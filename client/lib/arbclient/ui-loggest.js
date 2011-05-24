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
  structure: {
    loggersBlock: {
      loggersLabel: "Involved Loggers:",
      loggers: wy.vertList({type: "loggest-test-logger"}, "loggers"),
    },
    thingsBlock: {
      thingsLabel: "Things:",
      things: wy.vertList({type: "loggest-test-thing"}, "things"),
    },
    stepsBlock: {
      stepsLabel: "Steps:",
      steps: wy.vertList({type: "loggest-test-step"}, "steps"),
    },
  },
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
  name: "loggest-test-thing",
  doc: "ThingMeta presentation",
  constraint: {
    type: "loggest-test-thing",
  },
  structure: wy.flow({
    loggerIdent: wy.bind("loggerIdent"),
    semanticIdent: wy.bind("semanticIdent"),
  }),
});

wy.defineWidget({
  name: "loggest-test-step",
  doc: "TestCaseStepMeta presentation",
  constraint: {
    type: "loggest-test-step",
  },
  structure: {
    resolvedIdent: wy.stream({type: "loggest-sem-stream"}, "resolvedIdent"),
  },
});

}); // end define
