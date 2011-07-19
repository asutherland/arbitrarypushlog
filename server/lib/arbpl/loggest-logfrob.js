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
 * Process a stream for delineated loggest unit test run results.  Derived from
 *  the mozmill frobber.  The notable major change is that we are intended to
 *  process successes as well as failures.
 **/

define(
  [
    "exports"
  ],
  function(
    exports
  ) {

/**
 * Detect indicators of failure other than the silver platter JSON objects.
 *  (The current value is not a real thing, but the logic is useful.)
 */
var RE_OTHFAIL = /(^\*\*\* THE WORLD EXPLODED! \*\*\*)/m;

var RE_START = /^##### LOGGEST-TEST-RUN-BEGIN #####$/m;
var RE_END = /^##### LOGGEST-TEST-RUN-END #####$/m;
var OVERLAP_PADDING = 32;

var RE_BACKSLASH = /\\/g;

/**
 * Consume a stream for explicitly delineated runs of loggest test run JSON
 *  blobs and performing file-system normalizations.  Windows-style paths
 *  are forbidden and accordingly not handled.
 *
 * The write cells generated are:
 * - one log file summary (with summaryKey) characterizing all test cases,
 *    broken out into separate success and failure lists.  The failure list
 *    entries have no meta-data, the success entries include the run-time.
 * - one cell per test case, summary or failure.  every cell contains a copy
 *    of the schema block; I'm not crazy about it, but it may compress well.
 */
function Frobber(stream, summaryKey, detailKeyPrefix, callback) {
  stream.on("data", this.onData.bind(this));
  stream.on("end", this.onEnd.bind(this));

  this.detailKeyPrefix = detailKeyPrefix;
  this.callback = callback;

  this.overview = {
    type: "loggest",
    successes: [],
    failures: [],
    failureIndicated: false,
    unusualFailureIndicated: false,
  };
  this.writeCells = {};
  this.writeCells[summaryKey] = this.overview;

  this.inBlock = false;
  this.leftover = null;
}
Frobber.prototype = {
  _gobbleJsonFromLines: function(dstr) {
    var bits = dstr.split("\n");
    for (var i = 0; i < bits.length; i++) {
      // ignore blank lines...
      if (!bits[i])
        continue;

      // it's possible for other lines to get mixed in, although it's not
      //  preferred.  if it doesn't remotely look like JSON, don't mention it.
      if (bits[i][0] !== "{")
        continue;
      var rawObj;
      try {
        rawObj = JSON.parse(bits[i]);
      }
      catch(ex) {
        // die quickly in event of parse failure so we don't just sit around
        //  like suckers.
        // XXX once all test-driver bugs are ironed out, we want to stop doing
        //  this and instead just propagate an annotation that there was
        //  something corrupt about the log.
        console.error("JSON PARSING PROBLEM! on...");
        console.error(bits[i]);
        process.exit(1);
      }
      // top level is 'schema', 'log' whose 'kids' are testcase loggers
      var schema = rawObj.schema;
      // -- file require() failure
      if (rawObj.hasOwnProperty("fileFailure")) {
        var fileFailure = rawObj.fileFailure;
        var summaryObj = {
          fileName: fileFailure.fileName,
          moduleName: fileFailure.moduleName,
          testName: '$FILE',
          uniqueName: fileFailure.fileName + '-$FILE',
        };
        this.overview.failures.push(summaryObj);
        this.writeCells[this.detailKeyPrefix + ":" + summaryObj.uniqueName] = {
          type: "filefail",
          fileName: summaryObj.fileName,
          moduleName: fileFailure.moduleName,
          exceptions: fileFailure.exceptions,
        };
        continue;
      }

      var definerLog = rawObj.log;
      // Empty / fully disabled test files will have no kids!
      if (!definerLog.kids)
        continue;
      for (var iKid = 0; iKid < definerLog.kids.length; iKid++) {
        var testCaseLog = definerLog.kids[iKid];
        var testUniqueName = definerLog.semanticIdent + "-" +
                               testCaseLog.semanticIdent;
        var summaryObj = {
          fileName: definerLog.semanticIdent,
          testName: testCaseLog.semanticIdent,
          uniqueName: testUniqueName,
          passed: testCaseLog.latched.result === 'pass',
        };
        if (!testCaseLog.latched ||
            (!testCaseLog.latched.result ||
             testCaseLog.latched.result !== 'pass')) {
          this.overview.failureIndicated = true;
          this.overview.failures.push(summaryObj);
        }
        else {
          this.overview.successes.push(summaryObj);
        }
        var detailObj = {
          type: "loggest",
          fileName: definerLog.semanticIdent,
          schema: schema,
          log: testCaseLog,
        };
        this.writeCells[this.detailKeyPrefix + ":" + testUniqueName] =
          detailObj;
      }
    }
  },
  onData: function(data) {
    var dstr = this.leftover ?
                 (this.leftover + data.toString("utf8")) :
                 data.toString("utf8");
    this.leftover = null;

    var othFailMatch = RE_OTHFAIL.exec(dstr);
    if (othFailMatch) {
      this.overview.failureIndicated = true;
      if (!othFailMatch[3])
        this.overview.unusualFailureIndicated = true;
    }

    var match;
    while (dstr) {
      if (this.inBlock) {
        match = RE_END.exec(dstr);
        if (match) {
          this._gobbleJsonFromLines(dstr.substring(0, match.index - 1));
          dstr = dstr.substring(match.index + match[0].length + 1);
          this.inBlock = false;
          continue;
        }
        else {
          var lastNewline = dstr.lastIndexOf("\n");
          if (lastNewline != -1) {
            this._gobbleJsonFromLines(dstr.substring(0, lastNewline));
            this.leftover = dstr.substring(lastNewline + 1);
          }
          else {
            this.leftover = dstr;
          }
          break;
        }
      }
      else {
        match = RE_START.exec(dstr);
        if (match) {
          // gobble up after the newline
          dstr = dstr.substring(match.index + match[0].length + 1);
          this.inBlock = true;
          continue;
        }
        else {
          // nothing interesting in here; but potentially keep some overlap
          var maybeLeftover = dstr.slice(-OVERLAP_PADDING);
          if (maybeLeftover.indexOf("#") != -1)
            this.leftover = maybeLeftover;
          break;
        }
      }
    }
  },

  onEnd: function(data) {
    this.callback(this.writeCells);
  },
};
exports.LoggestFrobber = Frobber;

exports.dummyTestRun = function(stream) {
  var frobber = new Frobber(stream, "s", "d", function(writeCells) {
    console.log("SUMMARY");
    console.log(writeCells.s);
    console.log("WRITE CELLS:");
    console.log(writeCells);
  });
};

}); // end define
