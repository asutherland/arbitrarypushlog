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
 * Batch operations on multiple overminds; mainly just to trigger syncs
 *  (sequentially).  Uses the set of trees defined in repodefs as our hard-coded
 *  list of repositories.
 **/

define(
  [
    "q",
    "./overmind",
    "arbcommon/repodefs",
    "exports"
  ],
  function(
    $Q,
    $overmind,
    $repodefs,
    exports
  ) {
var when = $Q.when;

/**
 * Perform operations on multiple overminds.
 *
 * @args[
 *   @param[treeDefs @dictof["ignored tree name" TinderTreeDef]]
 * ]
 */
function HiveMind(treeDefs) {
  // convert into a list from a map...
  var trees = this.trees = [];
  for (var ignoredTreeName in treeDefs) {
    trees.push(treeDefs[ignoredTreeName]);
  }

  this._unprocessedTrees = null;
  this._syncDeferred = null;
  this._curOvermind = null;
}
HiveMind.prototype = {
  syncAll: function syncAll() {
    this._syncDeferred = $Q.defer();

    this._unprocessedTrees = this.trees.concat();
    this._syncNext();

    return this._syncDeferred.promise;
  },

  _syncNext: function _syncNext() {
    if (!this._unprocessedTrees.length) {
      this._syncDeferred.resolve();
      return;
    }

    this._curOvermind = new $overmind.Overmind(this._unprocessedTrees.pop());
    var self = this;
    when(self._curOvermind.bootstrap(),
      function() {
        when(self._curOvermind.syncUp(),
          function() {
            self._curOvermind = null;
            self._syncNext();
          });
      });
  }
};
exports.HIVE_MIND = new HiveMind($repodefs.TINDER_TREES);

}); // end define
