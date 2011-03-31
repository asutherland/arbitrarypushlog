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
 * Process a stream for delineated mozmill rich failure JSON blobs.
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
 */
var RE_OTHFAIL = /(^Disconnect Error: Application unexpectedly closed)|(^Timeout: bridge.execFunction)|(^ +TEST-UNEXPECTED-FAIL)/m;

var RE_START = /^##### MOZMILL-RICH-FAILURES-BEGIN #####$/m;
var RE_END = /^##### MOZMILL-RICH-FAILURES-END #####$/m;
var OVERLAP_PADDING = 32;

var RE_BACKSLASH = /\\/g;

/**
 * Consume
 */
function Frobber(stream, summaryKey, detailKeyPrefix, callback) {
  stream.on("data", this.onData.bind(this));
  stream.on("end", this.onEnd.bind(this));

  this.detailKeyPrefix = detailKeyPrefix;
  this.callback = callback;

  this.overview = {
    type: "mozmill",
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

      var detailObj = JSON.parse(bits[i]);

      // XXX temporary windows path normalization that runtests.py is not
      //  fixing for us; long term we want runtests.py to not need to do this.
      if (detailObj.fileName.indexOf("\\") != -1) {
        detailObj.fileName = detailObj.fileName.replace(RE_BACKSLASH, "/");
        var pathParts = detailObj.fileName.split("/");
        detailObj.fileName = pathParts.slice(-2).join("/");
      }

      var summaryObj = {};
      for (var key in detailObj) {
        if (key != "failureContext")
          summaryObj[key] = detailObj[key];
      }
      var testUniqueName = detailObj.fileName + "-" + detailObj.testName;
      summaryObj.uniqueName = testUniqueName;
      detailObj.type = "mozmill";
      this.overview.failures.push(summaryObj);
      this.writeCells[this.detailKeyPrefix + ":" + testUniqueName] = detailObj;
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
exports.MozmillFrobber = Frobber;

exports.dummyTestRun = function(stream) {
  var frobber = new Frobber(stream, "s", "d", function(writeCells) {
    console.log("SUMMARY");
    console.log(writeCells.s);
    console.log("WRITE CELLS:");
    console.log(writeCells);
  });
};

}); // end define
