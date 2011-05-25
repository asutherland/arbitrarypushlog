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
        loggersLabel: "Involved Loggers:",
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
  structure: wy.block({
    headerRow: {
      twisty: {},
      resolvedIdent: wy.stream({type: "loggest-sem-stream"}, "resolvedIdent"),
    },
    logEntries: wy.vertList({type: "loggest-entry"}, wy.NONE),
  }, {result: "result"}),
  impl: {
    postInitUpdate: function() {
      this.collapsed = true;
      // set it on the twisty because of webkit's selector deficiencies
      this.twisty_element.setAttribute("collapsed", this.collapsed);
    },
    toggleCollapsed: function() {
      this.collapsed = !this.collapsed;
      if (this.collapsed)
        this.logEntries_set(null);
      else
        this.logEntries_set(this.obj.entries);
      this.twisty_element.setAttribute("collapsed", this.collapsed);
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
    // XXX I'm not sure this will work right against the wildcard...
    obj: {type: "call", ex: wy.NONE},
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
