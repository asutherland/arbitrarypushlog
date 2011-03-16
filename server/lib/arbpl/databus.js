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
    "buffer",
    "q",
    "arbcommon/repodefs",
    "./utils/reliahttp",
    "exports"
  ],
  function(
    $buffer,
    $Q,
    $repodefs,
    $reliahttp,
    exports
  ) {
var when = $Q.when;

var MAX_PUSH_RANGE = 8;

/**
 * Instantiated by the data server process to process information received from
 *  the ScraperBridgeSource in the scraper process.  Most information is
 *  directly passed through to the DataServer, but some information is latched
 *  so that new subscribers can get the somewhat ephemeral data immediately
 *  and without having to scrape it themselves.
 */
function ScraperBridgeSink(httpServer) {
  /**
   * Latched tree meta information.
   */
  this._treeMeta = {};

  this._httpServer = httpServer;
  this._httpServer.on("request", this.onRequest.bind(this));

  this._dataServer = null;
}
ScraperBridgeSink.prototype = {
  onRequest: function(req, resp) {
    var data = {strSoFar: "", resp: resp};
    req.on("data", this.onReqData.bind(this, req, data));
    req.on("end", this.onReqEnd.bind(this, req, data));
  },

  onReqData: function(req, data, chunk) {
    data.strSoFar += chunk.toString("utf8");
  },

  onReqEnd: function(req, data) {
    var msg;
    try {
      msg = JSON.parse(data.strSoFar);
    }
    catch (ex) {
      console.error("received malformed message", ex);
      data.resp.statusCode = 500;
      data.resp.write("BAD!");
      data.resp.end();
      return;
    }
    data.resp.statusCode = 200;
    data.resp.write("OK");
    data.resp.end();

    this.onMessage(msg);
  },

  onMessage: function(msg) {
    switch (msg.type) {
      case "push":
        this._dataServer.sidebandPush(msg);
        break;

      default:
        console.warn("unexpected sideband message", msg);
        break;
    }
  },
};
exports.ScraperBridgeSink = ScraperBridgeSink;

/**
 * Instantiated by the scraper process in order to send information to the data
 *  server process.
 */
function ScraperBridgeSource(targetPort) {
  this._targetPort = targetPort;
}
ScraperBridgeSource.prototype = {
  send: function(message) {
    var url = "http://localhost:" + this._targetPort + "/";
    return $reliahttp.reliago({
             url: url,
             method: "POST",
             body: JSON.stringify(message)
           });
  }
};
exports.ScraperBridgeSource = ScraperBridgeSource;

}); // end define
