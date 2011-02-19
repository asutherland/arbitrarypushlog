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
    "narscribblus-plat/utils/pwomise",
    "exports",
  ],
  function(
    $pwomise,
    exports
  ) {
var when = $pwomise.when;

/**
 * A push to a repo that depends on one or more other repos to build.
 */
function ComplexPush(jsonObj) {
  for (var key in jsonObj)
    this[key] = jsonObj[key];
}
ComplexPush.prototype = {
  kind: "complex",
};

/**
 * A push of a single repo that stands alone.
 */
function SimplePush(jsonObj) {
  for (var key in jsonObj)
    this[key] = jsonObj[key];
}
SimplePush.prototype = {
  kind: "simple",
};

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

function RemoteStore(tinderTree) {
  this.tinderTree = tinderTree;
  this.urlBase = "/";
}
RemoteStore.prototype = {
  /**
   * The server uses HBase and surfaces that quite directly.  It might be
   *  worth pushing this transformation down into the server.
   */
  _normalizeOnePush: function(hbData) {
    var key, value;

    // --- first pass, get the revision info.
    for (key in hbData) {
      if (key[2] == "r") {
        // - top level push
        if (key.length == 3) {
        }
        // - sub repo push
        else {
        }
      }
    }

    // --- second pass, get the build info
    for (key in hbData) {
      if (key[2] == "b") {
        // (all builds should have the same, maximal, push depth)
      }
    }
  },

  getRecentPushes: function() {
    var deferred = $pwomise.defer("recent-pushes", this.tinderTree.name);

    when(commonLoad(this.urlBase + "tree/" + this.tinderTree.name +
                      "/pushes",
                    "push-fetch"),
      function(jsonStr) {

      },
      function() {
      });

    return deferred.promise;
  },
};
exports.RemoteStore = RemoteStore;

}); // end define
