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
 * Perform graph-related processing of the loggest logs.
 **/

define(
  [
    'exports'
  ],
  function(
    exports
  ) {

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
exports.analyzeRootLoggers = function(rootLoggers) {
  var nodes = [], rootNodes = [], links = [];
  /**
   * Maps loggers to the node that directly represents them; this exists
   *  for aggregation nodes.
   */
  var loggerMap = {};
  var aggrMap = {}, pendingLinkMap = {}, linkedMap = {};

  const RADIUS_BIG = 8, RADIUS_MED = 5;

  function processLogger(logger, parentNode) {
    var name, id, node, radius, type, othId, link;
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
               radius: radius, children: null, highlightGen: 0, links: [] };
      nodes.push(node);
      if (parentNode) {
        if (!parentNode.children)
          parentNode.children = [];
        parentNode.children.push(node);
      }
      aggrMap[id] = node;

      if (parentNode) {
        link = {source: parentNode, target: node, highlightGen: 0};
        links.push(link);
        parentNode.links.push(link);
        node.links.push(link);
      }
    }

    if (othId) {
      //console.log("wanna link", id, othId);
      var outLinkId = id + "-" + othId;
      var inLinkId = othId + "-" + id;
      var canonLinkId = (id < othId) ? outLinkId : inLinkId;
      if (linkedMap.hasOwnProperty(canonLinkId)) {
        // nothing to do if already linked
      }
      else if (pendingLinkMap.hasOwnProperty(inLinkId)) {
        var target = pendingLinkMap[inLinkId];
        link = {
          source: node,
          target: target,
        };
        links.push(link);
        node.links.push(link);
        target.links.push(link);
        delete pendingLinkMap[inLinkId];
        linkedMap[canonLinkId] = true;
        //console.log("  LINKED!");
      }
      else {
        pendingLinkMap[outLinkId] = node;
      }
    }

    loggerMap[logger.raw.uniqueName] = node;

    // - kids
    for (var iKid = 0; iKid < logger.kids.length; iKid++) {
      processLogger(logger.kids[iKid], node);
    }
    return node;
  }

  for (var iRoot = 0; iRoot < rootLoggers.length; iRoot++) {
    rootNodes.push(processLogger(rootLoggers[iRoot]));
  }

  return {
    rootNodes: rootNodes,
    nodes: nodes,
    links: links,
    loggerMap: loggerMap,
  };
};

}); // end define
