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
 * Process tinderbox mochitest logs.
 **/

define(
  [
    "carrier",
    "exports"
  ],
  function(
    $carrier,
    exports
  ) {

/**
 * We are not in a test, but are looking for TEST-START.  We transition to
 *  `FST_IN_TEST_SPECULATIVE_LOGGING` when we see one.
 */
var FST_LOOKING_FOR_TEST_START = 0;
/**
 * We are in a test (after TEST-START, before TEST-END) and may or may not
 *  have seen a failure.  When we see a failure we se `curFailure` and friends
 *  and use that to detect an edge transition.  We transition back to
 *  FST_LOOKING_FOR_TEST_START when we see TEST-END.
 */
var FST_IN_TEST = 1;

var RE_TEST_START = /TEST-START \| (.+)$/;
/**
 * Normal test-end; we can also encounter a crash situation where we see
 *  TEST-UNEXPECTED-FAIL, followed by some "INFO |" lines followed by a
 *  PROCESS-CRASH, some crash data, and attempt to process the leak log,
 *  followed by "INFO | runtests.py | Running tests: end.".
 */
var RE_TEST_END = /TEST-END \| (.+) | finished in (\d+)ms$/;
var RE_HARD_TEST_END = /^INFO \| runtests.py \| Running tests: end\.$/;

/**
 * Error string; does not have to be at the start of the line for mochitests.
 */
var RE_FAILED_TEST_STARTS = /TEST-UNEXPECTED-FAIL \| (.+) \| /;

var RE_SCREENSHOT_LINE = /^SCREENSHOT: data:image/;
var LEN_SCREENSHOT = ("SCREENSHOT: ").length;

var RE_GOBBLE_PREFIX = /^chrome:/;
var RE_IGNORE_PREFIX = /^(?:automation|plugin|\(SimpleTest)/;
var GOBBLE_URL_LEN = ("chrome://mochitests/content/").length;

/**
 * The maximum number of lines to put in the raw log.  People can go see the
 *  full log for themselves if they are so inclined...
 */
var MAX_LOG_LENGTH_IN_LINES = 8192;

/**
 * Process a mochitest log for failures.  Mochitests have the following
 *  interesting characteristics with the noted compensations:
 *
 * - Additional metadata at a failure for a given test may be shown as
 *   TEST-UNEXPECTED-FAIL lines.  They are still identified by the same path
 *   string, so we just cluster the additional lines with the first line in
 *   terms of info.
 *
 * - PROCESS-CRASH lines can be expected or unexpected (and thus failures).  The
 *   testing framework already generates TEST-UNEXPECTED-FAILURE lines when
 *   the crash is unexpected, so we don't actually have to do anything.
 *   However, if we cared about processing the failure stacks, we would want
 *   to look for these.
 *
 * We do not bother to do any deterministic trace stuff like we do for xpcshell
 *  because we don't know where to find such trace data.
 */
function MochiFrobber(stream, summaryKey, detailKeyPrefix, callback) {
  this.detailKeyPrefix = detailKeyPrefix;
  this.callback = callback;

  this.carrier = $carrier.carry(stream);
  this.carrier.on("line", this.onLine.bind(this));
  stream.on("end", this.onEnd.bind(this));

  this.overview = {type: "mochitest", failures: []};
  this.writeCells = {};
  this.writeCells[summaryKey] = this.overview;

  this.rawLog = null;
  this.curFailure = null;
  this.curDetails = null;
  this.state = FST_LOOKING_FOR_TEST_START;

  this.ignoredLineCount = 0;
}
MochiFrobber.prototype = {
  onLine: function(line) {
    var match;
    switch (this.state) {
      case FST_LOOKING_FOR_TEST_START:
        match = RE_TEST_START.exec(line);
        if (match) {
          // log the start line for book-ending
          this.rawLog = [line];
          this.state = FST_IN_TEST;
        }
        break;

      case FST_IN_TEST:
        // do not put the screenshot in raw logs; special-case...
        if (RE_SCREENSHOT_LINE.test(line)) {
          if (this.curDetails)
            this.curDetails.screenshotDataUrl = line.substring(LEN_SCREENSHOT);
          break;
        }
        // log all lines up to and including the TEST-END
        if (this.rawLog.length === MAX_LOG_LENGTH_IN_LINES)
          this.rawLog.push("TOO MANY LINES! I GIVE UP!");
        else if (this.rawLog.length < MAX_LOG_LENGTH_IN_LINES)
          this.rawLog.push(line);
        else
          this.ignoredLineCount++;
        if ((match = RE_FAILED_TEST_STARTS.exec(line))) {
          var fullPath = match[1];
          // this could be an automationutils gibberish thing, which is simply
          //  fallout of the previous test.  ignore.
          if (RE_IGNORE_PREFIX.test(fullPath))
            return;
          var relPath;
          if (RE_GOBBLE_PREFIX.test(fullPath))
            relPath = fullPath.substring(GOBBLE_URL_LEN);
          else
            relPath = fullPath;
          if (relPath[0] == "/")
            relPath = relPath.substring(1);
          var goodBit = line.substring(match.index + match[0].length);
          if (this.curFailure) {
            this.curFailure.details.push(goodBit);
          }
          else {
            this.curFailure = {
              test: relPath,
              uniqueName: relPath,
              details: [goodBit],
            };
            this.curDetails = {
              type: "mochitest",
              rawLog: this.rawLog,
              ignoredLineCount: 0,
              screenshotDataUrl: null,
            };
            this.overview.failures.push(this.curFailure);
            this.writeCells[this.detailKeyPrefix + ":" + relPath] =
              this.curDetails;
          }
        }
        else if ((match = RE_TEST_END.exec(line)) ||
                 RE_HARD_TEST_END.test(line)) {
          if (this.ignoredLineCount) {
            if (this.curDetails) {
              this.rawLog.push("ignored: " + this.ignoredLineCount + " lines");
              this.curDetails.ignoredLineCount = this.ignoredLineCount;
            }
            this.ignoredLineCount = 0;
          }
          this.state = FST_LOOKING_FOR_TEST_START;
          this.curFailure = null;
          this.curDetails = null;
          this.rawLog = null;
        }

        break;
    }
  },
  onEnd: function() {
    this.callback(this.writeCells);
  }
};
exports.MochiFrobber = MochiFrobber;

exports.dummyTestRun = function(stream) {
  var frobber = new MochiFrobber(stream, "s", "d", function(writeCells) {
    console.log("SUMMARY");
    console.log(writeCells.s);
    console.log("WRITE CELLS:");
    console.log(writeCells);
  });
};


}); // end define
