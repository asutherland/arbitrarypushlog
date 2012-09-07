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
 * Process a stream for delineated loggest unit test run results.  Derived from
 *  the mozmill frobber.
 *
 * Notable things we do versus the mozmill frobber:
 * - We process successes and failures.
 * - We perform a preprocessing pass that is able to contribute derived metadata
 *    from the logs.  We do this so that we can run graphviz
 **/

define(
  [
    "q",
    "graphviz",
    "arbcommon/chew-loggest",
    "arbcommon/topo-loggest",
    "exports"
  ],
  function(
    $Q,
    $graphviz,
    $chew_loggest,
    $topo_loggest,
    exports
  ) {
var when = $Q.when;

/**
 * Detect indicators of failure other than the silver platter JSON objects.
 *  (The current value is not a real thing, but the logic is useful.)
 */
var RE_OTHFAIL = /(^\*\*\* THE WORLD EXPLODED! \*\*\*)/m;

var RE_START = /^##### LOGGEST-TEST-RUN-BEGIN #####$/m;
var RE_END = /^##### LOGGEST-TEST-RUN-END #####$/m;
var OVERLAP_PADDING = 32;

var RE_BACKSLASH = /\\/g;

/**
 * Consume a stream for explicitly delineated runs of loggest test run JSON
 *  blobs and performing file-system normalizations.  Windows-style paths
 *  are forbidden and accordingly not handled.
 *
 * The write cells generated are:
 * - one log file summary (with summaryKey) characterizing all test cases,
 *    broken out into separate success and failure lists.  The failure list
 *    entries have no meta-data, the success entries include the run-time.
 * - one cell per test case, summary or failure.  every cell contains a copy
 *    of the schema block; I'm not crazy about it, but it may compress well.
 */
function Frobber(stream, summaryKey, detailKeyPrefix, callback) {
  this.stream = stream;
  stream.on("data", this.onData.bind(this));
  stream.on("end", this.onEnd.bind(this));

  this.detailKeyPrefix = detailKeyPrefix;
  this.callback = callback;

  this.overview = {
    type: "loggest",
    successes: [],
    failures: [],
    failureIndicated: false,
    unusualFailureIndicated: false,
  };
  this.writeCells = {};
  this.writeCells[summaryKey] = this.overview;

  this.inBlock = false;
  this.leftover = null;

  this.totalPending = 0;
  this.fileAllRead = false;

  this._prechewActive = false;
  this._pendingPrechews = [];
}
Frobber.prototype = {
  _gobbleJsonFromLines: function(dstr) {
    var bits = dstr.split("\n"), self = this, pending = 0;
    for (var i = 0; i < bits.length; i++) {
      // ignore blank lines...
      if (!bits[i])
        continue;

      // it's possible for other lines to get mixed in, although it's not
      //  preferred.  if it doesn't remotely look like JSON, don't mention it.
      if (bits[i][0] !== "{")
        continue;
      var rawObj;
      try {
        rawObj = JSON.parse(bits[i]);
      }
      catch(ex) {
        // die quickly in event of parse failure so we don't just sit around
        //  like suckers.
        // XXX once all test-driver bugs are ironed out, we want to stop doing
        //  this and instead just propagate an annotation that there was
        //  something corrupt about the log.
        console.error("JSON PARSING PROBLEM! " + ex + " on...");
        console.error(bits[i]);
        process.exit(1);
      }
      // top level is 'schema', 'log' whose 'kids' are testcase loggers
      var schema = rawObj.schema, summaryObj;
      // -- file require() failure
      if (rawObj.hasOwnProperty("fileFailure")) {
        var fileFailure = rawObj.fileFailure;
        summaryObj = {
          fileName: fileFailure.fileName,
          moduleName: fileFailure.moduleName,
          testName: '$FILE',
          uniqueName: fileFailure.fileName + '-$FILE',
        };
        this.overview.failureIndicated = true;
        this.overview.failures.push(summaryObj);
        this.writeCells[this.detailKeyPrefix + ":" + summaryObj.uniqueName] = {
          type: "filefail",
          fileName: summaryObj.fileName,
          moduleName: fileFailure.moduleName,
          exceptions: fileFailure.exceptions,
        };
        continue;
      }

      var definerLog = rawObj.log;
      // Empty / fully disabled test files will have no kids!
      if (!definerLog.kids)
        continue;

      for (var iKid = 0; iKid < definerLog.kids.length; iKid++) {
        var testCaseLog = definerLog.kids[iKid];
        var testUniqueName = definerLog.semanticIdent + "-" +
                               testCaseLog.semanticIdent;
        summaryObj = {
          fileName: definerLog.semanticIdent,
          testName: testCaseLog.semanticIdent,
          uniqueName: testUniqueName,
          passed: testCaseLog.latched.result === 'pass',
        };
        if (!testCaseLog.latched ||
            (!testCaseLog.latched.result ||
             testCaseLog.latched.result !== 'pass')) {
          this.overview.failureIndicated = true;
          this.overview.failures.push(summaryObj);
        }
        else {
          this.overview.successes.push(summaryObj);
        }

        pending++;
        this.totalPending++;
        //console.log("totalPending", this.totalPending);
        var detailObj = {
          type: "loggest",
          fileName: definerLog.semanticIdent,
          schema: schema,
          log: testCaseLog,
          prechewed: null,
        };
        self.writeCells[self.detailKeyPrefix + ":" + testUniqueName] =
            detailObj;
        when(this._prechewCase(schema, definerLog.semanticIdent, testCaseLog,
                               detailObj),
          function() {
            // resume I/O if we suspended
            if (--pending === 0)
              self.stream.resume();
            if (--self.totalPending === 0 && self.fileAllRead)
              self.allDone();
          }, function(err) {
            console.error("prechew problem:", err);
            if (--pending === 0)
              self.stream.resume();
            if (--self.totalPending === 0 && self.fileAllRead)
              self.allDone();
          });
      }
    }
    // if we have outstanding requests, pause I/O until we process all we have
    //  so far.  (avoid memory explosions)
    if (pending) {
      //console.log("PENDING:", pending);
      this.stream.pause();
    }
  },
  /**
   * Support for pipelining our prechew logic rather than doing them all in
   * parallel.
   */
  _actuallyPerformNextPrechew: function() {
    if (!this._pendingPrechews.length) {
      this._prechewActive = false;
      return;
    }
    this._prechewActive = true;
    var todo = this._pendingPrechews.shift();
    var self = this;
    when(this._topoLayoutPrechew(todo.perm),
         function(rval) {
           todo.deferred.resolve(rval);
           self._actuallyPerformNextPrechew();
         },
         function(err) {
           todo.deferred.reject(err);
           self._actuallyPerformNextPrechew();
         });
  },
  _prechewCase: function(schema, fileName, testCaseLog, detailObj) {
    // XXX we should be able to reuse the transformer if we didn't screw up
    var transformer = new $chew_loggest.LoggestLogTransformer();
    transformer.processSchemas(schema);
    var caseBundle = transformer.processTestCase(fileName, testCaseLog);
    var permPrechews = [];

    for (var iPerm = 0; iPerm < caseBundle.permutations.length; iPerm++) {
      var perm = caseBundle.permutations[iPerm],
          todo = { deferred: $Q.defer(), perm: perm };
      this._pendingPrechews.push(todo);
      permPrechews.push(todo.deferred.promise);
    }
    if (!this._prechewActive)
      this._actuallyPerformNextPrechew();

    return when($Q.all(permPrechews), function (prechewed) {
                  detailObj.prechewed = prechewed;
                });
  },
  _topoLayoutPrechew: function(perm) {
    var deferred = $Q.defer();

    // get the d3-biased node representation
    var topo = $topo_loggest.analyzeRootLoggers(perm.rootLoggers);
    // use that to build a graphviz style graph
    // note: I am cribbing some stuff from some of my old school python
    //  visophyte implementation.  it seemed reasonable at the time, but
    //  may not be reasonable today.

    // no nodes means no need to graph.
    if (!topo.nodes.length) {
      deferred.resolve({});
      return deferred.promise;
    }

    // -- graph!
    var g = $graphviz.graph("G");
    // create a known, bounded coordinate space
    g.set("size", "100,100");
    //g.set("mode", "ipsep");
    //g.set("overlap", "ipsep");
    //g.set("model", "mds");

    g.setNodeAttribut('shape', 'point');
    //g.setNodeAttribut('width', '0.8');
    //g.setNodeAttribut('height', '0.8');

    // - nodes
    for (var iNode = 0; iNode < topo.nodes.length; iNode++) {
      var dNode = topo.nodes[iNode];
      dNode.gNode = g.addNode(dNode.id);
    }
    // - edges
    for (var iEdge = 0; iEdge < topo.links.length; iEdge++) {
      var dEdge = topo.links[iEdge];
      g.addEdge(dEdge.source.gNode, dEdge.target.gNode);
    }

    // -- roundtrip graph for layout
    var dDot = $Q.defer();
    //console.log("INDOT", g.to_dot());

    // asuth's official aesthetic analysis when using no specialized graphviz
    //  settings.  (I have previously tweaked neato to good effect, and it
    //  should be considered.)
    // - dot: no good, not suitable to network topology.
    // - neato: pretty good, BUT:
    //   - unneeded crossings observed (signup and mailstore connections)
    //   - the server connection interconnection mixes up the deliver and
    //      establish channels, which is not particularly helpful.
    //   - label overlap happens for horizontal-ish lines (can we bias against?)
    // - twopi: very bad for our network topology purposes given that we do not
    //    really have a central/root node everything flows from.
    // - circo: very good (BEST), notes:
    //   - its bias towards creating circles/hexagons causes some oddness
    //      in places where we don't really benefit
    //   - it does a great job of breaking the establish and deliver subnets
    //      into clusters.
    //   - the circle bias does great things for label placement
    // - fdp: bad, at least without better settings.  It's like the neato
    //    graph melted to maximize ugliness.
    // - sfdp: pretty good
    //   - out-of-box is a little dense, especially in the server inter-link
    //      cluster.
    //   - less inclined to horizontal lines than neato
    //
    // Notable variations tried:
    // - neato:
    //   - mode=hier: bad
    //   - mode=ipsep: no appreciable change with sizes of 0.8
    //   - model=subset: no appreciable change
    //
    // fdp may end up being a better choice
    g.output(
      {
        type: 'dot',
        use: 'circo',
      },
      function(data) {
        dDot.resolve(data);
      },
      dDot.reject);
    //g.output({type: 'dot', use: 'neato'}, '/tmp/foo.dot');
    //g.output({type: 'png', use: 'neato'}, '/tmp/foo.png');

    when(dDot.promise, function(dotstr) {
      // console.log("DOTSTR", dotstr.toString());
      $graphviz.parse(dotstr, function callback(parsed) {
        // -- extract the layout
        var layoutData = {"BB": parsed.get("bb")};
        for (var iNode = 0; iNode < topo.nodes.length; iNode++) {
          var dNode = topo.nodes[iNode];
          layoutData[dNode.id] = parsed.getNode(dNode.id).get("pos");
        }
        //console.error("LAYOUT DATA:", layoutData);
        var retVal = {
          topoLayout: layoutData,
        };
        deferred.resolve(retVal);
      }, function(code, out, err) {
        console.error("PARSE PROBLEM", code, out, err);
        deferred.reject(err);
      });
    },
    function(err) {
      console.error('INITIAL DOT GENERATION PROBLEM', err);
      deferred.reject(err);
    });

    return deferred.promise;
  },

  onData: function(data) {
    var dstr = this.leftover ?
                 (this.leftover + data.toString("utf8")) :
                 data.toString("utf8");
    this.leftover = null;

    var othFailMatch = RE_OTHFAIL.exec(dstr);
    if (othFailMatch) {
      this.overview.failureIndicated = true;
      if (!othFailMatch[3])
        this.overview.unusualFailureIndicated = true;
    }

    var match;
    while (dstr) {
      if (this.inBlock) {
        match = RE_END.exec(dstr);
        if (match) {
          this._gobbleJsonFromLines(dstr.substring(0, match.index - 1));
          dstr = dstr.substring(match.index + match[0].length + 1);
          this.inBlock = false;
          continue;
        }
        else {
          var lastNewline = dstr.lastIndexOf("\n");
          if (lastNewline != -1) {
            this._gobbleJsonFromLines(dstr.substring(0, lastNewline));
            this.leftover = dstr.substring(lastNewline + 1);
          }
          else {
            this.leftover = dstr;
          }
          break;
        }
      }
      else {
        match = RE_START.exec(dstr);
        if (match) {
          // gobble up after the newline
          dstr = dstr.substring(match.index + match[0].length + 1);
          this.inBlock = true;
          continue;
        }
        else {
          // nothing interesting in here; but potentially keep some overlap
          var maybeLeftover = dstr.slice(-OVERLAP_PADDING);
          if (maybeLeftover.indexOf("#") != -1)
            this.leftover = maybeLeftover;
          break;
        }
      }
    }
  },

  onEnd: function(data) {
    this.fileAllRead = true;
    console.log("at end, total pending:", this.totalPending);
    if (this.totalPending === 0)
      this.allDone();
  },

  allDone: function() {
    // avoid double.
    this.totalPending = -1;
    console.log("truly done");
    this.callback(this.writeCells);
  },
};
exports.LoggestFrobber = Frobber;

exports.dummyTestRun = function(stream) {
  var frobber = new Frobber(stream, "s", "d", function(writeCells) {
    console.log("SUMMARY");
    console.log(writeCells.s);
    console.log("WRITE CELLS:");
    console.log(writeCells);
  });
};

}); // end define
