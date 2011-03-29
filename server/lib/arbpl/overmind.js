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
    "q",
    "./hstore",
    "./databus",
    "./tinderboxer",
    "./xpcshell-logfrob", "./mozmill-logfrob",
    "./mochitest-logfrob", "./reftest-logfrob",
    "arbcommon/repodefs",
    "./utils/reliahttp",
    "./hackjobs",
    "exports"
  ],
  function(
    $Q,
    $hstore,
    $databus,
    $tinderboxer,
    $frobXpcshell, $frobMozmill,
    $frobMochitest, $frobReftest,
    $repodefs,
    $reliahttp,
    $hackjobs,
    exports
  ) {

var when = $Q.when;

var DB = new $hstore.HStore();

var HOURS_IN_MS = 60 * 60 * 1000;

/**
 * The pushlog has ugly internal date parsing plus a fallback to the python
 *  "parsedatetime" module.  We opt to fail the custom date parsing regex and
 *  so go straight to parsedatetime which can understand time zones reliably.
 */
function PushlogDateString(d){
 function pad(n) {
   return n<10 ? '0'+n : n;
 };
 return encodeURIComponent(
   pad(d.getUTCMonth()+1) + '/' +
   pad(d.getUTCDate()) + '/' +
   d.getUTCFullYear() + ' ' +
   + pad(d.getUTCHours())+':'
   + pad(d.getUTCMinutes())+':'
   + pad(d.getUTCSeconds()) + 'Z');
}

function Overmind(tinderTreeDef, config) {
  this.tinderTree = tinderTreeDef;

  this.tinderboxer = new $tinderboxer.Tinderboxer(tinderTreeDef.name);

  this.bridge = new $databus.ScraperBridgeSource(config.bridgePort);

  this.state = "inactive";
  this._syncDeferred = null;

  /**
   * How many pushlog queries are in flight to the hg server?  We track this
   *  so we can resolve a promise when the number hits zero and stays there.
   *  (We may temporarily hit zero during the resolution process, but it
   *  will rebound to 1 before control flow is yielded.)
   */
  this._pendingPushFetches = 0;

  /**
   * How many log processing jobs are active?  This is used
   */
  this._activeLogFrobbers = [];
  /**
   * Queued log processing jobs.
   */
  this._logProcJobs = null;

  /**
   * @dictof[
   *   @key["repo:short-changeset-id" String]{
   *     An aggregate key made up of the repo name from the `CodeRepoDef` (Ex:
   *     "comm-central", "mozilla-central") and the 12-character form of the
   *     changeset revision (which is just the first 12 characters).
   *   }
   *   @value[@dict[
   *     @key[push Object]{
   *       The entire push meta-information blob from the hg pushlog for the
   *       push the changeset belongs to.
   *     }
   *     @key[changeset Object]{
   *       The changeset meta-information for the changeset.  This can be found
   *       inside the push structure too, but is obviously much easier to get
   *       to this way.
   *     }
   *   ]]
   * ]
   */
  this._revInfoByRepoAndRev = null;

  /**
   * @listof[@dict[
   * ]]{
   *   List of pushes to process from oldest to newest; used by
   *    `_processNextPush`, populated by `_processFirstPush`.
   * }
   */
  this._pushQueue = null;

  /**
   * Hierarchical map that clusters the builds.  In the case of comm-central,
   *  the outer map will contain the comm-central revisions as keys, and the
   *  values with be maps with mozilla-central revisions as keys.  In
   *  the case of mozilla-central, there will only be the revMap whose keys
   *  are mozilla-central revisions.
   *
   * The values/leaf nodes in the map will be dictionaries with objects with
   *  a "builds" list in it.
   */
  this._revMap = null;

  /**
   * The accumulated DB delta state that we will send via the sideband
   *  mechanism in one go when completed.  We accumulate this because failure
   *  clustering needs to hear about the failures at the same time it hears
   *  about the log summaries.  Also, otherwise we can end up sending a lot
   *  of traffic that would really benefit from clustering.
   */
  this._pendingSidebandState = null;
  this._pendingPushId = null;

  /**
   * For use by _fetchSpecificPushInfo to detect when a repo simply does not
   *  know about a given revision.  This can occur in cases where a repo has
   *  been cleared out but tinderbox still knows about builds from before the
   *  repo has been cleared out.
   */
  this._oneOffRevisionFetch = null;
}
Overmind.prototype = {
  _noteState: function(newState, extra) {
    this.state = newState;
    //console.log("Overmind state is now:", this.state, extra ? extra : "");
  },

  bootstrap: function() {
    return DB.bootstrap();
  },

  /**
   * Attempt to bring us up-to-date based on the current state.  Which means
   *  asking for what has happened in the last 12 hours (or whatever the
   *  tinderbox actually gives us from its "now" file) since it can involve
   *  starred stuff, slow builds, and the like.
   */
  syncUp: function() {
    return this.syncTimeRange({
      // We kick endTime into the future to cause a fast-path branch
      //  to be taken where we don't even issue a query proper but just
      //  ask for the "current" file.  (We are _not_ trying to fight
      //  clock skew on the server!  This just needs to be offset
      //  enough that the given duration has not ellapsed by the time
      //  we get to that fast-path check.)
      endTime: Date.now() + (20 * 1000),
      duration: 12 * HOURS_IN_MS,
    });
  },

  syncTimeRange: function(timeRange) {
    console.log("syncTimeRange... through", new Date(timeRange.endTime));
    this._syncDeferred = $Q.defer();

    this._logProcJobs = [];

    this._noteState("tinderbox:fetching");
    this._usingRange = timeRange;

    var self = this;
    when(this.tinderboxer.fetchRange(timeRange),
      this._procTinderboxBuildResults.bind(this),
      function(err) {
        console.error("problem getting tinderbox results.");
        self._syncDeferred.reject();
      });

    return this._syncDeferred.promise;
  },

  _abort: function(err) {
    this._syncDeferred.reject(err);
  },

  /**
   * Group results by build revision tuples, then ask the pushlog server for
   *  those revisions we do not currently know about.
   */
  _procTinderboxBuildResults: function(results) {
    this._noteState("tinderbox:processing");

    var RE_SUBDIR_NORM = /^(?:releases|projects)\//;
    /**
     * Given a repo-name from the tinderbox (basically the repo path), try
     *  and find the `CodeRepoDef` for that repository.
     */
    function findRepoDef(repoName) {
      var match = RE_SUBDIR_NORM.exec(repoName);
      if (match) {
        repoName = repoName.substring(match[0].length);
      }

      if ($repodefs.REPOS.hasOwnProperty(repoName)) {
        return $repodefs.REPOS[repoName];
      }
      return null;
    }

    /** Map repo families to revision map depth... */
    var familyPrioMap = {};
    /**
     * For dictionary key purposes in our maps we use the tree's canonical repo
     *  for a given family; establish this map.
     */
    var familyCanonRepoMap = {};
    for (var iRepo = 0; iRepo < this.tinderTree.repos.length; iRepo++) {
      familyPrioMap[this.tinderTree.repos[iRepo].family] = iRepo;
      familyCanonRepoMap[this.tinderTree.repos[iRepo].family] =
        this.tinderTree.repos[iRepo];
    }

    var revMap = this._revMap = {};
    // pre-initialize the repoAndRevs map for at least the canonical repo
    var repoAndRevs = {};
    repoAndRevs[this.tinderTree.repos[0].name] = {
      repo: this.tinderTree.repos[0],
      canonRepo: this.tinderTree.repos[0],
      revs: [],
    };
    var i, revision, repoDef;
    // Start out using the same time range as we asked the tinderbox for.
    var earliest = (this._usingRange.endTime - this._usingRange.duration),
        latest = this._usingRange.endTime;
    var expectedRevCount = this.tinderTree.repos.length;

    buildLoop:
    for (var buildId in results) {
      var build = results[buildId];

      if (earliest == null || build.startTime < earliest)
        earliest = build.startTime;
      if (latest == null || build.startTime > latest)
        latest = build.startTime;

      // Resolve and order the repositories based on our tupling hierarchy.
      // (We can't just key into build.revs in the order we want because on try
      //  servers we cannot guarantee that the exact repo we expect will be in
      //  use; that might be the variation that was being tried!)
      var orderedRevInfo = [];
      var seenRevs = 0;
      for (var revRepo in build.revs) {
        seenRevs++;
        revision = build.revs[revRepo];
        repoDef = findRepoDef(revRepo);
        if (!repoDef || !familyPrioMap.hasOwnProperty(repoDef.family)) {
          // tracemonkey uses mobile-browser for _some_ builds, but not all,
          //  which is an annoying inconsistency that we are punting on by
          //  just pretending we aren't hearing about this at all.
          if (revRepo == "mobile-browser") {
            seenRevs--;
            delete build.revs[revRepo];
            continue;
          }
          console.warn("unknown repo:", revRepo, "in", build);
          continue buildLoop;
        }
        orderedRevInfo[familyPrioMap[repoDef.family]] = [repoDef, revision];

        // update our pushlog fetch info
        if (!repoAndRevs.hasOwnProperty(revRepo))
          repoAndRevs[revRepo] = {repo: repoDef,
                                  canonRepo: familyCanonRepoMap[repoDef.family],
                                  revs: []};
        if (repoAndRevs[revRepo].revs.indexOf(revision) == -1)
          repoAndRevs[revRepo].revs.push(revision);
      }
      if (seenRevs != expectedRevCount) {
        if (seenRevs != 0) {
          console.info("skipping build", build.id,
                       "which does not have the expected rev count!",
                       build.revs);
        }
        continue;
      }

      // now map the contributions into the revMap
      var curMap = revMap;
      for (i = 0; i < orderedRevInfo.length; i++) {
        repoDef = orderedRevInfo[i][0];
        revision = orderedRevInfo[i][1];
        // final nesting?
        if (i == orderedRevInfo.length - 1) {
          if (curMap.hasOwnProperty(revision)) {
            curMap = curMap[revision];
            curMap.builds.push(build);
          }
          else {
            curMap = curMap[revision] = {builds: [build]};
          }
        }
        // hierarchy stage still
        else {
          if (curMap.hasOwnProperty(revision))
            curMap = curMap[revision];
          else
            curMap = curMap[revision] = {};
        }
      }
    }

    this._getPushInfoForRevisions(repoAndRevs, earliest, latest);
  },

  /**
   * Retrieve the push and changeset information given one or more trees and
   *  a set of revisions for each tree.  We assume temporal locality for the
   *  revisions we are provided and will ask for an expanded time range on
   *  what we are provided in order to reduce the need for one-off follow-up
   *  queries.
   *
   * Once all revision info has been fetched (using `fetchSpecificPushInfo`)
   *  control flow will transition to `_processNextPush`.
   *
   * @args[
   *   @param[repoAndRevs @dictof[repoName @dict[
   *     @key[repo CodeRepoDef]
   *     @key[revs @listof[String]]{
   *       The list of short (12 character) revision strings that the pushlog
   *       will find acceptable.
   *     }
   *   ]]]
   *   @param[earliestTime Date]{
   *     The earliest time that we think correlates with the revisions.  When
   *     going off of builds, this means the earliest timestamp for the start of
   *     a build.  We will apply a fudge factor; no one upstream of us should.
   *   }
   *   @param[latestTime Date]{
   *     The latest time that we think correlates with the revisions.  When
   *     going off of builds, this means the latest timestamp for the start of
   *     a build.
   *   }
   * ]
   */
  _getPushInfoForRevisions: function(repoAndRevs, earliestTime, latestTime) {
    this._noteState("pushlog:fetch");

    // map (repo+rev) => {push: blah, changeset: blah}
    this._revInfoByRepoAndRev = {};

    // no date range means no revisions means just go to the next push
    if (earliestTime == null) {
      this._processFirstPush();
      return;
    }

    // normalize to millis
    earliestTime = earliestTime.valueOf();
    latestTime = latestTime.valueOf();

    // fudge earliestTime by a lot because the one-off fetches are really
    //  slow.
    earliestTime -= 12 * HOURS_IN_MS;

    var earliestTimeStr = PushlogDateString(new Date(earliestTime));
    var latestTimeStr = PushlogDateString(new Date(latestTime));

    for (var repoName in repoAndRevs) {
      var repoAndRev = repoAndRevs[repoName];

      console.log("Repo", repoName, "wants", repoAndRev.revs);
      this._fetchSpecificPushInfo(repoAndRev.repo, repoAndRev.canonRepo,
                                  repoAndRev.revs,
                                  "&startdate=" + earliestTimeStr +
                                  "&enddate=" + latestTimeStr);
    }
    if (this._pendingPusheFetches == 0) {
      console.warn("INVARIANT VIOLATION: NOTHING TO FETCH");
      this._processFirstPush();
    }
  },

  _fetchSpecificPushInfo: function(repoDef, canonRepoDef, revs, paramStr) {
    var self = this;
    var url = repoDef.url + "json-pushes?full=1" + paramStr;
    this._pendingPushFetches++;
    var isCanonicalRepo = repoDef === this.tinderTree.repos[0];

    console.log("fetching push info for", repoDef.name, "paramstr", paramStr);
    when($reliahttp.reliago({url: url}),
      function(jsonStr) {
        self._pendingPushFetches--;

        var pushes = JSON.parse(jsonStr);

        console.log("repo", repoDef.name, "got JSON");
        for (var pushId in pushes) {
          var pinfo = pushes[pushId];
          pinfo.id = parseInt(pushId);

          for (var iChange = 0; iChange < pinfo.changesets.length; iChange++) {
            var csinfo = pinfo.changesets[iChange];

            var shortRev = csinfo.node.substring(0, 12);
            csinfo.shortRev = shortRev;

            var aggrKey = canonRepoDef.name + ":" + shortRev;
            self._revInfoByRepoAndRev[aggrKey] = {
              push: pinfo,
              changeset: csinfo,
            };
            //console.log("  resolving rev", shortRev, revs.indexOf(shortRev));
            if (revs.indexOf(shortRev) != -1)
              revs.splice(revs.indexOf(shortRev), 1);

            // If this is telling us about a revision the tinderbox did not
            //  know about, inject it.  (The builders do not build all
            //  revisions.)
            if (isCanonicalRepo && !self._revMap.hasOwnProperty(shortRev)) {
              if (repoDef.dependent)
                self._revMap[shortRev] = {};
              else
                self._revMap[shortRev] = {builds: []};
            }
          }
        }

        // Issue one-off requests for any missing changesets; chained, so only
        //  trigger for one right now.
        if (revs.length) {
          if (self._oneOffRevisionFetch === revs[0] &&
              // it's possible we had a date range for a single query range,
              //  which can indeed fail!
              paramStr.substring(0, 4) === "&cha") {
            // fail-fast since this is a very bad situation
            console.warn("failed to fetch revision info for", revs[0],
                         "aborting entire overmind job.");
            self._syncDeferred.reject("unable to resolve " + revs[0]);
            // and wedge this FSM so we don't bother to do any more
            //  processing.
            self._pendingPushFetches++;
            return;
          }
          console.log("... still have pending revs", revs);
          self._oneOffRevisionFetch = revs[0];
          self._fetchSpecificPushInfo(repoDef, canonRepoDef, revs,
                                      "&changeset=" + revs[0]);
        }
        else {
          if (self._pendingPushFetches == 0)
            self._processFirstPush();
        }
      },
      function(err) {
        self._pendingPushFetches--;
        console.error("Push fetch error", err, err.stack);
        self._abort("Push fetch error on: " + url);
      });
  },

  /**
   * Establish an oldest-to-newest processing order for _processNextPush, then
   *  invoke _processNextPush which starts a chain of doing that.
   */
  _processFirstPush: function() {
    var pushQueue = this._pushQueue = [];

    var repoDef = this.tinderTree.repos[0];
    for (var changeset in this._revMap) {
      var aggrKey = repoDef.name + ":" + changeset;
      if (!this._revInfoByRepoAndRev.hasOwnProperty(aggrKey))
        throw new Error("Unable to map changeset " + changeset);
      var csmeta = this._revInfoByRepoAndRev[aggrKey];
      pushQueue.push({pushId: csmeta.push.id, changeset: changeset});
    }
    pushQueue.sort(function(a, b) { return a.pushId - b.pushId; });
    this._processNextPush();
  },

  /**
   * Figure out what the database does not yet know; persist newfound state and
   *  initiate follow-on processing of logs and the like not yet processed.
   *
   * Now that we have the tinderbox builds and information on all the pushes
   *  mentioned by the tinderbox builds, we need to check what the database
   *  already knows.  Anything it does not know that we just found out, we need
   *  to tell.  Additionally, any derived information (like analysis of build
   *  logs) that has not been performed should also be scheduled.
   */
  _processNextPush: function() {
    this._noteState("db-delta:fetch");

    if (this._pushQueue.length) {
      var repoDef = this.tinderTree.repos[0];
      var todo = this._pushQueue.shift();

      this._pendingSidebandState = {};
      this._pendingPushId = todo.pushId;

      var self = this;
      when(DB.getPushInfo(this.tinderTree.id, todo.pushId),
        function(rowResults) {
          self._gotDbInfoForPush(todo.changeset, rowResults);
        },
        function(err) {
          console.error("Failed to find good info on push...");
        });
      // we did something. leave!
      return;
    }

    // (we only reach here if there were no more changesets to process)
    this._allDone();
  },

  /**
   * Now that we have what the database knows for this push, we can figure out
   *  what to tell the database and what log processing jobs we should trigger.
   */
  _gotDbInfoForPush: function(changeset, rowResults) {
    this._noteState("db-delta:check", changeset);
    var self = this;

    var rootRepoDef = this.tinderTree.repos[0];
    var isComplexRepo = this.tinderTree.repos.length > 1;

    var revInfo = this._revMap[changeset];
    delete this._revMap[changeset];

    // -- slurp dbstate into a map
    var dbstate = DB.normalizeOneRow(rowResults);
    var setstate = {};

    var rootPush =
      this._revInfoByRepoAndRev[rootRepoDef.name + ":" + changeset].push;

    // -- handle root "s:r" records.
    if (!dbstate.hasOwnProperty("s:r")) {
      setstate["s:r"] = rootPush;
      this._pendingSidebandState["s:r"] = rootPush;
    }

    /**
     * Figure out if the build is something we can perform follow-on processing
     *  for.  The requirements are that the test failed according to the
     *  tinderbox and we have a processor.  Once we have success data we care
     *  about (like runtimes), we may stop requiring a failure.
     */
    function isBuildLoggable(build) {
      var buildType = build.builder.type;
      if (buildType.type != "test")
        return false;
      switch (buildType.subtype) {
        case "mozmill":
        case "xpcshell":
        case "mochitest":
        case "reftest":
          return build.state == "testfailed";
        default:
          return false;
      }
    }

    // -- normalized logic for both 'b' variants and log job checking
    /**
     * @args[
     *   @param[keyExtra String]{
     *     In the case of a single-repo tree, this will be "".  In the case of
     *     a dual-repo like comm-central, this will be ":sub-repo-push-id", for
     *     example ":1000".
     *   }
     * ]
     */
    function rockBuilds(keyExtra, builds) {
      for (var iBuild = 0; iBuild < builds.length; iBuild++) {
        var build = builds[iBuild];

        var bKey = "s:b" + keyExtra + ":" + build.id;
        var jsonStr = JSON.stringify(build);
        if (!dbstate.hasOwnProperty(bKey) ||
            dbstate[bKey] != jsonStr) {
          setstate[bKey] = jsonStr;
          self._pendingSidebandState[bKey] = jsonStr;
        }

        if (isBuildLoggable(build)) {
          var lKey = "s:l" + keyExtra + ":" + build.id;
          var dKey = "d:l" + keyExtra + ":" + build.id;
          if (!dbstate.hasOwnProperty(lKey)) {
            self._logProcJobs.push({
              pushId: rootPush.id,
              summaryKey: lKey,
              detailKeyPrefix: dKey,
              build: build,
            });
          }
        }
      }
    }

    // -- fire off normalized logic
    /**
     *
     *
     * @args[
     *   @param[accumKey String]{
     *     The accumulated keyExtra to feed to rockBuilds.  This should start
     *     out as "" in the base case.  For each level of depth, we append
     *     ":sub-repo-push-id".
     *   }
     *   @param[revMap @dictof["push id" "sub revision map or {builds}"]]{
     *     In the style of the `_revMap` object.  In the case where we still
     *     have `subRepos`, this will be a map from pushes in subRepos[0] to
     *     either more maps of the same type or the builds-containing leaf
     *     objects.
     *   }
     *   @param[subRepos @listof[RepoDef]]{
     *     Sub-repositories yet to be processed.  This will be empty when we
     *     should be processing builds and `revMap` should accordingly just
     *     be an object with a builds attribute.
     *   }
     * ]
     */
    function walkRevMap(accumKey, revMap, subRepos) {
      if (subRepos.length) {
        var repoDef = subRepos[0];
        for (var csKey in revMap) {
          var minfo = self._revInfoByRepoAndRev[repoDef.name + ":" + csKey];
          if (!minfo) {
            console.warn("No rev info for '" +
                         repoDef.name + ":" + csKey + "', skipping:",
                         revMap[csKey].hasOwnProperty("builds") ?
                           revMap[csKey].builds : revMap[csKey]);
            continue;
          }
          var curPush = minfo.push;

          var kidAccumKey = accumKey + ":" + curPush.id;
          var rKey = "s:r" + kidAccumKey;
          if (!dbstate.hasOwnProperty(rKey)) {
            setstate[rKey] = curPush;
            self._pendingSidebandState[rKey] = curPush;
          }

          walkRevMap(kidAccumKey,
                     revMap[csKey],
                     subRepos.slice(1));
        }
      }
      else {
        rockBuilds(accumKey, revMap.builds);
      }
    }
    walkRevMap("", revInfo, this.tinderTree.repos.slice(1));

    when(DB.putPushStuff(this.tinderTree.id, rootPush.id, setstate),
      function() {
        self._noteState("logproc");
        self._processNextLog();
      },
      function(err) {
        console.error("failed to write our many stories! keys were:");
        for (var key in setstate) {
          console.log("  ", key);
        }
      });
  },

  /**
   * How many logs should we try and process in parallel?  Let's keep this
   *  at 1 unless it turns out the tinderbox is really bad at serving us our
   *  requested files in a timely fasion.
   */
  MAX_CONCURRENT_LOG_FROBS: 1,

  /**
   * Trigger the processing of (one or more) logs.  We do this in a streaming
   *  fashion rather than promise fashion because these logs can end up being
   *  rather large.
   *
   * Log processing occurs as a follow-on process after all pushes have been
   *  process for no particular reason.  We could just as easily process all
   *  the logs for a push before moving on to the next push.
   */
  _processNextLog: function() {
    while ((this._activeLogFrobbers.length < this.MAX_CONCURRENT_LOG_FROBS) &&
           (this._logProcJobs.length)) {
      var job = this._logProcJobs.pop();

      var frobber = null;
      switch (job.build.builder.type.subtype) {
        case "xpcshell":
          frobber = this._processXpcshellLog(job);
          break;

        case "mozmill":
          frobber = this._processMozmillLog(job);
          break;

        case "mochitest":
          frobber = this._processMochitestLog(job);
          break;

        case "reftest":
          frobber = this._processReftestLog(job);
          break;

        default:
          console.error("dunnae how to frobben", job);
          break;
      }

      if (frobber)
        this._activeLogFrobbers.push(frobber);
    }

    if (this._activeLogFrobbers.length === 0 &&
        this._logProcJobs.length === 0) {
      this._sendSidebandData();
    }
  },

  /**
   * Notify that a frobber has completed operation, saving its result state to
   *  the datastore and potentially triggering a new frobber.
   * XXX this implementation is verging on spaghetti-logic; the redeeming grace
   *  is we are still pretty small...
   *
   * @args[
   *   @param[frobber]{
   *     The frobber instance that completed processing, so that we can splice
   *     it out of the list of active frobbers.
   *   }
   *   @param[job]{
   *     The job the frobber was working; this provides us with the information
   *     required so we know where to write to.
   *   }
   *   @param[writeCells]{
   *     Dictionary of cells to write to the database; it is assumed that a
   *     summary object is present with the expected summary key.
   *   }
   * ]
   */
  _frobberDone: function(frobber, job, writeCells) {
    var self = this;

    this._pendingSidebandState[job.summaryKey] = writeCells[job.summaryKey];

    // Although we could potentially overlap the next request with this
    //  request, this is the easiest way to make sure that _allDone does not
    //  kill the VM prematurely.  XXX The datastore should probably be able to
    //  handle out a promise for when it has quiesced.
    when(DB.putPushStuff(this.tinderTree.id, job.pushId, writeCells),
      function() {
        console.log(" frobber db write completed");
        self._activeLogFrobbers.splice(
          self._activeLogFrobbers.indexOf(frobber), 1);
        self._processNextLog();
      });
  },

  _processMozmillLog: function(job) {
    console.log("MOZMILL LOG GOBBLE", job.build.logURL);
    var self = this;

    var stream = $hackjobs.gimmeStreamForThing(job.build.logURL);
    var frobber = new $frobMozmill.MozmillFrobber(
      stream, job.summaryKey, job.detailKeyPrefix, function(writeCells) {
      self._frobberDone(frobber, job, writeCells);
    });
    return frobber;
  },

  _processXpcshellLog: function(job) {
    console.log("XPCSHELL LOG GOBBLE", job.build.logURL);
    var self = this;

    var stream = $hackjobs.gimmeStreamForThing(job.build.logURL);
    var frobber = new $frobXpcshell.XpcshellFrobber(
      stream, job.summaryKey, job.detailKeyPrefix, function(writeCells) {
        self._frobberDone(frobber, job, writeCells);
      });
    return frobber;
  },

  _processMochitestLog: function(job) {
    console.log("MOCHITEST LOG GOBBLE", job.build.logURL);
    var self = this;

    var stream = $hackjobs.gimmeStreamForThing(job.build.logURL);
    var frobber = new $frobMochitest.MochiFrobber(
      stream, job.summaryKey, job.detailKeyPrefix, function(writeCells) {
        self._frobberDone(frobber, job, writeCells);
      });
    return frobber;
  },

  _processReftestLog: function(job) {
    console.log("REFTEST LOG GOBBLE", job.build.logURL);
    var self = this;

    var stream = $hackjobs.gimmeStreamForThing(job.build.logURL);
    var frobber = new $frobReftest.ReftestFrobber(
      stream, job.summaryKey, job.detailKeyPrefix, function(writeCells) {
        self._frobberDone(frobber, job, writeCells);
      });
    return frobber;
  },

  _sendSidebandData: function() {
    this._noteState("sideband");
    if (this._pendingSidebandState == null)
      console.warn("Trying to send sideband data with no data!");

    var anythingToSend = false;
    for (var key in this._pendingSidebandState) {
      anythingToSend = true;
      break;
    }

    var stateToSend = this._pendingSidebandState;
    var pushId = this._pendingPushId;
    this._pendingSidebandState = null;
    this._pendingPushId = null;

    if (anythingToSend) {
      var self = this;
      when(this.bridge.send({
             type: "push",
             treeName: this.tinderTree.name,
             pushId: pushId,
             keysAndValues: stateToSend,
           }),
        function() {
          //console.log("sideband push completed");
          self._processNextPush();
        },
        function() {
          console.warn("problem with sideband push!");
          self._processNextPush();
        }
      );
    }
    else {
      this._processNextPush();
    }
  },

  _allDone: function() {
    this._syncDeferred.resolve();
  },
};
exports.Overmind = Overmind;

}); // end define
