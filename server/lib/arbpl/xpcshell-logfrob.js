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
 * Process tinderbox xpcshell logs, summarize the failures, ignore successes.
 **/

define(
  [
    "carrier",
    "crypto",
    "exports"
  ],
  function(
    $carrier,
    $crypto,
    exports
  ) {

/**
 * We are in the wide open spaces between test failures, looking for a
 *  declaration of a test failure that will be followed by a log.  We transition
 *  to FST_IN_TEST_LOG once we see RE_FAILED_TEST_STARTS.
 */
var FST_LOOKING_FOR_FAILED_TEST = 0;
/**
 * We are in a log processing it, looking for the first TEST-UNEXPECTED-FAIL in
 *  the log.  Once we see it, we transition to FST_DONE_WITH_LOG.  We archive
 *  all lines for retrieval, as well as generating a deterministic trace for
 *  consultation.
 */
var FST_IN_TEST_LOG = 1;
/**
 * We saw the first TEST-UNEXPECTED-FAIL in a log and are now waiting for the
 *  end of the log.  We ignore everything after the first failure for
 *  deterministic trace purposes because after that point things tend to go off
 *  the rails and become gibberishy.  However, our general logging continues
 *  because the test framework might say some useful things humans care about on
 *  the way out.  (Exception death, unexpected additional turns of the event
 *  loop that the test framework was not really expecting, etc.)
 *
 * We transition back to FST_LOOKING_FOR_FAILED_TEST when we see the "<<<<<<<"
 *  that signals the end of the log.
 */
var FST_DONE_WITH_LOG = 2;

/**
 * The regular expression to detect the python test runner reporting a failed
 *  test before it dumps the buffer.  Semantically different from the failure
 *  marker in a test, although otherwise similar.
 */
var RE_FAILED_TEST_STARTS = /^TEST-UNEXPECTED-FAIL \| (.+) \| /;
/**
 * The entirety of the line that tells us we are getting a test log run.
 */
var LOG_START_MARKER = ">>>>>>>";
/**
 * Lines that should be part of our determinism trace.  We care about TEST-INFO
 *  primarily because do_test_pending/do_test_finished generate TEST-INFO lines.
 */
var RE_TEST_DETERMINISTIC_LINE = /^TEST-(INFO|PASS|UNEXPECTED-FAIL) \| /;
/**
 * The entirety of the line that terminates the log is thus:
 */
var LOG_END_MARKER = "<<<<<<<";

/**
 * We only care about the relative test path of the xpcshell test.  This starts
 *  after we find /build/xpcshell/tests/, but the slash type can vary based on
 *  the platform.
 */
var RE_TEST_TREE_PATH_BASE = /.+[/\\]build[/\\]xpcshell[/\\]tests[/\\](.+)/;

var RE_BACKSLASH = /\\/g;

var RE_IS_MOCHITEST = /^chrome:/;

/**
 * Process a tinderbox xpcshell run for failures.  When we see xpcshell
 *  calling out a failure and dumping a log, we process the log for all xpcshell
 *  lines.  We use this to generate a hopefully deterministic trace once the
 *  paths are normalized that we can hash to provide a signature for the failure
 *  variation.
 *
 * The theory is that although the test may dump all kinds of random output
 *  which could involve timestamps or other output we would need wisdom to
 *  scrub, the xpcshell lines can basically only do equivalence checks which
 *  should greatly increase the probability of them being (effectively) static.
 *  (Note: we ignore the path part of the line entirely because it seems
 *  unlikely that a change in file path would meaningfully happen without some
 *  other change to the deterministic trace.)
 */
function XpcshellFrobber(stream, summaryKey, detailKeyPrefix, callback) {
  this.detailKeyPrefix = detailKeyPrefix;
  this.callback = callback;

  this.carrier = $carrier.carry(stream);
  this.carrier.on("line", this.onLine.bind(this));
  stream.on("end", this.onEnd.bind(this));

  /**
   * MD5 hasher to feed lines to when we are in a test log generating a
   *  deterministic trace.
   */
  this.hasher = null;

  this.state = FST_LOOKING_FOR_FAILED_TEST;

  this.overview = {type: "xpcshell", failures: []};
  this.writeCells = {};
  this.writeCells[summaryKey] = this.overview;

  this.curFailure = null;
  this.curDetails = null;
}
XpcshellFrobber.prototype = {
  onLine: function(line) {
    var match;
    switch (this.state) {
      case FST_LOOKING_FOR_FAILED_TEST: {
        match = RE_FAILED_TEST_STARTS.exec(line);
        if (match) {
          var fullPath = match[1];
          // we hate mochitests; go directly to waiting for the log end marker.
          // (note: we should not actually be provided mochitest logs, but
          //  since I already screwed up once...)
          if (RE_IS_MOCHITEST.test(fullPath) ||
              // mochitest timeout reports like so:
              fullPath == "Shutdown") {
            console.warn("XpcshellFrobber does not like mochitests, " +
                         "but you still gave me one anyways!", fullPath);
            this.state = FST_DONE_WITH_LOG;
            break;
          }

          this.state = FST_IN_TEST_LOG;
          this.hasher = $crypto.createHash("md5");

          match = RE_TEST_TREE_PATH_BASE.exec(fullPath);
          if (!match)
            console.error("failed to match on", fullPath);
          var testPath = match[1].replace(RE_BACKSLASH, "/");
          this.curFailure = {
            test: testPath,
            uniqueName: testPath,
            hash: null,
            details: [],
          };
          this.curDetails = {
            type: "xpcshell",
            rawLog: [],
            deterministicLog: [],
          };
          this.writeCells[this.detailKeyPrefix + ":" + testPath] =
            this.curDetails;
          // (don't push the failure on the list until the log gets closed out
          //  as a paranoia move in case the log is somehow truncated.)
        }
      }
      break;

      case FST_IN_TEST_LOG: {
        if (line === LOG_START_MARKER)
          break;
        this.curDetails.rawLog.push(line);
        match = RE_TEST_DETERMINISTIC_LINE.exec(line);
        if (match) {
          // use indexOf "|" to skip over the path name, "|" and whitespace
          var goodBit = line.substring(line.indexOf("|", match[0].length) + 2);
          this.curDetails.deterministicLog.push(goodBit);
          this.hasher.update(goodBit);

          // If it's the (first) failure, we have enough to formalize the
          //  failure.  This also concludes the deterministic trace.
          if (match[1] == "UNEXPECTED-FAIL") {
            // For now, assume just the first failure is the only useful bit,
            //  although we may be able to expand this using heuristics in the
            //  future.
            this.curFailure.details.push(goodBit);
            this.curFailure.hash = this.hasher.digest("base64");
            this.overview.failures.push(this.curFailure);

            this.state = FST_DONE_WITH_LOG;
          }
        }
      }
      break;

      case FST_DONE_WITH_LOG: {
        if (line === LOG_END_MARKER) {
          this.hasher = null;
          this.curFailure = null;
          this.curDetails = null;

          this.state = FST_LOOKING_FOR_FAILED_TEST;
        }
        else {
          this.curDetails.rawLog.push(line);
        }
      }
      break;
    }
  },
  onEnd: function() {
    this.callback(this.writeCells);
  }
};
exports.XpcshellFrobber = XpcshellFrobber;

exports.dummyTestRun = function(stream) {
  var frobber = new XpcshellFrobber(stream, "s", "d", function(writeCells) {
    console.log("SUMMARY");
    console.log(writeCells.s);
    console.log(writeCells.s.failures);
    console.log("WRITE CELLS:");
    console.log(writeCells);
  });
};

}); // end define
