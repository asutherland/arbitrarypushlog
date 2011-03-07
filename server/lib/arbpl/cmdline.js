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


process.on("uncaughtException",
  function(err) {
    console.log("==== UNCAUGHT ====");
    console.error(err.stack);
  });

require(
  {
    baseUrl: "../../",
    packages: [
    ],
    paths: {
      arbpl: "server/lib/arbpl",
      arbcommon: "client/lib/arbcommon",
    },
  },
  [
    "nomnom",
    "q",
    "arbpl/hackjobs",
    "require"
  ],
  function(
    $nomnom,
    $Q,
    $hackjobs,
    $require
  ) {
var when = $Q.when;

var OPTS = [
  {
    name: "command",
    position: 0,
    help: "one of: sync, web, localchew",
  },
];

// We need to do our own argv slicing to compensate for RequireJS' r.js
var options = $nomnom.parseArgs(OPTS, null, process.argv.slice(3));
switch (options.command) {
  case "web":
    $require(
      ["arbpl/web/gogogo"],
      function($webgo) {
        // automatically goes, as it were.
      }
    );
    break;

  case "sync":
    $require(
      ["arbpl/hivemind"],
      function($hivemind) {
        when($hivemind.HIVE_MIND.syncAll(),
          function() {
            console.log("synchronized everyone! woo!");
            process.exit(0);
          },
          function() {
            console.error("suspiciously impossible failure!");
          });
      }
    );
    break;

  case "backfill":
    $require(
      ["arbpl/hivemind"],
      function($hivemind) {
        when($hivemind.HIVE_MIND.backfillAll(5),
          function() {
            console.log("synchronized everyone! woo!");
            process.exit(0);
          },
          function() {
            console.error("suspiciously impossible failure!");
          });
      }
    );
    break;

  case "localchew":
    $require(
      ["arbpl/localchew"],
      function($localchew) {
        var chewer = new $localchew.LocalChewer();
        when(chewer.chew(options[1]),
          function(pushId) {
            console.log("chewed log as push id:", pushId);
            process.exit(0);
          });
      }
    );
    break;

  case "frob-xpcshell":
    $require(
      ["arbpl/xpcshell-logfrob"],
      function($frobber) {
        $frobber.dummyTestRun($hackjobs.gimmeStreamForThing(options[1]));
      }
    );
    break;

  case "frob-mozmill":
    $require(
      ["arbpl/mozmill-logfrob"],
      function($frobber) {
        $frobber.dummyTestRun($hackjobs.gimmeStreamForThing(options[1]));
      }
    );
    break;

  default:
    console.error("unknown command: " + options.command);
    process.exit(-1);
    break;
}


});
