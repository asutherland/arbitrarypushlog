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
 *
 * The original implementation was one-shot, but now that we are socket.io
 *  enabled, things have been altered to process in an incremental/streaming
 *  fashion.  As a side-effect, things are slightly more OO.
 **/

define(
  [
    "./repodefs",
    "exports"
  ],
  function(
    $repodefs,
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

function similarPathComponents(a, b) {
  var i;
  for (i = 0; i < a.length && i < b.length; i++) {
    if (a[i] !== b[i])
      break;
  }
  return i;
}

/**
 * Hiearchical clustering node; cluster by test type, directory structure.
 */
function FailCluster(name) {
  this.name = name;
  this.kids = [];
  // there is no path in effect for this cluster right now.
  this.usingPath = null;
}
FailCluster.prototype = {
  kind: "cluster",
  explicitName: "",
  getOrCreateSubCluster: function(name) {
    for (var i = 0; i < this.kids.length; i++) {
      if (this.kids[i].explicitName == name)
        return this.kids[i];
    }
    var kid = new FailCluster(name);
    kid.explicitName = name;
    this.kids.push(kid);
    this.kids.sort(nameSorter);
    return kid;
  },
  /**
   * Place a build into a FailGroup building a minimal tree hierarchy that
   *  always has at least two outgoing edges to child FailClusters when it has
   *  any such edges.  For example, if test "a" and "b" both happen in "foo/bar",
   *  then our cluster node is just "foo/bar".  However, once a test "c" shows
   *  up in "foo/baz", we will have the "foo" cluster pointing to child clusters
   *  "bar" and "baz".
   *
   * This is implemented by performing
   */
  pathBasedPlacement: function(pathParts, type, name, signature, build) {
    var failGroup;
    if (this.usingPath == null) {
      this.usingPath = pathParts;
      this.name = this.usingPath.join("/") || this.explicitName;
      failGroup = new FailGroup(type, name, signature);
      failGroup.inBuilds.push(build);
      this.kids.push(failGroup);
      return;
    }
    var similarity = similarPathComponents(this.usingPath, pathParts);
    // exact similarity match means just stick it in our list
    if (similarity === this.usingPath.length &&
        similarity === pathParts.length) {
      this.groupifyInKids(type, name, signature, build);
      return;
    }
    // split if required
    var subCluster;
    if (this.usingPath.length > similarity) {
      var subPath = this.usingPath.slice(similarity);
      var subName = subPath.join("/");
      this.usingPath = this.usingPath.slice(0, similarity);
      this.name = this.usingPath.join("/") || this.explicitName;
      subCluster = new FailCluster(subName);
      subCluster.usingPath = subPath;
      // save off new array to avoid abandoning it as garbage
      var nuevoKids = subCluster.kids;
      subCluster.kids = this.kids;
      nuevoKids.push(subCluster);
      this.kids = nuevoKids;
    }
    else {
      pathParts = pathParts.slice(similarity);
    }
    // - see if there is an appropriate sub-cluster (there will only be one)
    for (var i = 0; i < this.kids.length; i++) {
      var kid = this.kids[i];
      if (kid.usingPath) {
        similarity = similarPathComponents(kid.usingPath, pathParts);
        if (similarity) {
          // do not slice; the child will handle that.
          kid.pathBasedPlacement(pathParts, type, name, signature, build);
          return;
        }
      }
    }
    // - no existing sub-cluster, create.
    subCluster = new FailCluster();
    subCluster.pathBasedPlacement(pathParts, type, name, signature, build);
    this.kids.push(subCluster);
  },
  groupifyInKids: function(type, name, signature, build) {
    var failGroup;
    for (var i = 0; i < this.kids.length; i++) {
      failGroup = this.kids[i];
      if (failGroup.type === type &&
          failGroup.name === name &&
          failGroup.signature === signature) {
        failGroup.inBuilds.push(build);
        return;
      }
    }
    failGroup = new FailGroup(type, name, signature);
    failGroup.inBuilds.push(build);
    this.kids.push(failGroup);
  }
};

/**
 * Groups failures of a specific test together.
 */
function FailGroup(type, name, signature) {
  // these field names are explicitly chosen to mimic the failure info!
  this.type = type;
  this.name = name;
  this.signature = signature;
  this.inBuilds = [];
}
FailGroup.prototype = {
  kind: "group",
};
exports.FailGroup = FailGroup;

/**
 *
 */
function BuildMatrix(bbmeta, allBuilds) {
  /**
   * The broken out header bits; for example the type of build or talos test.
   */
  this.protoTypeGroups = bbmeta.protoBuckets;
  /**
   * The grouping header bits; for example, "build" or "talos".  1:many
   *  relationship with the protoTypeGroups.
   */
  this.summaryRuns = bbmeta.summaryRuns;
  /**
   * The root `PlatformCluster` that forms a hierarchy of `PlatformGroup`
   *  instances which own the actual buckets that make up the main body of
   *  the build matrix.
   */
  this.platRootCluster = new PlatformCluster("*ROOT*");

  // XXX this is shared amongst all BuildMatrix instances and is actually just
  //  a reference to the list maintained by `AggrBuildSummary`.
  this.allBuilds = allBuilds;

  this._makeEmptyBuckets = bbmeta.makeEmptyBuckets.bind(bbmeta);

  this._bucketMap = bbmeta.buildTypeToColumnIndex;
}
BuildMatrix.prototype = {
  _gimmePlatGroup: function _gimmePlatGroup(builder) {
    var topCluster = this.platRootCluster.getOrCreateKid(builder.os.platform);
    var verCluster = topCluster.getOrCreateKid(builder.os.ver || "");
    var archCluster = verCluster.getOrCreateKid(builder.os.arch);
    var platGroup = archCluster.getOrCreateKid(
      builder.isDebug ? "debug" : "opt", PlatformGroup, this._makeEmptyBuckets);
    return platGroup;
  },
  chewBuild: function(build, oldBuild) {
    var builder = build.builder;
    // - get the platform group
    var platGroup = this._gimmePlatGroup(builder);

    // set the state to the highest priority
    if (BUILD_STATE_PRIORITY_MAP[build.state] >
        BUILD_STATE_PRIORITY_MAP[platGroup.state])
      platGroup.state = build.state;

    // - categorize by build type within the group
    var bucketKey = builder.type.subtype + "-" +
                              (builder.hasOwnProperty("capture") ?
                                 builder.capture : "");
    if (!this._bucketMap.hasOwnProperty(bucketKey)) {
      console.log("ignoring bucket key", bucketKey, build);
      return;
    }
    var bucketIdx = this._bucketMap[bucketKey];
    if (oldBuild)
      platGroup.buckets[bucketIdx].splice(
        platGroup.buckets.indexOf(oldBuild), 1, build);
    else
      platGroup.buckets[bucketIdx].push(build);
  },
};

var RE_JSREF = /jsreftest.html\?test=(.+)$/;

/**
 * @args[
 *   @param[bbtree BundleBucketTree]
 *   @param[allBuilds @listof[RawBuild]]
 * ]
 */
function AggrBuildSummary(bbtree) {
  this.bbtree = bbtree;
  this.allBuilds = [];

  // XXX we should really not be hardcoding a presentation string here, but it
  //  simplifies the UI logic a bit...
  this.rootFailCluster = new FailCluster("Test failures:", false);

  this.buildMatrices = [];
  this._matrixByName = {};
  for (var iBundle = 0; iBundle < bbtree.bucketBundles.length; iBundle++) {
    var bundle = bbtree.bucketBundles[iBundle];
    var matrix = new BuildMatrix(bundle.meta, this.allBuilds);
    this.buildMatrices.push(matrix);
    this._matrixByName[bundle.name] = matrix;
  }
}
AggrBuildSummary.prototype = {
  /**
   * @args[
   *   @param[build BuildInfo]
   *   @param[oldBuild #:optional BuildInfo]{
   *     If `build` is updated data for a build we already knew about, this is
   *     the old object reference suitable for use with indexOf so we can
   *     identify and replace the old data easily.
   *   }
   * ]
   */
  chewBuild: function(build, oldBuild) {
    if (oldBuild)
      // replace the previous thing; should we be moving it to the end?
      this.allBuilds.splice(this.allBuilds.indexOf(oldBuild), 1, build);
    else
      this.allBuilds.push(build);

    // -- build matrix
    // - figure out which bundle/matrix it goes in
    var bundle = this.bbtree.classifier(build.builder);
    if (!bundle) {
      console.log("ignoring unclassifiable build:",
                  build.builder.name, build.builder.os.platform, build);
      return;
    }
    var matrix = this._matrixByName[bundle.name];

    matrix.chewBuild(build, oldBuild);

    // -- failure clustering
    // only process logs if the old build did not exist or did not have a log.
    // (log processing is an atomic thing right now.)
    if ((!oldBuild || !oldBuild.processedLog) && build.processedLog) {
      var testType = build.builder.type.subtype;
      var buildFailures = build.processedLog.failures;
      for (var iFail = 0; iFail < buildFailures.length; iFail++) {
        var bfail = buildFailures[iFail];
        var pathParts, testName, signature;

        if (testType === "mozmill") {
          pathParts = bfail.fileName.split("/");
          testName = bfail.testName;
          signature = "";
        }
        else if (testType === "xpcshell") {
          pathParts = bfail.test.split("/");
          testName = pathParts.pop();
          signature = bfail.hash;
        }
        else {
          var jsrefmatch = RE_JSREF.exec(bfail.test);
          if (jsrefmatch) {
            testType = "jsreftest";
            pathParts = jsrefmatch[1].split("/");
            testName = pathParts.pop();
            signature = "";
          }
          else {
            pathParts = bfail.test.split("/");
            testName = pathParts.pop();
            signature = "";
          }
        }

        // XXX we need to stop mutating testType inside the loop and hoist.
        var typeCluster = this.rootFailCluster.getOrCreateSubCluster(testType);
        typeCluster.pathBasedPlacement(pathParts, testType, testName, signature,
                                       build);
      }
    }
  },
};
exports.AggrBuildSummary = AggrBuildSummary;

/**
 * @typedef[BucketMeta @dict[
 *   @key[bucketCount]
 *   @key[protoBuckets]
 *   @key[summaryRuns]
 *   @key[buildTypeToColumnIndex @dictof[buildTypeKey Number]]
 * ]]
 * @typedef[BundleBucketTree @dict[
 *  @key[classifier @func[
 *    @args[
 *      @param[builder]{
 *        A builder definition to use to figure out which bundle is appropriate;
 *        should just be build.builder.
 *      }
 *    ]
 *    @return[BucketMeta]
 *  ]]{
 *    A function that returns the appropriate bundle
 *  }
 *  @key[bucketBundles @listof[@dict[
 *    @key[name String]
 *    @key[meta BucketMeta]
 *  ]]]
 * ]]
 **/

/**
 * @dictof["tree name" BundleBucketTree]{
 *   Cached per-tree bundle/bucket info derived from the tree def.
 * }
 */
var BUCKET_MAP = {};

function _makeEmptyBuckets() {
  var buckets = [];
  for (var i = this.bucketCount - 1; i >= 0; i--)
    buckets.push([]);
  return buckets;
}

function _bbTreeClassifier(builder) {
  var fallback;
  if (this.bucketBundles.length == 1)
    return this.bucketBundles[0];
  for (var i = 0; i < this.bucketBundles.length; i++) {
    var bundle = this.bucketBundles[i];
    if (bundle.platforms.hasOwnProperty(builder.os.platform))
      return bundle;
    if (bundle.platforms.hasOwnProperty("_"))
      fallback = bundle;
  }
  return fallback;
}

/**
 * Pre-compute the columns for the build matrix table display, populating
 *  meta-data that provides us with the names/visual presentation of the
 *  columns as well as a map from builder ids to their column number.
 *
 * @return[@dict[
 * ]]
 */
function getBundleBucketTreeForTree(tinderTree) {
  if (BUCKET_MAP.hasOwnProperty(tinderTree.name))
    return BUCKET_MAP[tinderTree.name];

  var typeGroupBundles = tinderTree.typeGroupBundles;
  var bundleBucketTree = BUCKET_MAP[tinderTree.name] = {
    classifier: _bbTreeClassifier,
    bucketBundles: [],
  };
  var bucketBundles = bundleBucketTree.bucketBundles;
  for (var iBundle = 0; iBundle < typeGroupBundles.length; iBundle++) {
    var bundle = typeGroupBundles[iBundle];

    var meta = {
      bucketCount: 0,
      makeEmptyBuckets: _makeEmptyBuckets,
      protoBuckets: [],
      summaryRuns: [],
      buildTypeToColumnIndex: {}
    };
    bucketBundles.push({
      name: bundle.name,
      platforms: bundle.platforms,
      meta: meta
    });
    var map = meta.buildTypeToColumnIndex,
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

    traverseList(meta, bundle.typeGroups, true);

    meta.bucketCount = bucketCount;
  }
  return bundleBucketTree;
}

/**
 * Process the set of builds from a push, building the build-sucess matrix and
 *  clustering of builders to encountered test failures.  The matrix
 *  represenation is basically exactly what a UI widget should use to emit an
 *  HTML table and is not particularly contenty.
 */
exports.aggregateBuilds = function aggregateBuilds(tinderTree, builds) {
  var bbtree = getBundleBucketTreeForTree(tinderTree);

  var aggr = new AggrBuildSummary(bbtree);
  for (var i = 0; i < builds.length; i++) {
    var build = builds[i];
    aggr.chewBuild(build);
  }

  return aggr;
};

});
