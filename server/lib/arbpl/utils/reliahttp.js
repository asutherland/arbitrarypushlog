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
 * Subclasses http Agent class to let us add timeout support in a comparatively
 *  less hacky fashion than monkeypatching.
 *
 * In order to do the timeout thing, we need to be able to get at the raw net
 *  socket and call setTimeout on it.  Timeouts cover both connecting and
 *  data streaming; they are based on timers internally and not lower level
 *  system connection timeout abstractions.  To this end, our subclassing
 *  enables us to replace the act of establishing the connection, at which time
 *  we can establish the timeout and a timeout handler.
 */
function Agent(options) {
  $http.Agent.call(this, options);
}
$util.inherits(Agent, $http.Agent);

Agent.prototype._getConnection = function(host, port, cb) {
  var c = $net.createConnection(port, host);
  c.setTimeout(DEFAULT_IDLE_TIMEOUT_MS,
    function() {
      // Destroy the connection so we can't hear anything more the socket might
      //  say; we don't want a weird race where the socket comes back to life
      //  but we have kicked off a new one.
      c.end();
    }
  );
  c.on('connect', cb);
  return c;
};

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

  function tryIt() {
    // add something to grep for so we can see if this ever gets used...
    if (triesLeft !== DEFAULT_TRIES)
      console.log("RETRYING: " + config.url);

    if (--triesLeft <= 0) {
      deferred.reject("out of tries");
      return;
    }

    options.agent = new Agent(options);
    var req = $http._requestFromAgent(options, resultHandler);
    req.on("error", tryIt);
    if (config.body)
      req.write(config.body);
    req.end();
  }
  tryIt();

  return deferred.promise;
};

}); // end define
