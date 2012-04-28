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

define(
  [
    "narscribblus/utils/pwomise",
    "narscribblus-plat/utils/env",
    "wmsy/viewslice-array",
    "./rstore",
    "arbcommon/repodefs",
    "./chew-loghelper", "arbcommon/chew-loggest",
    "arbcommon/analyze-loggest",
    "./ui-main",
    "socket.io/socket.io",
    "require",
    "exports"
  ],
  function(
    $pwomise,
    $env,
    $vs_array,
    $rstore,
    $repodefs,
    $chew_loghelper, $chew_loggest,
    $analyze_loggest,
    $ui_main,
    $_na_socketio,
    $require,
    exports
  ) {
var when = $pwomise.when;

var DESIRED_PUSHES = 6;

var DummyRStore = {
  unsubscribe: function() {},
};

/**
 * Responsible for tracking the general state of the application and handling
 *  navigation amongst various supported pages including web browser history
 *  ramifications.  Bound into wmsy widgets in ui-main.js.
 *
 * @typedef[AbsoluteLoc @dictof[
 *   @key["location value" String]{
 *     One of the keys from `ORDERED_LOCATION_KEYS`.
 *   }
 *   @value[Object]
 * ]]{
 *   An object representing an explicit document location rather than
 *   transition information relative to the current location.
 * }
 */
function ArbApp(win, isStandalone) {
  this.tinderTree = null;
  this.rstore = isStandalone ? DummyRStore : new $rstore.RemoteStore(this);
  this.isStandalone = isStandalone;

  this.win = win;
  this._popLocationWrapped = this._popLocation.bind(this);
  if (!isStandalone)
    this.win.addEventListener("popstate", this._popLocationWrapped, false);
  this.history = win.history;

  /**
   * @oneof[
   *   @case["picktree"]{
   *     We don't know what tree we want to connect to yet.  Nothing happens
   *     until the user picks a tree.
   *   }
   *   @case["connecting"]{
   *     Our initial state when we are assuming the server is there but we have
   *     not yet gotten it to spill the required set of initial data.
   *   }
   *   @case["error"]{
   *     Something bad happened that effectively prevents us from doing
   *     anything.  This basically means we can't talk to the server or
   *     experienced an initialization failure.  (Keep in mind that many
   *     initialization failures will result in us breaking without getting
   *     far enough to throw up an error failure unless we refactor ourselves
   *     to defer all but the most essential require()s.)
   *   }
   *   @case["good"]{
   *     The steady state wherein we are usable and do stuff.
   *   }
   * ]
   */
  this.state = "picktree";

  this.possibleTrees = $repodefs.PUBLISHED_TREES;

  /**
   * The wmsy binding associated with us.  A related rule is that only a
   *  single UI can be bound to a single app instance.  The binding clobbers
   *  this value directly.
   *
   * It is currently required that the wmsy binding for the application be
   *  created before the next event loop event is processed, which is to say
   *  all callbacks triggered by the app can safely assume that binding is
   *  valid.  In the case of unit testing where it is desired to not actually
   *  have a UI, a sufficient stub must be provided.
   */
  this.binding = null;

  /**
   * @dict[
   *   @key[page String]{
   *     The page name; wmsy widgets slave off this.
   *   }
   *   @key[pathNodes @listof[PathNode]]
   * ]{
   *   The active UI page.
   * }
   */
  this.page = null;

  /**
   * The current navigated page location in terms of key/value pairs.  These
   *  are currently surface in the location bar as query terms, but we could
   *  also create a fake hierarchy with #! or something.
   */
  this._loc = null;

  this._popLocation();

  var self = this;
  this.boundUrlMaker = function(keyDeltas) {
    var key, cloney = {}, loc = self._loc;
    for (key in loc)
      cloney[key] = loc[key];
    for (key in keyDeltas) {
      cloney[key] = keyDeltas[key];
    }
    return self._urlMaker(cloney);
  };
  this.pathnodeUrlMaker = function(pathItem) {
    // use the "type" to nuke all values to the "right" of us in the clone of
    //  the current state
    var key, cloney = {}, loc = self._loc;
    for (key in loc)
      cloney[key] = loc[key];

    var iOrdered = self.ORDERED_LOCATION_KEYS.indexOf(pathItem.type);
    while (++iOrdered < self.ORDERED_LOCATION_KEYS.length) {
      cloney[self.ORDERED_LOCATION_KEYS[iOrdered]] = null;
    }

    return self._urlMaker(cloney);
  };
}
ArbApp.prototype = {
  _useTree: function(tinderTree) {
    if (this.tinderTree !== tinderTree) {
      this.tinderTree = tinderTree;
      this.rstore.useTree(tinderTree);
    }
  },

  _updateState: function(newState) {
    this.state = newState;
    if (this.binding) {
      this.binding.update();
      // XXX we are screwing up the state somehow; possibly because we have no
      //  children when this change is (immediately) made.
      // ideally we would use the persistFocus/restorePersistedFocus mechanism.
      //self.binding.FOCUS.ensureDomainFocused(this.binding.__focusDomain);
      //this.binding.FOCUS.updateFocusRing();
    }
  },

  ORDERED_LOCATION_KEYS: ["tree", "pushid", "log", "autonew", "divertedfrom"],
  NON_PATHNODE_KEYS: ["autonew", "divertedfrom"],
  /**
   * Infer current application state from our current URL state and make it so.
   *  This is the only code path for changing meaningful application state for
   *  simplicity.
   *
   * XXX The current state model is a bit soupy; it would likely be better to
   *  move to a more straightforward URL model of existence with routing
   *  semantics.
   */
  _popLocation: function() {
    var env = $env.getEnv(this.win);
    var loc = this._loc = {};
    var clobbering = false;
    var pathNodes = [{type: "root", value: "ArbPL"}];
    for (var iKey = 0; iKey < this.ORDERED_LOCATION_KEYS.length; iKey++) {
      var key = this.ORDERED_LOCATION_KEYS[iKey];
      if (clobbering) {
        loc[key] = null;
      }
      else if (env.hasOwnProperty(key)) {
        loc[key] = env[key];
        if (this.NON_PATHNODE_KEYS.indexOf(key) === -1)
          pathNodes.push({type: key, value: loc[key]});
      }
      else {
        loc[key] = null;
        clobbering = true;
      }
    }

    var treeDef = loc.tree ? $repodefs.safeGetTreeByName(loc.tree) : null;
    // no (legal) tree, gotta pick one
    if (!treeDef) {
      this._updateState("picktree");
      this._setLocation({}, true);
      this.rstore.unsubscribe();
      return;
    }
    this._useTree(treeDef);

    // no log, show pushes (either most recent or from a specific push)
    if (!loc.log) {
      this._getPushes(parseInt(loc.pushid), pathNodes);
      return;
    }

    // Default to true for autonew if they are requesting the most recent log
    //  (for that log).  If they are clicking on an older log, they obviously
    //  don't want it immediately replacing itself with something more recent.
    // XXX for now, assume that if it's the most recent push, it's the most
    //  recent log.  This holds true for full runs, but not sparse runs.
    var autonew = (typeof(loc.autonew) === "string") ? (loc.autonew === "true")
                    : this.rstore.isMostRecentPush(loc.pushid);

    // yes log, request it
    this._getLog(parseInt(loc.pushid), loc.log, pathNodes, autonew,
                 loc.divertedfrom);
  },

  /**
   * Generate a (query-change-only) navigation URL to accomplish the provided
   *  (absolute) location object state.  The `boundUrlMaker` and `navigate`
   *  methods take a relative dictionary that applies changes on top of the
   *  current location, and are probably what you want to use instead.
   *
   * @args[
   *   @param[loc AbsoluteLoc]
   * ]
   */
  _urlMaker: function(loc) {
    var qbits = [];
    for (var iKey = 0; iKey < this.ORDERED_LOCATION_KEYS.length; iKey++) {
      var key = this.ORDERED_LOCATION_KEYS[iKey];
      if (loc[key] != null)
        qbits.push(encodeURIComponent(key) + "=" + encodeURIComponent(loc[key]));
      else
        break;
    }

    var navUrl = "?" + qbits.join("&");
    return navUrl;
  },

  /**
   * Update our concept of our current location, possibly updating the
   *  application state.
   *
   * @args[
   *   @param[loc AbsoluteLoc]
   *   @param[alreadyInEffect Boolean]{
   *     If false, then we automatically call `_popLocation` to update the
   *     application state to be consistent with the URL.  Otherwise we
   *     assume the application is already in the state named by `loc.
   *   }
   * ]
   */
  _setLocation: function(loc, alreadyInEffect, replace) {
    // don't muck with the URL if we are standalone
    if (this.isStandalone)
      return;

    this._loc = loc;
    var navUrl = this._urlMaker(loc);
    if (alreadyInEffect || replace)
      this.history.replaceState(null, "", navUrl);
    else
      this.history.pushState(null, "", navUrl);

    if (!alreadyInEffect) {
      this._popLocation();
    }
  },

  /**
   * Navigation request from the UI layer; the widget bound to us has a receive
   *  handler that gets sent navigation requests by other widgets.
   *
   * @args[
   *   @param[keyDeltas Object]{
   *     New key/value pairs to clobber our existing navigation state.  Because
   *     we have an explicit ordering on keys and sanitize our state, you only
   *     need to null out the most important thing if there is a set of things
   *     to invalidate.
   *   }
   * ]
   */
  navigate: function(keyDeltas, alreadyInEffect, replace) {
    for (var key in keyDeltas) {
      this._loc[key] = keyDeltas[key];
    }
    //console.log("trying to navigate to", this._loc);
    this._setLocation(this._loc, alreadyInEffect, replace);
  },

  /**
   * Subscribe us to either recent pushes for the current tree or a specific
   *  push/set of pushes.
   */
  _getPushes: function(highPushId, pathNodes) {
    this.page = new PushesPage(highPushId, pathNodes, this.rstore);
    this._updateState("good");
  },

  /**
   * Notification from rstore that we have connected/disconnected or our data
   *  validity has changed.
   */
  onConnectionStateChange: function() {
    this.binding.emit_connectionStateChanged();
  },

  subDelta: function(delta) {
    this.rstore.subGrowOrShift(delta);
  },

  onSubModeChange: function(mode) {
    this.binding.emit_subModeChanged();
  },

  /**
   * Retrieve the test log for a specific test and display it, or switch to
   *  an error state if we failed to retrieve the log.
   *
   * @args[
   *   @param[pushId]
   *   @param[buildId]{
   *     A compound, opaque identifier that is comprised of the build/test log
   *     in question and the specific test from that run we are interested in.
   *   }
   *   @param[pathNodes]
   *   @param[autoNew]
   *   @param[divertedFrom]
   * ]
   */
  _getLog: function(pushId, buildId, pathNodes, autoNew, divertedFrom) {
    this._updateState("connecting");

    // XXX actually, we probably still want a sub, just no watched pushes.
    this.rstore.unsubscribe();

    var self = this;
    when(this.rstore.getPushLogDetail(pushId, buildId),
      function gotLogDetail(logDetail) {
        self._showLogPageForData(pushId, logDetail, pathNodes, autoNew,
                                 divertedFrom);
      },
      function fetchProblem(err) {
        console.error("No go on the data.");
        self.error = err;
        self._updateState("error");
      });
  },

  /**
   * Show a failure log from a set of writeCells.  This is intended for use
   *  for display of in-browser parsed logs using the frobber infrastructure.
   *  The frobbers produce writeCells, so this way we can just slurp the
   *  output and show it directly.
   *
   * This is currently only intended/expected to work with mozmill logs.
   */
  standaloneLoadLogsFromWriteCells: function(writeCells, summaryKey,
                                             detailKeyPrefix) {
    var failures = [],
        logDetail =  {
          type: 'mozmill-array',
          failures: failures,
        },
        overview = writeCells[summaryKey];

    for (var iFail = 0; iFail < overview.failures.length; iFail++) {
      var summaryObj = overview.failures[iFail];
      failures.push(writeCells[detailKeyPrefix + ":" +
                               summaryObj.uniqueName]);
    }

    this._showLogPageForData(1, logDetail, [], false, null);
  },

  /**
   * Load the contents of a log from a URL.  Historically, this has taken the
   *  form of using the actual ArbPL server, clicking on a link, and then just
   *  wget-ing the contents of whatever the underlying URL turned out to be.
   *  The file is going to be the same as a detail write cell from
   *  `standaloneLoadLogsFromWriteCells`.  (That function is somewhat atypical
   *  in that it smooshes what would normally be N separate pages into 1 page.)
   */
  standaloneLoadLogFromUrl: function(url) {
    var self = this;
    when($rstore.commonLoad(url, "log-fetch", url),
      function gotLogDetail(text) {
        self._showLogPageForData(1, JSON.parse(text), [], false, null);
      },
      function fetchProblem(err) {
        console.error("No go on the data.");
        self.error = err;
        self._updateState("error");
      });
  },

  /**
   * Load a log from a LogReaper-created time series of logs that exist outside
   * of a unit test context.  This is to support the deuxdrop logui use-case.
   */
  standaloneLoadLogFromBacklog: function(msg) {
    var sliceProcessor = new LogSliceProcessor();
    sliceProcessor.receiveMessage(msg);
    this._showLogPageForData(1, sliceProcessor.caseBundle, [], false, null);
  },

  _showLogPageForData: function(pushId, logDetail, pathNodes, autoNew,
                                divertedFrom) {
    var chewedDetails;
    switch (logDetail.type) {
      case "mozmill-array":
        chewedDetails = $chew_loghelper.chewMozmillFailure(logDetail.failures);
        break;

      case "mozmill":
        chewedDetails = $chew_loghelper.chewMozmillFailure(logDetail);
        break;

      case "loggest":
        var caseBundle;
        if (logDetail instanceof $chew_loggest.TestCaseLogBundle)
          caseBundle = logDetail;
        else
          caseBundle = $chew_loggest.chewLoggestCase(logDetail);
        $analyze_loggest.runOnPermutations(
          [
            $analyze_loggest.SummarizeAsyncTasks,
          ],
          caseBundle);
        chewedDetails = {
          failures: [caseBundle],
        };
        break;

      case "filefail":
        chewedDetails = {
          failures: [{
            type: 'filefail',
            testName: '$FILE',
            fileName: logDetail.fileName,
            moduleName: logDetail.moduleName,
            exceptions:
                logDetail.exceptions.map($chew_loggest.untransformEx),
          }]
        };
        break;

      default:
        chewedDetails = {
          failures: [logDetail],
        };
        break;
    }

    this.page = new TestLogPage(pushId, chewedDetails, autoNew,
                                pathNodes, this.rstore, divertedFrom);
    this._updateState("good");
  },
};

function PushesPage(highPushId, pathNodes, rstore) {
  this.pathNodes = pathNodes;
  this.rstore = rstore;

  if (!highPushId)
    this.rstore.subscribeToRecent(DESIRED_PUSHES, this);
  else
    this.rstore.subscribeToPushId(highPushId, DESIRED_PUSHES, this);

  this.pushes = new $vs_array.ArrayViewSlice([]);
}
PushesPage.prototype = {
  page: "pushes",

  /**
   * Notification from the `RemoteStore` about a new `BuildPush`.
   *
   * @args[
   *   @param[push BuildPush]
   * ]
   */
  onNewPush: function(buildPush) {
    // This goes at either end, so we don't have to get fancy on the index
    //  finding.  Put it at the front unless it's older than the front push.
    // (We order most recent to oldest.)
    var idx = 0;
    var slist = this.pushes._list;
    if (slist.length &&
        buildPush.push.id < slist[0].push.id)
      idx = slist.length;
    // no antics for now, it doesn't know what to do for adds anyways.
    //this.binding.ANTICS.prepare("buildpush");
    this.pushes.mutateSplice(idx, 0, buildPush);
    //this.binding.ANTICS.go("buildpush");
  },

  /**
   * Notification from the `RemoteStore` that an existing `BuildPush` or one
   *  of its children has been updated.
   */
  onModifiedPush: function(buildPush) {
    APP.binding.IDSPACE.updateUsingObject("buildpush", buildPush);
  },

  /**
   * Notification from the `RemoteStrore` that a `BuildPush` known to us has
   *  been unsubscribed.
   */
  onUnsubscribedPush: function(buildPush) {
    var slist = this.pushes._list;
    // no antics for now, it doesn't know what to do for adds anyways.
    //this.binding.ANTICS.prepare("buildpush");
    this.pushes.mutateSplice(slist.indexOf(buildPush), 1);
    //this.binding.ANTICS.go("buildpush");
  },
};

/**
 * Displaying test results, possibly auto-updating to newer results as they come
 *  in.  We are always focused on a specific test from a specific file, but when
 *  a test file failure occurs, we will divert to the file failure notification
 *  but retain the specific test name so we can divert back.
 */
function TestLogPage(pushId, chewedDetails, autoNew, pathNodes, rstore,
                     divertedFrom) {
  this.pushId = pushId;
  this.fileName = chewedDetails.failures[0].fileName;
  this.testName = divertedFrom || chewedDetails.failures[0].testName;

  this.failures = chewedDetails.failures;
  this.pathNodes = pathNodes;
  this.rstore = rstore;

  this.autoTransitionToNew = autoNew;
}
TestLogPage.prototype = {
  page: "testlog",

  get autoTransitionToNew() {
    return this._autoTransitionToNew;
  },

  set autoTransitionToNew(autoNew) {
    this._autoTransitionToNew = autoNew;
    //console.log("auto transition:", autoNew);

    if (autoNew)
      this.rstore.subscribeToRecent(DESIRED_PUSHES, this);
    else
      this.rstore.unsubscribe();

    APP.navigate({autonew: autoNew}, true);
  },

  /**
   * Evaluate a new/modified build-push for whether it has any newer test
   * results for the current test that we should jump to instead.  If it does,
   * jump to it.
   */
  _considerPush: function(buildPush) {
//console.log("considering push", buildPush, buildPush.push.id, this.pushId);

    // bail if the push is the same as / older than the one we are looking at
    // XXX eventually we will want to handle multiple build results per push.
    if (buildPush.push.id <= this.pushId)
      return;

    // This does not work with composite repo's like comm-central, but
    //  since comm-central does't produce loggest runs, that doesn't really
    //  matter.
    // -- scan the builds
    for (var iBuild = 0; iBuild < buildPush.builds.length; iBuild++) {
      var build = buildPush.builds[iBuild];
      //console.log("considering build", build, build.type, build.processedLog);
      if (!build.processedLog || (build.processedLog.type !== "loggest"))
        continue;

      // -- scan for this test again or a general file run failure for our file
      var tests = build.processedLog.successes.concat(
                    build.processedLog.failures);
      for (var iTest = 0; iTest < tests.length; iTest++) {
        var test = tests[iTest];
        //console.log("considering", test.fileName, test.testName, "versus",
        //            this.fileName, this.testName);

        // - general test run failure?
        if (test.fileName === this.fileName &&
            test.testName === '$FILE') {
          APP.navigate({
            pushid: buildPush.push.id,
            log: build.id + ":" + test.uniqueName,
            autonew: true,
            divertedfrom: this.testName,
          }, false, true);
          return;
        }

        // - updated run for this specific test?
        if (test.fileName === this.fileName &&
            test.testName === this.testName) {
          //console.log("FOUND NEWER, NAVIGATING", test, buildPush.push.id,
          //           build.id + ":" + test.uniqueName);
          APP.navigate({
            pushid: buildPush.push.id,
            log: build.id + ":" + test.uniqueName,
            autonew: true,
          }, false, true);
          return;
        }
      }
    }
  },
  onNewPush: function(buildPush) {
    if (this.autoTransitionToNew)
      this._considerPush(buildPush);
  },
  onModifiedPush: function(buildPush) {
    if (this.autoTransitionToNew)
      this._considerPush(buildPush);
  },
  onUnsubscribedPush: function(buildPush) {
  },
};

/**
 * Process log slices produced by a LogReaper to create a set of loggest data
 * that be shown on a results page.
 */
function LogSliceProcessor() {
  this.transformer = null;
  this._earliestStamp = null;

  this.caseBundle = new $chew_loggest.TestCaseLogBundle(
                      'postMessage()',
                      {
                        semanticIdent: 'unknown',
                      });
  this.fakePerms = this.caseBundle.permutations;

  this.useNamesMap = null;
}
LogSliceProcessor.prototype = {
  processSchema: function(schema) {
    this.transformer = new $chew_loggest.LoggestLogTransformer();
    this.transformer.processSchemas(schema);
  },

  /**
   * Process the logger, abusing a fair amount of the `chew-loggest.js`
   *  internals to enclose the logger in a fake test hierarchy.
   */
  processLogSlice: function(logslice) {
    if (this._earliestStamp === null)
      this._earliestStamp = logslice.begin;

    var transformer = this.transformer;
    var rootLogger = logslice.logFrag;

    // XXX in theory we might be provided with names by the server and so we
    //  should merge things, but for now it's known to not be the case.
    if (this.useNamesMap)
      rootLogger.named = this.useNamesMap;

    var fakePerm = new $chew_loggest.TestCasePermutationLogBundle({});
    transformer._uniqueNameMap = fakePerm._uniqueNameMap;
    transformer._usingAliasMap = fakePerm._thingAliasMap;
    transformer._connectionNameMap = fakePerm._connectionNameMap;
    transformer._baseTime = logslice.begin;

    var label = [Math.floor((logslice.begin - this._earliestStamp) / 1000) +
      'ms - ' +
      Math.floor((logslice.end - this._earliestStamp) / 1000) + 'ms'];
    var fakeStep = new $chew_loggest.TestCaseStepMeta(
                     label, { latched: {result: 'pass', boring: false} }, []);
    fakePerm.steps.push(fakeStep);

    // we are only putting one step in...
    var rows = fakePerm._perStepPerLoggerEntries,
        timeSpans = [[logslice.begin, logslice.end]];
    rows.push([]);
    rows.push([]);

    var rootLoggerMeta = transformer._createNonTestLogger(
                           rootLogger, fakePerm.loggers, fakePerm);
    // only one family!
    rootLoggerMeta.brandFamily('a');
    transformer._processNonTestLogger(rootLoggerMeta, rows, timeSpans);

    this.fakePerms.push(fakePerm);
  },

  receiveMessage: function(msg) {
    if (msg.type === 'logslice') {
      this.processLogSlice(msg.slice);
    }
    else if (msg.type === 'backlog') {
      this.processSchema(msg.schema);
      for (var i = 0; i < msg.backlog.length; i++) {
        this.processLogSlice(msg.backlog[i]);
      }
    }
    else if (msg.type === 'url') {
      this.useNamesMap = msg.annoFrag.named;
      remoteFetch(this, msg.url);
    }
    else {
      throw new Error("Unknown message type from logger: " + msg.type);
    }
  },
};

var APP;
exports.main = function main() {
  var env = $env.getEnv();

  var app = APP = window.app = new ArbApp(window, false);
  $ui_main.bindApp(app);
};

/**
 * Operate in standalone single test viewer mode; we fetch the data and cram it
 */
exports.mainStandalone = function(url) {
  var env = $env.getEnv();

  var app = APP = window.app = new ArbApp(window, true);
  $ui_main.bindStandaloneApp(app);
  app.standaloneLoadLogFromUrl(url);
};

exports.mainStandaloneFromData = function(writeCells, summaryKey,
                                          detailKeyPrefix) {
  var app = APP = window.app = new ArbApp(window, true);
  $ui_main.bindStandaloneApp(app);
  app.standaloneLoadLogsFromWriteCells(writeCells, summaryKey,
                                       detailKeyPrefix);
};

/**
 * Operate in a standalone mode where we get our data from some other open
 * window that postMessage()s the data to us.  Because the window that opened
 * us cannot possibly know when we have finished loading, we send out a
 * broad-spectrum postMessage indicating our successful startup and desire for
 * data.
 *
 * The hash in our location tells us the disambiguation code to use so that
 * this will work for more than one tab.
 */
exports.mainPostalone = function() {
  var app = APP = window.app = new ArbApp(window, true);
  $ui_main.bindStandaloneApp(app);

  var channelId = window.location.hash.substring(1);
  window.addEventListener("message", function(event) {
    if (event.data.id !== channelId)
      return;
    if (event.data.type === 'hello') {
      event.source.postMessage(
        { type: 'gimme', id: channelId },
        event.origin);
    }
    else if (event.data.type === 'backlog') {
      console.log("Trying to load backlog!");
      try {
        app.standaloneLoadLogFromBacklog(event.data);
      }
      catch (ex) {
        console.error('Problem backlog processing:', ex, ex.stack);
      }
    }
  }, false);

};

}); // end define
