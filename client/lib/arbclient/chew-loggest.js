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

function StateChangeEntry(timestamp, seq, name, value) {
  this.timestamp = timestamp;
  this.seq = seq;
  this.name = name;
  this.value = value;
}
StateChangeEntry.prototype = {
  type: "state",
};

function EventEntry(timestamp, seq, name, args) {
  this.timestamp = timestamp;
  this.seq = seq;
  this.name = name;
  this.args = args;
}
EventEntry.prototype = {
  type: "event",
};

function AsyncJobBeginEntry(timestamp, seq, name, args) {
  this.timestamp = timestamp;
  this.seq = seq;
  this.name = name;
  this.args = args;
}
AsyncJobBeginEntry.prototype = {
  type: "async-begin",
};

function AsyncJobEndEntry(timestamp, seq, name, args) {
  this.timestamp = timestamp;
  this.seq = seq;
  this.name = name;
  this.args = args;
}
AsyncJobEndEntry.prototype = {
  type: "async-end",
};

function CallEntry(startTimestamp, startSeq, endTimestamp, endSeq,
                   name, args, ex) {
  this.timestamp = startTimestamp;
  this.seq = startSeq;
  this.endTimestamp = endTimestamp;
  this.endSeq = endSeq;
  this.name = name;
  this.args = args;
  this.ex = ex;
}
CallEntry.prototype = {
  type: "call",
};

function ErrorEntry(timestamp, seq, name, args) {
  this.timestamp = timestamp;
  this.seq = seq;
  this.name = name;
  this.args = args;
}
ErrorEntry.prototype = {
  type: "error",
};

