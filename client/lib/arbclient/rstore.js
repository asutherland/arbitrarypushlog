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

/**
 * Per-tinderbox tree server talking.
 */
function RemoteStore(listener) {
  this._listener = listener;

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



  this.hookupSocket();
}
RemoteStore.prototype = {
  useTree: function(tinderTree) {
    this.tinderTree = tinderTree;
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

  onConnect: function() {
    // XXX this is where we might want to resubmit our current state to the
    //  server or cause a higher level to re-establish, etc.
    //console.log("socket.io connection established");
  },

  onMessage: function(msg) {
    //console.log("MESSAGE", msg);
    if (msg.seqId !== -1) {
      if (msg.seqId === this._pendingSeq) {
        this._pendingSeq = 0;
      }
      else {
        console.warn("Unexpected message seq; expected",
                     this._pendingSeq, "got", msg.seqId,
                     "message:", msg);
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
    }
  },

  onDisconnect: function() {
    //console.log("socket.io connection lost");
    this.hookupSocket();
  },

  _pushSorter: function(a, b) {
    return b.push.pushDate - a.push.pushDate;
  },

  subscribeToRecent: function(desiredPushesCount) {
    this._knownPushes = {};
    this._subMode = "recent";
    this._desiredPushes = desiredPushesCount;

    this._sock.send({
      seqId: (this._pendingSeq = this._nextSeqId++),
      type: "subtree",
      treeName: this.tinderTree.name,
      pushId: "recent"
    });
  },

  subscribeToPushId: function(highPushId, desiredPushesCount) {
    this._knownPushes = {};
    this._subMode = "range";
    this._desiredPushes = desiredPushesCount;

    this._sock.send({
      seqId: (this._pendingSeq = this._nextSeqId++),
      type: "subtree",
      treeName: this.tinderTree.name,
      pushId: highPushId,
    });
  },


  unsubscribe: function() {
    this._knownPushes = {};
    this._subMode = null;
    this._desiredPushes = 0;

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
        this._listener.onUnsubscribedPush(buildPush);
      }
    }

    var believedRecent = (this._subMode === "recent");
    if (believedRecent != msg.subRecent) {
      this._subMode = msg.subRecent ? "recent" : "range";
      this._listener.onSubModeChange(this._subMode);
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
    this._listener.onNewPush(buildPush);
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

    var buildPush = this._knownPushes[msg.pushId];
    //console.log("delta!", buildPush);
    this._normalizeOnePush(msg.keysAndValues, buildPush);
    this._listener.onModifiedPush(buildPush);

    this._checkSubs(msg);
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
      var cset = new $datamodel.Changeset();
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

        // - if this is an incremental processing, stream the aggregation.
        // (if not incremental, we will do it in a batch at the bottom)
        if (isIncremental && buildPush.buildSummary)
          buildPush.buildSummary.chewBuild(build, oldBuild);
      }
    }

    // -- perform any summarization that depends on us having seen everything
    // - summarize builds
    if (!isIncremental) {
      rootBuildPush.visitLeafBuildPushes(function(buildPush) {
        buildPush.buildSummary =
          $buildAggregator.aggregateBuilds(self.tinderTree, buildPush.builds);
      });
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
