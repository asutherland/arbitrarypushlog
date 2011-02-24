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
    "./rstore",
    "arbcommon/repodefs",
    "./ui-main",
    "exports"
  ],
  function(
    $pwomise,
    $env,
    $rstore,
    $repodefs,
    $ui_main,
    exports
  ) {
var when = $pwomise.when;

/**
 *
 */
function ArbApp(win) {
  this.tinderTree = null;
  this.rstore = null;

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
   *
   */
  this.page = null;

  /**
   * The current navigated page location in terms of key/value pairs.  These
   *  are currently surface in the location bar as query terms, but we could
   *  also create a fake hierarchy with #! or something.
   */
  this._loc = null;

  this._popLocation();
}
ArbApp.prototype = {
  _useTree: function(tinderTree) {
    if (this.tinderTree !== tinderTree) {
      this.tinderTree = tinderTree;
      this.rstore = new $rstore.RemoteStore(this.tinderTree);
    }
  },

  _updateState: function(newState) {
    this.state = newState;
    if (this.binding)
      this.binding.update();
  },

  ORDERED_LOCATION_KEYS: ["tree", "pushid", "log", "test"],
  _popLocation: function() {
    var env = $env.getEnv(this.win);
    var loc = this._loc = {};
    var clobbering = false;
    for (var iKey = 0; iKey < this.ORDERED_LOCATION_KEYS.length; iKey++) {
      var key = this.ORDERED_LOCATION_KEYS[iKey];
      if (clobbering) {
        loc[key] = null;
      }
      else if (env.hasOwnProperty(key)) {
        loc[key] = env[key];
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
      return;
    }
    this._useTree(treeDef);

    // no log, show pushes (either most recent or from a specific push)
    if (!loc.log) {
      this._getPushes(loc.pushid);
      return;
    }

    // yes log, request it
    this._getLog(loc.pushid, loc.log, loc.test);
  },

  _setLocation: function(loc, alreadyInEffect) {
    this._loc = loc;
    var qbits = [];
    for (var iKey = 0; iKey < this.ORDERED_LOCATION_KEYS.length; iKey++) {
      var key = this.ORDERED_LOCATION_KEYS[iKey];
      if (loc[key] != null)
        qbits.push(encodeURIComponent(key) + "=" + encodeURIComponent(loc[key]));
      else
        break;
    }

    var navUrl;
    if (qbits.length)
      navUrl = "?" + qbits.join("&");
    else
      navUrl = "";
    this.history.pushState(null, "", navUrl);

    if (!alreadyInEffect) {
      this._popLocation();
    }
  },

  navigate: function(keyDeltas) {
    for (var key in keyDeltas) {
      this._loc[key] = keyDeltas[key];
    }
    console.log("trying to navigate to", this._loc);
    this._setLocation(this._loc);
  },

  _getPushes: function(highPushId) {
    this._updateState("connecting");
    var self = this;
    when(this.rstore.getRecentPushes(highPushId),
      function gotPushes(pushes) {
        self.page = {
          page: "pushes",
          pushes: pushes,
        };
        self._updateState("good");
      },
      function fetchProblem(err) {
        console.error("No go on the data.");
        self.error = err;
        self._updateState("error");
      });
  },

  _getLog: function(pushId, buildId, filterToTest) {
    this._updateState("connecting");
    var self = this;
    when(this.rstore.getPushLogDetail(pushId, buildId),
      function gotPushes(logDetails) {
        self.page = {
          page: "testlog",
          failures: logDetails.failures,
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
