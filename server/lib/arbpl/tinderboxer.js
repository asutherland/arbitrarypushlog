/*
 * This file is based on TinderboxJSONUser from mstange's tinderboxpushlog.
 * The nominal hg repo for tinderboxpushlog is:
 *   http://hg.mozilla.org/users/mstange_themasta.com/tinderboxpushlog/
 *
 * More specifically, this is a mash-up of my work on a refactored
 *  JSON parser from mozbuildstalk (which was a refactoring of
 *  TinderboxJSONUser) plus the since-updated version of TinderboxJSONUser now
 *  that there has been lots of drift in terms of how tinderbox works and
 *  some enhancements to the scraping.
 */

define(
  [
    "q/util", "q-http",
    "exports"
  ],
  function(
    $Q, $Qhttp,
    exports
  ) {

/**
 * The tinderbox JSON format is not actually JSON but rather JSONP without
 *  the callback.
 */
function parseStupidJsonBlob(stupidBlob) {
  if (stupidBlob.substring(0, 16) != "tinderbox_stupidBlob =") {
    console.error("Tinderbox JSON stupidBlob not as expected!");
    return null;
  }
  stupidBlob = stupidBlob.trim().slice(17, -1);

  // Additionally, the JSON is not actually legal JSON, so we need to
  // flip the bloody quotes. Khaaaaaaaaaaaaaaaaaaaaaan.
  stupidBlob = stupidBlob.replace("'", "\xfffe", "g");
  stupidBlob = stupidBlob.replace('"', "'", "g");
  var lessStupidBlob = stupidBlob.replace("\xfffe", '"', "g");
  return JSON.parse(lessStupidBlob);
}

function Tinderboxer() {
}
Tinderboxer.prototype = {
  _getScriptURL: function TBx_getScriptURL(tree, timeRange, noIgnore, now) {
    if (timeRange.endTime >= now && !noIgnore)
      return "http://tinderbox.mozilla.org/" + tree + "/json.js";

    var scriptURL = 'http://tinderbox.mozilla.org/showbuilds.cgi?tree=' + tree +
                    '&json=1' +
                    '&maxdate=' + Math.ceil(timeRange.endTime / 1000) +
                    '&hours=' + Math.ceil(timeRange.duration / 60 / 60 / 1000);
    if (noIgnore) {
      scriptURL += '&noignore=1';
    }
    return scriptURL;
  },

};

}); // end define
