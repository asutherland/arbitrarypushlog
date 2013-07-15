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
 * Process a local (loggest) logfile and put it in a synthetic push in the
 *  "logal" tree.
 */

define(
  [
    "fs",
    "q",
    "./hstore",
    "./loggest/logfrob",
    "./databus",
    "exports"
  ],
  function(
    $fs,
    $Q,
    $hstore,
    $loggestFrobber,
    $databus,
    exports
  ) {
var when = $Q.when;

var LOCAL_TREE_ID = "logal";
var LOCAL_TREE_NAME = "Logal";

/**
 * Process local test run results into a synthetic push in the database.
 *
 * Pseudocode is as follows:
 * - Find the current highest push id, and then pick a synthetic push id that is
 *   one higher than that push.
 * - Create a synthetic push using the timestamp of the log file as the push
 *   timestamp.
 * - Parse the log file.
 * - Cram our new state in the database.
 *
 * There is no concurrency control and this is obviously not an idempotent sort
 *  of thing.
 */
function LocalLoggestChewer(bridgePort) {
  this._chewDeferred = null;
  this._db = new $hstore.HStore();
  this._usePushId = null;
  this._bridgePort = bridgePort;
}
LocalLoggestChewer.prototype = {
  /**
   * Chew the given loggest log at the given path.
   *
   * Only one such request is allowed to be in flight at a time; don't call
   *  again until we fulfill the promise.
   */
  chew: function(path) {
    this._path = path;
    this._chewDeferred = $Q.defer();

    var self = this;
    when(this._db.bootstrap(),
      function() {
        when(self._db.getMostRecentKnownPush(LOCAL_TREE_ID),
          function(rowResults) {
            if (rowResults.length) {
              var normalized = self._db.normalizeOneRow(rowResults);
              self._usePushId = parseInt(normalized["s:r"].id) + 1;
            }
            else {
              self._usePushId = 1;
            }

            console.error("Decided on push id:", self._usePushId);
            self._goParse();
          });
      });

    return this._chewDeferred.promise;
  },

  _goParse: function() {
    console.error("parsing and pre-chewing, which can include graphviz ops");
    // We always want files encoded as utf8.  Support for writing to utf8
    // varies a little:
    // - Node does the right thing.  It creates WriteStreams that use utf8 by
    //   default
    // - gecko/xpcshell do not automatically do the right thing.  Specifically,
    //   JS' C encoding is set to binary, and xpcshell.cpp does nothing special
    //   in dump or print to force an encoding, so we need to do it.
    var stream = $fs.createReadStream(this._path, {encoding: 'utf8'});
    var loggestFrobber =
      new $loggestFrobber.LoggestFrobber(stream,
                                         "s:l:" + this._path,
                                         "d:l:" + this._path,
                                         this._parsed.bind(this));
  },

  _parsed: function(setstate) {
    console.error("all parsed, writing");
    var logFileInfo = $fs.statSync(this._path);
    var logDate = new Date(logFileInfo.mtime);
    var logStamp = Math.floor(logDate.valueOf() / 1000);

    var overview = setstate["s:l:" + this._path];

    // the revision info
    setstate["s:r"] = {
      id: this._usePushId,
      date: logStamp,
      user: "You! <user@localhost.localdomain>",
      changesets: [
        {
          shortRev: "xxxxxxxxxxxx",
          node:  "xxxxxxxxxxxx",
          author: "user@localhost.localdomain",
          branch: "default",
          tags: [],
          desc: "Your test run of " + logFileInfo.mtime,
          files: [],
        }
      ],
    };

    // the synthetic-ish log entry
    // (this needs to be redundantly encoded)
    setstate["s:b:" + this._path] = JSON.stringify({
      builder: {
        name: "local loggest",
        os: {
          idiom: null,
          platform: "localhost",
          arch: null,
          ver: null,
        },
        isDebug: false,
        type: {
          type: "test",
          subtype: "loggest",
        },
      },
      id: this._path,
      state: (overview.failures.length || overview.failureIndicated) ?
               "testfailed" : "success",
      startTime: logStamp,
      endTime: logStamp,
      logURL: this._path,
      revs: {},
      richNotes: [],
      errorParser: "loggest",
      _scrape: "",
    });

    // XXX dev mode port only...
    var bridge = new $databus.ScraperBridgeSource(this._bridgePort);
    var sideband = {};
    sideband["s:r"] = setstate["s:r"];
    sideband["s:b:" + this._path] = setstate["s:b:" + this._path];
    sideband["s:l:" + this._path] = setstate["s:l:" + this._path];

    var scrapeStamp = Date.now();

    var self = this;
    console.error("issuing db write");
    var writeStarted = Date.now();
    when(this._db.putPushStuff(LOCAL_TREE_ID, this._usePushId, setstate),
      function() {
        console.log("db write completed", Date.now() - writeStarted, 'ms');
        when(self._db.metaLogTreeScrape("Logal", true,
               {timestamp: scrapeStamp, rev: 0, highPushId: self._usePushId}),
             function() {
          console.error("issuing sideband write on port", self._bridgePort);
          when(bridge.send({
                 type: "push",
                 treeName: LOCAL_TREE_NAME,
                 pushId: self._usePushId,
                 keysAndValues: sideband,
                 scrapeTimestampMillis: scrapeStamp,
                 revForTimestamp: 0,
               }),
            function() {
              console.error("db and sideband written");
              self._chewDeferred.resolve(self._usePushId);
            },
            function() {
              console.error("problem sidebanding, continuing.");
              self._chewDeferred.resolve(self._usePushId);
            }
          );
        }, function() {console.error("problem writing meta tree junk");});
      });
  },
};
exports.LocalLoggestChewer = LocalLoggestChewer;

}); // end define
