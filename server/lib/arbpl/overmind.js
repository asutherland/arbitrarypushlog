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
 * Main processing pipeline logic.  We operate based on a time-window based
 *  mode of operation.  In steady state, the window is open-ended from the last
 *  grab time.  In backfill, it's a specific window based on our backfill chunk
 *  size.
 *
 * General operation looks like this:
 * - Figure out the appropriate time window for a given Tinderbox tree.  This is
 *    hinted by checking the database for a tree and finding the most recent
 *    completed build timestamp we have heard about.
 * - Fetch the tinderbox data for that time window.
 * - Fetch the pushlog data corresponding to the revisions the tinderbox told us
 *    about.  If our time window is intended to cover through "now", issue the
 *    query open-ended so we might see push data that does not yet have builds
 *    triggered.
 * - Ask the database about everything we have heard about.
 * - Figure out what the database does not know about for the data we already
 *    have and store it.
 * - Figure out what build logs are interesting to us that we have not already
 *    fetched and processed and fetch them.
 **/

define(
  [
    "q/util",
    "./datastore",
    "exports"
  ],
  function(
    $Q,
    $datastore,
    exports
  ) {

var when = $Q.when;

var DB = new $datastore.HStore();

function Overmind(tinderTreeDef) {
  this.tinderTree = tinderTreeDef;

  this.state = "inactive";
}
Overmind.prototype = {
  _noteState: function(newState) {
    this.state = newState;
  },

  /**
   * Attempt to bring us up-to-date based on the current state.  In the event
   *  we have no data whatsoever, grab the most recent 12 hours.
   */
  syncUp: function() {
    var self = this;
    when(DB.getMostRecentKnownPush(this.tinderTree.id),
      function(rowResults) {
        
      },
      function(err) {

      });
  },

  syncTimeRange: function() {
  },
};

}); // end define
