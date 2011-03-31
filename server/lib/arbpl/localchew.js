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
 * Process a local (mozmill) logfile and put it in a synthetic push in the
 *  "local" tree.
 */

define(
  [
    "fs",
    "q",
    "./hstore",
    "./mozmill-logfrob",
    "./databus",
    "exports"
  ],
  function(
    $fs,
    $Q,
    $hstore,
    $mozmillFrobber,
    $databus,
    exports
  ) {
var when = $Q.when;

var LOCAL_TREE_ID = "local";
var LOCAL_TREE_NAME = "Local";

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
function LocalChewer() {
  this._chewDeferred = null;
  this._db = new $hstore.HStore();
  this._usePushId = null;
}
LocalChewer.prototype = {
  /**
   * Chew the given mozmill log at the given path.
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

            console.log("Decided on push id:", self._usePushId);
            self._goParse();
          });
      });

    return this._chewDeferred.promise;
  },

  _goParse: function() {
    var stream = $fs.createReadStream(this._path);
    var mozmillFrobber =
      new $mozmillFrobber.MozmillFrobber(stream,
                                         "s:l:" + this._path,
                                         "d:l:" + this._path,
                                         this._parsed.bind(this));
  },

  _parsed: function(failures) {
    console.log("all parsed, writing");
    var logFileInfo = $fs.statSync(this._path);
    var logDate = new Date(logFileInfo.mtime);
    var logStamp = Math.floor(logDate.valueOf() / 1000);

    var setstate = {};
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
        name: "local mozmill",
        os: {
          idiom: "desktop",
          platform: "localhost",
          arch: "localarch",
          ver: null,
        },
        isDebug: false,
        type: {
          type: "test",
          subtype: "mozmill",
        },
      },
      id: this._path,
      state: failures.length ? "testfailed" : "success",
      startTime: logStamp,
      endTime: logStamp,
      logURL: this._path,
      revs: {},
      richNotes: [],
      errorParser: "mozmill",
      _scrape: "",
    });

    var overviewFailures = [], detailedFailures = failures;
    for (var i = 0; i < failures.length; i++) {
      var failure = failures[i];
      var overviewFail = {};
      for (var key in failure) {
        if (key != "failureContext")
          overviewFail[key] = failure[key];
      }
      overviewFailures.push(overviewFail);
    }

    // put the summary results in...
    setstate["s:l:" + this._path] = {
      type: "mozmill",
      failures: overviewFailures,
    };

    // put the detailed results in...
    setstate["d:l:" + this._path] = {
      type: "mozmill",
      failures: detailedFailures,
    };

    // XXX dev mode port only...
    var bridge = new $databus.ScraperBridgeSource(8009);
    var sideband = {};
    sideband["s:r"] = setstate["s:r"];
    sideband["s:b:" + this._path] = setstate["s:b:" + this._path];
    sideband["s:l:" + this._path] = setstate["s:l:" + this._path];

    var self = this;
    when(this._db.putPushStuff(LOCAL_TREE_ID, this._usePushId, setstate),
      function() {
        when(bridge.send({
               type: "push",
               treeName: LOCAL_TREE_NAME,
               pushId: self._usePushId,
               keysAndValues: sideband
             }),
          function() {
            self._chewDeferred.resolve(self._usePushId);
          }
        );
      });
  },
};
exports.LocalChewer = LocalChewer;

}); // end define
