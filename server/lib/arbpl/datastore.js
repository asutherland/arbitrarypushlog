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
 * The maximum number of pushes-per-tree to cache, where we only cache the
 *  most recent ones (for now).
 */
var MAX_PUSHES_CACHED = 8;
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
function DataServer(ioSocky, bridgeSink) {
  /**
   * @typedef[ClientSub @dict[
   *   @key[client IOClient]{
   *     The socket.io connection for the subscriber.
   *   }
   *   @key[treeName @oneof[null String]] {
   *     The name of the tree the user is subscribed to; initially null and
   *     set to null if a gibberish subscription request is received.
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
   *   @key[newLatched Boolean]{
   *     Does this client want to hear about all new pushes?
   *   }
   *   @key[highPushId Number]{
   *     The inclusive highest push id we know of.
   *   }
   *   @key[pushSummaries @dictof[
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

  this._ioSocky = ioSocky;
  ioSocky.on("connection", this.onConnection.bind(this));
}
DataServer.prototype = {
  //////////////////////////////////////////////////////////////////////////////
  // Connection Management

  /**
   * Hook-up events and add the client to our subscription list on connect.
   */
  onConnection: function(client) {
    var sub = {
      client: client,
      treeName: null,
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
      case "subtree":
        this.reqSubscribeToTree(client, sub, msg);
        break;
      case "subgrow":
        this.reqSubscriptionGrow(client, sub, msg);
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
    if (sub.treeName) {
      var treeSubs = this._treeSubsMap[sub.treeName];
      treeSubs.splice(treeSubs.indexOf(sub), 1);
    }
  },

  //////////////////////////////////////////////////////////////////////////////
  // Caching

  _getOrCreateTreeCache: function(treeName) {
    if (!this._treeCaches.hasOwnProperty(treeName)) {
      this._treeCaches[treeName] = {
        meta: null,
        highPushId: null,
        pushSummaries: {},
      };
    }
    return this._treeCaches[treeName];
  },

  /**
   * We have the results of a fresh db query and should cache it if it is
   *  recent.
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

    if (isRecent && !treeCache.highPushId) {
      treeCache.highPushId = pushId;
    }
    if (isRecent && treeCache.pushSummaries.hasOwnProperty(pushId)) {
      console.log("ignoring cache request for already cached push:", pushId,
                  "we probably just consolidated two client requests...");
      return;
    }

    treeCache.pushSummaries[pushId] = keysAndValues;
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
        !treeCache.pushSummaries.hasOwnProperty(pushId))
      return;

    // - new!
    if (pushId > treeCache.highPushId) {
      treeCache.highPushId = pushId;
      this._evictOldEntriesFromCache(treeCache);
      treeCache.pushSummaries[pushId] = deltaKeyValues;
      return;
    }

    // - old, delta!
    var curKeyValues = treeCache.pushSummaries[pushId];
    for (var key in deltaKeyValues) {
      curKeyValues[key] = deltaKeyValues[key];
    }
  },

  _evictOldEntriesFromCache: function(treeCache) {
    var threshId = treeCache.highPushId - MAX_PUSHES_CACHED;
    for (var key in treeCache.pushSummaries) {
      if (parseInt(key) <= threshId)
        delete treeCache.pushSummaries[key];
    }
  },

  /**
   * Check if the given push (including "recent") has an up-to-date
   *  representation in the cache, and, if so, return it.
   *
   * @args[
   *   @param[treeName String]
   *   @param[pushId @oneof["recent" Number]]
   * ]
   */
  _maybeGetCachedPush: function(treeName, pushId) {
    var treeCache = this._getOrCreateTreeCache(treeName);
    if (pushId === "recent") {
      if (treeCache.highPushId === null ||
          !treeCache.pushSummaries.hasOwnProperty(treeCache.highPushId))
        return null;
      return treeCache.pushSummaries[treeCache.highPushId];
    }
    if (!treeCache.pushSummaries.hasOwnProperty(pushId))
      return null;
    return treeCache.pushSummaries[pushId];
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
   *     @key[pushId Number]
   *     @key[keysAndValues Object]
   *   ]
   * ]
   */
  sidebandPush: function(msg) {
    console.log("sideband push notification!", msg.treeName, msg.pushId);
    this._maybeCachePushDeltaFromScraper(msg.treeName, msg.pushId,
                                         msg.keysAndValues);

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
      if (msg.pushId > sub.highPushId && sub.newLatched) {
        // ex: new pushId: 6, => (6 - 4) + 1 = 2 + 1 = 3
        sub.pushCount = Math.min(msg.pushId - lowPushId + 1, MAX_PUSH_SUBS);
        sub.highPushId = msg.pushId;
        // (keep going, do send)
      }
      // - old?
      else {
        // bail if the push id is not covered by the subscription
        if (msg.pushId < lowPushId ||
            msg.pushId > sub.highPushId)
          continue;
        // (keep going if it's covered by the subscription)
      }

      sub.client.send({
        // unexpected by the client, no more known unexpected things coming
        seqId: -1, lastForSeq: true,
        type: "pushinfo",
        pushId: msg.pushId,
        keysAndValues: msg.keysAndValues,
        // it definitely needs to know that its subscription may have changed!
        subHighPushId: sub.highPushId,
        subPushCount: sub.pushCount,
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
    client.send({
      seqId: seqId, lastForSeq: true,
      type: "error",
      message: message
    });
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
    var treeSubs;
    // - validate
    // ignore gibberish trees.
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
    sub.highPushId = sub.pendingRetrievalPushId = msg.pushId;
    sub.pushCount = 0;

    if (msg.treeName != sub.treeName) {
      // remove from old tree sub list...
      if (sub.treeName) {
        treeSubs = this._treeSubsMap[sub.treeName];
        treeSubs.splice(treeSubs.indexOf(sub), 1);
      }

      // add to new tree sub list
      if (!this._treeSubsMap.hasOwnProperty(msg.treeName))
        this._treeSubsMap[msg.treeName] = [];
      treeSubs = this._treeSubsMap[msg.treeName];

      sub.treeName = msg.treeName;
      treeSubs.push(sub);

      /*
      var treeMeta = this._bridgeSink.getTreeMeta(sub.treeName);
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
      promise = this._db.getPushInfo(treeDef.id, requestedPushId);
    }

    // -- if the cache knows, use that
    var cached = this._maybeGetCachedPush(treeDef.name,
                                          sub.pendingRetrievalPushId);
    if (cached) {
      sub.pushCount = 1;
      sub.highPushId = cached["s:r"].id;
      client.send({
        seqId: sub.seqId, lastForSeq: true,
        type: "pushinfo",
        keysAndValues: cached,
        // make sure it knows what its subscription is, may remove this.
        subHighPushId: sub.highPushId,
        subPushCount: sub.pushCount,
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
            client.send({
              seqId: sub.seqId, lastForSeq: true,
              type: "moot",
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

        var pushId = colsAndValues["s:r"].id;
        // We may have raced the scraper telling us about this, and if that's
        //  the case, we may have also missed other deltas, so check the
        //  cache and use that if possible.  (If the db query took a long
        //  time, it could happen.)
        // (If we were looking for "recent", be sure to re-ask using "recent"
        //  to avoid leaving the client in a state where they will not hear
        //  about new pushes because they fell far behind.)
        var cachedData = self._maybeGetCachedPush(treeDef,
                                                  sub.pendingRetrievalPushId);
        if (!cachedData) {
          self._maybeCachePushFromDb(treeDef,
                                     sub.pendingRetrievalPushId === "recent",
                                     pushId, colsAndValues);
        }
        else {
          colsAndValues = cachedData;
          // because we may have used "recent" above, re-grab the pushId.
          pushId = cachedData["s:r"].id;
        }

        // this request is mooted if the sequence id is still not this one.
        if (sub.seqId !== reqSeqId)
          return;

        sub.highPushId = (targHighPushId === null) ? pushId : targHighPushId;
        sub.pushCount = targPushCount;
        sub.pendingRetrievalPushId = null;

        client.send({
          seqId: sub.seqId, lastForSeq: true,
          type: "pushinfo",
          pushId: pushId,
          keysAndValues: colsAndValues,
          // make sure it knows what its subscription is, may remove this.
          subHighPushId: sub.highPushId,
          subPushCount: sub.pushCount,
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
    if (!sub.treeName || !sub.pushCount) {
      this._scoldClient(client, sub.seqId,
                        "no valid subscription (" + sub.treeName + ": " +
                        sub.pushCount + ")");
      return;
    }

    var targHighPushId, targPushCount;

    // - moot out/shift range if already at max
    if (sub.pushCount >= MAX_PUSH_SUBS) {
      if (msg.conditional) {
        client.send({
          seqId: sub.seqId, lastForSeq: true,
          type: "moot",
          inResponseTo: "subgrow",
        });
        return;
      }
      targHighPushId = sub.highPushId + (msg.dir < 0) ? -1 : 1;
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
    var cached = this._maybeGetCachedPush(sub.treeName, pushId);
    if (cached) {
      sub.highPushId = targHighPushId;
      sub.pushCount = targPushCount;
      client.send({
        seqId: sub.seqId, lastForSeq: true,
        type: "pushinfo",
        pushId: pushId,
        keysAndValues: cached,
        subHighPushId: sub.highPushId,
        subPushCount: sub.pushCount,
      });
      return;
    }

    // - fallback to a db request
    sub.pendingRetrievalPushId = pushId;

    var treeDef = $repodefs.safeGetTreeByName(sub.treeName);
    this._commonPushFetch(
      client, sub,
      this._db.getPushInfo(treeDef.id, pushId),
      treeDef, targHighPushId, targPushCount, true
    );
  },

  //////////////////////////////////////////////////////////////////////////////
  // Other

  broadcast: function(msg) {
    this._ioSocky.broadcast(msg);
  },

  //////////////////////////////////////////////////////////////////////////////
};
exports.DataServer = DataServer;


}); // end define