function TestCaseLogBundle(fileName, raw) {
  this._raw = raw;

  this.fileName = fileName;
  this.testName = raw.semanticIdent;

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

/**
 * Holds the summary of what happened in the test run, the loggers active during
 *  the rest run, and the entries they logged during each step of the test.
 *  This conceptually ends up being like a matrix; the rows are the test
 *  steps, the columns are the (non-test) loggers, and the cells are what each
 *  logger log during that step.  (The test loggers' entries are fused into
 *  the row meta-data or they can be thought of as a special column.)
 */
function TestCasePermutationLogBundle(raw) {
  this._raw = raw;

  this._uniqueNameMap = {};

  /**
   * @listof[ActorMeta]{
   *   The 'actors' defined in this test case/permutation.
   * }
   */
  this.actors = [];

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
}
TestCasePermutationLogBundle.prototype = {
};

function TestCaseStepMeta(resolvedIdent, raw, entries) {
  this.resolvedIdent = resolvedIdent;
  this._raw = raw;
  this.entries = entries;

  if (raw.latched && ("result" in raw.latched))
    this.result = raw.latched.result;
  else
    this.result = 'skip';

  /**
   * @listof[LoggerMeta]{
   *   The set of loggers officially labeled to be part of this test step.
   * }
   */
  this.involvedLoggers = [];
}
TestCaseStepMeta.prototype = {
  /**
   * @listof[@oneof[null @listof[TestEntry]]]{
   *   For each decreed involved logger in `involvedLoggers`, provide the
   *   entries cell for this step.
   * }
   */
  get entriesForInvolvedLoggers() {
  },

  /**
   * @listof[LoggerMeta]{
   *   The loggers known to the test-case but not decreed involved in this step.
   * }
   */
  get uninvolvedLoggers() {
  },

  /**
   * @listof[@oneof[null @listof[TestEntry]]]{
   *   For each logger in `uninvolvedLoggers`, provide the entries cell for this
   *   step.
   * }
   */
  get entriesForUninvolvedLoggers() {
  },
};


/**
 * Provides distilled information about a logger from its raw loggest JSON
 *  transport data, as well as access to the raw data.
 */
function LoggerMeta(raw, entries) {
  this.raw = raw;
  this.entries = entries;
}
LoggerMeta.prototype = {
  type: "logger",
};

var UNRESOLVED_THING_RAW = {};

/**
 * Info about a thing as declared by a unit-test.  This will either serve as a
 *  handle for look-ups to be handled by the `TestCasePermutationLogBundle` or
 *  will just have the pre-computed information on it.  Unsure.
 */
function ThingMeta(raw) {
  this.raw = raw;
}
ThingMeta.prototype = {
  type: "thing",
};

var UNRESOLVED_ACTOR_RAW = {};

/**
 * Info about an actor as declared by a unit-test.  This mainly serves as an
 *  alias to a logger that can be referenced on its own by the semantic
 *  identifiers of test cases.  (Currently the theory is that loggers should
 *  not be name-checked in semantic identifiers which is significant because
 *  loggers and actors using the same numeric space for their unique names.)
 */
function ActorMeta(raw) {
  this.raw = raw;
}
ActorMeta.prototype = {
  type: "actor",
};


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
   * ]
   */
  this._schemaHandlerMaps = {};

  /** An alias to the _uniqueNameMap on the permutation. */
  this._uniqueNameMap = null;
}
LoggestLogTransformer.prototype = {
  _proc_stateVar: function(ignoredMeta, entry) {
    return new StateChangeEntry(entry[2], entry[3], entry[0], entry[1]);
  },

  _proc_event: function(metaArgs, entry) {
    var numArgs = 0, args = {};
    for (var key in metaArgs) {
      args[key] = entry[++numArgs];
    }
    return new EventEntry(entry[numArgs+1], entry[numArgs+2], entry[0], args);
  },

  _proc_asyncJobBegin: function(metaArgs, name, entry) {
    var numArgs = 0, args = {};
    for (var key in metaArgs) {
      args[key] = entry[++numArgs];
    }
    return new AsyncJobBeginEntry(entry[numArgs+1], entry[numArgs+2],
                                  name, args);
  },

  _proc_asyncJobEnd: function(metaArgs, name, entry) {
    var numArgs = 0, args = {};
    for (var key in metaArgs) {
      args[key] = entry[++numArgs];
    }
    return new AsyncJobEndEntry(entry[numArgs+1], entry[numArgs+2], name, args);
  },

  _proc_call: function(metaArgs, entry) {
    var numArgs = 0, args = {}, ex = null;
    for (var key in metaArgs) {
      args[key] = entry[++numArgs];
    }
    if (entry.length > numArgs + 5)
      ex = entry[numArgs + 5];
    return new CallEntry(entry[numArgs+1], entry[numArgs+2],
                         entry[numArgs+3], entry[numArgs+4],
                         entry[0], args, ex);
  },

  _proc_error: function(metaArgs, entry) {
    var numArgs = 0, args = {};
    for (var key in metaArgs) {
      args[key] = entry[++numArgs];
    }
    return new ErrorEntry(entry[numArgs+1], entry[numArgs+2], entry[0], args);
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
    for (var schemaName in schemas) {
      var key, schemaDef = schemas[schemaName];
      var handlers = this._schemaHandlerMaps[schemaName] = {};

      if ("stateVars" in schemaDef) {
        for (key in schemaDef.stateVars) {
          handlers[key] = this._proc_stateVar.bind(this,
                                                   schemaDef.stateVars[key]);
        }
      }
      if ("events" in schemaDef) {
        for (key in schemaDef.events) {
          handlers[key] = this._proc_event.bind(this, schemaDef.events[key]);
        }
      }
      if ("asyncJobs" in schemaDef) {
        for (key in schemaDef.asyncJobs) {
          handlers[key + '_begin'] = this._proc_asyncJobBegin.bind(
                                       this, schemaDef.asyncJobs[key], key);
          handlers[key + '_end'] = this._proc_asyncJobEnd.bind(
                                     this, schemaDef.asyncJobs[key], key);
        }
      }
      if ("calls" in schemaDef) {
        for (key in schemaDef.calls) {
          handlers[key] = this._proc_call.bind(this, schemaDef.calls[key]);
        }
      }
      if ("errors" in schemaDef) {
        for (key in schemaDef.errors) {
          handlers[key] = this._proc_error.bind(this, schemaDef.errors[key]);
        }
      }
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
      obj = new ActorMeta(UNRESOLVED_ACTOR_RAW);
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
      return thing;
    }

    actor = this._uniqueNameMap[uniqueNameStr] = new ActorMeta(raw);
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
    return thing;
  },

  /**
   * Instantiate a `TestCaseStepMeta` for a test-case, resolving name references
   *  in the semantic ident to proper `LoggerMeta` or `ThingMeta` instances.
   */
  _makeStep: function(raw, entries) {
    var stepMeta = new TestCaseStepMeta(
      this._resolveSemanticIdent(raw.semanticIdent), raw, entries);

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
   * Process the permutation's logger for the test-cases and the testing
   *  loggers to build the super-friendly `TestCasePermutationLogBundle`
   *  representation.
   *
   * @return[TestCasePermutationLogBundle]
   */
  _processPermutation: function(rawPerm) {
    var perm = new TestCasePermutationLogBundle(rawPerm);
    this._uniqueNameMap = perm._uniqueNameMap;
    var rows = perm._perStepPerLoggerEntries;

    var nonTestLoggers = [], stepTimeSpans = [];

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
      var timeStart = stepEntries[0].timestamp, timeEnd;
      var iLastEntry = stepEntries.length - 1;
      if ((stepEntries[iLastEntry] instanceof AsyncJobEndEntry) &&
          stepEntries[iLastEntry].name === 'run')
        timeEnd = stepEntries[iLastEntry].timestamp;
      else
        timeEnd = null;
      stepTimeSpans.push([timeStart, timeEnd]);
    }

    // -- process filtered non-step loggers, time-slice their entries
    for (var iLogger = 0; iLogger < nonTestLoggers.length; iLogger++) {
      var rawLogger = nonTestLoggers[iLogger];
      var entries = this._processEntries(rawLogger.loggerIdent,
                                         rawLogger.entries);
      var iRow;
      if (entries === null) {
        for (iRow = 0; iRow < rows.length; iRow++) {
          rows[iRow].push(null);
        }
        continue;
      }
      
      var loggerMeta = new LoggerMeta(rawLogger, entries);
      perm.loggers.push(loggerMeta);

      var iSpan, iEntry = 0, markEntry;
      // keep in mind that a failed test may not have run all the way and so
      //  we may not have all the spans.
      for (iSpan = 0, iRow = 0; iSpan < stepTimeSpans.length; iSpan++) {
        var timeStart = stepTimeSpans[iSpan][0];

        // - before step
        markEntry = iEntry;
        while (iEntry < entries.length &&
               entries[iEntry].timestamp < timeStart) {
          iEntry++;
        }
        if (iEntry > markEntry)
          rows[iRow++].push(entries.slice(markEntry, iEntry));
        else
          rows[iRow++].push(null);

        // - in step
        markEntry = iEntry;
        var timeEnd = stepTimeSpans[iSpan][1];
        // unbounded timeEnd means everything goes in there!
        if (timeEnd === null) {
          markEntry = entries.length;
        }
        else {
          while (iEntry < entries.length &&
                 entries[iEntry].timestamp <= timeEnd) {
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

    return perm;
  },

  /**
   * Process a test case's logger hierarchy to produce a
   *
   * @return[TestCaseLogBundle]
   */
  processTestCase: function(fileName, rawCase) {
    if (rawCase.loggerIdent !== 'testCase')
      throw new Error("You gave us a '" + rawCase.loggerIdent +
                      "', not a 'testCase'!");

    // XXX process run_begin/run_end here perchance...

    var caseBundle = new TestCaseLogBundle(fileName, rawCase);
    for (var iPerm = 0; iPerm < rawCase.kids.length; iPerm++) {
      var rawPerm = rawCase.kids[iPerm];
      if (rawPerm.loggerIdent !== 'testCasePermutation')
        throw new Error("The 'testCase' you gave us has a '" +
                        rawPerm.loggerIdent + "' kid where a " +
                        "'testCasePermutation' should be!");

      caseBundle.permutations.push(this._processPermutation(rawPerm));
    }
    return caseBundle;
  }
};

exports.chewLoggestCase = function chewLoggestCase(logDetail) {
  var transformer = new LoggestLogTransformer();
  transformer.processSchemas(logDetail.schema);
  var caseBundle = transformer.processTestCase(logDetail.fileName,
                                               logDetail.log);
  // temporary rep for consistency with mozmill
  return {
    failures: [caseBundle],
  };
};

}); // end define
