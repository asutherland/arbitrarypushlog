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
 * Presentations of loggest log entries as processed by `chew-loggest.js`.
 *
 * First step desired display behaviour is:
 * - Show test steps as collapsible nodes that summarize [pass/fail, time taken]
 *    and expand to show the specific activities that took place.
 * - In each test step's time interval, display each actor's actions in its own
 *    column (roughly), but with strict time-ordering (so no vertical overlap).
 *
 * Note that much of the legwork will be done upstream in `chew-loggest.js`.
 **/

define(
  [
    "wmsy/wmsy",
    'wmsy/wlib/hier',
    "wmsy/wlib/objdict",
    'jsdiff',
    "arbcommon/chew-loggest",
//    "./vis-loggest",
    "./ui-dice-loggest",
    "text!./ui-loggest.css",
    "exports"
  ],
  function(
    $wmsy,
    $_wlib_hier, // unused, just a dependency.
    $_wlib_objdict, // unused, just a dependency.
    $jsdiff,
    $logmodel,
//    $_vis_loggest, // unused, just a dep
    $_ui_dice_loggest, // unused, just a dep
    $_css,
    exports
  ) {

// NOTE: we are not in the arbpl domain anymore!
var wy = exports.wy = new $wmsy.WmsyDomain({id: "ui-loggest", domain: "loggest",
                                            css: $_css});

function dotMilliTimeFormatter(t) {
  var truncated = Math.floor(t / 100);
  var wholish = truncated.toString();
  // make sure to get a leading zero.
  if (truncated < 10)
    wholish = "0" + wholish;
  var len = wholish.length;
  return wholish.substring(0, len - 1) + "." + wholish.substring(len - 1) +
    "ms ";
}

wy.defineWidget({
  name: "file-failure",
  doc: "display the exception related to a test file failure",
  constraint: {
    type: "file-failure",
  },
  focus: wy.focus.item,
  structure: {
    moduleName: wy.bind("moduleName"),
    exceptions: wy.vertList({type: "transformed-exception"}, "exceptions"),
  }
});

var groupInterposer = wy.defineInterposingViewSlice({
  classifier: function groupClassifier(step) {
    return step.group;
  },
  maker: function groupMaker(pre, post) {
    return {
      name: post.group,
      relstamp: post.relstamp,
    };
  }
});

wy.defineWidget({
  name: "test-perm",
  doc: "test case permutation results display",
  constraint: {
    type: "test-perm",
  },
  provideContext: {
    permutation: wy.SELF,
  },
  focus: wy.focus.container.vertical("steps"),
  popups: {
    details: {
      constraint: {
        type: "popup-obj-detail"
      },
      clickAway: true,
      popupWidget: wy.libWidget({type: "popup"}),
      position: {
        above: "root",
      },
      size: {
        maxWidth: 0.9,
        maxHeight: 0.9,
      }
    },
    // A popup for display a (probably large) string containing newlines.
    newlineString: {
      constraint: {
        type: "popup-newline-string",
      },
      clickAway: true,
      popupWidget: wy.libWidget({ type: "popup" }),
      position: {
        centerOn: "root",
      },
      size: {
        maxWidth: 0.9,
        maxHeight: 0.9,
      }
    },
  },
  structure: {
    whoBlock: {
      // The top billed loggers was more interesting for deuxdrop; currently
      // disabling it, especially since it chews up screen real-estate.
      /*
      loggersBlock: {
        loggersLabel: "Top Billed Loggers:",
        loggers: wy.vertList({type: "hier-top-billed-logger"}, "rootLoggers"),
      },
      */
      // removed topology visualization for now
      /*
      visBlock: {
        visLabel: "Relationship Overview:",
        vis: wy.widget({type: "topo-summary"}, "rootLoggers"),
      },
      */
      summaryBlock: {
        summaryLabel: "Async Durations by Layer",
        asyncSummary: wy.widget({ type: "async-summary" }, wy.SELF),
      },
      /*
      diceBlock: {
        diceLabel: "Slice-n-Dice:",
        dicers: wy.widget({type: "dicer"}, "dicers"),
      },
      */
    },
    notableEntries: wy.vertList({type: "entry"}, "_notableEntries"),
    stepsLabel: "Steps:",
    stepsBlock: {
      steps: wy.vertList(
               groupInterposer({type: "test-step-group"},
                               {type: "test-step"}),
               "steps"),
    },
  },
  impl: {
    /**
     * Rather than have every log atom be able to trigger a popup or require
     *  them to emit something on click, we just provide our own click handler
     *  that checks if the bindings want to have their data shown in a pop-up
     *  (which is generically parameterized anyways).
     */
    maybeShowDetailForBinding: function(binding, event) {
      if ("SHOW_DETAIL" in binding && binding.SHOW_DETAIL) {
        var detailAttr = binding.SHOW_DETAIL;
        var obj = binding.obj;
        // extremely simple traversal
        if (detailAttr !== true)
          obj = obj[detailAttr];
        this.popup_details(obj, binding);
        return;
      }
      // Check if the click coordinate landed exactly on a span containing only
      // a textNode.
      var range = event.target.ownerDocument.caretRangeFromPoint(event.clientX,
                                                                 event.clientY);
      var elem = event.target.ownerDocument.elementFromPoint(event.clientX,
                                                             event.clientY);
      var bounder = range.startContainer;
      while (bounder.nodeType !== 1) {
        bounder = bounder.parentNode;
      }
      var bounds = bounder.getBoundingClientRect();
      var overlaps = event.clientX > bounds.left &&
                     event.clientX < bounds.right;

      if (overlaps &&
          range && range.startContainer &&
          range.startContainer.data.indexOf('\n') !== -1) {
        this.popup_newlineString(range.startContainer.data, binding);
      }
    },
  },
  events: {
    root: {
      click: function(binding, event) {
        this.maybeShowDetailForBinding(binding, event);
      }
    },
  },
});

wy.defineWidget({
  name: "async-summary",
  constraint: {
    type: "async-summary",
  },
  structure: {
    summaries: wy.vertList({ type: "async-summary-item" },
                           wy.dictAsKeyValueObjs(['summaries', 'asyncTasks'])),
  }
});

wy.defineWidget({
  name: "async-summary-item",
  constraint: {
    type: "async-summary-item",
  },
  structure: {
    layer: wy.bind('key'),
    timestamp: wy.bind('value', dotMilliTimeFormatter),
  },
});

wy.defineWidget({
  name: "test-step-group",
  constraint: {
    type: "test-step-group",
  },
  structure: {
    name: wy.bind("name"),
    lblAt: " @ ",
    timestamp: wy.bind("relstamp", dotMilliTimeFormatter),
  },
});

wy.defineWidget({
  name: "sem-stream-actor",
  doc: "ActorMeta in a resolved semanticIdent stream",
  constraint: {
    type: "sem-stream",
    obj: {
      type: "actor",
    }
  },
  structure: wy.flow({
    actorIdent: wy.bind(["raw", "actorIdent"]),
    ws: " ",
    semanticIdent: wy.bind(["raw", "semanticIdent"]),
  }),
});

wy.defineWidget({
  name: "sem-stream-thing",
  doc: "ThingMeta in a resolved semanticIdent stream",
  constraint: {
    type: "sem-stream",
    obj: {
      type: "thing",
    }
  },
  structure: wy.bind("name", {loggerfamily: "family"}),
});

wy.defineWidget({
  name: "sem-stream-logger",
  doc: "LoggerMeta in a semanticIdent-ish stream",
  constraint: {
    type: "sem-stream",
    obj: {
      type: "logger",
    },
  },
  structure: wy.flow({
    loggerIdent: wy.bind(["raw", "loggerIdent"]),
    loggerSemDelim: ": ",
    semanticIdent: wy.stream({type: "arg-stream"},
                             wy.normalizedWhitespaceStream("semanticIdent")),
  }),
});

wy.defineWidget({
  name: "hier-top-billed-logger",
  doc: "Hierarhical LoggerMeta presentation",
  constraint: {
    type: "hier-top-billed-logger",
  },
  structure: {
    tree: wy.libWidget({
      type: "hier",
      constraint: {type: "test-logger"},
      kidsAttr: "topBilledKids",
    }, wy.SELF),
  },
});

wy.defineWidget({
  name: "test-logger",
  doc: "LoggerMeta presentation",
  constraint: {
    type: "test-logger",
  },
  structure: wy.flow({
    loggerIdent: wy.bind(["raw", "loggerIdent"]),
    loggerSemDelim: ": ",
    semanticIdent: wy.stream({type: "arg-stream"},
                             wy.normalizedWhitespaceStream("semanticIdent")),
  }),
});

wy.defineWidget({
  name: "hier-actor",
  doc: "Hierarhical ActorMeta presentation",
  constraint: {
    type: "hier-actor",
  },
  structure: {
    tree: wy.libWidget({
      type: "hier",
      constraint: {type: "test-actor"},
      kidsAttr: "kids",
    }, wy.SELF),
  },
});

wy.defineWidget({
  name: "test-actor",
  doc: "ActorMeta presentation",
  constraint: {
    type: "test-actor",
  },
  structure: wy.flow({
    actorIdent: wy.bind(["raw", "actorIdent"]),
    ws: " ",
    semanticIdent: wy.bind(["raw", "semanticIdent"]),
  }),
});

wy.defineWidget({
  name: "test-thing",
  doc: "ThingMeta presentation",
  constraint: {
    type: "test-thing",
  },
  structure: {
    type: wy.bind(["raw", "type"]),
    ws: " ",
    name: wy.bind("name"),
  },
});

wy.defineWidget({
  name: "test-step",
  doc: "TestCaseStepMeta presentation",
  constraint: {
    type: "test-step",
  },
  focus: wy.focus.item,
  structure: {
    headerRow: wy.block({
      twisty: {},
      resolvedIdent: wy.stream({type: "sem-stream"}, "resolvedIdent"),
      duration: wy.bind("durationMS", dotMilliTimeFormatter),
    }, {result: "result", boring: "boring"}),
    contentBlock: {
      logEntries: wy.vertList({type: "entry-with-timestamp"}, wy.NONE),
      entryMatrix: wy.widget(
        {
          type: "case-entry-matrix",
          headerConstraint: { type: "sem-stream" },
          entryConstraint: { type: "entry-with-timestamp" },
        }, wy.NONE),
    }
  },
  impl: {
    postInitUpdate: function() {
      // be collapsed if we passed...
      this.collapsed = this.obj.result === 'pass';
      // ...unless there are errors in the step's logger.
      if (this.obj.entries) {
        for (var iEntry = 0; iEntry < this.obj.entries.length; iEntry++) {
          if (this.obj.entries[iEntry] instanceof $logmodel.ErrorEntry) {
            this.collapsed = false;
            this.domNode.setAttribute("haserrors", "true");
            break;
          }
        }
      }
      // ...or if the cells for this dude include an error/call with error
      if (this.__context.permutation.stepHasErrors(this.obj)) {
        this.collapsed = false;
        this.domNode.setAttribute("haserrors", "true");
      }

      // set it on all these directly because of webkit's selector deficiencies
      // XXX I believe the webkit bug has been fixed, so wen can probably stop
      //  doing this soon.
      this.domNode.setAttribute("collapsed", this.collapsed);
      this.twisty_element.setAttribute("collapsed", this.collapsed);
      this.headerRow_element.setAttribute("collapsed", this.collapsed);
      this.contentBlock_element.setAttribute("collapsed", this.collapsed);
      if (!this.collapsed) {
        this.logEntries_set(this.obj.entries);
        this.entryMatrix_set(this.obj);
      }
    },
    toggleCollapsed: function() {
      this.collapsed = !this.collapsed;
      if (this.collapsed) {
        this.logEntries_set(null);
        this.entryMatrix_set(null);
      }
      else {
        this.logEntries_set(this.obj.entries);
        this.entryMatrix_set(this.obj);
      }
      this.domNode.setAttribute("collapsed", this.collapsed);
      this.twisty_element.setAttribute("collapsed", this.collapsed);
      this.headerRow_element.setAttribute("collapsed", this.collapsed);
      this.contentBlock_element.setAttribute("collapsed", this.collapsed);
      this.FOCUS.bindingResized(this);
    },
  },
  events: {
    root: {
      enter_key: function() {
        this.toggleCollapsed();
      }
    },
    headerRow: {
      click: function() {
        this.toggleCollapsed();
      },
    },
  },

});

wy.defineWidget({
  name: "case-entry-matrix-empty",
  constraint: {
    type: "case-entry-matrix",
    headerConstraint: wy.PARAM,
    entryConstraint: wy.PARAM,
    obj: null,
  },
  structure: {
  },
});

wy.defineWidget({
  name: "case-entry-matrix",
  constraint: {
    type: "case-entry-matrix",
    headerConstraint: wy.PARAM,
    entryConstraint: wy.PARAM,
  },
  structure: {
  },
  protoConstructor: function(aConstraint, aGenesisDomNode) {
    // note that we are using our own domain for the evaluation, which differs
    //  from how a libWidget does it because it gets the domain passed in as
    //  a constraint!
    this._headerPartial = wy.domain.dtree.partialEvaluate(
                            aConstraint.headerConstraint);
    this._headerConstraint =
      JSON.parse(JSON.stringify(aConstraint.headerConstraint));

    this._entryPartial = wy.domain.dtree.partialEvaluate(
                           aConstraint.entryConstraint);
    this._entryConstraint =
      JSON.parse(JSON.stringify(aConstraint.entryConstraint));
  },
  impl: {
    postInit: function() {
      var step = this.obj, perm = this.__context.permutation;

      var clsHeaderRow = this.__cssClassBaseName + "headerRow",
          clsHeaderCol = this.__cssClassBaseName + "headerCol",
          clsDuringRow = this.__cssClassBaseName + "duringRow",
          clsOutsideRow = this.__cssClassBaseName + "outsideRow",
          clsDivider = this.__cssClassBaseName + "divider",
          clsEntryRun = this.__cssClassBaseName + "entryRun",
          clsEntryItem = this.__cssClassBaseName + "entryItem";

      // columnMetas is the list of the columns we are using in the order we are
      //  using them.  usingColumnMap maps matrix column number to the meta
      //  structure.
      var columnMetas = [], usingColumnMap = {};
      // the rows we care about, based on our step index.  Every step cares about
      //  its before and itself, the last step cares about its after too.
      var rows = perm.getRowsForStep(step);

      // -- figure out the involved loggers from the step info
      var iLogger, logger, colMeta;
      // XXX because of our use of helpers, we frequently end up including
      //  actors that aren't actually used in the step...
      /*
      for (var iActor = 0; iActor < step.involvedActors.length; iActor++) {
        var actor = step.involvedActors[iActor];
        logger = actor.logger;
        if (!logger)
          continue;
        colMeta = {
          logger: actor,
          idxColumn: perm.loggers.indexOf(logger),
          // involved == officially part of the step
          involved: true,
          layout: null,
        };
        columnMetas.push(colMeta);
        usingColumnMap[colMeta.idxColumn] = colMeta;
      }
      */

      // -- figure out the uninvolved loggers from the cells of the rows
      var iRow, row, iCol, entries, i;
      for (iRow = 0; iRow < rows.length; iRow++) {
        row = rows[iRow];
        for (iCol = 0; iCol < row.length; iCol++) {
          entries = row[iCol];
          if ((entries !== null) && (!(iCol in usingColumnMap))) {
            colMeta = {
              logger: perm.loggers[iCol],
              idxColumn: iCol,
              involved: false,
              layout: null,
            };
            columnMetas.push(colMeta);
            usingColumnMap[iCol] = colMeta;
          }
        }
      }

      /*
       * Layout Strategy (rev 2): Incremental column addition with resets on
       *  horizontal overflow.
       *
       * The Problem:
       *
       * It's possible to quickly end up with too many columns.  Forcing the
       *  test definition to slice things into additional steps to avoid this
       *  is neither appealing nor especially tractable.
       *
       * The Solution:
       *
       * At start/reset, add a div for column headers.  Then just process
       *  entries, adding (and positioning) columns as encountered.  When we
       *  need to place a column that there's no space for, we do a reset and
       *  restart the process.
       *
       * Fancier alternatives not taken:
       *
       * We could attempt to end up with some kind of clever clustering
       *  analysis and break things into separate displays.  This would be a
       *  risky solution because it could hide important time orderings.  This
       *  does seem beneficial as a filtering/faceting mechanism.  Namely, if
       *  we could just mark certain loggers as boring and take them out of
       *  the equation, that seems useful.
       */

      // layout knobs
      var gapEms = 16, widthEms = 50,
          maxCols = Math.floor((window.innerWidth - 250) / 200);

      // current column state
      var activeColAbsIndices = [], activeOffEms = 0;

      var rowHolderNode = this.domNode, doc = rowHolderNode.ownerDocument;
      var rowNode = null, headerDiv = null;
      function makeHeaderRow(container) {
        headerDiv = doc.createElement("div");
        headerDiv.setAttribute("class", clsHeaderRow);
        container.appendChild(headerDiv);
      }

      // --- header generation logic
      var headerPartial = this._headerPartial,
          headerConstraint = this._headerConstraint;
      function addHeaderNode(colMeta) {
        // Try and use the actor if we know it since it might have more
        // information associated.
        headerConstraint.obj = colMeta.logger.actor || colMeta.logger;
        var headerCol = doc.createElement("div");
        headerCol.className = clsHeaderCol;
        headerCol.setAttribute("loggerfamily", colMeta.logger.family);
        headerDiv.appendChild(headerCol); // need to append before bindOnto

        var headerFab = headerPartial.evaluate(headerConstraint);
        var headerWidget = headerFab.bindOnto(headerConstraint, headerCol);
        headerCol.setAttribute("style", "width: " + gapEms + "em;");
      }

      // --- process the rows, generating DOM nodes and headers
      makeHeaderRow(rowHolderNode);
      var entryPartial = this._entryPartial,
          entryConstraint = this._entryConstraint;
      for (iRow = 0; iRow < rows.length; iRow++) {
        row = rows[iRow];
        var isDuringStepRow = (iRow === 1);

        rowNode = doc.createElement("div");
        rowNode.setAttribute("class",
                             isDuringStepRow ? clsDuringRow : clsOutsideRow);

        var boxedEntries = this._timeOrderedEntriesForRow(row);
        var curCol = null, curDiv = null;
        // -- entry processing loop
        for (var iEntry = 0; iEntry < boxedEntries.length; iEntry++) {
          var boxedEntry = boxedEntries[iEntry],
              entry = boxedEntries[iEntry].entry;
          colMeta = usingColumnMap[boxedEntry.column];

          // -- column change?
          if (curCol !== boxedEntry.column) {
            var newCol = boxedEntry.column;
            // - handle it not yet being in the active set
            if (activeColAbsIndices.indexOf(newCol) === -1) {
              // - issue a reset if we are at our limit...
              if (activeColAbsIndices.length === maxCols) {
                curCol = null;
                // null out the layout offsets
                for (i = 0; i < activeColAbsIndices.length; i++) {
                  usingColumnMap[activeColAbsIndices[i]].layout = null;
                }
                // clear the list
                activeColAbsIndices.splice(0, activeColAbsIndices.length);
                // reset the layout state
                activeOffEms = 0;
                // create the new header row
                makeHeaderRow(rowNode);
              }

              // - add the column
              activeColAbsIndices.push(newCol);
              colMeta.layout = activeOffEms;
              activeOffEms += gapEms;

              addHeaderNode(colMeta);
            }

            // insert pretty divider
            if (curCol !== null) {
              var lastMeta = usingColumnMap[curCol];
              curDiv = doc.createElement("div");
              curDiv.setAttribute("class", clsDivider);
              var lefty, righty;
              if (colMeta.layout < lastMeta.layout) {
                lefty = colMeta.layout + 1;
                righty = lastMeta.layout + 1;
              }
              else {
                lefty = lastMeta.layout + gapEms - 1;
                righty = colMeta.layout + 1;
              }
              curDiv.setAttribute("style",
                "margin-left: " + lefty + "em; " +
                "width: " + (righty - lefty) + "em;");
              rowNode.appendChild(curDiv);
            }

            curDiv = doc.createElement("div");
            curDiv.setAttribute("class", clsEntryRun);
            curDiv.setAttribute("style",
                                "margin-left: " + colMeta.layout + "em; " +
                                "max-width: " + widthEms + "em;");
            rowNode.appendChild(curDiv);
            curCol = boxedEntry.column;
          }

          // -- generate the entry
          entryConstraint.obj = entry;
          var entryNode = doc.createElement("div");
          entryNode.className = clsEntryItem;
          curDiv.appendChild(entryNode);
          var entryFab = entryPartial.evaluate(entryConstraint);
          entryFab.bindOnto(entryConstraint, entryNode);
        }

        rowHolderNode.appendChild(rowNode);
      }
    },

    _sortBoxedEntries: function(a, b) {
      var ae = a.entry, be = b.entry;
      if (ae.timestamp === be.timestamp)
        return ae.seq - be.seq;
      return ae.timestamp - be.timestamp;
    },
    /**
     * Given a row of columns of loggest entries, return an array of the entries
     *  in time order wrapped in objects of the form {column: N, entry: E}.
     */
    _timeOrderedEntriesForRow: function(row) {
      var boxedEntries = [];

      for (var iCol = 0; iCol < row.length; iCol++) {
        var entries = row[iCol];
        if (entries === null)
          continue;
        for (var iEntry = 0; iEntry < entries.length; iEntry++) {
          boxedEntries.push({column: iCol, entry: entries[iEntry]});
        }
      }
      boxedEntries.sort(this._sortBoxedEntries);
      return boxedEntries;
    },
  },
});

wy.defineWidget({
  name: "popup-obj-detail",
  doc: "popup wrapper for our detail view; simplifies obj-detail bindings",
  constraint: {
    type: "popup-obj-detail",
  },
  focus: wy.focus.domain.vertical("detail"),
  structure: {
    detail: wy.widget({type: "obj-detail"}, wy.SELF),
  },
});

wy.defineWidget({
  name: "popup-newline-string",
  doc: "popup display a multi-line string",
  constraint: {
    type: "popup-newline-string",
  },
  focus: wy.focus.domain.vertical("str"),
  structure: {
    str: wy.bind(wy.SELF),
  },
});

wy.defineWidget({
  name: "arg-stream-label",
  doc: "rich exception display as a clickable exception message w/popup",
  constraint: {
    type: "arg-stream",
    obj: { type: "label" },
  },
  structure: wy.bind("label"),
});


wy.defineWidget({
  name: "arg-stream-ex",
  doc: "rich exception display as a clickable exception message w/popup",
  constraint: {
    type: "arg-stream",
    obj: { type: "exception" },
  },
  structure: wy.bind("message"),
  impl: {
    SHOW_DETAIL: true,
  },
});

wy.defineWidget({
  name: "obj-detail-ex",
  constraint: {
    type: "obj-detail",
    obj: { type: "exception" },
  },
  // XXX THIS IS VERY DUMB; WE SHOULD AUTO STUB.
  focus: wy.focus.item,
  structure: {
    ex: wy.widget({type: "transformed-exception"}, wy.SELF),
  },
});


wy.defineWidget({
  name: "arg-stream-full-obj",
  doc: "rich object display as a clickable 'obj' string w/popup",
  constraint: {
    type: "arg-stream",
    obj: { type: "full-obj" },
  },
  structure: "obj",
  impl: {
    SHOW_DETAIL: "obj",
  },
});

wy.defineWidget({
  name: "explicit-stack",
  doc: "show the string 'stack' and trigger the SHOW_DETAIL popup mechanism",
  constraint: {
    type: "explicit-stack"
  },
  structure: "stack",
  impl: {
    SHOW_DETAIL: true
  }
})

/**
 * Resolve aliases; also, augment things that we think are dates.
 */
function aliasTransformer(val, owningKey) {
  if (owningKey && owningKey === 'date' && typeof(val) === 'number') {
    return val + ' (' + new Date(val) + ')';
  }
  if (typeof(val) !== "string")
    return undefined;
  var context = this.__context;
  var aliasMap = context.permutation._thingAliasMap;
  // for now, just to a straight-up alias transform.
  if (aliasMap.hasOwnProperty(val)) {
    return {
      type: "alias-mapped",
      items: [aliasMap[val]],
    };
  }
  return undefined;
}
aliasTransformer.toString = function() {
  return "[aliasTransformer]";
};

wy.defineWidget({
  name: "obj-detail-wild",
  constraint: {
    type: "obj-detail",
    obj: { type: wy.WILD },
  },
  // XXX THIS IS VERY DUMB; we should auto-stub the popup focus instead
  focus: wy.focus.item,
  structure: {
    table: wy.libWidget({
        type: "objdict",
        labelConstraint: {type: "obj-detail"},
        labelTransformer: aliasTransformer,
        valueConstraint: {type: "obj-detail"},
        // we want string values alias-transformed
        valueTransformer: aliasTransformer,
      }, wy.SELF),
  },
});

wy.defineWidget({
  name: "obj-detail-arg-stream",
  constraint: {
    type: "obj-detail",
    obj: { type: "alias-mapped" },
  },
  structure: wy.stream({type: "arg-stream"}, "items"),
});

wy.defineWidget({
  name: "arg-stream-thing",
  doc: "a ThingMeta in a stream",
  constraint: {
    type: "arg-stream",
    obj: { type: "thing" },
  },
  structure: wy.bind("name", {loggerfamily: "family"}),
});


wy.defineWidget({
  name: "entry-with-timestamp",
  constraint: {
    type: "entry-with-timestamp",
  },
  structure: {
    timestamp: wy.bind("relstamp", dotMilliTimeFormatter),
    entry: wy.widget({type: "entry"}, wy.SELF),
  }
});

wy.defineWidget({
  name: "entry-state-change",
  constraint: {
    type: "entry",
    obj: {type: "state"},
  },
  structure: wy.flow({
    name: wy.bind("name"),
    arrow: " => ",
    value: wy.bind("value"),
  }, {layer: "layer"}),
});

wy.defineWidget({
  name: "entry-event",
  constraint: {
    type: "entry",
    obj: {type: "event"},
  },
  structure: wy.flow({
    name: wy.bind("name"),
    lParen: "! (",
    args: wy.stream({type: "arg-stream"}, "args"),
    rParen: ") ",
    testOnlyArgs: wy.stream({type: "arg-stream"}, "testOnlyArgs"),
  }, {layer: "layer"}),
});

wy.defineWidget({
  name: "entry-async-job-begin",
  constraint: {
    type: "entry",
    obj: {type: "async-begin"},
  },
  structure: wy.flow({
    name: wy.bind("name"),
    lParen: "(",
    args: wy.stream({type: "arg-stream"}, "args"),
    rParenDots: ")... ",
    testOnlyArgs: wy.stream({type: "arg-stream"}, "testOnlyArgs"),
  }, {layer: "layer"}),
});

wy.defineWidget({
  name: "entry-async-job-end",
  constraint: {
    type: "entry",
    obj: {type: "async-end"},
  },
  structure: wy.flow({
    dots: "...",
    name: wy.bind("name"),
    lParen: "(",
    args: wy.stream({type: "arg-stream"}, "args"),
    rParen: ") ",
    testOnlyArgs: wy.stream({type: "arg-stream"}, "testOnlyArgs"),
    duration: wy.bind("duration", dotMilliTimeFormatter),
  }, {layer: "layer"}),
});

wy.defineWidget({
  name: "entry-call",
  constraint: {
    type: "entry",
    obj: {type: "call", ex: null},
  },
  structure: wy.flow({
    name: wy.bind("name"),
    lParen: "(",
    args: wy.stream({type: "arg-stream"}, "args"),
    rParen: ") ",
    testOnlyArgs: wy.stream({type: "arg-stream"}, "testOnlyArgs"),
  }, {layer: "layer"}),
});

wy.defineWidget({
  name: "entry-call-with-ex",
  constraint: {
    type: "entry",
    obj: {type: "call", ex: wy.WILD},
  },
  structure: wy.block({
    eventLine: wy.flow({
      name: wy.bind("name"),
      lParen: "(",
      args: wy.stream({type: "arg-stream"}, "args"),
      rParen: ") ",
      testOnlyArgs: wy.stream({type: "arg-stream"}, "testOnlyArgs"),
      arrow: " => ",
      exMessage: wy.bind(["ex", "message"]),
    }),
    exBlock: {
      stack: wy.widget({type: "transformed-exception"}, "ex"),
    },
  }, {layer: "layer"}),
});


wy.defineWidget({
  name: "entry-error",
  constraint: {
    type: "entry",
    obj: {type: "error"},
  },
  structure: wy.flow({
    errLabel: "ERR! ",
    name: wy.bind("name"),
    colon: ": ",
    args: wy.stream({type: "arg-stream"}, "args"),
  }, {layer: "layer"}),
});

wy.defineWidget({
  name: "entry-failed-expectation",
  constraint: {
    type: "entry",
    obj: {type: "failed-expectation"},
  },
  structure: wy.flow({
    errLabel: "failed expectation: ",
    expType: wy.bind("expType"),
    colon: ": ",
    name: wy.bind("name"),
    lParen: "(",
    args: wy.stream({type: "arg-stream"}, "args"),
    rParen: ") ",
    stack: wy.widget({type: "explicit-stack"}, "stack")
  }, {layer: "layer"}),
});

wy.defineWidget({
  name: "entry-mismatched-expectation",
  constraint: {
    type: "entry",
    obj: {type: "mismatched-expectation"},
  },
  structure: wy.flow({
    errLabel: "mismatched expectation:",
    expLine: wy.flow({
      expName: wy.bind("expName"),
      lParen: "! (",
      args: wy.stream({type: "arg-stream"}, "expArgs"),
      rParen: ") ",
      // we do save off the stack but I'm not sure how to put that in the UI yet
      versus: "expected but got",
    }),
    actualEntry: wy.widget({type: "entry"}, "actualEntry"),
    diffLabel: "Diff:",
    diffBlock: {}
  }, {layer: "layer"}),
  impl: {
    postInit: function() {
      // The arguments are currently (potentially) stringified forms; we don't
      // really need to do rich diffs at this point, so just pair-wise
      // diff's of strings (and ignoring objects) should be sufficient.
      var insertNode = this.diffBlock_element;
      var expectedArgs = this.obj.expArgs,
          actualArgs = this.obj.actualEntry.args;
      for (var i = 0; i < expectedArgs.length; i++) {
        if (typeof(expectedArgs[i]) !== 'string' ||
            typeof(actualArgs[i]) !== 'string')
          continue;
        this._diffAndMakeNodes(expectedArgs[i], actualArgs[i], insertNode);
      }
    },
    _diffAndMakeNodes: function(a, b, node) {
      var colorizedSpanClass = this.__cssClassBaseName + "diffLine";

      var changes = $jsdiff.diffChars(a, b);
      for (var i=0; i < changes.length; i++) {
        var change = changes[i];
        var span = document.createElement('span');
        var text = change.value;
        if (change.added || change.removed) {
          span.setAttribute('class', colorizedSpanClass);
          if (change.added)
            span.setAttribute('added', '');
          else if (change.removed)
            span.setAttribute('removed', '');
          // spaces are handled by using white-space: pre-wrap
          text = text.replace(/\n/g, '\\n');
        }
        span.textContent = text;
        node.appendChild(span);
      }
    },
  }
});



wy.defineWidget({
  name: "entry-unexpected",
  constraint: {
    type: "entry",
    obj: {type: "unexpected"},
  },
  structure: wy.flow({
    errLabel: "unexpected event: ",
    subEntry: wy.widget({type: "entry"}, "entry"),
  }, {layer: "layer"}),
});


wy.defineWidget({
  name: "transformed-exception",
  doc: "A single exception, transformed by extranform.js.",
  constraint: {
    type: "transformed-exception",
  },
  structure: {
    descBlock: wy.flow({
      name: wy.bind("name"),
      nameDelim: ": ",
      message: wy.bind("message"),
    }),
    frames: wy.vertList({type: "stack-frame"}, "frames"),
  },
});

wy.defineWidget({
  name: "stack-frame",
  doc: "A stack frame from an exception",
  constraint: {
    type: "stack-frame",
  },
  structure: {
    filename: wy.bind("filename"),
    lineNo: wy.bind("lineNo"),
    funcName: wy.bind("funcName"),
  },
});


}); // end define
