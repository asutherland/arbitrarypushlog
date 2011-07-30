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
 * The Original Code is Mozilla Raindrop Code.
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
 * Dicing/faceting logic.  We are assisted by "dicing" entries in the logger
 *  schema definition to tell us what logger types are eligible for dicing
 *  and the bin groups that should be used when dicing.
 *
 * Our dicing processing consists of an initial phase where we figure out just
 *  enough to be able to expose to the UI what dicers are available, and then
 *  user-triggered phases where we actually perform the binning and/or
 *  display.
 **/

define(
  [
    'exports'
  ],
  function(
    exports
  ) {

/**
 * Perform a dicing pass.
 *
 * Filtering broad strokes:
 * - We can restrict to specific logger family hierarchies.  We (can do) this
 *    both for efficiency and because it is possible that loggers may not
 *    sufficiently namespace on their own.
 * - We express interest in a specific
 *
 * Processing broad strokes:
 * - Figure out what loggers are actually capable of generating events of
 *    interest.
 * - Walk the affected matrix columns in strictly increasing time-order,
 *    including the events that match the filter.
 */
function dicePerm() {
}

exports.populatePermutationDicers = function populatePermutationDicers(perm) {

};

}); // end define
