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
 * Git-ish Jenkins-ish processing pipeline with a github bias.
 *
 * We primarily differ from the Mozilla Tinderbox logic in that:
 * - We are not provided a canonical linearized view of the commit history by
 *    the pushlog hook because there is no pushlog.  Instead we approximate
 *    the pushlog based on the builds that Jenkins triggers.  Namely, all of
 *    the commits that happened since the last build are declared part of the
 *    same push.  One nice feature of this is that we should be able to
 *    reconstruct the data from our logs.
 * - We hear about and care about both successes and failures so we have more
 *    data and (more importantly) will definitely need an analytical pass that
 *    determines whether the success is interesting or not.  The analytical
 *    pass should not be coupled to this implementation, but we want it to run
 *    when we find out about new stuff, and so it is going to live in our
 *    app for now and be triggered by us or whatever triggers us.
 * - We are trying to be gitflow/feature-branch aware.  Specifically, we want
 *    to be able to see what a branch is getting up to relative to whatever
 *    it branched off of and do so as of the last merge.  (A longer term goal
 *    might be to run an analysis with both the upstream as a comparison basis
 *    and with the branch-work prior to the merge as the other comparison
 *    basis.)
 **/

define(
  [
    'exports'
  ],
  function(
    exports
  ) {

/**
 * We are pointed at one or more log files, we process them.
 */
function JenkgitOvermind(buildTreeDef, config) {
}
JenkgitOvermind.prototype = {
  /**
   * Retrieve all the currently unknown commits for a repository, linearize
   *  them, and persist them to our datastore.  The assumption is that we will
   *  be triggered in rough correspondence to when new builds are made and
   *  tests run and that this will roughly correspond with pushes made.  More
   *  specifically, if hear about some commits that are older than recent
   *  commits we have already fully processed, those older commits are still
   *  going to get push id's that are more recent than the commits they
   *  pre-date and this is believed desirable.  The perfection concern is that
   *  if the
   *
   *
   * The implementation is currently github specific, relying on its REST API
   *  to get information about the commits.
   *
   * The general algorith mis:
   * - Ask for the most recent page of commits.
   */
  getAndLinearizeCommits: function() {
  },
};

}); // end define
