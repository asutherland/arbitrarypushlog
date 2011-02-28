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
 * Process the logHelper.js formatted log records into a more usable
 *  representation.
 *
 * In a nutshell, logHelper.js tunnels a rich representation over a slightly
 *  upgraded but backwards compatible log4moz (in the vein of log4j).  This was
 *  primarily so that we could interoperate with more traditional log4moz
 *  consumers while also providing rich representations for UI, all the while
 *  still providing simple human readable text representations as a fallback.
 *  (Oh, and those log4moz consumers could also follow certain idioms to help
 *  out fancy UIs in terms of request tracking, etc.)  Because of these
 *  competing needs, the representation is something that benefits from
 *  additional processing (which we conveniently already wrote for logsploder.)
 *
 * The log4moz message representation is:
 * @typedef[Log4MozJsonMessage @dict[
 *   @key[level Number]{
 *     Log level.  logHelper uses 40 for everything.
 *   }
 *   @key[loggerName String]{
 *     The hierarchical logger name, ex: "foo.bar".
 *   }
 *   @key[time Number]{
 *     JS milliseconds date rep; new Date(message.time) to get a date.
 *   }
 *   @key[messageObjects @listof[Object]]{
 *     The message objects, which are probably strings or a full-out
 *     dictionary style object.
 *   }
 * ]]
 *
 * In the case of logHelper.js generated messages, the first entry will always
 *  be a context object.  They are pretty verbose and are always just about
 *  the currently executing test and its parent test file.
 *
 * @typedef[LoggerContext @dict[
 *   @key[_isContext true]{
 *     Indicates this is a context object and obeys the conventions defined
 *     here.
 *   }
 *   @key[type String]{
 *     The type of the context which defines the expectations of how the
 *     non-underscore prefixed attributes should be interpreted.  It's
 *     assumed people will avoid colliding with other types somehow.
 *   }
 *   @key[name String]{
 *     Human-readable name for this context, by convention.  In theory,
 *     this is left up to the discretion of the specific type.
 *   }
 *   @key[_contextDepth Number]{
 *     The number of ancestor contexts; zero for none.
 *   }
 *   @key[_contextParentId #:optional String]{
 *     The `_id` of the immediate parent context if `_contextDepth` is non-zero.
 *   }
 *   @key[_id String]{
 *     Opaque identifier for the context that will, by convention, be prefixed
 *     with the loggerName (and a colon) in order to provide namespacing
 *     to avoid collisions with other context allocators.
 *
 *     (The idea was that code might pass the context around to other subsystems
 *     to provide context, which is why we can't just implicitly namespace
 *     based on the logger the context is emitted by.)
 *   }
 *   @key[_state String]{
 *     Initially set to "start" by log4moz when the logger is created and set
 *     to "finished" when officially marked as finished.  The set of other
 *     acceptable values is defined by the type.
 *   }
 *   @key[_started Number]{
 *     Start timestamp of the context in JS millis.
 *   }
 *   @key[_lastStateChange Number]{
 *     Timestamp of the last state change for the context in JS millis.
 *   }
 * ]]{
 *   Log4Moz LoggerContext as used by logHelper.js.
 * }
 **/

/**
 * @typedef[WindowHelperWindowsDump @dict[
 *   @key[windows @listof[@dict[
 *     @key[id String]
 *     @key[title String]
 *     @key[screenshotDataUrl String]{
 *       A screenshot of this window rendered as a data URL.  The screenshot
 *       is captured using canvas's (chrome privileged) ability to render
 *       a window to a canvas.  The rendered screenshot is a composite of the
 *       root window in the frame and any visible iframe/browsers in the window.
 *     }
 *     @key[isActive Boolean]
 *     @key[coords]
 *     @key[dims]
 *     @key[pageOffsets]
 *     @key[focusedElem]
 *   ]]]
 * ]]
 **/

