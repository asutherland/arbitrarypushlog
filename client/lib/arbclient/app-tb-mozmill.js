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
 * Standalone webapp that will pull down a given full tinderbox log for a
 *  Thunderbird mozmill run, process it, and display the results.  This is
 *  expected to potentially require a lot of memory just because those logs can
 *  be so large and we display all found runs in a single listing.  (We do this
 *  because originally the server helped us out by filtering these things down,
 *  and now there is no server.)
 **/

define(
  [
    'narscribblus/utils/pwomise',
    'narscribblus-plat/utils/env',
    'arbcommon/moztinder/mozmill-logfrob',
    'arbclient/rstore',
    './app-main',
    'exports'
  ],
  function(
    $pwomise,
    $env,
    $mozmillFrobber,
    $rstore,
    $app_main,
    exports
  ) {

var RE_SLOW_TBOX_URL = /^http:\/\/tinderbox\.mozilla\.org\/showlog\.cgi\?log=(.+\.gz)(?:&fulltext=1)?$/;

/**
 * Transform a slow URL that goes through showlog.cgi into a fast URL that just
 *  asks for the file directly off the server.  We don't need showlog.cgi's
 *  processing, and it slows things down and makes things unreliable.
 *
 * For example, this is a slow URL:
 * http://tinderbox.mozilla.org/showlog.cgi?log=ThunderbirdTrunk/1328617905.1328618660.23575.gz&fulltext=1
 *
 * And it becomes this fast URL:
 * http://tinderbox.mozilla.org/ThunderbirdTrunk/1328617905.1328618660.23575.gz
 */
function getFastLogPathFromTinderboxURL(inUrl) {
  var match = RE_SLOW_TBOX_URL.exec(inUrl);
  if (match)
    return "http://tinderbox.mozilla.org/" + match[1];
  return inUrl;
};

/**
 * Use XHR to fetch a URL and expose it as something resembling a node.js
 *  stream, at least as far as our frobbers are concerned.  This is made of
 *  bits of string and second-hand glue; this will not work reliably if you
 *  yield control flow without causing listeners to be registered on the
 *  stream.
 */
function makeNodeLookingXHRStreamForURL(url) {
  var stream = {
    handlers: {},
    on: function(name, handler) {
      this.handlers[name] = handler;
    },
  };
  $pwomise.when($rstore.commonLoad(url, "mozmill log", null),
    function(text) {
      stream.handlers.data(text);
      stream.handlers.end();
    },
    function(err) {
      console.error("Hey, I did not fetch", url, "so good.",
                    "Now nothing is going wo work.  Sowwwwwy :(");
    });
  return stream;
}

exports.goFetchAndShow = function() {
  var queryStr = window.location.search, inUrl;
  if (/^\?log=/.test(queryStr)) {
    inUrl = queryStr.substring(5);
    // if there's an un-escaped question mark in there, it's raw and we can use
    //  it verbatim!
    if (inUrl.indexOf('?') !== -1) {
    }
    // otherwise it's right and proper and we should right and properly process
    else {
      var env = $env.getEnv(window);
      inUrl = env.log;
    }
  }
  else {
    console.error(
      "You need to provide us with a tinderbox log URL in the query as 'log'.",
      "It does not need to be escaped or anything.  You can just type '?log='",
      "and then paste the tinderbox link (even one that goes through",
      "showlog.cgi) and we should do the right thing.");
    return;
  }

  var useUrl = getFastLogPathFromTinderboxURL(inUrl),
      stream = makeNodeLookingXHRStreamForURL(useUrl),
      summaryKey = "s:l",
      detailKeyPrefix = "d:l",
      frobber = new $mozmillFrobber.MozmillFrobber(
        stream, summaryKey, detailKeyPrefix,
        function(writeCells) {
          // now that we have the data, we can feed it to the UI directly
          $app_main.mainStandaloneFromData(writeCells, summaryKey,
                                           detailKeyPrefix);
        });

};

}); // end define
