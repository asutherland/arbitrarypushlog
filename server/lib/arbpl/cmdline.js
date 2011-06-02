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

var DEATH_PRONE = false;

process.on("uncaughtException",
  function(err) {
    console.log("==== UNCAUGHT ====");
    console.error(err.stack);
    if (DEATH_PRONE)
      process.exit(1);
  });

/**
 * Although our cron jobs happen every 3 minutes right now, let's time-out
 *  after 10 minutes since we aren't a proper inactivity/watchdog timeout.
 */
var WATCHDOG_TIMEOUT = 6 * 60 * 1000;
function deathClock() {
  DEATH_PRONE = true;
  setTimeout(function() {
    console.log("WATCHDOG KILLIN");
    process.exit(10);
  }, WATCHDOG_TIMEOUT);
}

var parser = $nomnom.globalOpts({
});

const OPT_BRIDGE_PORT = {
  string: "--bridge-port",
  default: 8009,
};
const OPT_TREE = {
  string: "--tree=TREE",
};
const OPT_LOGFILE = {
  position: 1,
  help: "the log file to process",
};


parser.command('web')
  .help("Run the user-facing web-server.")
  .opts({
  })
  .callback(function(options) {
    $require(
      ["arbpl/web/gogogo"],
      function($webgo) {
        // automatically goes, as it were.
      }
    );
  });