/**
 * @typedef[MozmillFailureInfo @dict[
 *   @key[testName String]
 *   @key[fileName String]
 *   @key[exception @dict[
 *     @key[fileName String]
 *     @key[lineNumber Number]
 *     @key[message String]
 *     @key[stack String]
 *   ]]
 *   @key[failureContext @dict[
 *     @key[preEvents @listof[Log4MozJsonMessage]]
 *     @key[events @listof[Log4MozJsonMessage]]
 *     @key[windows @listof[WindowHelperWindowsDump]]
 *   ]]
 * ]]
 **/

define(
  [
    "exports"
  ],
  function(
    exports
  ) {

/**
 * Currently we just look for lists as the immediate children of action nodes
 *  and wrap them in a container.  This is a hack that simplifies widget
 *  binding but has the longer term goal of assisting in providing summaries
 *  or faceted views of such sets (as well as being a baby step to providing
 *  more useful processing.)
 *
 * The current mode of operation does not mutate in-place, although we should
 *  consider it...
 *
 * @args[
 *   @param[rawEvents @listof[Log4MozJsonMessage]]
 * ]
 */
function chewEvents(rawEvents) {
  var outEvents = [];
  for (var iEvent = 0; iEvent < rawEvents.length; iEvent++) {
    var rawMsg = rawEvents[iEvent];
    var outMsg = {
      loggerName: rawMsg.loggerName,
      level: rawMsg.level,
      time: rawMsg.time,
      messageObjects: null
    };
    outEvents.push(outMsg);
    if (!rawMsg.messageObjects.length) {
      outMsg.messageObjects = rawMsg;
    }
    else {
      var outMsgObjs = outMsg.messageObjects = [];
      for (var iMsgObj = 0; iMsgObj < rawMsg.messageObjects.length; iMsgObj++) {
        var rawMsgObj = rawMsg.messageObjects[iMsgObj];
        // nothing to do for simple types or untyped objects
        if (rawMsgObj == null ||
            typeof(rawMsgObj) !== "object" ||
            !rawMsgObj.hasOwnProperty("type")) {
          outMsgObjs.push(rawMsgObj);
          continue;
        }
        // - MarkAction handling
        // make sure any list "args" get wrapped
        if (rawMsgObj.type === "action") {
          // no need to copy/mutate if there is no such arg
          if (!(rawMsgObj.args.some(Array.isArray))) {
            outMsgObjs.push(rawMsgObj);
            continue;
          }
          // (need to mutate)
          var outAct = {
            type: "action",
            who: rawMsgObj.who,
            what: rawMsgObj.what,
            args: [],
          };
          outMsgObjs.push(outAct);
          var outArgs = outAct.args;
          for (var iArg = 0; iArg < rawMsgObj.args.length; iArg++) {
            var curArg = rawMsgObj.args[iArg];
            if (Array.isArray(curArg)) {
              outArgs.push({
                type: "array",
                items: curArg,
              });
            }
            else {
              outArgs.push(curArg);
            }
          }
        }
        else {
          outMsgObjs.push(rawMsgObj);
        }
      }
    }
  }

  return outEvents;
}

/**
 * Specialized handling of mozmill failure entries that is aware of that
 *  format so that all the rest of the code in this module affects are
 *  logHelper generated entries.
 *
 * @args[
 *   @param[rawDetails @dict[
 *     @key[failures @listof[MozmillFailureInfo]]
 *   ]]
 * ]
 */
exports.chewMozmillFailures = function(rawDetails) {
  var chewedDetails = {
    failures: [],
  };
  var chewedFailures = chewedDetails.failures,
      rawFailures = rawDetails.failures;

  for (var iFailure = 0; iFailure < rawFailures.length; iFailure++) {
    var outFailure = {}, rawFailure = rawFailures[iFailure];
    chewedFailures.push(outFailure);

    for (var key in rawFailure) {
      if (key === "failureContext") {
        var rawContext = rawFailure.failureContext;
        var outContext = outFailure.failureContext = {};
        for (var subkey in rawContext) {
          if (subkey === "events" || subkey === "preEvents")
            outContext[subkey] = chewEvents(rawContext[subkey]);
          else
            outContext[subkey] = rawContext[subkey];
        }
      }
      else {
        outFailure[key] = rawFailure[key];
      }
    }
  }
  return chewedDetails;
};

}); // end define
