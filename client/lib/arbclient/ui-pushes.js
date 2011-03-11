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
    "wmsy/wmsy",
    "text!./ui-pushes.css",
  ],
  function(
    $wmsy,
    $_css
  ) {

var wy = new $wmsy.WmsyDomain({id: "ui-pushes", domain: "arbpl",
                               css: $_css});

wy.defineWidget({
  name: "generic-push",
  constraint: {
    type: "push",
  },
  // don't automatically bind anything, but make sure we create the obj
  //  so we can potentially assign to it in postInit.
  provideContext: {
  },
  focus: wy.focus.nestedItem.vertical("changesets", "subPushes"),
  structure: {
    headingBox: {
      pushDate: wy.libWidget({type: "relative-date"}, ["push", "pushDate"]),
      pusher: wy.widget({type: "person"}, ["push", "pusher"]),
    },

    kids: {
      changesets: wy.vertList({type: "changeset"}, ["push", "changesets"]),
      buildSummary: wy.widget({type: "aggr-build-summary"}, "buildSummary"),

      // build failures
      buildFailGroups: wy.vertList({type: "build-fail-group"},
                                   ["buildSummary", "failGroups"]),
      subPushes: wy.vertList({type: "push"}, "subPushes"),
    }
  },
  impl: {
    postInitUpdate: function() {
      if (this.obj.topLevelPush) {
        this.__context.pushId = this.obj.push.id;
        this.__context.subPushId = "";
      }
      else {
        this.__context.subPushId = this.obj.push.id;
      }
    },
  },
});

wy.defineWidget({
  name: "changeset",
  constraint: {
    type: "changeset",
  },
  focus: wy.focus.nestedItem.vertical("summaryGroups"),
  structure: {
    // The revision does not seem tremendously useful until you want more
    //  information about the push or want to cite it to someone else, so
    //  let's forget about it for now.
    //shortRev: wy.bind("shortRev"),
    header: {
      author: wy.widget({type: "person"}, "author"),
      desc: wy.bind("rawDesc"),
    },
    summaryGroups: wy.vertList({type: "change-summary-group"},
                               ["changeSummary", "changeGroups"]),
  },
});

wy.defineWidget({
  name: "change-summary-group",
  constraint: {
    type: "change-summary-group",
  },
  structure: {
    summaryRow: wy.flow({
      name: wy.bind("name"),
      colonStr: ": ",
      fileTypes: "",
    }),
    // the file list should start out collapsed...
    fileList: wy.vertList({type: "changed-file"}, wy.NONE),
  },
  focus: wy.focus.item,
  impl: {
    postInitUpdate: function() {
      this.collapsed = true;
      this.fileTypes_element.textContent = this.obj.fileTypes.join(", ");
    },
  },
  events: {
    root: {
      command: function() {
        this.collapsed = !this.collapsed;
        if (this.collapsed)
          this.fileList_set(null);
        else
          this.fileList_set(this.obj.files);
        this.FOCUS.bindingResized(this);
      },
    },
  },
});

wy.defineWidget({
  name: "changed-file",
  constraint: {
    type: "changed-file",
  },
  structure: wy.bind(wy.SELF),
});

wy.defineWidget({
  name: "aggr-build-summary-nullary",
  doc: "no build summary? no problem.",
  constraint: {
    type: "aggr-build-summary",
    obj: null,
  },
  structure: {
  },
});

/**
 * Flyweight style build matrix that uses a table for display.  We don't create
 *  widgets for the intermediary grouping constructs because it does not work
 *  well with our use of an actual HTML table.  We do not create proper widgets
 *  for the builds either because they are reasonably boring, there can be a
 *  lot of them, and our table not looking stupid depends on them all being
 *  largely homogeneous.  We do, however, provide click events for them and
 *  will provide other fancy hookups as needed.
 */
wy.defineWidget({
  name: "aggr-build-summary",
  doc: "build summary matrix",
  constraint: {
    type: "aggr-build-summary",
  },
  popups: {
    buildDetails: {
      popupWidget: wy.libWidget({type: "popup"}),
      constraint: {type: "build-details-container"},
      clickAway: true,
      position: {
        abovish: "root",
      },
    },
  },
  structure: {
  },
  impl: {
    postInit: function() {
      var rootCluster = this.obj.platRootCluster;
      var doc = this.domNode.ownerDocument;
      var clsTable = this.__cssClassBaseName + "table",
          clsCol = this.__cssClassBaseName + "col",
          clsProtoHeader = this.__cssClassBaseName + "protoHeader",
          clsProtoRotated = this.__cssClassBaseName + "protoRotated",
          clsSummaryHeader = this.__cssClassBaseName + "summaryHeader",
          clsPlatRow = this.__cssClassBaseName + "platRow",
          clsPlatCell = this.__cssClassBaseName + "platCell",
          clsResultCell = this.__cssClassBaseName + "resultCell",
          clsBuildNode = this.__cssClassBaseName + "buildNode";
      var rootNode = doc.createElement("table");
      rootNode.setAttribute("class", clsTable);

      // this will get clobbered by the platform group inner loop for indices
      //  greater than 1.
      var rowNode;
      function fabPlatCell(clustery) {
        var platNode = doc.createElement("td");
        platNode.setAttribute("class", clsPlatCell);
        platNode.setAttribute("rowspan", clustery.tallyRowCount());
        platNode.setAttribute("state", clustery.aggrState());
        platNode.textContent = clustery.name;
        rowNode.appendChild(platNode);
      }

      // --- header row, colgroup metadata
      var cgNode = doc.createElement("colgroup");
      cgNode.setAttribute("span", "4");
      rootNode.appendChild(cgNode);
      cgNode = doc.createElement("colgroup");

      var protoBuckets = this.obj.protoTypeGroups;
      rowNode = doc.createElement("tr");

      var ignoredNode = doc.createElement("td");
      ignoredNode.setAttribute("colspan", 4);
      rowNode.appendChild(ignoredNode);

      for (var iProto = 0; iProto < protoBuckets.length; iProto++) {
        var colNode = doc.createElement("col");
        colNode.setAttribute("class", clsCol);
        cgNode.appendChild(colNode);

        var protoNode = doc.createElement("td");
        protoNode.setAttribute("class", clsProtoHeader);
        var rotateNode = doc.createElement("span");
        rotateNode.setAttribute("class", clsProtoRotated);
        rotateNode.textContent = protoBuckets[iProto];
        protoNode.appendChild(rotateNode);
        rowNode.appendChild(protoNode);
      }
      rootNode.appendChild(cgNode);
      rootNode.appendChild(rowNode);

      var summaryRuns = this.obj.summaryRuns;
      rowNode = doc.createElement("tr");
      ignoredNode = doc.createElement("td");
      ignoredNode.setAttribute("colspan", 4);
      rowNode.appendChild(ignoredNode);
      for (var iSum = 0; iSum < summaryRuns.length; iSum++) {
        var sumNode = doc.createElement("td");
        sumNode.textContent = summaryRuns[iSum].name;
        sumNode.setAttribute("class", clsSummaryHeader);
        sumNode.setAttribute("colspan", summaryRuns[iSum].count);
        rowNode.appendChild(sumNode);
      }
      rootNode.appendChild(rowNode);

      // --- clusters / platform groups => rows
      for (var iPlat = 0; iPlat < rootCluster.kids.length; iPlat++) {
        rowNode = doc.createElement("tr");
        rowNode.setAttribute("class", clsPlatRow);
        var topCluster = rootCluster.kids[iPlat];
        fabPlatCell(topCluster);

        for (var iVer = 0; iVer < topCluster.kids.length; iVer++) {
          var verCluster = topCluster.kids[iVer];
          fabPlatCell(verCluster);

          for (var iArch = 0; iArch < verCluster.kids.length; iArch++) {
            var archCluster = verCluster.kids[iArch];
            fabPlatCell(archCluster);

            for (var iPG = 0; iPG < archCluster.kids.length; iPG++) {

              var platGroup = archCluster.kids[iPG];
              fabPlatCell(platGroup);

              // -- bucket cells
              for (var iBucket = 0;
                   iBucket < platGroup.buckets.length;
                   iBucket++) {
                var bucket = platGroup.buckets[iBucket];
                var bucketNode = doc.createElement("td");
                bucketNode.setAttribute("class", clsResultCell);

                // - builds
                for (var iBuild = 0; iBuild < bucket.length; iBuild++) {
                  var build = bucket[iBuild];
                  var buildNode = doc.createElement("div");
                  buildNode.setAttribute("class", clsBuildNode);
                  buildNode.setAttribute("state", build.state);
                  buildNode.setAttribute("build-id", build.id);
                  if (build.richNotes.length)
                    buildNode.textContent = "*";
                  bucketNode.appendChild(buildNode);
                }
                rowNode.appendChild(bucketNode);
              }

              rootNode.appendChild(rowNode);
              rowNode = doc.createElement("tr");
              rowNode.setAttribute("class", clsPlatRow);
            }
          }
        }
        // we will leave with an unused rowNode...
      }

      this.domNode.appendChild(rootNode);
    },

    /**
     * Locate a build by ID in O(n) time, so only use this on rare events.
     */
    getBuildById: function(buildId) {
      var builds = this.obj.allBuilds;
      for (var i = 0; i < builds.length; i++) {
        if (builds[i].id === buildId)
          return builds[i];
      }
      throw new Error("Impossibly did not find build for id: " + buildId);
    },

    clickedBuild: function(build, node) {
      node.setAttribute("popped", "true");
      this.popup_buildDetails(build, {domNode: node},
        function allGone() {
          node.removeAttribute("popped");
        }, /* explicit parent because we fake out the relBinding */ this);
    },
  },
  events: {
    root: {
      /**
       * Handle clicks, attempting to localize them to the build in question.
       */
      click: function root_click(ignoredBinding, event) {
        var target = event.target;
        if (target.hasAttribute("build-id"))
          this.clickedBuild(this.getBuildById(target.getAttribute("build-id")),
                            target);
      },
    },
  },
});

wy.defineWidget({
  name: "xpcshell-build-fail-group",
  doc: "characterize xpcshell failure groups",
  constraint: {
    type: "build-fail-group",
    obj: { type: "xpcshell" },
  },
  structure: {
    testGroup: wy.flow({
      name: wy.bind("name"),
      delimContextLinks: " (",
      topfailsLink: wy.hyperlink(wy.localizableString("topfails"), {
                                   href: wy.computed("topfailsLink"),
                                 }),
      endDelimContextLinks: ")",
    }),
    builderGroup: wy.flow({
      buildersLabel: "Builders: ",
      types: wy.widgetFlow({type: "build-info"}, "inBuilds",
                           {separator: ", "}),
    }),
  },
  impl: {
    topfailsLink: function() {
      return "http://brasstacks.mozilla.com/topfails/test/" +
        this.__context.tinderTree.name +
        "?name=xpcshell/tests/" + this.obj.name;
    },
  },
});

wy.defineWidget({
  name: "mozmill-build-fail-group",
  doc: "characterize mozmill failure groups",
  constraint: {
    type: "build-fail-group",
    obj: { type: "mozmill" },
  },
  emit: ["navigate"],
  structure: {
    testGroup: wy.flow({
      name: wy.bind("name"),
    }),
    builderGroup: wy.flow({
      buildersLabel: "Builders: ",
      types: wy.widgetFlow({type: "build-info"}, "inBuilds",
                           {separator: ", "}),
    }),
  },
  impl: {
  },
  events: {
    types: {
      click: function(buildBinding) {
        console.log("context", this.__context, "obj", this.obj);
        this.emit_navigate({pushid: this.__context.pushId,
                            log: this.__context.subPushId + ":" +
                                buildBinding.obj.id});
      },
    },
  },
});

wy.defineWidget({
  name: "mochitest-build-fail-group",
  doc: "characterize mochitest failure groups",
  constraint: {
    type: "build-fail-group",
    obj: { type: "mochitest" },
  },
  structure: {
    testGroup: wy.flow({
      name: wy.bind("name"),
    }),
    builderGroup: wy.flow({
      buildersLabel: "Builders: ",
      types: wy.widgetFlow({type: "build-info"}, "inBuilds",
                           {separator: ", "}),
    }),
  },
});

wy.defineWidget({
  name: "reftest-build-fail-group",
  doc: "characterize reftest failure groups",
  constraint: {
    type: "build-fail-group",
    obj: { type: "reftest" },
  },
  structure: {
    testGroup: wy.flow({
      name: wy.bind("name"),
    }),
    builderGroup: wy.flow({
      buildersLabel: "Builders: ",
      types: wy.widgetFlow({type: "build-info"}, "inBuilds",
                           {separator: ", "}),
    }),
  },
});


wy.defineWidget({
  name: "build-info",
  doc: "summarize the build information concisely",
  constraint: {
    type: "build-info",
  },
  structure: "",
  impl: {
    postInitUpdate: function() {
      var platform = this.obj.builder.os;
      var type = this.obj.builder.type;
      var buildStr = platform.platform;
      if (platform.ver)
        buildStr += " " + platform.ver;
      if (platform.arch)
        buildStr += " " + platform.arch;

      if (this.obj.builder.isDebug)
        buildStr += " debug";

      buildStr += " " + type.subtype;

      if (this.obj.builder.hasOwnProperty("capture") &&
          this.obj.builder.capture)
        buildStr += " " + this.obj.builder.capture;

      this.domNode.textContent = buildStr;

      if (this.obj.richNotes.length)
        this.domNode.setAttribute("starred", "true");
    },
  },
});

wy.defineWidget({
  name: "build-details-container",
  doc: "build details popup payload container",
  constraint: {
    type: "build-details-container",
  },
  structure: {
    actualDetails: wy.widget({type: "build-details"}, wy.SELF),
  },
});

wy.defineWidget({
  name: "build-details",
  doc: "build details popup payload",
  constraint: {
    type: "build-details",
  },
  structure: {
    builderName: wy.bind(["builder", "name"]),

    noteBlock: {
      noteHeaderLabel: "Notes:",
      notes: wy.vertList({type: "build-note"}, "richNotes"),
    },

    logBlock: {
      logHeaderLabel: "Logs:",
      logLinks: {
        briefLogLink: wy.hyperlink(wy.localizableString("brief log"), {
                                     href: wy.computed("briefLogLink"),
                                   }),
        fullLogLink: wy.hyperlink(wy.localizableString("full log"), {
                                     href: wy.computed("fullLogLink"),
                                  }),
        rawLogLink: wy.hyperlink(wy.localizableString("raw log"), {
                                     href: "logURL",
                                  }),

      }
    }
  },
  impl: {
    briefLogLink: function briefLogLink() {
      // logURL looks like http://tinderbox.mozilla.org/Tree/BuildId.gz,
      //  we want to insert the cgi script directive in the middle.
      var url = this.obj.logURL;
      var idxPath = url.indexOf("/", 9) + 1;
      return url.substring(0, idxPath) +
        "showlog.cgi?log=" +
        url.substring(idxPath);
    },
    fullLogLink: function fullLogLink() {
      return this.briefLogLink() + "&fulltext=1";
    },
  },
});

wy.defineWidget({
  name: "build-note",
  doc: "rich build note",
  constraint: {
    type: "build-note",
  },
  structure: {
    author: wy.bind("author"),
    dateStr: wy.bind("dateStr"),
    note: wy.bind("note"),
  },
});


}); // end define
