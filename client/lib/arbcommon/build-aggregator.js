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
 * Given multiple builds, 1) group them by platform with a display bias, and 2)
 *  attempt to cluster the failures where possible.  Failure clustering is the
 *  important and interesting bit, as we want to know if a failure happened
 *  across all platforms, etc.
 **/

define(
  [
    "exports"
  ],
  function(
    exports
  ) {

function nameSorter(a, b) {
  return a.name.localeCompare(b.name);
}

var BUILD_STATE_PRIORITY_MAP = {
  success: 0,
  building: 1,
  exception: 2,
  testfailed: 3,
  busted: 4,
};

function PlatformCluster(name) {
  this.name = name;
  this.kids = [];
}
PlatformCluster.prototype = {
  getOrCreateKid: function(name, cls, extraFunc) {
    for (var i = 0; i < this.kids.length; i++) {
      if (this.kids[i].name == name)
        return this.kids[i];
    }
    var kid = new (cls || PlatformCluster)(name,
                                           extraFunc ? extraFunc() : undefined);
    this.kids.push(kid);
    this.kids.sort(nameSorter);
    return kid;
  },
  tallyRowCount: function() {
    var count = 0;
    for (var i = 0; i < this.kids.length; i++) {
      count += this.kids[i].tallyRowCount();
    }
    return count;
  },
  aggrState: function() {
    var state = "success";
    for (var i = 0; i < this.kids.length; i++) {
      var kidState = this.kids[i].aggrState();
      if (BUILD_STATE_PRIORITY_MAP[kidState] >
          BUILD_STATE_PRIORITY_MAP[state])
        state = kidState;
    }
    return state;
  },
};

/**
 * Per-platform grouping.
 */
function PlatformGroup(name, buckets) {
  this.name = name;
  this.types = [];
  this.typeMap = {};
  this.state = "success";
  this.buckets = buckets;
}
PlatformGroup.prototype = {
  tallyRowCount: function() {
    return 1;
  },
  aggrState: function() {
    return this.state;
  },
};
exports.PlatformGroup = PlatformGroup;

function FailGroup(type, name, signature) {
  // these field names are explicitly chosen to mimic the failure info!
  this.type = type;
  this.name = name;
  this.signature = signature;
  this.inBuilds = [];
}
FailGroup.prototype = {
};
exports.FailGroup = FailGroup;

function AggrBuildSummary(protoTypeGroups, summaryRuns,
                          platRootCluster, failGroups,
                          allBuilds) {
  this.protoTypeGroups = protoTypeGroups;
  this.summaryRuns = summaryRuns;
  this.platRootCluster = platRootCluster;
  this.failGroups = failGroups;
  this.allBuilds = allBuilds;
}
AggrBuildSummary.prototype = {
};
exports.AggrBuildSummary = AggrBuildSummary;

var BUCKET_MAP = {};

/**
 * Pre-compute the columns for the build matrix table display, populating
 *  meta-data that provides us with the names/visual presentation of the
 *  columns as well as a map from builder ids to their column number.
 */
function getBucketsForTree(tinderTree) {
  if (BUCKET_MAP.hasOwnProperty(tinderTree.name))
    return BUCKET_MAP[tinderTree.name];

  var bucketAll = BUCKET_MAP[tinderTree.name] = {
    meta: {bucketCount: 0, protoBuckets: [], summaryRuns: []},
    map: {}
  };
  var meta = bucketAll.meta, map = bucketAll.map, doSummary = false,
      protoBuckets = meta.protoBuckets, summaryRuns = meta.summaryRuns;

  var bucketCount = 0;
  function traverseList(blah, glist, top) {
    for (var i = 0; i < glist.length; i++) {
      var entry = glist[i];
      if (entry.hasOwnProperty("subgroups")) {
        traverseList(blah, entry.subgroups);
        summaryRuns.push({name: entry.name, count: entry.subgroups.length});
        continue;
      }

      if (typeof(entry) === "string")
        entry = {name: entry, subtype: entry, capture: ""};
      else if (!entry.hasOwnProperty("capture"))
        entry.capture = "";

      map[entry.subtype + "-" + entry.capture] = bucketCount++;
      protoBuckets.push(entry.name);
      if (top)
        summaryRuns.push({name: "", count: 1});
    }
  }

  traverseList(meta, tinderTree.typeGroups, true);

  meta.bucketCount = bucketCount;
  return bucketAll;
}

/**
 * Process the set of builds from a push, building the build-sucess matrix and
 *  clustering of builders to encountered test failures.  The matrix
 *  represenation is basically exactly what a UI widget should use to emit an
 *  HTML table and is not particularly contenty.
 */
exports.aggregateBuilds = function aggregateBuilds(tinderTree, builds) {
  var bucketInfo = getBucketsForTree(tinderTree);
  var bucketMap = bucketInfo.map;
  function makeEmptyBuckets() {
    var buckets = [];
    for (var i = bucketInfo.meta.bucketCount - 1; i >= 0; i--)
      buckets.push([]);
    return buckets;
  }

  var platRootCluster = new PlatformCluster("*ROOT*");
  function gimmePlatGroup(builder) {
    var topCluster = platRootCluster.getOrCreateKid(builder.os.platform);
    var verCluster = topCluster.getOrCreateKid(builder.os.ver || "");
    var archCluster = verCluster.getOrCreateKid(builder.os.arch);
    var platGroup = archCluster.getOrCreateKid(
      builder.isDebug ? "debug" : "opt", PlatformGroup, makeEmptyBuckets);
    return platGroup;
  }

  var failGroups = [], failGroupMap = {};
  for (var i = 0; i < builds.length; i++) {
    var build = builds[i];
    var builder = build.builder;

    // -- platform/build type hierarchy grouping
    // - get the platform group
    var platGroup = gimmePlatGroup(builder);

    // set the state to the highest priority
    if (BUILD_STATE_PRIORITY_MAP[build.state] >
        BUILD_STATE_PRIORITY_MAP[platGroup.state])
      platGroup.state = build.state;

    // - categorize by build type within the group
    var bucketKey = builder.type.subtype + "-" +
                              (builder.hasOwnProperty("capture") ?
                                 builder.capture : "");
    if (!bucketMap.hasOwnProperty(bucketKey)) {
      console.log("ignoring bucket key", bucketKey, build);
      continue;
    }
    var bucketIdx = bucketMap[bucketKey];
    platGroup.buckets[bucketIdx].push(build);

    // -- failure clustering
    if (build.processedLog) {
      var testType = build.builder.type.subtype;
      var buildFailures = build.processedLog.failures;
      for (var iFail = 0; iFail < buildFailures.length; iFail++) {
        var bfail = buildFailures[iFail];
        var failGroupKey, testName, signature;
        if (testType === "mozmill") {
          failGroupKey = testType + ":" + bfail.fileName + ":" + bfail.testName;
          testName = bfail.testName;
          signature = "";
        }
        else if (testType === "xpcshell") {
          failGroupKey = testType + ":" + bfail.test + ":" + bfail.hash;
          testName = bfail.test;
          signature = bfail.hash;
        }
        else {
          failGroupKey = testType + ":" + bfail.test;
          testName = bfail.test;
          signature = "";
        }

        var failGroup;
        if (failGroupMap.hasOwnProperty(failGroupKey)) {
          failGroup = failGroupMap[failGroupKey];
        }
        else {
          failGroup = failGroupMap[failGroupKey] =
            new FailGroup(testType, testName, signature);
          failGroups.push(failGroup);
        }

        failGroup.inBuilds.push(build);
      }
    }
  }

  return new AggrBuildSummary(bucketInfo.meta.protoBuckets,
                              bucketInfo.meta.summaryRuns,
                              platRootCluster, failGroups,
                              builds);
};

});
