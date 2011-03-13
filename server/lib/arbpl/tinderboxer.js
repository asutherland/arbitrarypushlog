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

/**
 * Tinderbox data fetching and normalization.
 **/

define(
  [
    "q", "q-http",
    "url",
    "./hackjobs",
    "exports"
  ],
  function(
    $Q, $Qhttp,
    $url,
    $hackjobs,
    exports
  ) {

var when = $Q.when;

/**
 * Platform categories to be decided by applying the associated regular
 *  expressions in the order they are found in this list.
 */
var OS_PLATFORMS = [
  {
    regexes: [/linux.*64/i, /fedora.*64/i],
    plat: {
      idiom: "desktop",
      platform: "linux",
      arch: "x64",
      ver: null,
    },
  },
  {
    regexes: [/linux/i, /fedora/i],
    plat: {
      idiom: "desktop",
      platform: "linux",
      arch: "x32",
      ver: null,
    },
  },
  {
    regexes: [/snowleopard/, /OS\s?X.*10\.6/, /macosx64/],
    plat: {
      idiom: "desktop",
      platform: "mac",
      arch: "x64",
      ver: "10.6",
    },
  },
  {
    regexes: [/leopard/, /OS\s?X.*10\.5/, /macosx/],
    plat: {
      idiom: "desktop",
      platform: "mac",
      arch: "x64",
      ver: "10.5",
    },
  },
  {
    regexes: [/w764/, /WINNT 6\.1 x64/i],
    plat: {
      idiom: "desktop",
      platform: "win",
      arch: "x64",
      ver: "7",
    },
  },
  {
    regexes: [/WINNT 5\.1/i],
    plat: {
      idiom: "desktop",
      platform: "win",
      arch: "x32",
      ver: "XP",
    },
  },
  {
    regexes: [/win7/i],
    plat: {
      idiom: "desktop",
      platform: "win",
      arch: "x32",
      ver: "7",
    },
  },
  {
    regexes: [/WINNT 6\.1/i],
    plat: {
      idiom: "desktop",
      platform: "win",
      arch: "x32",
      ver: "7",
    },
  },
  {
    regexes: [/WINNT 5\.2/i, /* ??? */ /win32/],
    plat: {
      idiom: "desktop",
      platform: "win",
      arch: "x32",
      ver: "2003",
    },
  },
  {
    regexes: [/Android/i],
    plat: {
      idiom: "mobile",
      platform: "android",
      arch: "arm",
      ver: null,
    },
  },
  {
    regexes: [/Maemo/i, /n900/],
    plat: {
      idiom: "mobile",
      platform: "maemo",
      arch: "arm",
      ver: "5",
    },
  },
];

/**
 * Build type categories to be decided by applying the associated regular
 *  expressions in the order they are found in this list.
 */
var BUILD_TYPES = [
  {
    regexes: [/talos (a11y|chrome|cold|dirty|dromaeo|nochrome|scroll|svg|tp4|v8)/],
    buildType: {
      type: "perf",
      subtype: "talos",
    },
  },
  {
    regexes: [/mochitest-?(other)/, /mochitests-?(\d+)\//i,],
    buildType: {
      type: "test",
      subtype: "mochitest",
    },
  },
  {
    regexes: [/(crashtest-ipc)/i],
    buildType: {
      type: "test",
      subtype: "reftest",
    },
  },
  {
    regexes: [/(crashtest)/i],
    buildType: {
      type: "test",
      subtype: "reftest",
    },
  },
  {
    regexes: [/(jsreftest)/i],
    buildType: {
      type: "test",
      subtype: "reftest",
    },
  },
  {
    regexes: [/(reftest-ipc)/i],
    buildType: {
      type: "test",
      subtype: "reftest",
    },
  },
  {
    regexes: [/(reftest)/i, /(reftest)-d2d/i, /direct3d/i, /opengl/i],
    buildType: {
      type: "test",
      subtype: "reftest",
    },
  },
  {
    regexes: [/mozmill/i],
    buildType: {
      type: "test",
      subtype: "mozmill",
    },
  },
  // tracemonkey shenanigans
  {
    regexes: [/QT/],
    buildType: {
      type: "build",
      subtype: "qt",
    },
  },
  {
    regexes: [/Mobile/],
    buildType: {
      type: "build",
      subtype: "mobile",
    },
  },
  {
    regexes: [/nomethodjit/i],
    buildType: {
      type: "build",
      subtype: "nomethodjit",
    },
  },
  {
    regexes: [/notracejit/i],
    buildType: {
      type: "build",
      subtype: "notracejit",
    },
  },
  {
    regexes: [/spidermonkey-dtrace/i],
    buildType: {
      type: "build",
      subtype: "dtrace",
    },
  },
  {
    regexes: [/spidermonkey-shark/i],
    buildType: {
      type: "build",
      subtype: "shark",
    },
  },
  // catch-all builder
  {
    regexes: [/depend/i, /build/i],
    buildType: {
      type: "build",
      subtype: "build",
    },
  },
  {
    regexes: [/nightly/i, /shark/i],
    buildType: {
      type: "nightly",
      subtype: "nightly",
    },
  },
  {
    regexes: [/jetpack/i],
    buildType: {
      type: "test",
      subtype: "jetpack",
    },
  },
  {
    regexes: [/valgrind/i],
    buildType: {
      type: "test",
      subtype: "valgrind",
    },
  },
  // because check/test are catch-ally, this must go last.
  {
    regexes: [/xpcshell/i, /(check|test)/],
    buildType: {
      type: "test",
      subtype: "xpcshell",
    },
  },
];

var RE_SINGLE_QUOTE = /'/g;
var RE_DOUBLE_QUOTE = /"/g;
var RE_XFFE = /\xfffe/g;

var RE_PRE = /<\/?pre>/g;
var RE_NBSP = /&nbsp;/g;
var RE_NOTE_HUNK =
  /^\n*\[<b><a href=[^>]+>([^<]+)<\/a> - ([^<]+)<\/b>\]\n(.+)\n*$/;

/**
 * The tinderbox JSON format is not actually JSON but rather JSONP without
 *  the callback.
 */
function parseStupidJsonBlob(stupidBlob) {
  if (stupidBlob.substring(0, 16) != "tinderbox_data =") {
    console.error("Tinderbox JSON stupidBlob not as expected!");
    return null;
  }
  stupidBlob = stupidBlob.trim().slice(17, -1);

  // Additionally, the JSON is not actually legal JSON, so we need to
  // flip the bloody quotes. Khaaaaaaaaaaaaaaaaaaaaaan.
  stupidBlob = stupidBlob.replace(RE_SINGLE_QUOTE, "\xfffe");
  stupidBlob = stupidBlob.replace(RE_DOUBLE_QUOTE, "'");
  var lessStupidBlob = stupidBlob.replace(RE_XFFE, '"');

  return JSON.parse(lessStupidBlob);
}

var SERVER_URL = "http://tinderbox.mozilla.org/";

/**
 * Tinderbox data fetcher / normalizer.  No meaningful utilization of data
 *  occurs.
 */
function Tinderboxer(treeName) {
  this.treeName = treeName;
  this._buildersByName = {};
}
Tinderboxer.prototype = {
  _getScriptURL: function TBx_getScriptURL(timeRange, noIgnore, now) {
    if (timeRange.endTime >= now && !noIgnore)
      return SERVER_URL + this.treeName + "/json.js";

    var scriptURL = SERVER_URL + 'showbuilds.cgi?tree=' + this.treeName +
                    '&json=1' +
                    '&maxdate=' + Math.ceil(timeRange.endTime / 1000) +
                    '&hours=' + Math.ceil(timeRange.duration / 60 / 60 / 1000);
    if (noIgnore) {
      scriptURL += '&noignore=1';
    }
    return scriptURL;
  },

  fetchRange: function(timeRange) {
    var deferred = $Q.defer(), self = this;
    var url = this._getScriptURL(timeRange, false, Date.now());
    console.log("fetching tinderbox data from", url);
    when($Qhttp.read(url),
      function(dataBuffer) {
        try {
          var tinderObj = parseStupidJsonBlob(dataBuffer.toString("utf8"));
          deferred.resolve(self._parseTinderbox(tinderObj));
        }
        catch (ex) {
          console.error("Exception parsing tinderbox data", ex.stack);
          deferred.reject(ex);
        }
      },
      function(err) {
        console.error("Problem fetching tinderbox log!", err);
        deferred.reject(err);
      });

    return deferred.promise;
  },

  /**
   * Categorize a builder based on its name; builders are interned for
   *  identity purposes.
   *
   * Builders have names that tell us:
   * - The OS/platform (Linux/MacOSX/WINNT)
   * - The platform variant (none/x86-64/10.5/10.6/5.2)
   * - The branch (comm-central)
   * - The type of build/what it does (build/leak test build/test xpcshell/
   *    test xpcshell/test mozmill).
   *
   * @return[@oneof[BuilderInfo null]]{
   *   If the builder is boring, null, otherwise a populated info structure.
   * }
   */
  _categorizeBuilder: function(name) {
    if (this._buildersByName.hasOwnProperty(name))
      return this._buildersByName[name];

    var iRegex, goodOs = null, goodBuildType = null, match;
    outerOSLoop:
    for (var iOS = 0; iOS < OS_PLATFORMS.length; iOS++) {
      var osDef = OS_PLATFORMS[iOS];
      for (iRegex = 0; iRegex < osDef.regexes.length; iRegex++) {
        if (osDef.regexes[iRegex].test(name)) {
          goodOs = osDef;
          break outerOSLoop;
        }
      }
    }
    if (!goodOs) {
      console.warn("IGNORING BUILDER on OS", name);
      return (this._buildersByName[name] = null);
    }

    outerBuildLoop:
    for (var iBT = 0; iBT < BUILD_TYPES.length; iBT++) {
      var buildType = BUILD_TYPES[iBT];
      for (iRegex = 0; iRegex < buildType.regexes.length; iRegex++) {
        if ((match = buildType.regexes[iRegex].exec(name))) {
          goodBuildType = buildType;
          break outerBuildLoop;
        }
      }
    }
    if (!goodBuildType) {
      console.warn("IGNORING BUILDER on type", name);
      return (this._buildersByName[name] = null);
    }

    var isDebug = /debug/i.test(name) || /(leak|bloat)/i.test(name);

    var buildInfo = {
      name: name,
      os: goodOs.plat,
      isDebug: isDebug,
      type: goodBuildType.buildType,
    };
    if (match[1])
      buildInfo.capture = match[1];
    //console.log("BUILDER: ", buildInfo.name, buildInfo.os, buildInfo.isDebug, buildInfo.type);
    return (this._buildersByName[name] = buildInfo);
  },

  _processNote: function TinderboxJSONUser_processNote(note) {
    var s =  note.replace(RE_PRE, "").replace(RE_NBSP, " ");
    // Given that there is a very precise pattern used for tinderbox notes, let's
    //  manually scan on that rather than potentially screwing up the regexp
    //  by making it brittle or computationally nuts.
    var richNotes = [];
    while (s) {
      var nextS = null;
      var idxNext = s.indexOf("[<b><a href=mailto:", 16);
      if (idxNext != -1) {
        nextS = s.substring(idxNext);
        s = s.substring(0, idxNext);
      }
      var match = RE_NOTE_HUNK.exec(s);
      if (match) {
        richNotes.push({
          author: match[1],
          dateStr: match[2],
          note: match[3],
        });
      }
      else {
        console.warn("tinderbox note match failure on", s, "original:", note);
      }

      s = nextS;
    }
    return richNotes;
  },

  _findRevInScrape: function TinderboxJSONUser_findRevInScrape(scrape) {
    var revs = {};
    if (!scrape)
      return revs;
    var matches;
    var re = /http:\/\/hg.mozilla.org\/([^/]+(?:\/[^/]+)?)\/rev\/([0-9a-f]{12})/g;
    for (var i = 0; i < scrape.length; i++) {
      // There may be multiple revs in different repos in one line of the
      // scrape, so keep exec()ing until we run out.
      while ((matches = re.exec(scrape[i])) != null) {
        revs[matches[1]] = matches[2];
      }
    }
    return revs;
  },

  _parseTinderbox: function TinderboxJSONUser_parseTinderbox(td) {
    var machines = [];

    for (var iBN = 0; iBN < td.build_names.length; iBN++) {
      machines.push(this._categorizeBuilder(td.build_names[iBN]));
    }

    var notes = td.note_array.map(this._processNote);

    var machineResults = {};
    // rows
    for (var rowIndex = 0; rowIndex < td.build_table.length; rowIndex++) {
      // machines
      for (var machineIndex = 0;
           machineIndex < td.build_table[rowIndex].length;
           machineIndex++) {
        var machine = machines[machineIndex];
        if (!machine)
          continue;

        var build = td.build_table[rowIndex][machineIndex];
        if (build === -1 || build.buildstatus == "null" ||
            !machines[machineIndex])
          continue;

        /* building, success, testfailed, busted */
        var state = build.buildstatus;
        var rev = "";
        var startTime = new Date(build.buildtime * 1000);
        var endTime = (state != "building") ? new Date(build.endtime * 1000)
                                            : 0;
        var machineRunID = build.logfile;
        var buildScrape = td.scrape[machineRunID];
        var revs = this._findRevInScrape(buildScrape);
        // just ignore jobs that can’t be associated to a revision, this also
        // takes care of running builds
        if (!revs)
          continue;

        if (machineResults[machineRunID])
          continue;

        var richNotes = build.hasnote ? notes[build.noteid * 1] : [];

        var result = machineResults[machineRunID] = new MachineResult ({
          builder: machine,
          id: machineRunID,
          state: state,
          startTime: startTime,
          endTime: endTime,
          logURL: SERVER_URL + this.treeName + "/" + machineRunID,
          revs: revs,
          richNotes: richNotes,
          errorParser: build.errorparser,
          _scrape: buildScrape,
        });
      }
    }
    return machineResults;
  },
};
exports.Tinderboxer = Tinderboxer;

function MachineResult(data) {
  for (var i in data) {
    this[i] = data[i];
  }
}

MachineResult.prototype = {
};

}); // end define
