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
  /**
   * Hook-up events and add the client to our subscription list on connect.
   */
  onConnection: function(client) {
    var sub = {
      client: client,
      treeName: null,
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
   * Handle illegal requests from the client.  Centralized logic so we can get
   *  fancy with logging or dynamic blacklisting of bad actors later on.
   */
  _scoldClient: function(client, message) {
    console.warn("client error:", message);
    client.send({
      type: "error",
      message: message
    });
  },

  /**
   * We got a message from a client, dispatch to the right method.
   */
  onClientMessage: function(client, sub, msg) {
    if (msg.seqId !== sub.seqId + 1) {
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
      this._scoldClient(client, "Unknown tree name: " + msg.treeName);
      return;
    }

    if (!msg.hasOwnProperty("pushId") ||
        (msg.pushId !== "recent" &&
         ((typeof(msg.pushId) !== "number") ||
          isNaN(msg.pushId)))) {
      this._scoldClient(client, "Illegal pushId: " + msg.pushId);
      return;
    }

    // - update
    // XXX
    //sub.highPushId = msg.highPushId;
    //sub.lowPushId = msg.lowPushId;

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

    var self = this;
    when(this._db.getMostRecentKnownPush(treeDef.id),
      function(rows) {
        client.send({
          seqId: sub.seqId, lastForSeq: true,
          type: "pushinfo",
          keysAndValues: self._db.normalizeOneRow(rows),
        });
      });
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
  },

  broadcast: function(msg) {
    this._ioSocky.broadcast(msg);
  },
};
exports.DataServer = DataServer;


}); // end define
