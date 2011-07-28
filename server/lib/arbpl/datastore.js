/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at:
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Mozilla Messaging Code.
 *
 * The Initial Developer of the Original Code is
 *   The Mozilla Foundation
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Andrew Sutherland <asutherland@asutherland.org>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

/**
 * Implements our persistent query view of the world.  What we're selling to
 *  clients is up-to-date information on a set of pushes, plus the option to
 *  automatically extend that set to include new pushes.
 *
 * In the base case, this is just us asking the backing database for the
 *  current set of information and then if we hear about any new information
 *  for that push via the sideband channel, we send it to the clients.  We
 *  optimize for the most recent set of pushes by pre-fetching them and then
 *  mutating that state as new events come in.  (And if we hear about a new
 *  push, we just start the data-structure from scratch.)
 **/

define(
  [
    "buffer",
    "q", "q-http",
    "arbcommon/repodefs",
    "./hstore",
    "exports"
  ],
  function(
    $buffer,
    $Q, $Qhttp,
    $repodefs,
    $hstore,
    exports
  ) {
var when = $Q.when;

/**
 * The maximum number of recent pushes-per-tree to cache.
 */
var MAX_RECENT_PUSHES_CACHED = 12;
/**
 * The maximum number of non-recent LRU pushes-per-tree to cache.
 */
var MAX_OLD_PUSHES_CACHED = 12;
/**
 * The maximum number of subscriptions a client is allowed to maintain.  This
 *  doesn't actually affect our caching, so it's somewhat excessive right now.
 *  However, if we start trying to bound resource utilization / perform
 *  throttling, this would be a good number to base thresholds off of.
 */
var MAX_PUSH_SUBS = 8;

/**
 * Runs inside the web-server and tells things to the clients that they are
 *  interested after being told about them by the ScraperBridge.  The important
 *  thing it does is to enforce invariants about subscriptions so we can avoid
 *  classes of bugs where clients end up subscribed to everything, or subscribed
 *  to things multiple times, etc.
 *
 * A client can be interested in exactly one tree at a time.  Being interested
 *  in the tree provides a feed of meta-information about the tree, such as
 *  whether the tree is open/restricted/closed.  For that interested tree, the
 *  client can subscribe to a bounded window of pushes for information on
 *  updates to those pushes.  If the range includes the most recent push and
 *  a newer push shows up, the range will automatically be shifted/grown to
 *  include the new push.  For composite trees, only the outermost repo and
 *  its pushes matters for subscription purposes.
 *
 * For various reasons we want to chunk up our responses into reasonably sized
 *  pieces and have some degree of flow control so we don't try and cram them
 *  all at once.  Those reasons are UI responsiveness (show something fast) and
 *  it doesn't look like socket.io particularly has flow-control mechanisms
 *  it exposes to us other than having the client just issue a series of
 *  requests to get its data.  So we do that (have the client issue a series
 *  on requests for reasonably-sized bites.)
 */
function DataServer(ioSocky, bridgeSink, devMode) {
  /**
   * @typedef[ClientSub @dict[
   *   @key[client IOClient]{
   *     The socket.io connection for the subscriber.
   *   }
   *   @key[activeSub Boolean]{
   *     Are we actively subscribed (to something)?  This is set to true when
   *     a subscription is made and set to false if we unsubscribe.  We track
   *     this independently of `treeDef`/`treeCache` so that if a resubscribe
   *     attempt is made we still know what their last subscription was.
   *     (We do expect this to happen fairly frequently when the user
   *     transitions from viewing pushlogs to viewing specific details, but where
   *     it is not clear the user will return to the pushlog anytime soon, if
   *     ever.)
   *   }
   *   @key[treeDef @oneof[null BuildTreeDef]] {
   *     The tree the user is subscribed to; initially null and set to null if a
   *     gibberish subscription request is received.
   *   }
   *   @key[treeCache TreeCache]
   *   @key[newLatched Boolean]{
   *     Does this client want to hear about all new pushes?
   *   }
   *   @key[highPushId Number]{
   *     The inclusive push id of the highest / most recent push the client is
   *     interested in / displaying and already has valid data for.
   *   }
   *   @key[pushCount Number]{
   *     The number of pushes, starting from `highPushId` and iterating lower,
   *     that the client is interested in displaying.  This may be zero.
   *   }
   *   @key[pendingRetrievalPushId @oneof[null Number]]{
   *     If non-null, the push id the client is waiting for data on.  We
   *     clear this only once we have issued the write for the push.
   *   }
   *   @key[seqId Number]{
   *     The last sequence id received in a request from the client.  Initially
   *     set to 0, with the first expected sequence id being 1.  The response
   *     for messages will bear the sequence id of the triggering command.
   *     (And unsolicited messages sent to the client will have a sequence id
   *     of -1.)
   *
   *     We use this as a sanity checking measure because the transport
   *     mechanism is not truly reliable (although we expect it to be pretty
   *     reliable), so we need to know when we desynchronized, as it were.
   *     In practice, I expect that just having the client re-send its
   *     request with idempotent semantics in event of a timeout (calculated
   *     by the client) should be fine; if the server was just really busy,
   *     it will ignore the message because of the redundant sequence and
   *     respond when it was going to get to it anyways.
   *   }
   * ]]
   **/
  /**
   * @dictof[
   *   @key[treeName String]
   *   @value[@listof[ClientSub]]
   * ]
   */
  this._treeSubsMap = {};
  /**
   * @listof[ClientSub]{
   *   All of the currently subscribed clients.
   * }
   */
  this._allSubs = [];

  /**
   * @typedef[PushCache @dictof[
   *   @key[lastUsedMillis Number]{
   *     The last timestamp at which this cache entry was "used".  For our
   *     purposes, a DB retrieval to populate the cache entry counts, as does
   *     a cache hit, as does a sidebanded update that revises the cache entry
   *     that has a subscribed client.
   *   }
   *   @key[columnsMap @dict[
   *     @key[pushId]{
   *       The (numeric) push id.
   *     }
   *     @value[summaryColumns @dictof[
   *       @key[columnName]
   *       @value[columnValue]
   *     ]]{
   *       The columns that we believe to currently exist in the hbase store for
   *       the summary column family.  The detailed information is never cached.
   *     }
   *   ]]
   * ]]
   * @typedef[TreeCache @dict[
   *   @key[meta @dict[
   *     @key[treeStatus @oneof["OPEN" "CLOSED" "APPROVAL REQUIRED"]]{
   *       The current status of the tinderbox tree.
   *     }
   *     @key[treeNotes String]{
   *       Any description up on the tinderbox tree status page accompanying the
   *       `treeStatus`.
   *     }
   *   ]]
   *   @key[highPushId Number]{
   *     The inclusive highest push id we know of.
   *   }
   *   @key[mostRecentTinderboxScrapeMillis Number]{
   *     The timestamp in UTC milliseconds of the most recent (good) scraping of
   *     the given tinderbox tree.  When loading from the database we derive
   *     this value from the meta table.  Sidebanded data overwrites this value
   *     with an explicit timestamp.
   *   }
   *   @key[revForTimestamp Number]{
   *     Lets us express a change in data/meta-data for a
   *   }
   *   @key[recentPushCache PushColumnsMap]{
   *     Cache of recent pushes as defined by `highPushId` -
   *     MAX_RECENT_PUSHES_CACHED;
   *   }
   *   @key[oldPushCache PushColumnsMap]{
   *     MRU cache of entries that do not belong in the `recentPushCache`.
   *     Evicted `recentPushCache` entries do not get evicted into here,
   *     although it might be a reasonable idea.
   *   }
   * ]]
   **/
  /**
   * @dictof[
   *   @key[treeName String]
   *   @value[TreeCache]
   * ]{
   *   Our per-tree caches.
   * }
   */
  this._treeCaches = {};

  this._bridgeSink = bridgeSink;
  this._bridgeSink._dataServer = this;

  this._db = new $hstore.HStore();

  this._devMode = devMode;

  this._ioSocky = ioSocky;
  ioSocky.sockets.on("connection", this.onConnection.bind(this));
}
DataServer.prototype = {
  //////////////////////////////////////////////////////////////////////////////
  // Bootstrap

  /**
   * Initialize our database connection and retrieve required meta-data; once
   *  we fulfill our promise the caller will begin listening and we can receive
   *  client and sideband connections.
   *
   * Our main goal is to know the timestamp of the most recent scrape for each
   *  tree before clients can reconnect and start asserting subscriptions.  (We
   *  could obviously just pend responding to those requests on our database
   *  query, but that would complicate things for no win.)
   */
  bootstrap: function() {
    var self = this;
    return when (this._db.bootstrap(), function() {
        // (returns a promise itself)
        return self._bootstrapFetchScraperMetaState();
      });
  },

  _bootstrapFetchScraperMetaState: function() {
    var self = this;
    return when(this._db.getMetaRow($hstore.META_ROW_SCRAPER),
                function(keysAndValues){
        var RE_GOOD_TREE = /m:tree:good:(.+)/, match;
        for (var key in keysAndValues) {
          if ((match = RE_GOOD_TREE.exec(key))) {
            var timeObj = keysAndValues[key];
            var treeName = match[1];
            var treeCache = self._getOrCreateTreeCache(treeName);
            treeCache.mostRecentTinderboxScrapeMillis = timeObj.timestamp;
            treeCache.revForTimestamp = timeObj.rev;
          }
        }
      });
  },

  //////////////////////////////////////////////////////////////////////////////
  // Connection Management

  /**
   * Hook-up events and add the client to our subscription list on connect.
   */
  onConnection: function(client) {
    var sub = {
      client: client,
      activeSub: false,
      treeDef: null,
      treeCache: null,
      newLatched: false,
      highPushdId: 0,
      pushCount: 0,
      pendingRetrievalPushId: null,
      seqId: 0,
    };
    this._allSubs.push(sub);

    client.on("message", this.onClientMessage.bind(this, client, sub));
    client.on("disconnect", this.onClientDisconnect.bind(this, client, sub));
  },

  /**
   * We got a message from a client, dispatch to the right method.
   */
  onClientMessage: function(client, sub, msg) {
    if (this._devMode)
      console.log("clientMessage", msg.type);
    // Be concerned for sequence jumps unless this is the first thing we have
    //  heard from the client; if the server restarted, clients will have
    //  high sequence id's.
    if (msg.seqId !== sub.seqId + 1 &&
        sub.seqId !== 0) {
      console.warn("got message with seqId", msg.seqId,
                   "when our last known seqId was", sub.seqId);
    }
    sub.seqId = msg.seqId;

    switch (msg.type) {
      case "assertsub":
        this.reqAssertSub(client, sub, msg);
        break;
      case "subtree":
        this.reqSubscribeToTree(client, sub, msg);
        break;
      case "subgrow":
        this.reqSubscriptionGrow(client, sub, msg);
        break;
      case "unsub":
        this.reqUnsubscribe(client, sub, msg);
        break;
      // notifies us that they starred something.
      case "starred":
        break;
    }
  },

  /**
   * Remove the client from all subscription lists on disconnection.  (Keep in
   *  mind that this is a higher level concept of disconnection, as socket.io's
   *  transports are not all technically persistent and those that are may
   *  still allow for reconnections within a short window.)
   */
  onClientDisconnect: function(client, sub) {
    this._allSubs.splice(this._allSubs.indexOf(sub), 1);
    if (sub.treeDef) {
      var treeSubs = this._treeSubsMap[sub.treeDef.name];
      treeSubs.splice(treeSubs.indexOf(sub), 1);
    }
  },

  /**
   * Send helper that crams the information every packet should have in so
   *  we aren't duplicating that logic all over the place.  As the extra info
   *  we add grows in size, it might make sense to factor some of it out to
   *  discrete messages sent only on transition.
   */
  sendToClient: function(sub, msg) {
    msg.subTree = sub.treeDef ? sub.treeDef.name : null,
    msg.subRecent = (sub.newLatched &&
                     sub.highPushId === sub.treeCache.highPushId);
    msg.subHighPushId = sub.highPushId;
    msg.subPushCount = sub.pushCount;
    msg.accurateAsOfMillis = sub.treeCache.mostRecentTinderboxScrapeMillis;
    msg.revForTimestamp = sub.treeCache.revForTimestamp;
    return sub.client.json.send(msg);
  },

  //////////////////////////////////////////////////////////////////////////////
  // Caching

  _getOrCreateTreeCache: function(treeName) {
    if (!this._treeCaches.hasOwnProperty(treeName)) {
      this._treeCaches[treeName] = {
        meta: null,
        highPushId: null,
        mostRecentTinderboxScrapeMillis: null,
        revForTimestamp: null,
        recentPushCache: {},
        oldPushCache: {},
      };
    }
    return this._treeCaches[treeName];
  },

  /**
   * We have the results of a fresh db query and should cache it either as a
   *  recent push or an MRU old push.  In the future it might be worth
   *
   * We do not need to worry about the race case where we already have a cache
   *  entry for the push (because the scraper told us about the push after the
   *  client request was issued but before we asked hbase, and assuming hbase
   *  exposed the new data for querying purposes before our query hit it)
   *  because callers must call _maybeGetCachedPush before going on to call us.
   *
   * @args[
   *   @param[treeDef]
   *   @param[isRecent Boolean]{
   *     Is this believed to be the most recent push the database knows about
   *     (versus an arbitrary/explicit push query)?
   *   }
   *   @param[pushId Number]
   *   @param[keysAndValues Object]
   * ]
   */
  _maybeCachePushFromDb: function(treeDef, isRecent, pushId, keysAndValues) {
    var treeCache = this._getOrCreateTreeCache(treeDef.name);

    var now = Date.now();
    // It's recent if it's defined as recent or if its push id falls in the
    //  recent cache's current caching range
    if (isRecent ||
        (treeCache.highPushId &&
         (pushId > treeCache.highPushId - MAX_RECENT_PUSHES_CACHED))) {
      if (!treeCache.highPushId)
        treeCache.highPushId = parseInt(pushId);

      treeCache.recentPushCache[pushId] = {
        lastUsedMillis: now,
        columnsMap: keysAndValues,
      };
    }
    else {
      treeCache.oldPushCache[pushId] = {
        lastUsedMillis: now,
        columnsMap: keysAndValues,
      };
      this._maybeEvictOldPushCacheEntry(treeCache);
    }
  },

  /**
   * The scraper is telling us about the new key/values it just sent to the
   *  database for persistence.  It operates in an oldest-to-newest processing
   *  order.
   *
   * If there is an "s:r" column, we know this to be an entirely new push and
   *  we can cache it in its entirety and we are interested.  If there isn't,
   *  then it's just a delta and we should update our cached entry iff we have
   *  one.
   *
   * We are interested in a push only if we already know about at least one push
   *  in the given tree and the push we are being told about is more recent
   *  than the push we know about.  (We do not require the push number to be
   *  adjacent.)
   */
  _maybeCachePushDeltaFromScraper: function(treeName, pushId, deltaKeyValues) {
    // - bail if we have no pushes cached for the tree
    if (!this._treeCaches.hasOwnProperty(treeName))
      return;
    var treeCache = this._treeCaches[treeName];
    if (treeCache.highPushId === null)
      return;

    // - bail if the change is not new and not already cached
    if (pushId <= treeCache.highPushId &&
        !treeCache.recentPushCache.hasOwnProperty(pushId) &&
        !treeCache.oldPushCache.hasOwnProperty(pushId))
      return;

    // - new!
    if (pushId > treeCache.highPushId) {
      treeCache.highPushId = parseInt(pushId);
      this._evictOldEntriesFromRecentPushCache(treeCache);
      treeCache.recentPushCache[pushId] = {
        lastUsedMillis: Date.now(),
        columnsMap: deltaKeyValues,
      };
      return;
    }

    // - existing, delta!
    var cacheEntry;
    if (treeCache.recentPushCache.hasOwnProperty(pushId))
      cacheEntry = treeCache.recentPushCache[pushId];
    else
      cacheEntry = treeCache.oldPushCache[pushId];
    cacheEntry.lastUsedMillis = Date.now();
    var curKeyValues = cacheEntry.columnsMap;
    for (var key in deltaKeyValues) {
      curKeyValues[key] = deltaKeyValues[key];
    }
  },

  /**
   * Remove any entries from the recent push cache not falling in the current
   *  recent push range as bounded by the high push and the cache limit.
   */
  _evictOldEntriesFromRecentPushCache: function(treeCache) {
    var threshId = treeCache.highPushId - MAX_RECENT_PUSHES_CACHED;
    for (var key in treeCache.recentPushCache) {
      if (parseInt(key) <= threshId)
        delete treeCache.recentPushCache[key];
    }
  },

  /**
   * Evict 0 or 1 oldPushCache entries on an LRU basis if we are over the old
   *  push cache limit.
   */
  _maybeEvictOldPushCacheEntry: function(treeCache) {
    var count = 0, oldestPushKey = null, oldestMillis = null;
    for (var key in treeCache.oldPushCache) {
      count++;
      var stamp = treeCache.oldPushCache[key].lastUsedMillis;
      if (oldestMillis === null || oldestMillis > stamp) {
        oldestPushKey = key;
        oldestMillis = stamp;
      }
    }
    if (count > MAX_OLD_PUSHES_CACHED)
      delete treeCache.oldPushCache[oldestPushKey];
  },

  /**
   * Check if the given push (including "recent") has an up-to-date
   *  representation in the cache, and, if so, return it.
   *
   * @args[
   *   @param[treeCache TreeCache]
   *   @param[pushId @oneof["recent" Number]]
   * ]
   */
  _maybeGetCachedPush: function(treeCache, pushId) {
    var cacheEntry;
    if (pushId === "recent") {
      if (treeCache.highPushId === null ||
          !treeCache.recentPushCache.hasOwnProperty(treeCache.highPushId))
        return null;
      cacheEntry = treeCache.recentPushCache[treeCache.highPushId];
    }
    else if (treeCache.recentPushCache.hasOwnProperty(pushId)) {
      cacheEntry = treeCache.recentPushCache[pushId];
    }
    else if (treeCache.oldPushCache.hasOwnProperty(pushId)) {
      cacheEntry = treeCache.oldPushCache[pushId];
    }
    else {
      return null;
    }
    cacheEntry.lastUsedMillis = Date.now();
    return cacheEntry.columnsMap;
  },

  //////////////////////////////////////////////////////////////////////////////
  // Sideband Notification Handling

  /**
   * If we get told about a push (delta), tell the caching layer and tell any
   *  explicitly subscribed clients, plus consider adjusting its subscription
   *  if it's a new/recent push.
   *
   * @args[
   *   @param[msg @dict[
   *     @key[type "push"]
   *     @key[treeName String]
   *     @key[scrapeTimestampMillis @oneof[null Number]]{
   *       If this is the last push from the scrape, this will contain the
   *       timestamp of the tinderbox request/response.
   *     }
   *     @key[pushId Number]
   *     @key[keysAndValues Object]
   *   ]
   * ]
   */
  sidebandPush: function(msg) {
    console.log("sideband push notification!", msg.treeName, msg.pushId);
    this._maybeCachePushDeltaFromScraper(msg.treeName, msg.pushId,
                                         msg.keysAndValues);

    var isFullPush = msg.keysAndValues.hasOwnProperty("s:r");
    var treeCache = this._getOrCreateTreeCache(msg.treeName);

    // -- update timestamp info for the tree
    // (And flag that we need to send the info about our up-to-date-ness even
    //  if the user does not care about this particular push, noting that the
    //  sideband server will only tell us about a timestamp change at the
    //  conclusion of its last push, so it's not like we'll be spamming
    //  otherwise uninterested clients.)
    var timestampUpdated = false;
    if (msg.scrapeTimestampMillis) {
      timestampUpdated = true;
      treeCache.mostRecentTinderboxScrapeMillis = msg.scrapeTimestampMillis;
      treeCache.revForTimestamp = msg.revForTimestamp;
    }

    // -- send to all subscribed people
    if (!this._treeSubsMap.hasOwnProperty(msg.treeName))
      return;
    var treeSubs = this._treeSubsMap[msg.treeName];
    for (var iSub = 0; iSub < treeSubs.length; iSub++) {
      var sub = treeSubs[iSub];
      // If pushCount is zero, they are either pending on a request or got
      //  screwed by an empty database and will just have to refresh (to
      //  reduce our complexity :).
      if (!sub.pushCount)
        continue;

      // ex: highPushId: 5, sub.pushCount: 2 => lowPushId 4
      var lowPushId = sub.highPushId - sub.pushCount + 1;

      // - new?
      if (isFullPush && msg.pushId > sub.highPushId && sub.newLatched) {
        // ex: new pushId: 6, => (6 - 4) + 1 = 2 + 1 = 3
        sub.pushCount = Math.min(parseInt(msg.pushId) - lowPushId + 1,
                                 MAX_PUSH_SUBS);
        sub.highPushId = parseInt(msg.pushId);
        // (keep going, do send)
      }
      // - old?
      else {
        // bail if the push id is not covered by the subscription
        if (msg.pushId < lowPushId ||
            msg.pushId > sub.highPushId) {
          // do tell them about a timestamp update before going (see above)
          if (timestampUpdated) {
            this.sendToClient(sub, {
              seqId: -1, lastForSeq: true,
              type: "treemeta",
              // sendToClient will fill in accurateAsOfMillis/revForTimestamp
              //  for us.
            });
          }
          continue;
        }
        // (keep going if it's covered by the subscription)
      }

      this.sendToClient(sub, {
        // unexpected by the client, no more known unexpected things coming
        seqId: -1, lastForSeq: true,
        type: isFullPush ? "pushinfo" : "pushdelta",
        pushId: msg.pushId,
        keysAndValues: msg.keysAndValues,
      });
    }
  },

  //////////////////////////////////////////////////////////////////////////////
  // Client Request Handling

  /**
   * Handle illegal requests from the client.  Centralized logic so we can get
   *  fancy with logging or dynamic blacklisting of bad actors later on.
   */
  _scoldClient: function(client, seqId, message) {
    console.warn("client error:", message);
    client.json.send({
      seqId: seqId, lastForSeq: true,
      type: "error",
      message: message
    });
  },

  /**
   * Idempotently subscribe the given clientsub to the given tree name.
   */
  _treeSubscribe: function(treeName, sub) {
    if (!this._treeSubsMap.hasOwnProperty(treeName))
      this._treeSubsMap[treeName] = [];
    var treeSubs = this._treeSubsMap[treeName];
    if (treeSubs.indexOf(sub) === -1)
      treeSubs.push(sub);
  },

  /**
   * Idempotently unsubscribe the given client sub from the given tree.
   */
  _treeUnsubscribe: function(treeName, sub) {
    if (!this._treeSubsMap.hasOwnProperty(treeName))
      return;
    var treeSubs = this._treeSubsMap[treeName];
    var index = treeSubs.indexOf(sub);
    if (index !== -1)
      treeSubs.splice(index, 1);
  },

  /**
   * Unsubscribe the client from any subscribed tree.  As a side-effect of
   *  having received any message at all, this should invalidate pending
   *  requests by bumping the sequence id (in the sense that we should check
   *  that value and bail on any callbacks that fire after this point.)
   */
  reqUnsubscribe: function(client, sub, msg) {
    if (sub.treeDef) {
      var treeSubs = this._treeSubsMap[sub.treeDef.name];
      treeSubs.splice(treeSubs.indexOf(sub), 1);
      sub.activeSub = false;
    }
  },

  /**
   * The client has reconnected and wants to verify the state of its
   *  subscription and the validity of the data it has.  We convert this to
   *  a subscription request if the data is no good.
   */
  reqAssertSub: function(client, sub, msg) {
    if (sub.activeSub)
      // XXX it appears this can happen during debugging, and it kills us, which
      //  is not a great thing...
      // throw new Error("assertsub's resub logic assumes no active sub!");
      return;

    // - find the push sub range
    var minPush = null, maxPush = null;
    for (var iPush = 0; iPush < msg.knownPushesAndVersions.length; iPush++){
      var pushId = msg.knownPushesAndVersions[iPush].id;
      if (minPush === null || pushId < minPush)
        minPush = pushId;
      if (maxPush === null || pushId > maxPush)
        maxPush = pushId;
    }

    var treeDef = $repodefs.safeGetTreeByName(msg.treeName);
    if (!treeDef) {
      // let the subscription case handle this gibberish
      this.reqSubscribeToTree(client, sub, msg);
      return;
    }
    var treeCache = this._getOrCreateTreeCache(msg.treeName);

    // -- up-to-date?
    if (treeCache.mostRecentTinderboxScrapeMillis === msg.timestamp &&
        treeCache.revForTimestamp === msg.timestampRev) {
      sub.treeDef = treeDef;
      sub.treeCache = treeCache;

      sub.newLatched = msg.mode === "recent";

      // If they didn't tell us about any pushes, just force them into a
      //  "recent" subscription.
      if (minPush === null) {
        msg.pushId = "recent";
        this.reqSubscribeToTree(client, sub, msg);
        return;
      }
      sub.highPushId = maxPush;
      sub.pushCount = Math.min(maxPush - minPush + 1, MAX_PUSH_SUBS);

      this._treeSubscribe(msg.treeName, sub);
      sub.activeSub = true;

      if (this._devMode)
        console.log("resubscribed; high push: ", sub.highPushId, "count:",
                    sub.pushCount);
      this.sendToClient(sub, {
        seqId: sub.seqId, lastForSeq: true,
        type: "assertedsub",
      });
      return;
    }

    // -- not up-to-date
    // treat it as a new subscription request based on the mode/etc.
    if (msg.mode === "recent" || !maxPush)
      msg.pushId = "recent";
    else
      msg.pushId = maxPush;
    this.reqSubscribeToTree(client, sub, msg);
  },

  /**
   * Subscribe to a given tree starting with a specific push id.  If a specific
   *  push id is not requested, we assume you just want the most recent push
   *  and to listen for new things.  If the client wants more than just the
   *  one push, it needs to issue "subgrow" notifications (implemented by
   *  `reqSubscriptionGrow`.)
   *
   * We send them an entirely new set of data.
   */
  reqSubscribeToTree: function(client, sub, msg) {
    // - validate
    // ignore gibberish trees; don't nuke a valid subscription.
    var treeDef = $repodefs.safeGetTreeByName(msg.treeName);
    if (!treeDef) {
      this._scoldClient(client, sub.seqId,
                        "Unknown tree name: " + msg.treeName);
      return;
    }

    if (!msg.hasOwnProperty("pushId") ||
        (msg.pushId !== "recent" &&
         ((typeof(msg.pushId) !== "number") ||
          isNaN(msg.pushId)))) {
      this._scoldClient(client, sub.seqId, "Illegal pushId: " + msg.pushId);
      return;
    }

    // - update
    if (msg.pushId === "recent")
      sub.newLatched = true;
    else
      msg.pushId = parseInt(msg.pushId);
    sub.highPushId = sub.pendingRetrievalPushId = msg.pushId;
    sub.pushCount = 0;

    if (msg.treeDef !== sub.treeDef) {
      // remove from old tree sub list...
      if (sub.treeDef) {
        this._treeUnsubscribe(sub.treeDef.name, sub);
      }

      // add to new tree sub list
      this._treeSubscribe(msg.treeName, sub);

      sub.activeSub = true;
      sub.treeDef = treeDef;
      sub.treeCache = this._getOrCreateTreeCache(treeDef.name);

      /*
      var treeMeta = this._bridgeSink.getTreeMeta(sub.treeDef.name);
      if (treeMeta)
        client.send({seqId: sub.seqId, lastForSeq: false,
                     type: "treemeta", meta: treeMeta});
       */
    }

    var promise;
    if (sub.pendingRetrievalPushId === "recent") {
      promise = this._db.getMostRecentKnownPush(treeDef.id);
    }
    else {
      promise = this._db.getPushInfo(treeDef.id, sub.pendingRetrievalPushId);
    }

    // -- if the cache knows, use that
    var cached = this._maybeGetCachedPush(sub.treeCache,
                                          sub.pendingRetrievalPushId);
    if (cached) {
      sub.pushCount = 1;
      sub.highPushId = parseInt(cached["s:r"].id);
      this.sendToClient(sub, {
        seqId: sub.seqId, lastForSeq: true,
        type: "pushinfo",
        keysAndValues: cached,
      });
      return;
    }

    // -- ask the database, cache any results
    this._commonPushFetch(client, sub, promise, treeDef, null, 1, false);
  },
  _commonPushFetch: function(client, sub, promise, treeDef,
                             targHighPushId, targPushCount, mootable) {
    // latch the request's sequence id so we can ignore mooted responses
    var reqSeqId = sub.seqId;
    var self = this;
    when(promise,
      function(rows) {
        var colsAndValues = self._db.normalizeOneRow(rows);
        if (!colsAndValues.hasOwnProperty("s:r")) {
          if (mootable) {
            client.json.send({
              seqId: sub.seqId, lastForSeq: true,
              type: "moot",
              why: "fetch lacks revision",
              pushId: sub.pendingRetrievalPushId,
              inResponseTo: "subgrow",
            });
          }
          else {
            // This could just be the case of an unpopulated database, but that
            //  is so far from steady state expected behaviour that it's worth
            //  complaining.
            console.warn("hstore told us about a push lacking any data!",
                         "requested push:", sub.pendingRetrievalPushId);
            self._scoldClient(client, sub.seqId,
                              "no such push!");
          }
          return;
        }

        var pushId = parseInt(colsAndValues["s:r"].id);
        // We may have raced the scraper telling us about this, and if that's
        //  the case, we may have also missed other deltas, so check the
        //  cache and use that if possible.  (If the db query took a long
        //  time, it could happen.)
        // (If we were looking for "recent", be sure to re-ask using "recent"
        //  to avoid leaving the client in a state where they will not hear
        //  about new pushes because they fell far behind.)
        var cachedData = self._maybeGetCachedPush(sub.treeCache,
                                                  sub.pendingRetrievalPushId);
        if (!cachedData) {
          self._maybeCachePushFromDb(treeDef,
                                     sub.pendingRetrievalPushId === "recent",
                                     pushId, colsAndValues);
        }
        else {
          colsAndValues = cachedData;
          // because we may have used "recent" above, re-grab the pushId.
          pushId = parseInt(cachedData["s:r"].id);
        }

        // this request is mooted if the sequence id is still not this one.
        if (sub.seqId !== reqSeqId)
          return;

        sub.highPushId = (targHighPushId === null) ? pushId : targHighPushId;
        sub.pushCount = targPushCount;
        sub.pendingRetrievalPushId = null;
        self.sendToClient(sub, {
          seqId: sub.seqId, lastForSeq: true,
          type: "pushinfo",
          pushId: pushId,
          keysAndValues: colsAndValues,
        });
      }
    );
  },

  /**
   * Grow the subscription's push range, potentially conditionally.  A
   *  conditional grow means "don't expand my range if I'm already at the
   *  limit", and is intended for initial UI backfill when it's possible
   *  we can grow their subscription automatically with an unsolicited new
   *  push notification.  We will send a message to the effect that we did
   *  not grow the subscription if that happens.
   *
   * An unconditional grow will unsubscribe the push at the opposite end
   *  of the desired growth and would be used when performing scrolling type
   *  behaviour.
   */
  reqSubscriptionGrow: function(client, sub, msg) {
    // - err out if there's no valid push subscription
    if (!sub.treeDef || !sub.pushCount) {
      this._scoldClient(client, sub.seqId,
                        "no valid subscription (" + sub.treeDef + ": " +
                        sub.pushCount + ")");
      return;
    }

    var targHighPushId, targPushCount;

    // - moot out/shift range if already at max
    if (sub.pushCount >= MAX_PUSH_SUBS) {
      if (msg.conditional) {
        client.json.send({
          seqId: sub.seqId, lastForSeq: true,
          type: "moot",
          why: "conditional",
          inResponseTo: "subgrow",
        });
        return;
      }
      targHighPushId = sub.highPushId + ((msg.dir < 0) ? -1 : 1);
      targPushCount = sub.pushCount;
    }
    // - grow range in dir
    else {
      targPushCount = sub.pushCount + 1;
      if (msg.dir > 0)
        targHighPushId = sub.highPushId + 1;
      else
        targHighPushId = sub.highPushId;
    }
    var pushId;
    if (msg.dir > 0)
      pushId = sub.highPushId + 1;
    else
      pushId = sub.highPushId - sub.pushCount; // note, no + 1

    // - use cached data if possible
    var cached = this._maybeGetCachedPush(sub.treeCache, pushId);
    if (cached) {
      sub.highPushId = targHighPushId;
      sub.pushCount = targPushCount;
      this.sendToClient(sub, {
        seqId: sub.seqId, lastForSeq: true,
        type: "pushinfo",
        pushId: pushId,
        keysAndValues: cached,
      });
      return;
    }

    // - fallback to a db request
    sub.pendingRetrievalPushId = pushId;

    this._commonPushFetch(
      client, sub,
      this._db.getPushInfo(sub.treeDef.id, pushId),
      sub.treeDef, targHighPushId, targPushCount, true
    );
  },

  //////////////////////////////////////////////////////////////////////////////
  // Other

  broadcast: function(msg) {
    this._ioSocky.sockets.json.send(msg);
  },

  //////////////////////////////////////////////////////////////////////////////
};
exports.DataServer = DataServer;


}); // end define
