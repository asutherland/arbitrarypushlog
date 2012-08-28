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
 * The place for ill-defined analysis passes of loggest logs and perhaps
 *  framework to be used by better-defined passes that live elsewhere.
 *
 * Right now this means:
 * - Counting up the duration of all async tasks
 **/

define(
  [
    './chew-loggest',
    'exports'
  ],
  function(
    $chew_loggest,
    exports
  ) {

const AsyncJobBeginEntry = $chew_loggest.AsyncJobBeginEntry,
      AsyncJobEndEntry = $chew_loggest.AsyncJobEndEntry;

function SummarizeAsyncTasks(perm) {

}
exports.SummarizeAsyncTasks = SummarizeAsyncTasks;
SummarizeAsyncTasks.prototype = {
  NAME: 'asyncTasks',

  processEvents: function(globalSummary, localSummary, events) {
    var tracky = {};

    for (var iEvent = 0; iEvent < events.length; iEvent++) {
      var event = events[iEvent];
      if ((event instanceof AsyncJobBeginEntry) && event.layer) {
        tracky[event.name] = event;
      }
      else if ((event instanceof AsyncJobEndEntry) && event.layer) {
        if (tracky.hasOwnProperty(event.name) && tracky[event.name]) {
          if (!globalSummary.hasOwnProperty(event.layer))
            globalSummary[event.layer] = 0;
          if (!localSummary.hasOwnProperty(event.layer))
            localSummary[event.layer] = 0;

          var duration = event.relstamp - tracky[event.name].relstamp;
          event.duration = duration;
          tracky[event.name] = null;

          //console.log(event.layer, event.name, duration);

          globalSummary[event.layer] += duration;
          localSummary[event.layer] += duration;
        }
      }
    }
  },
};

exports.runOnPermutations = function(analyzers, caseBundle) {
  for (var iPerm = 0; iPerm < caseBundle.permutations.length; iPerm++) {
    var perm = caseBundle.permutations[iPerm];
    perm.summaries = {};

    for (var iLyzer = 0; iLyzer < analyzers.length; iLyzer++) {
      var analyzer = new analyzers[iLyzer]();

      var permScratch = perm.summaries[analyzer.NAME] = {};

      for (var iStep = 0; iStep < perm.steps.length; iStep++) {
        var step = perm.steps[iStep];
        if (!step.summaries)
          step.summaries = {};
        var stepScratch = step.summaries[analyzer.NAME] = {};

        var entries = perm.getAllEntriesForStep(step);
        analyzer.processEvents(permScratch, stepScratch, entries);
      }
    }
  }
};

}); // end define
