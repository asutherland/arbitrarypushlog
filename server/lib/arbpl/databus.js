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
 * Provides socket.io subscription hookup for clients, plus the bridge logic
 *  between the scraping server/client and the web server.
 *
 * Scraping / data retrieval / processing is currently handled by a separate
 *  process for hygiene and latency reasons.  Ideally the web server should
 *  not get tied up with processing things.  And while we try and make sure
 *  data retrieval is smart about stream processing, it's nice to have some
 *  room to screw up.
 **/

define(
  [
    "arbcommon/repodefs",
    "exports"
  ],
  function(
    $repodefs,
    exports
  ) {

var MAX_PUSH_RANGE = 8;

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
 */
function DataServer(bridgeSink) {
  /**
   * @typedef[ClientSub @dict[
   *   @key[client IOClient]{
   *     The socket.io connection for the subscriber.
   *   }
   *   @key[treeName String] {
   *   }
   *   @key[highPushId Number]{
   *     The inclusive push id of the highest / most recent push the client is
   *     interested in / displaying.
   *   }
   *   @key[lowPushId Number]{
   *     The inclusive push id of the lowest / oldest push the client is
   *     interested in.
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

  this._bridgeSink = bridgeSink;
}
DataServer.prototype = {
  onConnection: function(client) {
    var sub = {
      client: client,
      treeName: null,
      highPushdId: null,
      lowPushId: null,
    };

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

  onClientMessage: function(client, sub, msg) {
    var treeSubs;
    switch (msg.type) {
      // Subscribe to a given tree and set of pushes, replacing the previous
      //  subscription.
      case "subscribe":
        // - validate
        // ignore gibberish trees.
        var treeDef = $repodefs.safeGetTreeByName(msg.treeName);
        if (!treeDef) {
          this._scoldClient(client, "Unknown tree name: " + msg.treeName);
          return;
        }

        if (!msg.hasOwnProperty("highPushId") ||
            !msg.hasOwnProperty("lowPushId") ||
            (typeof(msg.highPushId) !== "number") ||
            (typeof(msg.lowPushId) !== "number") ||
            isNaN(msg.highPushId) || isNaN(msg.lowPushId) ||
            (msg.highPushdId - msg.lowPushId >= MAX_PUSH_RANGE)) {
          this._scoldClient(client, "Bad push ranges.");
          return;
        }

        // - update
        sub.highPushId = msg.highPushId;
        sub.lowPushId = msg.lowPushId;

        if (msg.treeName != sub.treeName) {
          // remove from old tree sub list...
          if (sub.treeName) {
            treeSubs = this._treeSubsMap[sub.treeName];
            treeSubs.splice(treeSubs.indexOf(sub), 1);
          }

          // add to new tree sub list
          if (!this._treeSubsMap.hasOwnProperty(msg.treeName))
            this._treeSubsMap[msg.treeName] =
          treeSubs = this._treeSubsMap[msg.treeName];

          sub.treeName = msg.treeName;
          treeSubs.push(sub);

          var treeMeta = this._bridgeSink.getTreeMeta(sub.treeName);
          if (treeMeta)
            client.send({type: "treemeta", meta: treeMeta});
        }
        break;
      // notifies us that they starred something.
      case "starred":
        break;
    }
  },
  onClientDisconnection: function(client, sub) {
    this._allSubs.splice(this._allSubs.indexOf(sub), 1);
    if (sub.treeName) {
      var treeSubs = this._treeSubsMap[sub.treeName];
      treeSubs.splice(treeSubs.indexOf(sub), 1);
    }
  },
};
exports.DataServer = DataServer;

/**
 * Instantiated by the data server process to process information received from
 *  the ScraperBridgeSource in the scraper process.  Most information is
 *  directly passed through to the DataServer, but some information is latched
 *  so that new subscribers can get the somewhat ephemeral data immediately
 *  and without having to scrape it themselves.
 */
function ScraperBridgeSink() {
  /**
   * Latched tree meta information.
   */
  this._treeMeta = {};
}
ScraperBridgeSink.prototype = {
};
exports.ScraperBridgeSink = ScraperBridgeSink;

/**
 * Instantiated by the scraper process in order to send information to the data
 *  server process.
 */
function ScraperBridgeSource() {
}
ScraperBridgeSource.prototype = {
};
exports.ScraperBridgeSource = ScraperBridgeSource;

}); // end define
