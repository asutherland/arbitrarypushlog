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
    "./chew-loghelper", "./chew-loggest",
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
    $ui_main,
    $_na_socketio,
    $require,
    exports
  ) {
var when = $pwomise.when;

var DESIRED_PUSHES = 6;

/**
 * Responsible for tracking the general state of the application and handling
 *  navigation amongst various supported pages including web browser history
 *  ramifications.  Bound into wmsy widgets in ui-main.js.
 */
function ArbApp(win) {
  this.tinderTree = null;
  this.rstore = new $rstore.RemoteStore(this);

  this.win = win;
  this._popLocationWrapped = this._popLocation.bind(this);
  this.win.addEventListener("popstate", this._popLocationWrapped, false);
  this.history = win.history;

  /**
   * @oneof[
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

  this.possibleTrees = $repodefs.TINDER_TREES;

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

  this.error = null;

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
    if (this.binding)
      this.binding.update();
  },

  ORDERED_LOCATION_KEYS: ["tree", "pushid", "log", "test"],
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

    // yes log, request it
    this._getLog(loc.pushid, loc.log, loc.test, pathNodes);
  },

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

  _setLocation: function(loc, alreadyInEffect) {
    this._loc = loc;
    var navUrl = this._urlMaker(loc);
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
  navigate: function(keyDeltas) {
    for (var key in keyDeltas) {
      this._loc[key] = keyDeltas[key];
    }
    //console.log("trying to navigate to", this._loc);
    this._setLocation(this._loc);
  },

  /**
   * Subscribe us to either recent pushes for the current tree or a specific
   *  push/set of pushes.
   */
  _getPushes: function(highPushId, pathNodes) {
    this._updateState("connecting");
    var self = this;

    self._slice_pushes = new $vs_array.ArrayViewSlice([]);
    self.page = {
      page: "pushes",
      pathNodes: pathNodes,
      pushes: self._slice_pushes,
      rstore: self.rstore,
    };
    self._updateState("good");

    if (!highPushId)
      self.rstore.subscribeToRecent(DESIRED_PUSHES);
    else
      self.rstore.subscribeToPushId(highPushId, DESIRED_PUSHES);
  },

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
    var slist = this._slice_pushes._list;
    if (slist.length &&
        buildPush.push.id < slist[0].push.id)
      idx = slist.length;
    // no antics for now, it doesn't know what to do for adds anyways.
    //this.binding.ANTICS.prepare("buildpush");
    this._slice_pushes.mutateSplice(idx, 0, buildPush);
    //this.binding.ANTICS.go("buildpush");
  },

  /**
   * Notification from the `RemoteStore` that an existing `BuildPush` or one
   *  of its children has been updated.
   */
  onModifiedPush: function(buildPush) {
    this.binding.IDSPACE.updateUsingObject("buildpush", buildPush);
  },

  /**
   * Notification from the `RemoteStrore` that a `BuildPush` known to us has
   *  been unsubscribed.
   */
  onUnsubscribedPush: function(buildPush) {
    var slist = this._slice_pushes._list;
    // no antics for now, it doesn't know what to do for adds anyways.
    //this.binding.ANTICS.prepare("buildpush");
    this._slice_pushes.mutateSplice(slist.indexOf(buildPush), 1);
    //this.binding.ANTICS.go("buildpush");
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

  _getLog: function(pushId, buildId, filterToTest, pathNodes) {
    this._updateState("connecting");

    // XXX actually, we probably still want a sub, just no watched pushes.
    this.rstore.unsubscribe();

    var self = this;
    when(this.rstore.getPushLogDetail(pushId, buildId),
      function gotLogDetail(logDetail) {
        var chewedDetails;
        switch (logDetail.type) {
          case "mozmill":
            chewedDetails = $chew_loghelper.chewMozmillFailure(logDetail);
            break;

          case "loggest":
            chewedDetails = $chew_loggest.chewLoggestCase(logDetail);
            break;

          default:
            chewedDetails = {
              failures: [logDetail],
            };
            break;
        }

        self.page = {
          page: "testlog",
          pathNodes: pathNodes,
          failures: chewedDetails.failures,
          // should we subscribe to new failures and jump to them?
          autoTransitionToNewFailures: false,
        };
        self._updateState("good");
      },
      function fetchProblem(err) {
        console.error("No go on the data.");
        self.error = err;
        self._updateState("error");
      });
  },
};

exports.main = function main() {
  var env = $env.getEnv();

  var app = window.app = new ArbApp(window);
  $ui_main.bindApp(app);
};

}); // end define
