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
    "text!./ui-loggest.css"
  ],
  function(
    $wmsy,
    $_wlib_objdict, // unused, just a dependency.
    $_css
  ) {

var wy = new $wmsy.WmsyDomain({id: "ui-loggest", domain: "arbpl",
                               css: $_css});

wy.defineWidget({
  name: "loggest-test-perm",
  doc: "test case permutation results display",
  constraint: {
    type: "loggest-test-perm",
  },
  provideContext: {
    permutation: wy.SELF,
  },
  focus: wy.focus.container.vertical("steps"),
  structure: {
    whoBlock: {
      actorsBlock: {
        actorsLabel: "Actors:",
        actors: wy.vertList({type: "loggest-test-actor"}, "actors"),
      },
      thingsBlock: {
        thingsLabel: "Things:",
        things: wy.vertList({type: "loggest-test-thing"}, "things"),
      },
      loggersBlock: {
        loggersLabel: "Loggers:",
        loggers: wy.vertList({type: "loggest-test-logger"}, "loggers"),
      },
    },
    stepsLabel: "Steps:",
    stepsBlock: {
      steps: wy.vertList({type: "loggest-test-step"}, "steps"),
    },
  },
});

wy.defineWidget({
  name: "loggest-sem-stream-actor",
  doc: "ActorMeta in a resolved semanticIdent stream",
  constraint: {
    type: "loggest-sem-stream",
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
  name: "loggest-sem-stream-thing",
  doc: "ThingMeta in a resolved semanticIdent stream",
  constraint: {
    type: "loggest-sem-stream",
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
  name: "loggest-test-logger",
  doc: "LoggerMeta presentation",
  constraint: {
    type: "loggest-test-logger",
  },
  structure: wy.flow({
    loggerIdent: wy.bind(["raw", "loggerIdent"]),
    loggerSemDelim: ": ",
    semanticIdent: wy.bind(["raw", "semanticIdent"]),
  }),
});

wy.defineWidget({
  name: "loggest-test-actor",
  doc: "ActorMeta presentation",
  constraint: {
    type: "loggest-test-actor",
  },
  structure: wy.flow({
    actorIdent: wy.bind(["raw", "actorIdent"]),
    ws: " ",
    semanticIdent: wy.bind(["raw", "semanticIdent"]),
  }),
});

wy.defineWidget({
  name: "loggest-test-thing",
  doc: "ThingMeta presentation",
  constraint: {
    type: "loggest-test-thing",
  },
  structure: wy.flow({
    type: wy.bind(["raw", "type"]),
    ws: " ",
    name: wy.bind(["raw", "name"]),
  }),
});

wy.defineWidget({
  name: "loggest-test-step",
  doc: "TestCaseStepMeta presentation",
  constraint: {
    type: "loggest-test-step",
  },
  focus: wy.focus.item,
  structure: {
    headerRow: wy.block({
      twisty: {},
      resolvedIdent: wy.stream({type: "loggest-sem-stream"}, "resolvedIdent"),
    }, {result: "result"}),
    contentBlock: {
      logEntries: wy.vertList({type: "loggest-entry"}, wy.NONE),
      entryMatrix: wy.widget(
        {
          type: "loggest-case-entry-matrix",
          headerConstraint: { type: "loggest-test-logger" },
          entryConstraint: { type: "loggest-entry" },
        }, wy.NONE),
    }
  },
  impl: {
    postInitUpdate: function() {
      this.collapsed = this.obj.result === 'pass';
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
      command: function() {
        this.toggleCollapsed();
      },
    },
  },

});

wy.defineWidget({
  name: "loggest-case-entry-matrix-empty",
  constraint: {
    type: "loggest-case-entry-matrix",
    headerConstraint: wy.PARAM,
    entryConstraint: wy.PARAM,
    obj: null,
  },
  structure: {
  },
});

wy.defineWidget({
  name: "loggest-case-entry-matrix",
  constraint: {
    type: "loggest-case-entry-matrix",
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
          clsEntryRun = this._cssClassBaseName + "entryRun",
          clsEntryItem = this.__cssClassBaseName + "entryItem";

      // columnMetas is the list of the columns we are using in the order we are
      //  using them.  usingColumnMap maps matrix column number to the meta
      //  structure.
      var columnMetas = [], usingColumnMap = {};
      // the rows we care about, based on our step index.  Every step cares about
      //  its before and itself, the last step cares about its after too.
      var rows = [];
      rows.push(perm._perStepPerLoggerEntries[stepIndex*2]);
      rows.push(perm._perStepPerLoggerEntries[stepIndex*2 + 1]);
      if (isLastStep)
        rows.push(perm._perStepPerLoggerEntries[stepIndex*2 + 2]);

      // -- figure out the involved loggers from the step info
      var iLogger, logger, colMeta;
      for (iLogger = 0; iLogger < step.involvedLoggers.length; iLogger++) {
        logger = step.involvedLoggers[iLogger];
        colMeta = {
          logger: logger,
          idxColumn: perm.loggers.indexOf(logger),
          // involved == officially part of the step
          involved: true,
          layout: null,
        };
        columnMetas.push(colMeta);
        usingColumnMap[iLogger] = colMeta;
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
      var gapEms = 30, widthEms = 45, offEm = 0;
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

          if (curCol !== entry.column) {
            curDiv = doc.createElement("div");
            curDiv.setAttribute("class", clsEntryRun);
            curDiv.setAttribute("style",
                                "margin-left: " + colMeta.layout + "em; " +
                                "max-width: " + widthEms + "em;");
            rowNode.appendChild(curDiv);
            curCol = entry.column;
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


function stringifyArgs(args) {
  var s = "";
  for (var key in args) {
    if (s)
      s += ", ";
    s += key + ": " + args[key];
  }
  return s;
}

wy.defineWidget({
  name: "loggest-entry-state-change",
  constraint: {
    type: "loggest-entry",
    obj: {type: "state"},
  },
  structure: wy.flow({
    name: wy.bind("name"),
    arrow: " => ",
    value: wy.bind("value"),
  }),
});

wy.defineWidget({
  name: "loggest-entry-event",
  constraint: {
    type: "loggest-entry",
    obj: {type: "event"},
  },
  structure: wy.flow({
    name: wy.bind("name"),
    lParen: "! (",
    argsStr: "",
    rParen: ")",
  }),
  impl: {
    postInitUpdate: function() {
      this.argsStr_element.textContent = stringifyArgs(this.obj.args);
    }
  }
});

wy.defineWidget({
  name: "loggest-entry-async-job-begin",
  constraint: {
    type: "loggest-entry",
    obj: {type: "async-begin"},
  },
  structure: wy.flow({
    name: wy.bind("name"),
    lParen: "(",
    argsStr: "",
    rParenDots: ")...",
  }),
  impl: {
    postInitUpdate: function() {
      this.argsStr_element.textContent = stringifyArgs(this.obj.args);
    }
  }
});

wy.defineWidget({
  name: "loggest-entry-async-job-end",
  constraint: {
    type: "loggest-entry",
    obj: {type: "async-end"},
  },
  structure: wy.flow({
    dots: "...",
    name: wy.bind("name"),
    lParen: "(",
    argsStr: "",
    rParen: ")",
  }),
  impl: {
    postInitUpdate: function() {
      this.argsStr_element.textContent = stringifyArgs(this.obj.args);
    }
  }
});

wy.defineWidget({
  name: "loggest-entry-call",
  constraint: {
    type: "loggest-entry",
    obj: {type: "call", ex: null},
  },
  structure: wy.flow({
    name: wy.bind("name"),
    lParen: "(",
    argsStr: "",
    rParen: ")",
  }),
  impl: {
    postInitUpdate: function() {
      this.argsStr_element.textContent = stringifyArgs(this.obj.args);
    }
  }
});

wy.defineWidget({
  name: "loggest-entry-call-with-ex",
  constraint: {
    type: "loggest-entry",
    obj: {type: "call", ex: wy.WILD},
  },
  structure: {
    eventLine: wy.flow({
      name: wy.bind("name"),
      lParen: "(",
      argsStr: "",
      rParen: ") => ",
      exMessage: wy.bind(["ex", "message"]),
    }),
    exBlock: {
      stack: wy.bind(["ex", "stack"]),
    },
  },
  impl: {
    postInitUpdate: function() {
      this.argsStr_element.textContent = stringifyArgs(this.obj.args);
    }
  }
});


wy.defineWidget({
  name: "loggest-entry-error",
  constraint: {
    type: "loggest-entry",
    obj: {type: "error"},
  },
  structure: wy.flow({
    errLabel: "ERR! ",
    name: wy.bind("name"),
    colon: ": ",
    argsStr: "",
  }),
  impl: {
    postInitUpdate: function() {
      this.argsStr_element.textContent = stringifyArgs(this.obj.args);
    }
  }
});


}); // end define
