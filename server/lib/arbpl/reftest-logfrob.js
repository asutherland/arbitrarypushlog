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
 * Process tinderbox mochitest logs as much as they deserve.  This file is a
 *  fork of xpcshell-logfrob because we don't want to contaminate that file
 *  with workarounds for annoying mochitest BS.
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
 * The regular expression to detect the python test runner reporting a failed
 *  test before it dumps the buffer.  Semantically different from the failure
 *  marker in a test, although otherwise similar.
 */
var RE_FAILED_TEST_STARTS = /^REFTEST TEST-UNEXPECTED-FAIL \| (.+) \| /;

var RE_GOBBLE = /^http:\/\/localhost:\d+\/\d+\/\d+\//;
var RE_FALLBACK_GOBBLE = /\/test\/build\//;

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
function ReftestFrobber(stream, callback) {
  this.callback = callback;

  this.carrier = $carrier.carry(stream);
  this.carrier.on("line", this.onLine.bind(this));
  stream.on("end", this.onEnd.bind(this));

  this.failures = [];
  this.curFailure = null;
}
ReftestFrobber.prototype = {
  onLine: function(line) {
    var match = RE_FAILED_TEST_STARTS.exec(line);
    if (match) {
      var fullPath = match[1], relPath;
      var gobbleMatch = RE_GOBBLE.exec(fullPath);
      if (!gobbleMatch) {
        gobbleMatch = RE_FALLBACK_GOBBLE.exec(fullPath);
        if (!gobbleMatch) {
          console.error("bad gobble match on", fullPath);
          return;
        }
      }
      relPath = fullPath.substring(gobbleMatch.index + gobbleMatch[0].length);
      if (relPath[0] == "/")
        relPath = relPath.substring(1);
      var goodBit = line.substring(match.index + match[0].length);
      if (this.curFailure && this.curFailure.test == relPath) {
        this.curFailure.details.push(goodBit);
        return;
      }

      this.curFailure = {
        test: relPath,
        details: [goodBit],
      };
      this.failures.push(this.curFailure);
    }
  },
  onEnd: function() {
    this.callback(this.failures);
  }
};
exports.ReftestFrobber = ReftestFrobber;

exports.dummyTestRun = function(stream) {
  var frobber = new ReftestFrobber(stream, function(failures) {
    for (var i = 0; i < failures.length; i++) {
      console.log(failures[i]);
    }
  });
};


}); // end define
