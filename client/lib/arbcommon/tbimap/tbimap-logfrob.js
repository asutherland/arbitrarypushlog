/**
 * PARTIAL PORT, NOT YET DONE.
 *
 * Parse a Thunderbird NSPR IMAP log and push the information through loggest
 * loggers so we can reuse display mechanisms being constructed for the gaia
 * email client.
 *
 * This JS code is intended to be able to run in either an unprivileged browser
 * (ideally chained directly to the display logic) like our mozmill frobber,
 * or from node.  It is not intended to be nice to your memory wherever it runs.
 **/

define(
  [
    'rdcommon/log',
    'module',
    'exports'
  ],
  function(
    $log,
    $module,
    exports
  ) {

function ImapThread(threadId) {
  this.id = id;
}
ImapThread.prototype = {
};

function ImapLoop(loopId, _parentLog) {
  this.LOG = LOGFAB.TBImapLoop(this, _parentLog, loopId);

  this.lastLine = '';
  // If we are in a stream, the lines we have received.
  this.streamBytes = null;
  this.streamLines = null;
}
ImapLoop.prototype = {
};

/**
 * The parsing logic is derived from my nspr_imap_log_parser.py impl from my
 * tb-test-help repo.
 */
function ImapLogFrobber(stream, callback) {
  stream.on("data", this.onData.bind(this));
  stream.on("end", this.onEnd.bind(this));
  this.callback = callback;

  this.LOG = LOGFAB.TBImapRoot(this, null, 'root');

  this.threads = {};
  this.imapLoops = {};

  this.imapAccounts = {};
  this.folders = {};

  this.urls = {};

  this.leftover = null;
  this.iLine = 0;
}
ImapLogFrobber.prototype = {
  onData: function(data) {
    var dstr = this.leftover ?
                 (this.leftover + data.toString("utf8")) :
                 data.toString("utf8");
    this.leftover = null;

    var startFrom = 0, idxNewline;
    while (true) {
      idxNewline = dstr.indexOf('\n', startFrom);
      if (idxNewline === -1) {
        this.leftover = dstr.substring(startFrom);
        break;
      }

      var line, iLine = ++this.iLine, idx, nidx;
      if (line[idxNewline - 1] === '\r')
        line = dstr.substring(startFrom, idxNewline - 1);
      else
        line = dstr.substring(startFrom, idxNewline);
      startFrom = idxNewline + 1;

      // -- line!
      // Every line starts with something like '-1523583232[7f91a9571670]: '
      // where the first bit is an weird decimal thing with sign problems that
      // I was too lazy to figure out last time and apparently am too lazy this
      // time too, and a hex thread id.
      idx = line.indexOf('[') + 1;
      nidx = line.indexOf(']', idx);
      var threadId = line.substring(idx, nidx);
      idx = nidx + 3;

      var thread;
      if (this.threads.hasOwnProperty(threadId))
        thread = this.threads[threadId];
      else
        thread = this.threads[threadId] = new ImapThread(threadId);

      // Things are then generally either info from the IMAP loop, in which
      // case it's a colon-delimited robotic prefix thing like
      // "a5c79800:a1.balanced.spunky.mail.dreamhost.com:A:SendData:" or a
      // bit more humanish space-delimited thing like:
      // "trying auth method 0x1000", "got new password", "IMAP auth:",
      // "(GSSAPI = 0x1000000,", etc.
      // The main outlier is "IMAP: trying auth method 0x1000".
      var idxSpace = line.indexOf(' ', idx),
          idxColon = line.indexOf(':', idx);
      // -- space-delimited!
      if (idxColon === -1 ||
          (idxSpace !== -1 && idxSpace < idxColon) ||
          // IMAP: is the one glitchy case we want in this case
          line.substring(idx, idxColon) === 'IMAP') {
      }
      // -- colon-delimited, probably IMAP loop!
      else {
      }


    }
  },

  // "ImapThreadMainLoop entering [this=a5c79800]"
  _parse_ImapThreadMainLoop: function(line, thread) {
  },

  _parse_ReadNextLine: function(line, thread) {
    // This is boring, so we do nothing.
    // Looks like: "ReadNextLine [stream=a3d6ff10 nb=255 needmore=0]"
  },

  _parse_queuing: function(line, thread) {
  },

  _parse_considering: function(line, thread) {
  },

  _parse_failed: function(line, thread) {
  },

  _parse_playing: function(line, thread) {
  },

  _parse_retrying: function(line, thread) {
  },

  _imapLoop_func_SetupWithUrl: function(line, imapLoop) {
  },

  _imapLoop_func_ProcessCurrentURL: function(line, imapLoop) {
  },

  _imapLoop_func_SendData: function(line, imapLoop) {
    imapLoop.LOG.send(line);
  },

  _imapLoop_func_CreateNewLineFromSocket: function (line, imapLoop) {
    // If we're in a stream, just accumulate the lines.
    if (imapLoop.streamLines !== null)
      imapLoop.streamLines.push(line);
    else
      imapLoop.LOG.recv(line);
  },

  _imapLoop_func_STREAM: function(line, imapLoop) {
    // This looks like one of the following:
    // "STREAM:OPEN Size: 4337: Begin Message Download Stream"
    // "STREAM:CLOSE: Normal Message End Download Stream"
    // Noting that the size value appears to be unreliable.  It seems far
    // easier to just parse out the literal length from the previous line
    // since this inevitably happens on fetches.

    if (/^OPEN/.test(line)) {
      // Dig the number of bytes out from the previous line.
      var idxClose = imapLoop.lastLine.lastIndexOf('}'),
          idxOpen = imapLoop.lastLine.lastIndexOf('{');
      if (idxOpen !== -1 && idxClose !== -1 && idxClose > idxOpen)
        imapLoop.streamBytes =
          parseInt(imapLoop.lastLine.substring(idxOpen+1, idxClose));
      else
        imapLoop.streamBytes = null;

      imapLoop.streamLines = [];
      imapLoop.LOG.stream_begin(imapLoop.streamBytes, null);
    }
    else if (/^CLOSE:/.test(line)) {
      imapLoop.LOG.stream_end(imapLoop.streamBytes, imapLoop.streamLines);
    }
  },

  _imapLoop_func_TellThreadToDie: function(line, imapLoop) {
  },

  onEnd: function(data) {
    this.callback(this.writeCells);
  },

};

var LOGFAB = exports.LOGFAB = $log.register($module, {
  TBImapRoot: {
    type: $log.DAEMON,
    subtype: $log.DAEMON,
    events: {
    },
    asyncJobs: {
    },
  },

  TBImapLoop: {
    type: $log.CONNECTION,
    subtype: $log.CLIENT,
    events: {
      send: { data: false },
      recv: { data: false },
    },
    asyncJobs: {
      stream: { bytes: false, lines: false },
    },
  },
}); // end LOGFAB

}); // end define
