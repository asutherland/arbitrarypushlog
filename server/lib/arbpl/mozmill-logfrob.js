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

var RE_START = /^##### MOZMILL-RICH-FAILURES-BEGIN #####$/m;
var RE_END = /^##### MOZMILL-RICH-FAILURES-END #####$/m;
var OVERLAP_PADDING = 32;

/**
 * Consume
 */
function Frobber(stream, callback) {
  stream.on("data", this.onData.bind(this));
  stream.on("end", this.onEnd.bind(this));

  this.callback = callback;

  this.jsonObjs = [];
  this.inBlock = false;
  this.leftover = null;
}
Frobber.prototype = {
  _gobbleJsonFromLines: function(dstr) {
    var bits = dstr.split("\n");
    for (var i = 0; i < bits.length; i++) {
      this.jsonObjs.push(JSON.parse(bits[i]));
    }
  },
  onData: function(data) {
    var dstr = this.leftover ?
                 (this.leftover + data.toString("utf8")) :
                 data.toString("utf8");
    this.leftover = null;

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
    this.callback(this.jsonObjs);
  },
};
exports.MozmillFrobber = Frobber;

exports.dummyTestRun = function(path) {
  var stream = $fs.createReadStream(path);

  var frobber = new Frobber(stream, function(objs) {
    for (var i = 0; i < objs.length; i++) {
      console.log(objs[i].exception.message);
    }
  });
};

}); // end define
