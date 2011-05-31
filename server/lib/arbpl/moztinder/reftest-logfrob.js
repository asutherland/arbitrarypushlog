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
 * Process reftests; they are closest to mochitests but have some weird logging
 *  semantics and so are going to get the shortest end of the stick for now.
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

var RE_FAILED_TEST_STARTS = /^REFTEST TEST-UNEXPECTED-FAIL \| (.+) \| /;

var RE_GOBBLE = /^http:\/\/localhost:\d+\/\d+\/\d+\//;
var RE_FALLBACK_GOBBLE = /\/test\/build\//;

/**
 * Look for unexpected failures, log them.  For normalization we will pretend we
 *  have details but it's all a big lie.
 */
function ReftestFrobber(stream, summaryKey, detailKeyPrefix, callback) {
  this.detailKeyPrefix = detailKeyPrefix;
  this.callback = callback;

  this.carrier = $carrier.carry(stream);
  this.carrier.on("line", this.onLine.bind(this));
  stream.on("end", this.onEnd.bind(this));

  this.overview = {type: "mochitest", failures: []};
  this.writeCells = {};
  this.writeCells[summaryKey] = this.overview;
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
        uniqueName: relPath,
        details: [goodBit],
      };
      this.overview.failures.push(this.curFailure);
      this.writeCells[this.detailKeyPrefix + ":" + relPath] = {
        type: "reftest",
      };
    }
  },
  onEnd: function() {
    this.callback(this.writeCells);
  }
};
exports.ReftestFrobber = ReftestFrobber;

exports.dummyTestRun = function(stream) {
  var frobber = new ReftestFrobber(stream, "s", "d", function(writeCells) {
    console.log("SUMMARY");
    console.log(writeCells.s);
    console.log("WRITE CELLS:");
    console.log(writeCells);
  });
};


}); // end define
