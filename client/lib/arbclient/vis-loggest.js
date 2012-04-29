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
    'arbcommon/chew-loggest',
    'arbcommon/topo-loggest',
    "text!./vis-loggest.css",
    'exports'
  ],
  function(
    $wmsy,
    _d3isnotrequirejsaware,
    $chew_loggest,
    $topo_loggest,
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
      this._highlightGen = 1;
      this._layoutMode = 'force';
      this._width = 500;
      this._height = 400;
      this._populate();
      this._makeVis();
    },
    _makeVis: function() {
      var clsLine = this.__cssClassBaseName + "line",
          clsNode = this.__cssClassBaseName + "node",
          clsNodeCircle = this.__cssClassBaseName + "nodeCircle",
          clsNodeText = this.__cssClassBaseName + "nodeText";

      const w = this._width, h = this._height;
      var vis = this.vis = d3.select(this.domNode)
        .append("svg:svg")
          .attr("width", w)
          .attr("height", h);

      // -- layout
      const layoutMode = this._layoutMode;
      var layout, nodes;
      // - pack
      if (layoutMode === 'pack') {
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
      // - force
      else if (layoutMode === 'force') {
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
      else if (layoutMode === 'graphviz') {
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
      // force layout does the transforms in the tick
      if (layoutMode === 'force')
        node.call(layout.drag);
      // pack/graphviz have already laid things out by this time, translate
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
      if (layoutMode !== 'pack')
        nodeCirc.attr("r", function(d) { return d.radius; });
      else
        nodeCirc.attr("r", function(d) { return d.r; });

      // - node label
      var nodeText = node.append("svg:text")
          .attr("class", clsNodeText)
          .attr("loggerfamily", function(d) { return d.family; })
          .attr("type", function(d) { return d.type; })
          .attr("dx", 12)
          .attr("dy", "0.35em")
          .text(function(d) { return d.name; });
      // try and put the text in the circles
      if (layoutMode === 'pack')
        nodeText.attr("text-anchor", "middle");


      if (layoutMode === 'force') {
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
    _populate: function() {
      // -- build the graph rep
      var result = $topo_loggest.analyzeRootLoggers(this.obj);
      this.rootNodes = result.rootNodes;
      this.nodes = result.nodes;
      this.links = result.links;
      this.loggerMap = result.loggerMap;

      // -- if we have a prechewed graphviz layout, use it
      var perm = this.__context.permutation;
      if ("topoLayout" in perm.prechewed) {
        this._layoutMode = 'graphviz';
        var topoLayout = perm.prechewed.topoLayout;

        var gvBounds = topoLayout.BB.split(',').map(parseFloat);
        // scale by multiplication: x, y
        var padleft = 10, padtop = 10, padright = 90, padbottom = 10;
        var usewidth = this._width - padleft - padright;
        var useheight = this._height - padtop - padbottom;
        var smx = usewidth / gvBounds[2],
            smy = useheight / gvBounds[3];

        var rot = 0, rmx = 0, rmy = 0;
        if (smx < smy) {
          // if we are notably more wide than tall, perform a 45 degree rotation
          //  to try and avoid labels overlapping each other.
          if (smy / smx > 2) {
            // downscale a little
            smx *= 0.9;
            var a45 = Math.sin(Math.PI / 4);
            rmx = -a45 * smx;
            rmy = a45 * smx;
            padleft += padright - (padleft * 2);
          }
          smy = smx;
        }
        else {
          // nb: the layout algorithm should not be making stuff tall, if it does
          //  we would want to change this to also rotate.
          smx = smy;
        }

        //console.log("smx", smx, "smy", smy, "rmx", rmx, "rmy", rmy);
        for (var iNode = 0; iNode < this.nodes.length; iNode++) {
          var node = this.nodes[iNode];

          var gvCoords = topoLayout[node.id].split(',').map(parseFloat);
          node.x = padleft + gvCoords[0] * smx + gvCoords[1] * rmx;
          node.y = padtop + gvCoords[1] * smy + gvCoords[0] * rmy;
        }
      }
    },
    /**
     *
     */
    _highlightStepParticipantsOnly: function(step) {
      var highlightGen = this._highlightGen++;

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
        // (defensive guard against bad rows)
        if (!row) continue;
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
          if (highlightNodes.indexOf(node) === -1) {
            highlightNodes.push(node);
            node.highlightGen = highlightGen;
            // mark links if the other side is also highlighted (converges)
            for (var iLink = 0; iLink < node.links.length; iLink++) {
              var link = node.links[iLink];
              if (link.source.highlightGen === highlightGen &&
                  link.target.highlightGen === highlightGen)
                link.highlightGen = highlightGen;
            }
          }
        }
      }

      var clsLine = this.__cssClassBaseName + "line",
          clsNode = this.__cssClassBaseName + "node",
          clsNodeCircle = this.__cssClassBaseName + "nodeCircle",
          clsNodeText = this.__cssClassBaseName + "nodeText";

      // nb: we could be more efficient by stashing the DOM nodes on the
      //  JS nodes, but our N is small enough this is not a huge deal.

      // -- un-highlight the currently highlighted
      this.vis.selectAll("circle." + clsNodeCircle + "[highlighted]")
        .attr("highlighted", null);
      this.vis.selectAll("line." + clsLine + "[highlighted]")
        .attr("highlighted", null);
      this.vis.selectAll("text." + clsNodeText + "[highlighted]")
        .attr("highlighted", null);

      function highlightify(d) {
        return d.highlightGen === highlightGen;
      };

      // -- highlight the new fellas
      this.vis.selectAll("circle." + clsNodeCircle)
        .filter(highlightify)
          .attr("highlighted", "true");
      this.vis.selectAll("line." + clsLine)
        .filter(highlightify)
          .attr("highlighted", "true");
      this.vis.selectAll("text." + clsNodeText)
        .filter(highlightify)
          .attr("highlighted", "true");
    },
  },
  receive: {
    focusChanged: function(binding) {
      if (!binding)
        return;
      var obj = binding.obj;
      if (obj instanceof $chew_loggest.TestCaseStepMeta) {
        this._highlightStepParticipantsOnly(obj);
      }
    },
  },
});

}); // end define
