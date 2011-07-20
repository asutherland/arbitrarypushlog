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
 * The Original Code is Arbitrarypushlog.
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
 *
 **/

define(
  [
    "wmsy/wmsy",
    'd3',
    "text!./vis-loggest.css",
    'exports'
  ],
  function(
    $wmsy,
    _d3isnotrequirejsaware,
    $_css,
    exports
  ) {
var wy = exports.wy = new $wmsy.WmsyDomain({id: "vis-loggest",
                                            domain: "loggest",
                                            css: $_css});

wy.defineWidget({
  name: "topo-summary",
  doc: "force directed graph showing actors and their relationships",
  constraint: {
    type: "topo-summary",
  },
  structure: {
  },
  impl: {
    postInit: function() {
      this._highlightedNodes = [];
      this._populate();
      this._makeVis();
    },
    _makeVis: function() {
      var clsLine = this.__cssClassBaseName + "line",
          clsNode = this.__cssClassBaseName + "node",
          clsNodeCircle = this.__cssClassBaseName + "nodeCircle",
          clsNodeText = this.__cssClassBaseName + "nodeText";

      const w = 400, h = 400;
      var vis = this.vis = d3.select(this.domNode)
        .append("svg:svg")
          .attr("width", w)
          .attr("height", h);

      // -- layout
      const forceLayout = true;
      var layout, nodes;
      // - pack
      if (!forceLayout) {
        layout = d3.layout.pack()
          .size([w - 4, h - 4])
          .value(function(d) { return d.radius; });
        var rootNode = {
          name: "",
          children: this.rootNodes,
          radius: 1,
        };
        nodes = layout.nodes(rootNode);
        // sort by depth so that we can
        nodes.sort(function (a, b) {
        });
      }
      // - (no longer used, force-directed)
      else {
        layout = d3.layout.force()
          .nodes(this.nodes)
          .links(this.links)
          .gravity(0.05)
          .distance(60)
          .charge(-60)
          .size([w, h])
          .start();
        nodes = this.nodes;
      }

      // -- edges
      var link = vis.selectAll("line." + clsLine)
          .data(this.links)
        .enter().append("svg:line")
          .attr("class", clsLine)
          .attr("x1", function(d) { return d.source.x; })
          .attr("y1", function(d) { return d.source.y; })
          .attr("x2", function(d) { return d.target.x; })
          .attr("y2", function(d) { return d.target.y; });

      // -- nodes
      // - container
      var node = vis.selectAll("g." + clsNode)
          .data(nodes)
        .enter().append("svg:g")
          .attr("class", clsNode);
      if (forceLayout)
        node.call(layout.drag);
      else
        node.attr("transform", function(d) {
                    return "translate(" + d.x + "," + d.y + ")"; });

      // - node vis
      var nodeCirc = node.append("svg:circle")
          .attr("class", clsNodeCircle)
          .attr("loggerfamily", function(d) { return d.family; })
          .attr("type", function(d) { return d.type; })
          .attr("cx", 0)
          .attr("cy", 0);
          // CSS can't style the radius :(
      if (forceLayout)
          nodeCirc.attr("r", function(d) { return d.radius; });
      else
          nodeCirc.attr("r", function(d) { return d.r; });

      // - node label
      node.append("svg:text")
          .attr("class", clsNodeText)
          .attr("loggerfamily", function(d) { return d.family; })
          .attr("type", function(d) { return d.type; })
          .attr("dx", 12)
          .attr("dy", "0.35em")
          .attr("text-anchor", "middle")
          .text(function(d) { return d.name; });


      if (forceLayout) {
        layout.on("tick", function() {
          link.attr("x1", function(d) { return d.source.x; })
              .attr("y1", function(d) { return d.source.y; })
              .attr("x2", function(d) { return d.target.x; })
              .attr("y2", function(d) { return d.target.y; });

          node.attr("transform", function(d) {
                      return "translate(" + d.x + "," + d.y + ")"; });
        });
      }
    },
    /**
     * Populate the nodes/links in the graph by traversing the logger family
     *  hierarchy roots recursively.
     *
     * We deal with loggers by their type:
     * - synthetic actors: always get created as nodes
     * - connections:
     *   - aggregating nodes are created based on type
     *   - a link is created to the parent
     *   - links between connections are created to the counterpart node
     * - servers/daemons: get aggregated into their parent
     * - tasks: get ignored, eventually will get aggregated
     * - everybody else: get ignored
     */
    _populate: function() {
      var nodes = this.nodes = [], rootNodes = this.rootNodes = [];
      var links = this.links = [];
      /**
       * Maps loggers to the node that directly represents them; this exists
       *  for aggregation nodes.
       */
      var loggerMap = this.loggerMap = {};
      var aggrMap = {}, pendingLinkMap = {}, linkedMap = {};

      const RADIUS_BIG = 8, RADIUS_MED = 5;

      function processLogger(logger, parentNode) {
        var name, id, node, radius, type, othId;
        switch (logger.schemaNorm.type) {
          case 'test:synthactor':
            id = logger.raw.uniqueName;
            // this should already be a simple string of sorts, but force the
            //  issue.
            name = "" + logger.raw.semanticIdent;
            type = logger.schemaNorm.subtype;
            radius = RADIUS_BIG;
            break;
          case 'connection':
            name = logger.schemaNorm.normalizeConnType(logger.raw.semanticIdent);
            id = logger.family + "-" + name;
            type = 'connection';
            radius = RADIUS_MED;
            if (logger.otherSide) {
              var othLogger = logger.otherSide,
                  othName = othLogger.schemaNorm.normalizeConnType(
                              othLogger.raw.semanticIdent);
              othId = othLogger.family + "-" + othName;
            }
            break;
          case 'server':
          case 'daemon':
            node = parentNode;
            break;
          default:
            return null;
        }

        if (node) {
          // do nothing; we just wanted to leave the node as-is
        }
        else if (aggrMap.hasOwnProperty(id)) {
          node = aggrMap[id];
        }
        else {
          node = { id: id, name: name, type: type, family: logger.family,
                   radius: radius, children: null };
          nodes.push(node);
          if (parentNode) {
            if (!parentNode.children)
              parentNode.children = [];
            parentNode.children.push(node);
          }
          aggrMap[id] = node;

          if (parentNode) {
            links.push({source: parentNode, target: node});
          }
        }

        if (othId) {
          console.log("wanna link", id, othId);
          var linkId = (id < othId) ? (id + "-" + othId) : (othId + "-" + id);
          if (linkedMap.hasOwnProperty(linkId)) {
            // nothing to do if already linked
          }
          else if (pendingLinkMap.hasOwnProperty(linkId)) {
            var link = {
              source: node,
              target: pendingLinkMap[linkId],
            };
            links.push(link);
            delete pendingLinkMap[linkId];
            console.log("  LINKED!");
          }
          else {
            pendingLinkMap[linkId] = node;
          }
        }

        loggerMap[logger.raw.uniqueName] = node;

        // - kids
        for (var iKid = 0; iKid < logger.kids.length; iKid++) {
          processLogger(logger.kids[iKid], node);
        }
        return node;
      }

      var roots = this.obj;
      for (var iRoot = 0; iRoot < roots.length; iRoot++) {
        rootNodes.push(processLogger(roots[iRoot]));
      }
    },
    /**
     *
     */
    _highlightStepParticipantsOnly: function(step) {
      // -- figure out the loggers with any activity.
      var activeLoggers = [], logger;
      // nb: this is taken from the case-entry-matrix processor
      var perm = this.__context.permutation,
          stepIndex = perm.steps.indexOf(step),
          isLastStep = stepIndex === (perm.steps.length - 1);

      var rows = [];
      rows.push(perm._perStepPerLoggerEntries[stepIndex*2]); // before
      rows.push(perm._perStepPerLoggerEntries[stepIndex*2 + 1]); // the step
      if (isLastStep)
        rows.push(perm._perStepPerLoggerEntries[stepIndex*2 + 2]); // after

      var iRow, row, iCol, entries, iLogger;
      for (iRow = 0; iRow < rows.length; iRow++) {
        row = rows[iRow];
        for (iCol = 0; iCol < row.length; iCol++) {
          entries = row[iCol];
          logger = perm.loggers[iCol];
          if ((entries !== null) && (activeLoggers.indexOf(logger) === -1))
            activeLoggers.push(logger);
        }
      }

      // -- map from the active loggers to the first parent with a node.
      var nodes = this.nodes, loggerMap = this.loggerMap,
          node, highlightNodes = [];
      for (iLogger = 0; iLogger < activeLoggers.length; iLogger++) {
        logger = activeLoggers[iLogger];
        while (logger && !loggerMap.hasOwnProperty(logger.raw.uniqueName)) {
          logger = logger.parent;
        }
        if (logger) {
          node = loggerMap[logger.raw.uniqueName];
          if (highlightNodes.indexOf(node) === -1)
            highlightNodes.push(node);
        }
      }

      // -- un-highlight the currently highlighted

      // -- highlight the new fellas
    },
  },
  dreceive: {
    brushStep: function(step) {
      this._highlightStepParticipantsOnly(step);
    },
  },
});

}); // end define
