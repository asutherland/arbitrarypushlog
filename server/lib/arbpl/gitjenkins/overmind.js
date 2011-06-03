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
 *    same push.  Because it's only easy to get Jenkins to tell us the revision
 *    we are building (rather than all 'new' revisions), we derive that
 *    information from asking github because we don't want to have to check out
 *    repositories locally.  We use the jenkins build id's as the push id's.
 * - We hear and care about both successes and failures so we have more
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
    'q',
    '../hstore',
    '../databus',
    '../utils/reliahttp',
    'exports'
  ],
  function(
    $Q,
    $hstore,
    $databus,
    $reliahttp,
    exports
  ) {
var when = $Q.when;

var DB = new $hstore.HStore();

const GITHUB_API_ROOT = "http://github.com/api/",
      GITHUB_API_COMMITS = GITHUB_API_ROOT + "v2/json/commits/";


/**
 * We are pointed at one or more log files, we process them.
 *
 * General notes:
 * - Jenkins build id's are used as our push id's.  If/when we start performing
 *    multiple builds per push we will likely model those as downstream builds
 *    that use that contribute builds onto the root build's build id.
 */
function JenkgitOvermind(buildTreeDef, options) {
  this.buildTree = buildTreeDef;

  options.buildNum = parseInt(options.buildNum);
  this.options = options;

  this.bridge = new $databus.ScraperBridgeSource(options.bridgePort);

  this._procDeferred = null;
  this._remainingSteps = null;

  this._pendingSidebandState = null;
}
JenkgitOvermind.prototype = {
  bootstrap: function() {
    return DB.bootstrap();
  },

  /**
   * Given a specific commit being used in a build find the list of commits,
   *  likely including the build commit itself, that are new to the repository.
   *
   * The implementation is currently github specific, relying on its REST API
   *  to get information about the commits.  We use the "show the details for
   *  a specific commit" API to get our info which means N requests for N
   *  revisions.  We do this because the files modified are only available via
   *  this mechanism and it avoids the complexity of the paging mechanism in
   *  the commit listing requests.
   *
   * We aren't directly inquiring from git because we 1) don't want to have to
   *  have the repo available locally and 2) running some logic on the jenkins
   *  machine to package up the results looks like it would require some
   *  jenkins plugin hacking at this point.
   */
  _findCommitBatchForBuildCommit: function() {
  },

  /**
   * Make sure the database knows about this build; if it does not, fetch
   *  the required info and populate the database.  Subsequent work performed
   *  by `_gotDbPushInfo`.
   */
  _ensurePush: function() {
    var self = this;
    return when(DB.getPushInfo(this.buildTree.id, this.options.buildNum),
      function(rowResults) {
        return self._gotDbPushInfo(DB.normalizeOneRow(rowResults));
      },
      function(err) {
        console.error("DB problem that's poorly handled...", err);
      });
  },

  /**
   *
   */
  _gotDbPushInfo: function(dbstate) {
    if (!dbstate.hasOwnProperty("s:r")) {
      return when(this._findCommitBatchForBuildCommit(this.options.commit),
        function(pushInfo) {
        },
        function(err) {
        });
    }
  },

  /**
   * Run the loggest frobber
   */
  _processLog: function() {
  },

  _sendSideband: function() {
  },

  _runSteps: function(steps) {
    this._procDeferred = $Q.defer();
    this._remainingSteps = steps;

    var self = this;
    function failStep(err) {
      self._procDeferred.reject(err);
      self._procDeferred = null;
    }
    function runNextStep(val) {
      if (!steps.length) {
        self._procDeferred.resolve();
        self._procDeferred = null;
        return;
      }

      var stepFunc = steps.shift();
      when(stepFunc.call(this, val), runNextStep, failStep);
    }

    runNextStep();
    return this._procDeferred.promise;
  },

  processBuiltStart: function() {
    return this._runSteps([
      this.bootstrap,
      this._findCommitBatchForBuildCommit,
      this._ensurePush,
      this._sendSideband,
    ]);
  },

  processBuildCompletedWithLog: function() {
    return this._runSteps([
      this.bootstrap,
      this._findCommitBatchForBuildCommit,
      this._ensurePush,
      this._processLog,
      this._sendSideband,
    ]);
  },
};
exports.Overmind = JenkgitOvermind;

}); // end define
