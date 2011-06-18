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
    "wmsy/wlib/objdict",
    "./chew-loggest",
    "text!./ui-loggest.css",
    "exports"
  ],
  function(
    $wmsy,
    $_wlib_objdict, // unused, just a dependency.
    $logmodel,
    $_css,
    exports
  ) {

// NOTE: we are not in the arbpl domain anymore!
var wy = exports.wy = new $wmsy.WmsyDomain({id: "ui-loggest", domain: "loggest",
                                            css: $_css});

wy.defineWidget({
  name: "file-failure",
  doc: "display the exception related to a test file failure",
  constraint: {
    type: "file-failure",
  },
  focus: wy.focus.item,
  structure: {
    exceptions: wy.vertList({type: "transformed-exception"}, "exceptions"),
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
      }
    }
  },
  structure: {
    whoBlock: {
      actorsBlock: {
        actorsLabel: "Actors:",
        actors: wy.vertList({type: "test-actor"}, "actors"),
      },
      thingsBlock: {
        thingsLabel: "Things:",
        things: wy.vertList({type: "test-thing"}, "things"),
      },
      loggersBlock: {
        loggersLabel: "Loggers:",
        loggers: wy.vertList({type: "test-logger"}, "loggers"),
      },
    },
    notableEntries: wy.vertList({type: "entry"}, "_notableEntries"),
    stepsLabel: "Steps:",
    stepsBlock: {
      steps: wy.vertList({type: "test-step"}, "steps"),
    },
  },
  impl: {
    /**
     * Rather than have every log atom be able to trigger a popup or require
     *  them to emit something on click, we just provide our own click handler
     *  that checks if the bindings want to have their data shown in a pop-up
     *  (which is generically parameterized anyways).
     */
    maybeShowDetailForBinding: function(binding) {
      if ("SHOW_DETAIL" in binding && binding.SHOW_DETAIL) {
        var detailAttr = binding.SHOW_DETAIL;
        var obj = binding.obj;
        // extremely simple traversal
        if (detailAttr !== true)
          obj = obj[detailAttr];
        this.popup_details(obj, binding);
      }
    },
  },
  events: {
    root: {
      click: function(binding) {
        this.maybeShowDetailForBinding(binding);
      }
    },
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
  structure: wy.flow({
    loggerIdent: wy.bind("loggerIdent"),
    loggerSemDelim: ": ",
    semanticIdent: wy.bind("semanticIdent"),
  }),
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
    semanticIdent: wy.bind(["raw", "semanticIdent"]),
  }),
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
    semanticIdent: wy.bind(["raw", "semanticIdent"]),
  }),
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
  structure: wy.flow({
    type: wy.bind(["raw", "type"]),
    ws: " ",
    name: wy.bind(["raw", "name"]),
  }),
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
    }, {result: "result"}),
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
            break;
          }
        }
      }

      // set it on all these directly because of webkit's selector deficiencies
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
    this._headerConstraint = aConstraint.headerConstraint;

    this._entryPartial = wy.domain.dtree.partialEvaluate(
                           aConstraint.entryConstraint);
    this._entryConstraint = aConstraint.entryConstraint;
  },
  impl: {
    postInit: function() {
      var step = this.obj, perm = this.__context.permutation,
          stepIndex = perm.steps.indexOf(step),
          isLastStep = stepIndex === (perm.steps.length - 1);

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
      var rows = [];
      rows.push(perm._perStepPerLoggerEntries[stepIndex*2]); // before
      rows.push(perm._perStepPerLoggerEntries[stepIndex*2 + 1]); // the step
      if (isLastStep)
        rows.push(perm._perStepPerLoggerEntries[stepIndex*2 + 2]); // after

      // -- figure out the involved loggers from the step info
      var iLogger, logger, colMeta;
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

      // -- figure out the uninvolved loggers from the cells of the rows
      var iRow, row, iCol, entries;
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

      // -- compute layout
      // Although we are currently using a linear allocation that does not
      //  actually require its own iteration pass, I'm expecting we may need
      //  something slightly better in the near future.
      var gapEms = 20, widthEms = 50, offEm = 0;
      for (iCol = 0; iCol < columnMetas.length; iCol++) {
        colMeta = columnMetas[iCol];

        colMeta.layout = offEm;
        offEm += gapEms;
      }

      var rowHolderNode = this.domNode, doc = rowHolderNode.ownerDocument;
      // -- generate the column header.
      var headerPartial = this._headerPartial,
          headerConstraint = this._headerConstraint;
      var headerDiv = doc.createElement("div");
      headerDiv.setAttribute("class", clsHeaderRow);
      rowHolderNode.appendChild(headerDiv);
      for (iCol = 0; iCol < columnMetas.length; iCol++) {
        colMeta = columnMetas[iCol];
        var nextColMeta = (iCol + 1 < columnMetas.length) ?
                            columnMetas[iCol + 1] : null;

        headerConstraint.obj = colMeta.logger;
        var headerCol = doc.createElement("div");
        headerCol.className = clsHeaderCol;
        headerDiv.appendChild(headerCol);

        var headerFab = headerPartial.evaluate(headerConstraint);
        var headerWidget = headerFab.bindOnto(headerConstraint, headerCol);

        if (nextColMeta) {
          headerCol.setAttribute(
            "style", "width: " + (nextColMeta.layout - colMeta.layout) + "em;");
        }
        else {
          headerCol.setAttribute(
            "style", "width: " + gapEms + "em;");
        }
      }


      // -- process the rows, generating DOM nodes
      var entryPartial = this._entryPartial,
          entryConstraint = this._entryConstraint;
      for (iRow = 0; iRow < rows.length; iRow++) {
        row = rows[iRow];
        var isDuringStepRow = (iRow === 1);

        var rowNode = doc.createElement("div");
        rowNode.setAttribute("class",
                             isDuringStepRow ? clsDuringRow : clsOutsideRow);


        var boxedEntries = this._timeOrderedEntriesForRow(row);
        var curCol = null, curDiv = null;
        for (var iEntry = 0; iEntry < boxedEntries.length; iEntry++) {
          var boxedEntry = boxedEntries[iEntry],
              entry = boxedEntries[iEntry].entry;
          colMeta = usingColumnMap[boxedEntry.column];

          if (curCol !== boxedEntry.column) {
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
  doc: "rich exception display as a clickable exception message w/popup",
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
  name: "obj-detail-wild",
  constraint: {
    type: "obj-detail",
    obj: { type: wy.WILD },
  },
  // XXX THIS IS VERY DUMB; WE SHOULD AUTO STUB.
  focus: wy.focus.item,
  structure: {
    table: wy.libWidget({
        type: "objdict",
        valueConstraint: {type: "obj-detail"},
      }, wy.SELF),
  },
});


function stringifyArgs(args) {
  var s = "";
  for (var key in args) {
    if (s)
      s += ", ";
    s += key + ": " + args[key];
  }
  return s;
}

function dotMilliTimeFormatter(t) {
  var wholish = Math.floor(t / 100).toString();
  var len = wholish.length;
  return wholish.substring(0, len - 1) + "." + wholish.substring(len - 1) +
    "ms ";
}

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
    rParenDots: ")...",
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
    rParen: ")",
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
    argsStr: "",
    rParen: ")",
  }, {layer: "layer"}),
  impl: {
    postInit: function() {
      this.argsStr_element.textContent = stringifyArgs(this.obj.args);
    }
  },
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
    message: wy.bind("message"),
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
