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
 * Normalize loggest log records with schema to produce a format suitable for
 *  UI presentation.  Specifically, the JSON log format currently assumes you
 *  know the schema that went in to make good sense of what comes out.  We
 *  help out with that and also provide interleaving and slicing/dicing support.
 **/

define(
  [
    'exports'
  ],
  function(
    exports
  ) {

function StateChangeEntry(timestamp, relstamp, seq, name, value) {
  this.layer = null;
  this.timestamp = timestamp;
  this.relstamp = relstamp;
  this.seq = seq;
  this.name = name;
  this.value = value;
}
StateChangeEntry.prototype = {
  type: "state",
};
exports.StateChangeEntry = StateChangeEntry;

function EventEntry(timestamp, relstamp, seq, name, args, testOnlyArgs) {
  this.layer = null;
  this.timestamp = timestamp;
  this.relstamp = relstamp;
  this.seq = seq;
  this.name = name;
  this.args = args;
  this.testOnlyArgs = testOnlyArgs;
}
EventEntry.prototype = {
  type: "event",
};
exports.EventEntry = EventEntry;

function AsyncJobBeginEntry(timestamp, relstamp, seq, name, args, testOnlyArgs) {
  this.layer = null;
  this.timestamp = timestamp;
  this.relstamp = relstamp;
  this.seq = seq;
  this.name = name;
  this.args = args;
  this.testOnlyArgs = testOnlyArgs;
}
AsyncJobBeginEntry.prototype = {
  type: "async-begin",
};
exports.AsyncJobBeginEntry = AsyncJobBeginEntry;

function AsyncJobEndEntry(timestamp, relstamp, seq, name, args, testOnlyArgs) {
  this.layer = null;
  this.timestamp = timestamp;
  this.relstamp = relstamp;
  this.seq = seq;
  this.name = name;
  this.args = args;
  this.testOnlyArgs = testOnlyArgs;
  this.duration = 0;
}
AsyncJobEndEntry.prototype = {
  type: "async-end",
};
exports.AsyncJobEndEntry = AsyncJobEndEntry;

function CallEntry(startTimestamp, startRelstamp, startSeq,
                   endTimestamp, endSeq,
                   name, args, testOnlyArgs, ex) {
  this.layer = null;
  this.timestamp = startTimestamp;
  this.relstamp = startRelstamp;
  this.seq = startSeq;
  this.endTimestamp = endTimestamp;
  this.endSeq = endSeq;
  this.name = name;
  this.args = args;
  this.testOnlyArgs = testOnlyArgs;
  this.ex = ex;
}
CallEntry.prototype = {
  type: "call",
};
exports.CallEntry = CallEntry;

function ErrorEntry(timestamp, relstamp, seq, name, args) {
  this.layer = null;
  this.timestamp = timestamp;
  this.relstamp = relstamp;
  this.seq = seq;
  this.name = name;
  this.args = args;
}
ErrorEntry.prototype = {
  type: "error",
};
exports.ErrorEntry = ErrorEntry;

function FailedExpectationEntry(timestamp, relstamp, seq, expType, name, args) {
  this.layer = null;
  this.timestamp = timestamp;
  this.relstamp = relstamp;
  this.seq = seq;
  this.expType = expType;
  this.name = name;
  this.args = args;
}
FailedExpectationEntry.prototype = {
  type: "failed-expectation",
};
exports.FailedExpectationEntry = FailedExpectationEntry;

function MismatchedExpectationEntry(timestamp, relstamp, seq,
                                    expName, expArgs, actualEntry) {
  this.layer = null;
  this.timestamp = timestamp;
  this.relstamp = relstamp;
  this.seq = seq;
  this.expName = expName;
  this.expArgs = expArgs;
  this.actualEntry = actualEntry;
};
MismatchedExpectationEntry.prototype = {
  type: "mismatched-expectation",
};

function UnexpectedEntry(unexpEntry) {
  this.layer = null;
  this.timestamp = unexpEntry.timestamp;
  this.relstamp = unexpEntry.relstamp;
  this.seq = unexpEntry.seq;
  this.entry = unexpEntry;
}
UnexpectedEntry.prototype = {
  type: "unexpected"
};
exports.UnexpectedEntry = UnexpectedEntry;

function TestCaseLogBundle(fileName, raw) {
  this._raw = raw;

  this.fileName = fileName;
  this.testName = raw.semanticIdent;
  this.variant = raw.latched ? raw.latched.variant : null;

  /**
   * @listof[TestCasePermutationLogBundle]{
   *   The runs of all of the permutations of this test-case.
   * }
   */
  this.permutations = [];
}
TestCaseLogBundle.prototype = {
  // identify for the UI (type: build-test-failure, ui-page-testlog.js)
  type: "loggest",
};
exports.TestCaseLogBundle = TestCaseLogBundle;

/**
 * Holds the summary of what happened in the test run, the loggers active during
 *  the rest run, and the entries they logged during each step of the test.
 *  This conceptually ends up being like a matrix; the rows are the test
 *  steps, the columns are the (non-test) loggers, and the cells are what each
 *  logger log during that step.  (The test loggers' entries are fused into
 *  the row meta-data or they can be thought of as a special column.)
 */
function TestCasePermutationLogBundle(raw, prechewed) {
  this._raw = raw;
  this.prechewed = prechewed || {};

  // mount point for analyzers
  this.summaries = null;

  this._uniqueNameMap = {};
  /**
   * @dictof[
   *   @key[alias String]
   *   @value[thing ThingMeta]
   * ]{
   *   Maps unique id-esque things to the `ThingMeta` instances that provide
   *   meaningful human names for otherwise gibberish public keys, etc.
   * }
   */
  this._thingAliasMap = {};
  /**
   * @dictof[
   *   @key["normalized conn name" String]{
   *     A string consisting of the concatenated elements: [server id, "-",
   *     client id, "-", type, "-", unique-ing value].
   *   }
   *   @value[pairs @listof[@dict[
   *     @key[client LoggerMeta]
   *     @key[server LoggerMeta]
   *   ]]]{
   *     Since the unique-ing value may not be globally unique, we stick things
   *     in a list.  Each list entry is a pair of client and server `LoggerMeta`
   *     instances.
   *   }
   * ]
   */
  this._connectionNameMap = {};

  /**
   * @listof[ActorMeta]{
   *   The 'actors' defined in this test case/permutation.
   * }
   */
  this.actors = [];
  /**
   * @listof[ActorMeta]{
   *   The actors in `actors` that are not the children of other actors in
   *   `actors`.
   * }
   */
  this.rootActors = [];

  /**
   * @listof[ThingMeta]{
   *   The 'things' defined in this test case/permutation.
   * }
   */
  this.things = [];

  /**
   * @listof[TestCaseStepMeta]
   */
  this.steps = [];
  /**
   * @listof[LoggerMeta]
   */
  this.loggers = [];
  /**
   * @listof[LoggerMeta]{
   *   The loggers in `loggers` that are not children of other loggers in
   *   `loggers`.
   * }
   */
  this.rootLoggers = [];
  /**
   * @listof[
   *   @listof[
   *     @oneof[null @listof[TestEntry]]{
   *       If there are no entries for the logger that round, null, otherwise
   *       a list of the entries.
   *     }
   *   ]{
   *     Each item in the columns's list corresponds to the logging output of
   *     the logger in the matching position in the `loggers` list.
   *   }
   * ]{
   *   Each row corresponds to an explicit test case step or a
   *   before/between/after gap.  Odd indices are actual step time-spans,
   *   even indices are gaps.  Index 0 is before the first step has run,
   *   index 2 is after the first step has run but before the second step has
   *   run (which will be index 3).  In other words, step N is found at index
   *   (2*N + 1).
   * }
   */
  this._perStepPerLoggerEntries = [[]];

  /**
   * Any entries from the permutation's own logger that should be made known,
   *  namely an exception thrown in the setupFunc.
   */
  this._notableEntries = [];

  /**
   * Dicers appropriate to this permutation; populated in a post-pass by
   *  `dice-loggest.js`.
   */
  this.dicers = [];
}
exports.TestCasePermutationLogBundle = TestCasePermutationLogBundle;
TestCasePermutationLogBundle.prototype = {
  /**
   * Get the rows affiliated with a step.  Every step cares about its before and
   *  itself, the last step cares about its after too.
   */
  getRowsForStep: function(step) {
    var stepIndex = this.steps.indexOf(step),
        isLastStep = stepIndex === (this.steps.length - 1),
        rows = [];
    rows.push(this._perStepPerLoggerEntries[stepIndex*2]); // before
    rows.push(this._perStepPerLoggerEntries[stepIndex*2 + 1]); // the step
    if (isLastStep)
      rows.push(this._perStepPerLoggerEntries[stepIndex*2 + 2]); // after
    return rows;
  },

  /**
   * Get all of the entries that happened in a step flattened into a single
   *  list.
   */
  getAllEntriesForStep: function(step) {
    var rows = this.getRowsForStep(step), events = [];
    for (var iRow = 0; iRow < rows.length; iRow++) {
      var row = rows[iRow];
      for (var iCol = 0; iCol < row.length; iCol++) {
        var rowEvents = row[iCol];
        if (rowEvents)
          events = events.concat(rowEvents);
      }
    }

    return events;
  },

  stepHasErrors: function(step) {
    var rows = this.getRowsForStep(step);
    var iRow, row, iCol, entries, iEntry, entry;
    for (iRow = 0; iRow < rows.length; iRow++) {
      row = rows[iRow];
      for (iCol = 0; iCol < row.length; iCol++) {
        entries = row[iCol];
        if (!entries)
          continue;

        for (iEntry = 0; iEntry < entries.length; iEntry++) {
          entry = entries[iEntry];
          if ((entry instanceof ErrorEntry) ||
              ((entry instanceof CallEntry) && entry.ex))
            return true;
        }
      }
    }
    return false;
  },
};

function TestCaseStepMeta(resolvedIdent, raw, entries) {
  this.resolvedIdent = resolvedIdent;
  this._raw = raw;

  this.summaries = null;

  /** The step functions's entries; not the matrix entries. */
  this.entries = entries;

  // result may not be present...
  if (raw.latched && ("result" in raw.latched))
    this.result = raw.latched.result;
  else
    this.result = 'skip';
  // but boring should always be there; it is latched in the constructor
  this.boring = raw.latched.boring;
  if (raw.latched && ("group" in raw.latched))
    this.group = raw.latched.group;
  else
    this.group = null;

  /**
   * @listof[ActorMeta]{
   *   The set of loggers officially labeled to be part of this test step.
   * }
   */
  this.involvedActors = [];
}
exports.TestCaseStepMeta = TestCaseStepMeta;
TestCaseStepMeta.prototype = {
  /**
   * The duration of this step's execution in milliseconds.
   */
  get durationMS() {
    if (!this.entries || !this.entries.length)
      return 0;
    return this.entries[this.entries.length - 1].relstamp -
           this.entries[0].relstamp;
  },

  get relstamp() {
    if (!this.entries || !this.entries.length)
      return 0;
    return this.entries[0].relstamp;
  },
};


/**
 * Provides distilled information about a logger from its raw loggest JSON
 *  transport data, as well as access to the raw data.
 */
function LoggerMeta(raw, semanticIdent, entries, schemaNorm) {
  this.raw = raw;
  this.schemaNorm = schemaNorm;
  this.semanticIdent = semanticIdent;
  this.entries = entries;

  this.family = "";
  this.parent = null;
  /** If this is a connection type, the other side of the connection, if any. */
  this.otherSide = null;
  this.kids = [];

  /**
   * The actor, if any, that was associated with this logger.  This is
   * established by _processPermutation in a post-pass.
   */
  this.actor = null;

  this.things = [];

  this.topBilled = schemaNorm.hasTopBilling;
  /** subset hierarchy of kids that only lists top-billed ones. */
  this.topBilledKids = [];

  this._layerMapping = schemaNorm.layerMapping;
  if (this.entries)
    this._tagEntriesWithLayers();
}
LoggerMeta.prototype = {
  type: "logger",

  /**
   * Process our entries in order to assign layers to the entries.  This is
   *  performed as a post-processing pass because this is a stateful analysis
   *  and not all entries for a logger may be available at once, so we need
   *  to run the analysis someplace that can be stateful.  Also the bulk
   *  conversion logic would not benefit from extra complexity.
   */
  _tagEntriesWithLayers: function() {
    if (!this._layerMapping)
      return;
    var entries = this.entries, layerMapping = this._layerMapping;

    var layer = layerMapping.layer;
    // XXX we are hard-coded to state transitions, and just one, for now.
    var checkName = null, checkVal = null, become = null;
    if ("transitions" in layerMapping) {
      var transition = layerMapping.transitions[0];
      for (var key in transition.after) {
        checkName = key;
        checkVal = transition.after[key];
        break;
      }
      become = transition.become;
    }

    for (var iEntry = 0; iEntry < entries.length; iEntry++) {
      var entry = entries[iEntry];

      entry.layer = layer;
      if (checkName && entry.name === checkName && entry.value === checkVal) {
        layer = become;
        checkName = null;
      }
    }
  },

  brandFamily: function(name) {
    var i;
    this.family = name;
    for (i = 0; i < this.kids.length; i++) {
      this.kids[i].brandFamily(name);
    }
    for (i = 0; i < this.things.length; i++) {
      // things may have a hardcoded family
      if (!this.things[i].family)
        this.things[i].family = name;
    }
  },

  /**
   * Resolve our semantic ident and our childrens' too using the given alias
   *  map.
   */
  resolveSemanticIdentDeep: function(aliasMap) {
    var rawSemIdent = this.raw.semanticIdent;
    if (!Array.isArray(rawSemIdent))
      rawSemIdent = [rawSemIdent];

    var outIdent = [];
    for (var i = 0; i < rawSemIdent.length; i++) {
      var bit = rawSemIdent[i];
      if (aliasMap.hasOwnProperty(bit))
        outIdent.push(aliasMap[bit]);
      else
        outIdent.push(bit);
    }
    this.semanticIdent = outIdent;

    for (var iKid = 0; iKid < this.kids.length; iKid++) {
      this.kids[iKid].resolveSemanticIdentDeep(aliasMap);
    }
  },
};

var UNRESOLVED_THING_RAW = {};

/**
 * Info about a thing as declared by a unit-test.  This will either serve as a
 *  handle for look-ups to be handled by the `TestCasePermutationLogBundle` or
 *  will just have the pre-computed information on it.  Unsure.
 */
function ThingMeta(raw) {
  this.raw = raw;
  this.name = raw.name;
  this.family = raw.hasOwnProperty('family') ? raw.family : '';
  this.distinctAliases = [];
  if (raw.dname)
    this.distinctAliases.push(raw.dname);
}
ThingMeta.prototype = {
  type: "thing",
};

var UNRESOLVED_ACTOR_RAW = {};

const DIED_EVENTNAME = '(died)';
const DIED_SCHEMA = {};

/**
 * Info about an actor as declared by a unit-test.  This mainly serves as an
 *  alias to a logger that can be referenced on its own by the semantic
 *  identifiers of test cases.  (Currently the theory is that loggers should
 *  not be name-checked in semantic identifiers which is significant because
 *  loggers and actors using the same numeric space for their unique names.)
 *
 * Actors are resolved to loggers on demand by way of a reference to the unique
 *  name map established at creation time.
 */
function ActorMeta(raw, uniqueNameMap) {
  this.raw = raw;
  this.kids = [];
  this.family = "";
  this._uniqueNameMap = uniqueNameMap;
}
ActorMeta.prototype = {
  type: "actor",
  get logger() {
    if (!this.raw ||
        !this._uniqueNameMap.hasOwnProperty(this.raw.loggerUniqueName))
      return null;
    return this._uniqueNameMap[this.raw.loggerUniqueName];
  },
};

function untransformEx(rawEx) {
  if (rawEx == null)
    return null;
  return {type: 'exception', name: rawEx.n, message: rawEx.m, frames: rawEx.f};
}
exports.untransformEx = untransformEx;

/**
 * Feed it some schemas then feed it logs derived from those schemas and it will
 *  producer richer objects suitable for UI presentation via `ui-loggest.js`.
 *
 * The implementation has a weak understanding of the test logger schemas which
 *  is dependent on the test logger schemas being included in the set of
 *  provided schemas.
 */
function LoggestLogTransformer() {
  /**
   * @dictof[
   *   @key[schemaName String]
   *   @value[@dictof[
   *     @key[eventName String]
   *     @value[eventProcessor Function]
   *   ]]
   * ]{
   *   Map schema names to a map of event names to processing functions.
   * }
   */
  this._schemaHandlerMaps = {};
  /**
   * @dictof[
   *   @key[schemaName String]{
   *     The name of the schema, which usually corresponds to a single
   *      implementation class (but could be used by multiple classes.)
   *   }
   *   @value[@dict[
   *     @key[layerMapping LayerMapping]
   *     @key[hasTopBilling Boolean]
   * ]{
   *   Map schema names to layer labeling mappings. (ex: app, protocol, crypto)
   * }
   */
  this._schemaNormMap = {};

  /** An alias to the _uniqueNameMap on the permutation. */
  this._uniqueNameMap = null;
  /** An alias to the _connectionNameMap on the permutation. */
  this._connectionNameMap = null;

  this._layers = ["protocol", "app"];

  this._usingAliasMap = {};
}
exports.LoggestLogTransformer = LoggestLogTransformer;
LoggestLogTransformer.prototype = {
  _transformEx: untransformEx,
  /**
   * Helper function to perform any transformations on the wire-format object
   *  representations to rich local representations.  This is pretty ad-hoc
   *  right now and it can survive some growth, but eventually will need to
   *  get fancier.
   */
  _transformArgs: function(metaArgs, entry, startFrom) {
    if (startFrom === undefined)
      startFrom = 1;
    var iEntry = startFrom;
    var args = [];
    for (var key in metaArgs) {
      var def = metaArgs[key];
      args.push((iEntry > startFrom) ? ", " : "");
      args.push({ type: 'label', label: key });
      args.push(': ');
      var arg = entry[iEntry++];
      if (def === 'exception') {
        args.push(this._transformEx(arg));
      }
      else {
        if (arg == null) {
          args.push("null");
        }
        else if (typeof(arg) === 'object') {
          if (Array.isArray(arg) && arg.length === 0) {
            // 0 length arrays look stupid in popups
            args.push("[]");
          }
          else {
            // this used to only happen for 'jsonable'...
            args.push({type: 'full-obj', obj: arg});
          }
        }
        else if (typeof(arg) === 'string') {
          // - direct alias
          if (this._usingAliasMap.hasOwnProperty(arg)) {
            args.push(this._usingAliasMap[arg]);
          }
          // - check for compound alias
          // check if the string is long enough to have a crypto key in it
          //  and the first thing is a crypto key...
          else {
            outerloopy:
            while (arg.length >= 32) {
              // be willing to try offsetting by up to 4 bytes
              var maxSlip = Math.min(4, (arg.length % 32));
              // first thing is a crypto key
              for (var off=0; off <= maxSlip; off++) {
                var candAlias = arg.substring(off, off + 32);
                if (this._usingAliasMap.hasOwnProperty(candAlias)) {
                  if (off)
                    args.push(arg.substring(0, off));
                  args.push(this._usingAliasMap[candAlias]);
                  // (gobble obvious delimeter)
                  if ((arg.length - off) > 32 &&
                      arg[off + 32] === ":") {
                    args.push(":");
                    arg = arg.substring(off + 33);
                  }
                  else {
                    arg = arg.substring(off + 32);
                  }
                  continue outerloopy;
                }
              }
              break;
            }
            if (arg.length)
              args.push(arg);
          }
        }
        else {
          args.push("" + arg);
        }
      }
    }
    return args;
  },

  // [name, val, timestamp, seq]
  _proc_stateVar: function(ignoredMeta, entry) {
    return new StateChangeEntry(entry[2], entry[2] - this._baseTime,
                                entry[3], entry[0], entry[1]);
  },

  // [name, ...args..., timestamp, seq]
  _proc_event: function(metaArgs, numArgs, metaTestOnlyArgs, entry) {
    var args = this._transformArgs(metaArgs, entry), testOnlyArgs = null;
    if (entry.length > numArgs + 3)
      testOnlyArgs = this._transformArgs(metaTestOnlyArgs, entry,
                                         numArgs + 3);

    return new EventEntry(entry[numArgs+1], entry[numArgs+1] - this._baseTime,
                          entry[numArgs+2], entry[0], args, testOnlyArgs);
  },

  // [name_begin, ...args..., timestamp, seq]
  _proc_asyncJobBegin: function(metaArgs, numArgs, name, metaTestOnlyArgs,
                                entry) {
    var args = this._transformArgs(metaArgs, entry), testOnlyArgs = null;
    if (entry.length > numArgs + 3)
      testOnlyArgs = this._transformArgs(metaTestOnlyArgs, entry,
                                         numArgs + 3);
    return new AsyncJobBeginEntry(entry[numArgs+1],
                                  entry[numArgs+1] - this._baseTime,
                                  entry[numArgs+2],
                                  name, args, testOnlyArgs);
  },

  // [name_end, ...args..., timestamp, seq]
  _proc_asyncJobEnd: function(metaArgs, numArgs, name, metaTestOnlyArgs,
                              entry) {
    var args = this._transformArgs(metaArgs, entry), testOnlyArgs = null;
    if (entry.length > numArgs + 3)
      testOnlyArgs = this._transformArgs(metaTestOnlyArgs, entry,
                                         numArgs + 3);
    return new AsyncJobEndEntry(entry[numArgs+1],
                                entry[numArgs+1] - this._baseTime,
                                entry[numArgs+2], name, args, testOnlyArgs);
  },

  // [name, ...args..., startTimestamp, startSeq, endTimestamp, endSeq, ex]
  _proc_call: function(metaArgs, numArgs, metaTestOnlyArgs, entry) {
    var args = this._transformArgs(metaArgs, entry),
        ex = this._transformEx(entry[numArgs + 5]),
        testOnlyArgs = null;

    if (entry.length > numArgs + 6)
      testOnlyArgs = this._transformArgs(metaTestOnlyArgs, entry,
                                         numArgs + 6);

    return new CallEntry(entry[numArgs+1], entry[numArgs+1] - this._baseTime,
                         entry[numArgs+2],
                         entry[numArgs+3], entry[numArgs+4],
                         entry[0], args, testOnlyArgs, ex);
  },

  // [name, ...args.., timestamp, seq]
  _proc_error: function(metaArgs, numArgs, entry) {
    var args = this._transformArgs(metaArgs, entry);
    return new ErrorEntry(entry[numArgs+1], entry[numArgs+1] - this._baseTime,
                          entry[numArgs+2], entry[0], args);
  },

  // ["!failedxp", EXPOBJ, timestamp, seq]
  // where EXPOBJ is [name, ...args...]
  _proc_failedExpectation: function(schemaSoup, entry) {
    var exp = entry[1];
    var expName = exp[0];
    var schemaType, schema;
    if (expName !== DIED_EVENTNAME) {
      schemaType = schemaSoup[expName][0];
      schema = schemaSoup[expName][1];
    }
    else {
      schemaType = 'event';
      schema = DIED_SCHEMA;
    }

    var args = this._transformArgs(schema, exp, 1);
    return new FailedExpectationEntry(entry[2], entry[2] - this._baseTime,
                                      entry[3], schemaType,
                                      expName, args);
  },

  _proc_mismatchedExpectation: function(handlers, schemaSoup, aggr) {
    var exp = aggr[1], actual = aggr[2];

    var expName = exp[0];
    var schemaType = schemaSoup[expName][0];
    var schema = schemaSoup[expName][1];
    var args = this._transformArgs(schema, exp);

    var actualEntry = handlers[actual[0]](actual);

    return new MismatchedExpectationEntry(actualEntry.timestamp,
                                          actualEntry.relstamp,
                                          actualEntry.seq,
                                          expName, args, actualEntry);
  },

  // ["!unexpected", a normal entry]
  _proc_unexpectedEntry: function(handlers, entry) {
    var subEntry = entry[1];
    var subObj = handlers[subEntry[0]](subEntry);
    return new UnexpectedEntry(subObj);
  },

  /**
   * Tell us about the schemas used in one or more loggers before we process
   *  them.
   *
   * We use this to build a map from event name to the proper generic handler
   *  to use and the meta-data that describes the event to hand that handler.
   *  We use bind() to curry the meta-data so we can just put a function
   *  to call in the map...
   */
  processSchemas: function(schemas) {
    function countArgsInSchema(schemaArgs) {
      var numArgs = 0;
      for (var key in schemaArgs) {
        numArgs++;
      }
      return numArgs;
    }

    function makeConnNameNormalizer(semanticIdentDef) {
      var idxServer, idxClient, idxType, idxUnique;
      var i = 0;
      for (var key in semanticIdentDef) {
        switch (semanticIdentDef[key]) {
          case 'server':
            idxServer = i;
            break;
          case 'client':
            idxClient = i;
            break;
          case 'type':
            idxType = i;
            break;
          case 'unique':
            idxUnique = i;
            break;
        }
        i++;
      }
      return function(identBits) {
        if (identBits.length < i)
          return null;
        return identBits[idxServer] + '-' + identBits[idxClient] + '-' +
               identBits[idxType] + '-' + identBits[idxUnique];
      };
    };
    function makeConnCategorizer(semanticIdentDef) {
      var idxType, i = 0;
      for (var key in semanticIdentDef) {
        var val = semanticIdentDef[key];
        if (val === 'type')
          idxType = i;
        i++;
      }
      return function(identBits) {
        if (identBits.length <= idxType)
          return null;
        return identBits[idxType];
      };
    }

    for (var schemaName in schemas) {
      var key, schemaDef = schemas[schemaName];
      var handlers = this._schemaHandlerMaps[schemaName] = {};
      var schemaNorm = this._schemaNormMap[schemaName] = {};
      var schemaSoup = {}, testOnlyMeta;

      handlers["!failedexp"] = this._proc_failedExpectation.bind(this,
                                                                 schemaSoup);
      handlers["!mismatch"] = this._proc_mismatchedExpectation.bind(this,
                                                                    handlers,
                                                                    schemaSoup);
      handlers["!unexpected"] = this._proc_unexpectedEntry.bind(this,
                                                                handlers);

      schemaNorm.type = schemaDef.type;
      schemaNorm.subtype = schemaDef.subtype;
      // create a function to extract and normalize the connection name
      if (schemaNorm.type === 'connection' &&
          "semanticIdent" in schemaDef) {
        schemaNorm.normalizeConnName = makeConnNameNormalizer(
                                         schemaDef.semanticIdent);
        schemaNorm.normalizeConnType = makeConnCategorizer(
                                         schemaDef.semanticIdent);
      }
      else {
        schemaNorm.normalizeConnName = null;
        schemaNorm.normalizeConnType = null;
      }

      schemaNorm.hasTopBilling =
        ("topBilling" in schemaDef) ? schemaDef.topBilling : false;

      if ("stateVars" in schemaDef) {
        for (key in schemaDef.stateVars) {
          schemaSoup[key] = ['state', schemaDef.stateVars[key]];
          handlers[key] = this._proc_stateVar.bind(this,
                                                   schemaDef.stateVars[key]);
        }
      }
      if ("events" in schemaDef) {
        var testOnlyEventsSchema = null;
        if ("TEST_ONLY_events" in schemaDef)
          testOnlyEventsSchema = schemaDef.TEST_ONLY_events;
        for (key in schemaDef.events) {
          testOnlyMeta = null;
          if (testOnlyEventsSchema && testOnlyEventsSchema.hasOwnProperty(key))
            testOnlyMeta = testOnlyEventsSchema[key];

          schemaSoup[key] = ['event', schemaDef.events[key]];
          handlers[key] = this._proc_event.bind(this,
                            schemaDef.events[key],
                            countArgsInSchema(schemaDef.events[key]),
                            testOnlyMeta);
        }
      }
      if ("asyncJobs" in schemaDef) {
        var testOnlyAsyncJobsSchema = null;
        if ("TEST_ONLY_asyncJobs" in schemaDef)
          testOnlyAsyncJobsSchema = schemaDef.TEST_ONLY_asyncJobs;
        for (key in schemaDef.asyncJobs) {
          testOnlyMeta = null;
          if (testOnlyAsyncJobsSchema &&
              testOnlyAsyncJobsSchema.hasOwnProperty(key))
            testOnlyMeta = testOnlyAsyncJobsSchema[key];

          schemaSoup[key + '_begin'] = ['async job begin',
                                        schemaDef.asyncJobs[key]];
          handlers[key + '_begin'] = this._proc_asyncJobBegin.bind(
              this,
              schemaDef.asyncJobs[key],
              countArgsInSchema(schemaDef.asyncJobs[key]),
              key,
              testOnlyMeta);
          schemaSoup[key + '_end'] = ['async job end', schemaDef.asyncJobs[key]];
          handlers[key + '_end'] = this._proc_asyncJobEnd.bind(
              this,
              schemaDef.asyncJobs[key],
              countArgsInSchema(schemaDef.asyncJobs[key]),
              key,
              testOnlyMeta);
        }
      }
      if ("calls" in schemaDef) {
        var testOnlyCallsSchema = null;
        if ("TEST_ONLY_calls" in schemaDef)
          testOnlyCallsSchema = schemaDef.TEST_ONLY_calls;
        for (key in schemaDef.calls) {
          testOnlyMeta = null;
          schemaSoup[key] = ['call', schemaDef.calls[key]];
          if (testOnlyCallsSchema && testOnlyCallsSchema.hasOwnProperty(key))
            testOnlyMeta = testOnlyCallsSchema[key];
          handlers[key] = this._proc_call.bind(this,
                            schemaDef.calls[key],
                            countArgsInSchema(schemaDef.calls[key]),
                            testOnlyMeta);
        }
      }
      if ("errors" in schemaDef) {
        for (key in schemaDef.errors) {
          schemaSoup[key] = ['error', schemaDef.errors[key]];
          handlers[key] = this._proc_error.bind(this,
                            schemaDef.errors[key],
                            countArgsInSchema(schemaDef.errors[key]));
        }
      }
      if ("LAYER_MAPPING" in schemaDef)
        schemaNorm.layerMapping = schemaDef.LAYER_MAPPING;
      else
        schemaNorm.layerMapping = {layer: "app"};
    }
  },

  /**
   * Resolve the provided unique name in a semantic ident context to a
   *  `ActorMeta` or `ThingMeta` instance, speculatively instantiating new
   *  instances as needed.
   */
  _resolveUniqueNameInSemanticIdent: function(uniqueName) {
    var sname = uniqueName.toString();
    if (this._uniqueNameMap.hasOwnProperty(sname))
      return this._uniqueNameMap[sname];

    // - actor (loggers forbidden in this context)
    var obj;
    if (uniqueName > 0) {
      obj = new ActorMeta(UNRESOLVED_ACTOR_RAW, this._uniqueNameMap);
    }
    // - thing
    else {
      obj = new ThingMeta(UNRESOLVED_THING_RAW);
    }
    this._uniqueNameMap[sname] = obj;
    return obj;
  },

  /**
   * Resolve unique name references in semantic identifiers AND apply the
   *  whitespacing logic.  Note that the whitespacing logic is obviously
   *  pretty latin-character-set specific.  It probably makes sense to kick the
   *  whitespacing logic up into wmsy as some kind of delimiter hookup at some
   *  point.
   */
  _resolveSemanticIdent: function(semanticIdent) {
    if (typeof(semanticIdent) === "string")
      return semanticIdent;
    if (semanticIdent === null)
      return "null";
    if (semanticIdent.length === 1 && semanticIdent[0] === null)
      return "[null]";

    // We pose things in terms of our need of whitespace and commas because
    //  this is easy to think about, but in reality:
    // - needSpace === !lastThingWasAUniqueName && i !== 0
    // - maybeNeedComma === lastThingWasAUniqueName && i !== 0
    var resolved = [], needSpace = false, maybeNeedComma = false;
    for (var i = 0; i < semanticIdent.length; i++) {
      var bit = semanticIdent[i];
      if (typeof(bit) === "string") {
        maybeNeedComma = false;

        // -- If we need whitespace coming into the string...
        if (needSpace) {
          // - kill the need if the left-side of the string doesn't need space
          switch (bit[0]) {
            // no whitespace needed for the inside of groupy things
            case ")":
            case "}":
            case "]":
            // no whitespace needed for the left-side of delimiters
            case ":":
            case ";":
            case ",":
            // if it already has white-space...
            case " ":
              needSpace = false;
              break;
          }
          // - prepend the space if still needed
          if (needSpace)
            bit = " " + bit;
        }

        // -- Check if we need to set the whitespace flag going out.
        // Only need whitespace if something is coming after us.
        // (and it must be a named reference because we require it.)
        if (i + 1 < semanticIdent.length) {
          var lastChar = bit[bit.length - 1];
          switch (lastChar) {
            // no whitespace for the inside of groupy things
            case "(":
            case "{":
            case "[":
            // if it already has white-space...
            case " ":
              break;

            // and for everything else, we do want white-space.
            // (esp. for the right-side of delimiters: comma/colon/semi-colon)
            default:
              bit = bit + " ";
              break;
          }
        }
        needSpace = false;
        resolved.push(bit);
      }
      else if (bit == null) {
        resolved.push(maybeNeedComma ? ", NULL" : "NULL");
      }
      else {
        if (maybeNeedComma)
          resolved.push(", ");

        resolved.push(this._resolveUniqueNameInSemanticIdent(bit));

        maybeNeedComma = true;
        needSpace = true;
      }
    }
    return resolved;
  },

  /**
   * Instantiate a new actor if not already present in the unique name map, or
   *  update the existing entry if it is already there.
   */
  _makeActor: function(uniqueNameStr, raw) {
    var actor;
    if (this._uniqueNameMap.hasOwnProperty(uniqueNameStr)) {
      actor = this._uniqueNameMap[uniqueNameStr];
      actor.raw = raw;
      return actor;
    }

    actor = this._uniqueNameMap[uniqueNameStr] =
              new ActorMeta(raw, this._uniqueNameMap);
    return actor;
  },

  /**
   * Instantiate a new thing if not already present in the unique name map, or
   *  update the existing entry if it is already there.
   */
  _makeThing: function(uniqueNameStr, raw) {
    var thing;
    if (this._uniqueNameMap.hasOwnProperty(uniqueNameStr)) {
      thing = this._uniqueNameMap[uniqueNameStr];
      thing.raw = raw;
      return thing;
    }

    thing = this._uniqueNameMap[uniqueNameStr] = new ThingMeta(raw);
    for (var iAlias = 0; iAlias < thing.distinctAliases.length; iAlias++) {
      this._usingAliasMap[thing.distinctAliases[iAlias]] = thing;
    }
    return thing;
  },

  /**
   * Instantiate a `TestCaseStepMeta` for a test-case, resolving name references
   *  in the semantic ident to proper `LoggerMeta` or `ThingMeta` instances.
   */
  _makeStep: function(raw, entries) {
    var stepMeta = new TestCaseStepMeta(
      this._resolveSemanticIdent(raw.semanticIdent), raw, entries);

    // pull the actors out of the resolved ident if reasonable
    if (Array.isArray(stepMeta.resolvedIdent)) {
      for (var i = 0; i < stepMeta.resolvedIdent.length; i++) {
        var identBit = stepMeta.resolvedIdent[i];
        if (identBit instanceof ActorMeta)
          stepMeta.involvedActors.push(identBit);
      }
    }

    return stepMeta;
  },

  _processEntries: function(schemaName, rawEntries) {
    if (!rawEntries.length)
      return null;

    var handlers = this._schemaHandlerMaps[schemaName];
    var entries = [];
    for (var i = 0; i < rawEntries.length; i++) {
      var entry = rawEntries[i];
      entries.push(handlers[entry[0]](entry));
    }
    return entries;
  },

  /**
   * Create `LoggerMeta` instances for a (non-test-infra) logger and its kids.
   *  This is the first phase of full processing and is just concerned with
   *  object creation and naming.  We defer all name resolution (or anything
   *  that requires it) to the second phase so all names will be available.
   */
  _createNonTestLogger: function(rawLogger, allLoggers, rawPerm) {
    var schemaNorm = this._schemaNormMap[rawLogger.loggerIdent];
    if (!schemaNorm)
      throw new Error("No schema mapping for: '" + rawLogger.loggerIdent + "'");
    var loggerMeta = new LoggerMeta(
                       rawLogger,
                       /* semantic ident resolution deferred */ null,
                       /* entries deferred */ null,
                       schemaNorm);
    allLoggers.push(loggerMeta);
    this._uniqueNameMap[loggerMeta.raw.uniqueName] = loggerMeta;

    // -- connection naming
    if (schemaNorm.type === 'connection' && schemaNorm.normalizeConnName) {
      var normName = schemaNorm.normalizeConnName(rawLogger.semanticIdent),
          connPairs, iPair;
      if (normName) {
        if (this._connectionNameMap.hasOwnProperty(normName))
          connPairs = this._connectionNameMap[normName];
        else
          connPairs = this._connectionNameMap[normName] = [];
        // find the first entry that does not already have our type in it
        for (iPair = 0; iPair < connPairs.length; iPair++) {
          if (!connPairs[iPair][schemaNorm.subtype])
            break;
        }
        if (iPair >= connPairs.length)
          connPairs.push({client: null, server: null});
        connPairs[iPair][schemaNorm.subtype] = loggerMeta;
      }
    }

    // -- owned things
    if (rawLogger.named) {
      for (var strName in rawLogger.named) {
        var numName = parseInt(strName);
        if (numName > 0) {
          console.error("Non-test loggers should not own/name actors.",
                        rawLogger);
        }
        else {
          var thing = this._makeThing(strName, rawLogger.named[strName]);
          loggerMeta.things.push(thing);
          // (flatten out things)
          rawPerm.things.push(thing);
        }
      }
    }

    // -- kids!
    if (rawLogger.kids) {
      for (var iKid = 0; iKid < rawLogger.kids.length; iKid++) {
        var kidMeta = this._createNonTestLogger(rawLogger.kids[iKid],
                                                allLoggers, rawPerm);
        loggerMeta.kids.push(kidMeta);
        // nb: this does not allow for generation skipping, currently fine.
        if (kidMeta.topBilled && loggerMeta.topBilled)
          loggerMeta.topBilledKids.push(kidMeta);
      }
    }

    return loggerMeta;
  },

  /**
   * Process a logger and all its children, transforming entries into object
   *  representations, slicing the events for our logger/step matrix, and
   *  establishing any linkage relationships.
   */
  _processNonTestLogger: function(loggerMeta, rows, stepTimeSpans) {
    var rawLogger = loggerMeta.raw,
        schemaNorm = this._schemaNormMap[rawLogger.loggerIdent];
    var entries = loggerMeta.entries =
      this._processEntries(rawLogger.loggerIdent, rawLogger.entries);
    if (entries)
      loggerMeta._tagEntriesWithLayers();
    if (entries && rawLogger.died) {
      // This is okay because this is a fallback comparator, but it would be
      //  nice if we didn't need to fall back to this.
      var useSeq = 999999999;
      if (entries.length)
        useSeq = entries[entries.length - 1].seq;
      entries.push(
        new EventEntry(rawLogger.died, rawLogger.died - this._baseTime,
                       useSeq, "(died)", null, null));
    }

    loggerMeta.resolveSemanticIdentDeep(this._usingAliasMap);

    // -- connection linkages
    if (schemaNorm.type === 'connection' && schemaNorm.normalizeConnName) {
      var normName = schemaNorm.normalizeConnName(rawLogger.semanticIdent);
      if (normName) {
        var connPairs = this._connectionNameMap[normName];
        var otherType = (schemaNorm.subtype === 'client') ? 'server' : 'client';
        // find the first entry that does not already have our type in it
        for (var iPair = 0; iPair < connPairs.length; iPair++) {
          if (connPairs[iPair][schemaNorm.subtype] === loggerMeta) {
            loggerMeta.otherSide = connPairs[iPair][otherType];
            break;
          }
        }
      }
    }

    // -- matrix building
    var iRow;
    if (entries === null) {
      for (iRow = 0; iRow < rows.length; iRow++) {
        rows[iRow].push(null);
      }
    }
    else {
      var iSpan, iEntry = 0, markEntry;
      // keep in mind that a failed test may not have run all the way and so
      //  we may not have all the spans.
      for (iSpan = 0, iRow = 0; iSpan < stepTimeSpans.length; iSpan++) {
        var timeStart = stepTimeSpans[iSpan][0],
            seqStart = stepTimeSpans[iSpan][1];

        // - before step
        markEntry = iEntry;
        while (iEntry < entries.length &&
               (entries[iEntry].timestamp < timeStart ||
                (entries[iEntry].timestamp === timeStart &&
                 entries[iEntry].seq < seqStart))) {
          iEntry++;
        }
        if (iEntry > markEntry)
          rows[iRow++].push(entries.slice(markEntry, iEntry));
        else
          rows[iRow++].push(null);

        // - in step
        markEntry = iEntry;
        var timeEnd = stepTimeSpans[iSpan][2],
            seqEnd = stepTimeSpans[iSpan][3];
        // unbounded timeEnd means everything goes in there!
        if (timeEnd === null) {
          iEntry = entries.length;
        }
        else {
          while (iEntry < entries.length &&
                 (entries[iEntry].timestamp < timeEnd ||
                  (entries[iEntry].timestamp === timeEnd &&
                   entries[iEntry].seq <= seqEnd))) {
            iEntry++;
          }
        }
        if (iEntry > markEntry)
          rows[iRow++].push(entries.slice(markEntry, iEntry));
        else
          rows[iRow++].push(null);
      }
      // - leftovers
      // if we have any entries that did not fall inside a step, push them
      //  into their own row.
      if (iEntry < entries.length) {
        rows[iRow++].push(entries.slice(iEntry));
      }
      // - blanks
      // fill in any un-filled rows in this column with nulls.
      while (iRow < rows.length) {
        rows[iRow++].push(null);
      }
    }

    for (var iKid = 0; iKid < loggerMeta.kids.length; iKid++) {
      var kidMeta = loggerMeta.kids[iKid];
      this._processNonTestLogger(kidMeta, rows, stepTimeSpans);
    }
  },

  INTERESTING_PERMUTATION_ENTRIES: ["setupFunc", "actorConstructor"],
  /**
   * Process the permutation's logger for the test-cases and the testing
   *  loggers to build the super-friendly `TestCasePermutationLogBundle`
   *  representation.
   *
   * @return[TestCasePermutationLogBundle]
   */
  _processPermutation: function(rawPerm, permPrechewed) {
    // normalize missing kids (=== no steps) into an empty list
    if (!rawPerm.kids)
      rawPerm.kids = [];

    var perm = new TestCasePermutationLogBundle(rawPerm, permPrechewed);
    this._uniqueNameMap = perm._uniqueNameMap;
    this._usingAliasMap = perm._thingAliasMap;
    this._connectionNameMap = perm._connectionNameMap;
    this._baseTime = rawPerm.born;

    var rows = perm._perStepPerLoggerEntries, i;

    var nonTestLoggers = [], stepTimeSpans = [];

    // -- skim the permutation's own entries for a setupFunc failure
    if (rawPerm.entries) {
      var setupEntries = this._processEntries('testCasePermutation',
                                              rawPerm.entries);
      for (i = 0; i < setupEntries.length; i++) {
        // yup, failure; put it in the list of notable entries
        if (this.INTERESTING_PERMUTATION_ENTRIES.indexOf(setupEntries[i].name)
              !== -1 && setupEntries[i].ex) {
          perm._notableEntries.push(setupEntries[i]);
        }
      }
    }

    // -- process named things/actors
    // (Loggers share the same namespace (positive numbers) as actors but don't
    //  go in this dictionary because they live in the kids hierarchy tree.)
    for (var strName in rawPerm.named) {
      var numName = parseInt(strName);
      var rawNamed = rawPerm.named[strName];
      // - actor
      if (numName > 0)
        perm.actors.push(this._makeActor(strName, rawNamed));
      // - thing
      else
        perm.things.push(this._makeThing(strName, rawNamed));
    }

    // - hierarchical actor assembly
    for (var iActor = 0; iActor < perm.actors.length; iActor++) {
      var actor = perm.actors[iActor];
      if (actor.raw.parentUniqueName) {
        var parentActor = this._resolveUniqueNameInSemanticIdent(
                            actor.raw.parentUniqueName);
        parentActor.kids.push(actor);
        if (parentActor.raw === UNRESOLVED_ACTOR_RAW)
          console.warn("Unresolved parent for", actor,
                       "synthetic parent:", parentActor);
      }
      else {
        perm.rootActors.push(actor);
      }
    }

    // -- filter test step loggers, create their metas, find their time-spans
    for (var iKid = 0; iKid < rawPerm.kids.length; iKid++) {
      var rawKid = rawPerm.kids[iKid];
      if (rawKid.loggerIdent !== 'testStep') {
        nonTestLoggers.push(rawKid);
        continue;
      }

      var stepEntries = this._processEntries('testStep', rawKid.entries);
      var stepMeta = this._makeStep(rawKid, stepEntries);
      perm.steps.push(stepMeta);

      // every step adds 2 rows to the matrix (actual row, after-gap)
      rows.push([], []);

      // the case's time-range should be defined by its first-if-any entry being
      //  a 'run' job-begin and its last-although-possibly-missing entry being a
      // 'run' job-end.
      if (stepEntries === null) // zero-length is normalized to null!
        continue;

      if (!(stepEntries[0] instanceof AsyncJobBeginEntry) ||
          stepEntries[0].name !== 'run')
        throw new Error("Test step's first entry *must* be a run entry if " +
                        "it has any entries!");
      var timeStart = stepEntries[0].timestamp,
          seqStart = stepEntries[0].seq,
          timeEnd, seqEnd;
      var iLastEntry = stepEntries.length - 1;
      if ((stepEntries[iLastEntry] instanceof AsyncJobEndEntry) &&
          stepEntries[iLastEntry].name === 'run') {
        timeEnd = stepEntries[iLastEntry].timestamp;
        seqEnd = stepEntries[iLastEntry].seq;
      }
      else if ((stepEntries[iLastEntry] instanceof ErrorEntry) &&
               stepEntries[iLastEntry].name === 'timeout') {
        timeEnd = stepEntries[iLastEntry].timestamp;
        seqEnd = stepEntries[iLastEntry].seq;
      }
      else {
        timeEnd = null;
        seqEnd = null;
      }
      stepTimeSpans.push([timeStart, seqStart, timeEnd, seqEnd]);
    }

    // -- create filtered non-step loggers,
    var iLogger, loggerMeta;
    for (iLogger = 0; iLogger < nonTestLoggers.length; iLogger++) {
      loggerMeta = this._createNonTestLogger(nonTestLoggers[iLogger],
                                             perm.loggers, perm);
      // ('a').charCodeAt(0) === 97
      loggerMeta.brandFamily(String.fromCharCode(97 + iLogger));
      perm.rootLoggers.push(loggerMeta);
    }

    // -- resolve semantic idents, time-slice their entries
    // Previously we resolved logger semantic idents and transformed entries
    //  as we were creating them, but that was before things were named and
    //  thus stashed inside loggers.
    for (iLogger = 0; iLogger < perm.rootLoggers.length; iLogger++) {
      this._processNonTestLogger(perm.rootLoggers[iLogger],
                                 rows, stepTimeSpans);
    }

    // -- establish linkage from loggers to actors
    // Now that we know about all the loggers, use actors' ability to resolve
    // to their logger to establish back-links from the loggers.
    for (iActor = 0; iActor < perm.actors.length; iActor++) {
      actor = perm.actors[iActor];
      loggerMeta = actor.logger;
      if (loggerMeta)
        loggerMeta.actor = actor;
    }

    return perm;
  },

  /**
   * Process a test case's logger hierarchy to produce a
   *
   * @return[TestCaseLogBundle]
   */
  processTestCase: function(fileName, rawCase, prechewed) {
    if (rawCase.loggerIdent !== 'testCase')
      throw new Error("You gave us a '" + rawCase.loggerIdent +
                      "', not a 'testCase'!");

    // XXX process run_begin/run_end here perchance...

    var caseBundle = new TestCaseLogBundle(fileName, rawCase);
    if (!rawCase.kids)
      return caseBundle;
    for (var iPerm = 0; iPerm < rawCase.kids.length; iPerm++) {
      var rawPerm = rawCase.kids[iPerm];
      if (rawPerm.loggerIdent !== 'testCasePermutation')
        throw new Error("The 'testCase' you gave us has a '" +
                        rawPerm.loggerIdent + "' kid where a " +
                        "'testCasePermutation' should be!");

      var permPrechewed = null;
      if (prechewed && Array.isArray(prechewed))
        permPrechewed = prechewed[iPerm];

      caseBundle.permutations.push(this._processPermutation(rawPerm,
                                                            permPrechewed));
    }
    return caseBundle;
  }
};

exports.chewLoggestCase = function chewLoggestCase(logDetail) {
  var transformer = new LoggestLogTransformer();
  transformer.processSchemas(logDetail.schema);
  var caseBundle = transformer.processTestCase(logDetail.fileName,
                                               logDetail.log,
                                               logDetail.prechewed);
  return caseBundle;
};

}); // end define
