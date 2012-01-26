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
 * Provides a reasonably sane high level promises-based http request mechanism
 *  with timeout and retry functionality.  I did a quick survey of all the http
 *  libraries listed on the node modules page and none of them supported retries
 *  or timeouts, although some had it as a to-do.  This is also somewhat
 *  rebelling against the q-http library which uses a confusingly large
 *  stack of promises.
 *
 * Our general timeout/retry strategy is based on the fact that our requests
 *  usually either respond quite quickly or just end up hanging.  Since retrying
 *  usually works immediately, it makes sense to give things 2 retries and
 *  then just give up for whatever it was that we were after.  (Most of our
 *  uses use some form of idempotent logic, so this is fine.)  The probability
 *  of a hung connection is reasonably low, and there are various requests
 *  we make that can take a while (hg.mozilla.org and tinderbox both have
 *  different issues), so we try and avoid being too aggressive about
 *  killing things.
 *
 * I believe the underlying problem we are trying to solve is some combination
 *  of quirky mozilla.org servers interacting with the transparent caching
 *  proxies that front them.  That and the newer node HTTP API not being
 *  entirely production-grade yet (but still very nice!)
 *
 * This module has now been upgraded to 0.6.* node; we previously performed
 *  a white-box subclassing of the Agent class to accomplish our goals, but
 *  now that the socket is directly exposed via the 'socket' event, that is
 *  not required.
 **/

define(
  [
    "http", "url", "net", "util",
    "q",
    "exports"
  ],
  function(
    $http, $url, $net, $util,
    $Q,
    exports
  ) {
var when = $Q.when;

var DEFAULT_IDLE_TIMEOUT_MS = 15 * 1000;
var DEFAULT_TRIES = 3;

/**
 * Fetching abstraction with retries and timeouts.
 *
 * We currently create a new Agent every time we want something and do not
 *  save them off.
 *
 * @args[
 *   @param[config @dict[
 *     @key[url]
 *     @key[method]
 *   ]]
 * ]
 */
exports.reliago = function reliago(config) {
  var deferred = $Q.defer();
  var parsed = $url.parse(config.url);
  var triesLeft = DEFAULT_TRIES;

  var options = {
    host: parsed.hostname,
    port: parsed.port || 80,
    method: config.method || "GET",
    path: parsed.pathname + (parsed.search || ""),
    headers: {
      "Host": parsed.hostname,
    }
  };

  function resultHandler(res) {
    // uh, start with a reasonable size I guess.
    var buf = "";
    if (res.statusCode !== 200) {
      deferred.reject("status: " + res.statusCode);
      return;
    }
    res.on('data', function(chunk) {
        buf += chunk.toString("utf8");
      }
    );
    res.on('end', function() {
        deferred.resolve(buf);
      }
    );
  }

  function addConnectTimeout(sock) {
    sock.setTimeout(DEFAULT_IDLE_TIMEOUT_MS,
      function() {
        // Destroy the connection so we can't hear anything more the socket might
        //  say; we don't want a weird race where the socket comes back to life
        //  but we have kicked off a new one.
        console.warn("  killing connection due to timeout!");
        sock.end();
      });
  }

  function tryIt() {
    // add something to grep for so we can see if this ever gets used...
    if (triesLeft !== DEFAULT_TRIES)
      console.log("  reliago RETRYING: " + config.url);

    if (--triesLeft <= 0) {
      deferred.reject("out of tries");
      return;
    }

    var req = $http.request(options, resultHandler);
    // (Even though the socket should be immediately created, it won't be saved
    //  to its attribute or the event generated until a future tick.)
    req.on('socket', addConnectTimeout);
    req.on('error', tryIt);
    if (config.body)
      req.write(config.body);
    req.end();
  }
  tryIt();

  return deferred.promise;
};

}); // end define
