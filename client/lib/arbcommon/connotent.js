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
 * Parses changeset messages for bug references/changeset links, etc.
 **/

define(
  [
    "exports",
  ],
  function(
    exports
  ) {

/**
 * @listof[@dict[
 *   @key[re RegExp]
 *   @key[handler @func[
 *     @args[
 *       @param[match RegExpMatch]
 *       @param[context @dict[
 *         @key[repo RepoDef]
 *       ]]{
 *         Theoretically generic dictionary to provide the context in which
 *         the detector is being run.  For example, the revision control repo
 *         to which the commit belongs is the most likely repository any
 *         changeset is referencing.  Bug numbers likely correspond to the
 *         associate bug tracker for the repo, etc.
 *       }
 *     ]
 *     @return[Object]{
 *       An object suitable for presentation
 *     }
 *   ]]{
 *     Handler function to produce a replacement object for the matching value
 *     of the regular expression.  A 1:1 mapping is currently assumed, but it
 *     might alternately be reasonable to pass the output list for complicated
 *     things should they arise.
 *   }
 * ]]{
 *   A list of detectors in prioritized order of application.  You will want
 *   to prioritize first to disambiguate between overlapping regexes and
 *   secondly to defer frequently matching regexes to the end of the list.  This
 *   is because a matching regexp splits the string into segments and we need
 *   to run the rest of the regular expressions against all of those segments.
 * }
 */
var DETECTORS = [];

DETECTORS.push({
  re: /\b(?:[Bb][Uu][Gg])? ?(\d{4,7})\b/g,
  handler: function bugDetector(match, context) {
    return {
      kind: "bug-ref",
      // let's provide the text verbatim; it would likely feel "off" for us
      //  to be normalizing stuff...
      text: match[0],
      bugId: parseInt(match[1]),
      bugTracker: context.repo.bugTracker,
    };
  },
});

DETECTORS.push({
  re: /\b([a-fA-F0-9]{12})\b/g,
  handler: function changesetDetector(match, context) {
    return {
      kind: "changeset-ref",
      shortRev: match[1],
      repo: context.repo,
    };
  },
});


var ACRONYMS = {
  NPOTB: "Not Part Of The Build",
  NPOTDB: "Not Part Of The (Default,Damn) Build",
  DONTBUILD: "Infrastructure keyword to suppress builds for this changeset",
  "CLOSED TREE": "Commit hook keyword allowing a push to succeed even when " +
    "the tree is marked as closed; you must have actual authorization and an " +
    "'a=authorizer' inclusion in your commit!",
};

function buildAcronymRegex() {
  var termList = [];
  for (var nym in ACRONYMS) {
    termList.push(nym);
  }
  var restr = "\\b(" + termList.join("|") + ")\\b";
  var regex = new RegExp(restr, "g");
  return regex;
}

DETECTORS.push({
  re: buildAcronymRegex(),
  handler: function acronymDetector(match, context) {
    return {
      kind: "acronym",
      acronym: match[1],
      explanation: ACRONYMS[match[1]],
    };
  },
});


exports.transformCommitText = function transformCommitText(wholeString,
                                                           context) {
  var inBits = [wholeString];
  for (var iDetector = 0; iDetector < DETECTORS.length; iDetector++) {
    var outBits = [];
    var detector = DETECTORS[iDetector];
    var re = detector.re, handler = detector.handler;
    for (var iBit = 0; iBit < inBits.length; iBit++) {
      var bit = inBits[iBit];
      if (typeof(bit) !== "string") {
        outBits.push(bit);
        continue;
      }

      var lastProcessedIndex = 0;
      var match;
      while ((match = re.exec(bit))) {
        if (lastProcessedIndex < match.index)
          outBits.push(bit.substring(lastProcessedIndex, match.index));
        lastProcessedIndex = match.index + match[0].length;
        outBits.push(handler(match, context));
      }
      if (lastProcessedIndex < bit.length)
        outBits.push(bit.substring(lastProcessedIndex));
    }
    inBits = outBits;
  }
  return inBits;
};

}); // end define