parser.command('sync')
  .help("Synchronize polling-based build trees.")
  .opts({
    bridgePort: OPT_BRIDGE_PORT,
    tree: OPT_TREE,
  })
  .callback(function(options) {
    deathClock();
    $require(
      ["arbpl/hivemind"],
      function($hivemind) {
        $hivemind.HIVE_MIND.configure({
          bridgePort: parseInt(options.bridgePort),
          tree: options.tree,
        });
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
  });

parser.command('backfill')
  .help("Synchronize polling-based build trees.")
  .opts({
    bridgePort: OPT_BRIDGE_PORT,
    tree: OPT_TREE,
    days: {
      string: "--days=DAYS",
      default: 5,
      help: "for backfill, how many days to backfill",
    },
  })
  .callback(function(options) {
    $require(
      ["arbpl/hivemind"],
      function($hivemind) {
        $hivemind.HIVE_MIND.configure({
          bridgePort: parseInt(options.bridgePort),
          tree: options.tree,
        });
        when($hivemind.HIVE_MIND.backfillAll(options.days),
          function() {
            console.log("synchronized everyone! woo!");
            process.exit(0);
          },
          function() {
            console.error("suspiciously impossible failure!");
          });
      }
    );
  });

const OPT_JOB = {
  string: "--job",
};
const OPT_BUILD_NUM = {
  string: "--build-num",
};
const OPT_BUILD_ID = {
  string: "--build-id",
};
const OPT_COMMIT = {
  string: "--commit",
};
const OPT_BRANCH = {
  string: "--branch",
};
const OPT_LOGFILE_NAMED_ARG = {
  string: "--logfile",
};
parser.command('jenkins-building')
  .help("Jenkins automation: Report the start of a build job.")
  .opts({
    job: OPT_JOB,
    buildNum: OPT_BUILD_NUM,
    buildId: OPT_BUILD_ID,
    commit: OPT_COMMIT,
    branch: OPT_BRANCH,
  })
  .callback(function(options) {
  });

parser.command('jenkins-built')
  .help("Jenkins automation: Report the completion of a build job.")
  .opts({
    job: OPT_JOB,
    buildNum: OPT_BUILD_NUM,
    buildId: OPT_BUILD_ID,
    commit: OPT_COMMIT,
    branch: OPT_BRANCH,
    logfile: OPT_LOGFILE_NAMED_ARG,
  })
  .callback(function(options) {
  });


// test function to push something to the clients using console.log.
parser.command('testpush')
  .help("Debugging: hackjob to send a message to clients.")
  .opts({
  })
  .callback(function(options) {
    $require(
      ["arbpl/databus"],
      function($databus) {
        console.log("creating data bridge");
        var sink = new $databus.ScraperBridgeSource(8009);
        console.log("sending message");
        when(sink.send({type: "test", message: "do it."}),
          function(rstr) {
            console.log("message sent");
            console.log("response body was:", rstr);
            process.exit(0);
          },
          function(errstr) {
            console.error("problem sending message", errstr);
          });
      }
    );
  });


parser.command('localchew')
  .help("Consume a local mozmill run's output, pushing to the 'Local' tree.")
  .opts({
    logfile: OPT_LOGFILE,
  })
  .callback(function(options) {
    $require(
      ["arbpl/localchew"],
      function($localchew) {
        var chewer = new $localchew.LocalChewer();
        when(chewer.chew(options.logfile),
          function(pushId) {
            console.log("chewed log as push id:", pushId);
            process.exit(0);
          });
      }
    );
  });

parser.command('logalchew')
  .help("Consume a local loggest run's output, pushing to the 'Logal' tree.")
  .opts({
    logfile: OPT_LOGFILE,
  })
  .callback(function(options) {
    $require(
      ["arbpl/loggestchew"],
      function($loggestchew) {
        var chewer = new $loggestchew.LocalLoggestChewer();
        when(chewer.chew(options.logfile),
          function(pushId) {
            console.log("chewed log as push id:", pushId);
            process.exit(0);
          });
      }
    );
  });

parser.command('frob-xpcshell')
  .help("Debugging: Process an xpcshell log and dump its output to stdout.")
  .opts({
    logfile: OPT_LOGFILE,
  })
  .callback(function(options) {
    $require(
      ["arbpl/xpcshell-logfrob"],
      function($frobber) {
        $frobber.dummyTestRun($hackjobs.gimmeStreamForThing(options.logfile));
      }
    );
  });

parser.command('frob-mochitest')
  .help("Debugging: Process a mochitest log and dump its output to stdout.")
  .opts({
    logfile: OPT_LOGFILE,
  })
  .callback(function(options) {
    $require(
      ["arbpl/mochitest-logfrob"],
      function($frobber) {
        $frobber.dummyTestRun($hackjobs.gimmeStreamForThing(options.logfile));
      }
    );
  });

parser.command('frob-reftest')
  .help("Debugging: Process a reftest log and dump its output to stdout.")
  .opts({
    logfile: OPT_LOGFILE,
  })
  .callback(function(options) {
    $require(
      ["arbpl/reftest-logfrob"],
      function($frobber) {
        $frobber.dummyTestRun($hackjobs.gimmeStreamForThing(options.logfile));
      }
    );
  });

parser.command('frob-mozmill')
  .help("Debugging: Process a mozmill log and dump its output to stdout.")
  .opts({
    logfile: OPT_LOGFILE,
  })
  .callback(function(options) {
    $require(
      ["arbpl/mozmill-logfrob"],
      function($frobber) {
        $frobber.dummyTestRun($hackjobs.gimmeStreamForThing(options.logfile));
      }
    );
  });

parser.command('frob-loggest')
  .help("Debugging: Process a loggest log and dump its output to stdout.")
  .opts({
    logfile: OPT_LOGFILE,
  })
  .callback(function(options) {
    $require(
      ["arbpl/loggest-logfrob"],
      function($frobber) {
        $frobber.dummyTestRun($hackjobs.gimmeStreamForThing(options.logfile));
      }
    );
  });

parser.scriptName('cmdline');

// We need to do our own argv slicing to compensate for RequireJS' r.js.
//  Because nomnom currently uses "passedInArgv || process.argv.slice(2)",
//   passing in process.argv.slice(3) can screw us if there is no command because
//   an empty list is falsey.  So we just chop off one of the first args so
//   that the default slice(2) ends up effectively being slice(3).
process.argv = process.argv.slice(1);
parser.parseArgs();

});
