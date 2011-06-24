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
 *
 **/

define(
  [
    "narscribblus/utils/pwomise",
    "arbcommon/change-summarizer",
    "arbcommon/build-aggregator",
    "./datamodel",
    "./lstore",
    "exports",
  ],
  function(
    $pwomise,
    $changeSummarizer,
    $buildAggregator,
    $datamodel,
    $lstore,
    exports
  ) {
var when = $pwomise.when;

var LocalDB = $lstore.LocalDB;

function commonLoad(url, promiseName, promiseRef) {
  var deferred = $pwomise.defer(promiseName, promiseRef);
  var req = new XMLHttpRequest();
  req.open("GET", url, true);
  req.addEventListener("load", function() {
    if (req.status == 200)
      deferred.resolve(req.responseText);
    else
      deferred.reject(req.status);
  }, false);
  // We used to disable caching here with Cache-Control.  Instead, we are
  //  making this the problem of the development web-server to provide us
  //  with proper cache directives.  Or the client can nuke or otherwise
  //  disable its cache.
  req.send(null);
  return deferred.promise;
}

var CONNECT_RETRY_INTERVAL = 5000;

var APP_LISTENER_DUMMY = {
  onNewPush: function() {},
  onModifiedPush: function() {},
  onUnsubscribedPush: function() {},
};

/**
 * Per-tinderbox tree server talking.
 */
function RemoteStore(listener) {
  this._connListener = listener;
  this._appListener = null;

  this.tinderTree = null;
  this.urlBase = "/";

  this._onPushFunc = null;

  /**
   * @dictof[
   *   @key["push id"]
   *   @value[BuildPush]
   * ]{
   *   All currently
   * }
   */
  this._knownPushes = null;
  this._subMode = null;
  this._prevSubMode = null;
  this._modeAcked = false;
  this._desiredPushes = null;

  /**
   * Next sequence id to use in messages to the server.
   */
  this._nextSeqId = 1;
  /**
   * If we have a pending request, its sequence id; zero/falsey if there is no
   *  pending request.
   */
  this._pendingSeq = 0;

  /**
   * The timestamp in milliseconds the push data is accurate as-of.  This is
   *  time at which the tinderbox data was "retrieved".  Please see the
   *  `DataServer` documentation for the precise semantics of how this value is
   *  derived; the short story is that this is the value to display to the user
   *  to convey how accurate/up-to-date the data is and used to let the server
   *  figure out what deltas it needs to send us.
   */
  this._accurateAsOfMillis = null;
  /**
   * This is part of a strictly increasing lexicographical tuple whose first
   *  element is `accurateAsOfMillis`.  It exists to convey changes in state
   *  that do not correspond to a change in the `_accurateAsOfMillis` timestamp.
   *  Specifically, the processing of log files does not necessarily merit
   *  a revision in the timestamp.  (If/when we switch to streaming consumption
   *  like buildbot, it probably will.)
   */
  this._revForTimestamp = null;

  this._connected = false;
  this._retryTimeout = null;

  /**
   * If we have an assertsub request pending, do we need to reissue our pushes
   *  to the UI or does the UI already know?
   */
  this._needToReissuePushes = false;

  this.hookupSocket();
}
RemoteStore.prototype = {
  useTree: function(tinderTree) {
    // nothing to do if we are already using the right three
    if (tinderTree === this.tinderTree)
      return;

    this.tinderTree = tinderTree;
    // clear all cached state on tree change.
    this._knownPushes = null;
    this._subMode = this._prevSubMode = null;
    this._modeAcked = false;
  },

  /**
   * Invoked once socket.io has been loaded and so we should have io.Socket
   *  available to us.
   */
  hookupSocket: function() {
    //console.log("establishing socket");
    this._sock = new io.Socket();
    this._sock.on("connect", this.onConnect.bind(this));
    this._sock.on("message", this.onMessage.bind(this));
    this._sock.on("disconnect", this.onDisconnect.bind(this));
    this._sock.connect();
  },

  /**
   * Re-assert subscription status on reconnect.
   */
  onConnect: function() {
    this._connected = true;
    this._connListener.onConnectionStateChange();

    if (this._retryTimeout !== null) {
      window.clearTimeout(this._retryTimeout);
      this._retryTimeout = null;
    }

    // If we have no mode or our mode was not acknowledged, do not attempt to
    //  resubscribe.  (The assumption in terms of _modeAcked is that our message
    //  was queued; there is a potential race here depending on transmission
    //  guarantees provided by socket.io; mainly, if it can drop things, we can
    //  wedge.)
    if (!this._subMode || !this._modeAcked) {
      //console.log("connected, not resubscribing:", this._subMode,
      //            this._modeAcked);
      return;
    }
    this._resubscribe(this._subMode, true);
  },

  onMessage: function(msg) {
    //console.log("MESSAGE", msg);
    if (msg.seqId !== -1) {
      if (msg.seqId === this._pendingSeq) {
        this._pendingSeq = 0;
        if (msg.type !== "error" && this._subMode)
          this._modeAcked = true;
      }
      else {
        // XXX this is actually fairly expected at this point, but it would be
        //  a very nice thing for me to explain why this is expected and fine,
        //  etc.
        /*
        console.warn("Unexpected message seq; expected",
                     this._pendingSeq, "got", msg.seqId,
                     "message:", msg);
        */
      }
    }

    switch (msg.type) {
      case "error":
        console.error("error from server:", msg.message, msg);
        break;

      case "treemeta":
        console.log("treemeta", msg);
        break;

      case "pushinfo":
        this.msgPushInfo(msg);
        break;

      case "pushdelta":
        this.msgPushDelta(msg);
        break;

      case "assertedsub":
        // nothing to do; the logic above implicitly acknowledged the mode
        this.msgAssertedSub(msg);
        break;
    }
  },

  onDisconnect: function() {
    this._connected = false;
    this._connListener.onConnectionStateChange();

    //console.log("socket.io connection lost; attempting reconnect");
    this._tryToReconnect();
  },

  /**
   * Attempt to reconnect.  Establish a completely new connection in order to
   *  avoid the possibility of complicated state mismatches, although in theory
   *  assertsub and the like may save us.  (But let's wait on actual analysis
   *  to conclude it's safe rather than just assume.)
   *
   * Socket.io currently does not support auto-reconnect, nor great/any
   *  notifications on error, at least not consistently.  So we use the simple
   *  heuristic of trying to connect and setting a timeout.
   */
  _tryToReconnect: function() {
    this.hookupSocket();
    if (this._retryTimeout === null) {
      var self = this;
      this._retryTimeout = window.setTimeout(function() {
        self._retryTimeout = null;
        if (self._connected)
          return;
        // avoid having two outstanding requests...
        if (self._sock.readystate !== 0)
          self._sock.disconnect();
        //console.log("attempting connect");
        self._tryToReconnect();
      }, CONNECT_RETRY_INTERVAL);
    }
  },

  _pushSorter: function(a, b) {
    return b.push.pushDate - a.push.pushDate;
  },

  subscribeToRecent: function(desiredPushesCount, appListener) {
    this._appListener = appListener;
    if (this._subMode === "recent") {
    }
    else if (this._subMode === null && this._prevSubMode === "recent") {
      this._resubscribe(this._prevSubMode, false);
      return;
    }

    this._knownPushes = {};
    this._subMode = "recent";
    this._modeAcked = false;
    this._desiredPushes = desiredPushesCount;

    this._sock.send({
      seqId: (this._pendingSeq = this._nextSeqId++),
      type: "subtree",
      treeName: this.tinderTree.name,
      pushId: "recent"
    });
  },

  subscribeToPushId: function(highPushId, desiredPushesCount, appListener) {
    this._appListener = appListener;
    if (this._subMode === null && this._prevSubMode === "range" &&
        this._knownPushes.hasOwnProperty(highPushId) &&
        this._desiredPushes === desiredPushesCount) {
      this._resubscribe(this._prevSubMode, false);
      return;
    }

    this._knownPushes = {};
    this._subMode = "range";
    this._modeAcked = false;
    this._desiredPushes = desiredPushesCount;

    this._sock.send({
      seqId: (this._pendingSeq = this._nextSeqId++),
      type: "subtree",
      treeName: this.tinderTree.name,
      pushId: highPushId,
    });
  },

  /**
   * Attempt to reuse our previous subscription data in the hopes that little
   *  has changed.  It's on the caller to ensure we had a previous mode.
   */
  _resubscribe: function(mode, automatic) {
    this._subMode = mode;
    this._prevSubMode = null;
    this._modeAcked = false;
    this._needToReissuePushes = !automatic;

    // (use a rich rep because we may want to send additional meta-data soon)
    var knownPushesAndVersions = [];
    for (var pushKey in this._knownPushes) {
      var buildPush = this._knownPushes[pushKey];
      knownPushesAndVersions.push({
        id: buildPush.push.id,
      });
    }

    this._sock.send({
      seqId: (this._pendingSeq = this._nextSeqId++),
      type: "assertsub",
      treeName: this.tinderTree.name,
      mode: this._subMode,
      timestamp: this._accurateAsOfMillis,
      timestampRev: this._revForTimestamp,
      knownPushesAndVersions: knownPushesAndVersions,
    });
  },

  /**
   * Unsubscribe from our current subscription setup, but do not destroy any of
   *  the data we have received at this point.  If the user hits the back
   *  button, we want to be able to reuse the data we have in the event that no
   *  updates have occurred or just apply deltas if only a small number of
   *  changes have occurred (and the server supports it.)
   */
  unsubscribe: function() {
    this._appListener = APP_LISTENER_DUMMY;
    this._prevSubMode = this._subMode;
    this._subMode = null;

    this._sock.send({
      seqId: (this._pendingSeq = this._nextSeqId++),
      type: "unsub",
    });
  },

  subGrowOrShift: function(dir) {
    this._sock.send({
      seqId: (this._pendingSeq = this._nextSeqId++),
      type: "subgrow",
      conditional: false,
      dir: dir,
    });
  },

  /**
   * Notice if the server un-subscribed us from a push we currently know about.
   *  If so, generate a removal notification.
   */
  _checkSubs: function(msg) {
    var highSub = parseInt(msg.subHighPushId);
    var lowSub = highSub - parseInt(msg.subPushCount) + 1;

    for (var pushIdStr in this._knownPushes) {
      var pushId = parseInt(pushIdStr);
      if (pushId < lowSub || pushId > highSub) {
        var buildPush = this._knownPushes[pushIdStr];
        delete this._knownPushes[pushIdStr];
        this._appListener.onUnsubscribedPush(buildPush);
      }
    }

    var believedRecent = (this._subMode === "recent");
    if (believedRecent != msg.subRecent) {
      this._subMode = msg.subRecent ? "recent" : "range";
      this._connListener.onSubModeChange(this._subMode);
    }
  },

  _checkAccuracyChange: function(msg) {
    if (msg.accurateAsOfMillis &&
        msg.accurateAsOfMillis != this._accurateAsOfMillis ||
        msg.revForTimestamp != this._revForTimestamp) {
      this._accurateAsOfMillis = msg.accurateAsOfMillis;
      this._revForTimestamp = msg.revForTimestamp;
      this._connListener.onConnectionStateChange();
    }
  },

  /**
   * Information on a fully formed push.
   */
  msgPushInfo: function(msg) {
    //console.log("push info", msg);

    // check subscriptions prior to doing the auto-grow thing because it
    //  may affect the mode we are in
    this._checkSubs(msg);

    // attempt to grow our subscription if required.
    if (this._subMode === "recent" &&
        msg.subPushCount < this._desiredPushes) {
      //console.log("trying to grow from", msg.subPushCount,
      //            "to", this._desiredPushes);
      this._sock.send({
        seqId: (this._pendingSeq = this._nextSeqId++),
        type: "subgrow",
        conditional: true,
        dir: -1,
      });
    }

    var buildPush = this._normalizeOnePush(msg.keysAndValues);
    this._knownPushes[buildPush.push.id] = buildPush;
    this._appListener.onNewPush(buildPush);

    this._checkAccuracyChange(msg);
  },

  /**
   * Delta information for a push we are subscribed to and should already know
   *  aboot.
   */
  msgPushDelta: function(msg) {
    if (!this._knownPushes ||
        !this._knownPushes.hasOwnProperty(msg.pushId)) {
      console.warn("server is telling us about a push delta we know nothing " +
                   "about:", msg);
      return;
    }

    // see if the server is actually telling us new data or just using this as
    //  a hacky way to update related meta-state.
    // XXX I meant to use treemeta to avoid sending a fake delta, but this isn't
    //  a bad guard...
    var anyChanges = false;
    for (var key in msg.keysAndValues) {
      anyChanges = true;
      break;
    }

    var buildPush = this._knownPushes[msg.pushId];
    //console.log("delta!", buildPush);
    if (anyChanges) {
      this._normalizeOnePush(msg.keysAndValues, buildPush);
      this._appListener.onModifiedPush(buildPush);
    }

    this._checkSubs(msg);
    this._checkAccuracyChange(msg);
  },

  /**
   * We are being told our data is still good; repopulate the UI.
   */
  msgAssertedSub: function(msg) {
    if (!this._needToReissuePushes)
      return;
    for (var pushId = msg.subHighPushId;
         this._knownPushes.hasOwnProperty(pushId);
         pushId--) {
      this._appListener.onNewPush(this._knownPushes[pushId]);
    }
  },

  /**
   * Normalize push data (in the form of raw HBase maps) for a single
   *  push into local object representations.  Supports initial and incremental
   *  processing.
   *
   * @args[
   *   @param[hbData @dictof["column name" "value"]{
   *     The HBase map representation to process.
   *   }
   *   @param[rootBuildPush #:optional BuildPush]{
   *     The top-level build push; pass null for a new push, pass the
   *     `BuildPush` we returned last time if this is an incremental
   *     processing.
   *   }
   * ]
   */
  _normalizeOnePush: function(hbData, rootBuildPush) {
    var key, value, self = this;

    function chewChangeset(hbcs, repo) {
      var cset = new $datamodel.Changeset(repo);
      cset.shortRev = hbcs.shortRev;
      cset.fullRev = hbcs.node;

      cset.author = LocalDB.getPersonForCommitter(hbcs.author);

      cset.branch = hbcs.branch;
      cset.tags = hbcs.tags;

      cset.rawDesc = hbcs.desc;

      cset.files = hbcs.files;
      cset.changeSummary =
        $changeSummarizer.summarizeChangeset(hbcs.files, repo.path_mapping);

      return cset;
    }

    /**
     * Process and create or retrieve the already created BuildPush instance
     *  corresponding to the given push key.   We do this because hbData is
     *  an unordered map that has the hierarchical push information effectively
     *  randomly distributed throughout it.  Rather than perform an ordering
     *  pass, we leverage our ability to randomly access the map and the fact
     *  that our push "parents" are the lexical prefixes of their children.
     */
    function chewPush(pushKey) {
      if (rootBuildPush) {
        if (pushKey === "s:r")
          return rootBuildPush;
        if (rootBuildPush._chewedBuildPushes.hasOwnProperty(pushKey))
          return rootBuildPush._chewedBuildPushes[pushKey];
      }
      var buildPush = new $datamodel.BuildPush(self.tinderTree);
      var truePush = new $datamodel.Push();
      buildPush.push = truePush;

      if (!hbData.hasOwnProperty(pushKey)) {
        console.warn("coherency issue with pushKey:", pushKey,
                     "we know about a build but not the associated revision");
        return buildPush;
      }

      var value = hbData[pushKey];
      var keyBits = pushKey.split(":");

      buildPush.topLevelPush = (keyBits.length == 2);
      buildPush.repo = buildPush.tinderTree.repos[keyBits.length - 2];

      // - set push state...
      truePush.id = parseInt(value.id);
      truePush.pushDate = new Date(value.date * 1000);
      truePush.pusher = LocalDB.getPersonForPusher(value.user);

      // process in reverse order
      for (var iCS = value.changesets.length - 1; iCS >= 0; iCS--) {
        truePush.changesets.push(
          chewChangeset(value.changesets[iCS],
                        self.tinderTree.repos[keyBits.length - 2]));
      }

      // - complex?  add us to our parent.
      if (keyBits.length > 2) {
        var parentBuildPush = chewPush(keyBits.slice(0, -1).join(":"));
        parentBuildPush.subPushes.push(buildPush);
        parentBuildPush.subPushes.sort(self._pushSorter);
      }

      // if there is no root, this is the root
      if (!rootBuildPush)
        buildPush._chewedBuildPushes = {};
      else
        rootBuildPush._chewedBuildPushes[pushKey] = buildPush;
      return buildPush;
    }

    var isIncremental = (rootBuildPush != null);
    if (!rootBuildPush)
      rootBuildPush = chewPush("s:r");

    for (key in hbData) {
      if (key[2] == "r") {
        // we already processed the root build push, don't chew it again
        if (key.length != 3)
          chewPush(key);
      }
      // s:b:(pushid:)*BUILDID
      else if (key[2] == "b") {
        // - just use the build rep verbatim for now...
        // (which is redundantly JSON encoded for change detection reasons)
        var build = JSON.parse(hbData[key]);

        // - stash us in our owning push
        // derive our parent's push key from our build key.
        var idxLastColon = key.lastIndexOf(":");
        var pushKey = "s:r" + key.substring(3, idxLastColon);
        // get that push...
        var buildPush = chewPush(pushKey);

        var oldBuild = null;
        if (buildPush._buildsById.hasOwnProperty(build.id)) {
          oldBuild = buildPush._buildsById[build.id];
          buildPush.builds.splice(
            buildPush.builds.indexOf(oldBuild), 1, build);
        }
        else {
          buildPush.builds.push(build);
        }
        buildPush._buildsById[build.id] = build;

        // - if we have a processed log, stash that on us
        var logKey = "s:l" + key.substring(3);
        if (hbData.hasOwnProperty(logKey)) {
          // (note: _not_ redundantly JSON encoded, unlike the build)
          build.processedLog = hbData[logKey];
        }
        else {
          build.processedLog = null;
        }

        // - set starred/extended state based on starred status.
        build.starred = build.richNotes.length > 0;
        if (build.starred)
          build.extendedState = build.state + "*";
        else
          build.extendedState = build.state;

        // - summarize
        // (We now always do this in a streaming fashion; we previously tried
        //  to batch in the name of locality, but let's go with fewer code
        //  paths for now.)
        if (!buildPush.buildSummary)
          buildPush.buildSummary = $buildAggregator.aggregateBuilds(
                                     self.tinderTree, []);
        buildPush.buildSummary.chewBuild(build, oldBuild);
      }
    }
    return rootBuildPush;
  },

  getRecentPushes: function(fromPushId) {
    var deferred = $pwomise.defer("recent-pushes", this.tinderTree.name);
    var self = this;
    var query = (fromPushId != null) ? ("?highpushid=" + fromPushId) : "";
    when(commonLoad(this.urlBase + "tree/" + this.tinderTree.name +
                      "/pushes" + query,
                    "push-fetch"),
      function(jsonStr) {
        var jsonObj = JSON.parse(jsonStr);
        var buildPushes = jsonObj.map(self._normalizeOnePush, self);
        // sort them...
        buildPushes.sort(self._pushSorter);
        deferred.resolve(buildPushes);
      },
      function(err) {
        deferred.reject(err);
      });

    return deferred.promise;
  },

  getPushLogDetail: function(pushId, buildId) {
    var deferred = $pwomise.defer("pushlog-detail", this.tinderTree.name);
    var self = this;
    when(commonLoad(this.urlBase + "tree/" + this.tinderTree.name +
                      "/push/" + pushId + "/log/" + encodeURIComponent(buildId),
                    "log-fetch"),
      function(jsonStr) {
        deferred.resolve(JSON.parse(jsonStr));
      },
      function(err) {
        deferred.reject(err);
      });

    return deferred.promise;
  },
};
exports.RemoteStore = RemoteStore;

}); // end define
