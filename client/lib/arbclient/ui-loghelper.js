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
 * Presentations of logHelper log entries and the higher level errors that
 *  contain them.
 *
 * All the data was originally designed for logsploder to express, so it might
 *  be useful to consult in spots:  https://github.com/asutherland/logsploder
 **/

define(
  [
    "wmsy/wmsy",
  ],
  function(
    $wmsy
  ) {

var wy = new $wmsy.WmsyDomain({id: "ui-loghelper", domain: "arbpl"});

wy.defineStyleBase("logs", [
  "@logIndent: 15em;",
  ".action-bubble (@color) {",
      "display: inline-block;",
      "padding: 0px 6px;",
      "border-radius: 6px;",
      "background-color: @color;",
      "color: white;",
      "margin: 1px;",
  "}",
]);

wy.defineWidget({
  name: "log4moz-record",
  constraint: {
    type: "log4moz-record",
  },
  structure: {
    // we need to slice off/ignore the first entry
    entries: wy.stream({type: "log-entry"}, wy.NONE),
  },
  impl: {
    postInit: function() {
      this.entries_set(this.obj.messageObjects.slice(1));
    },
  },
  style: {
    root: [
      "display: block;",
    ],
    entries: [
    ],
  },
});

/**
 * Basically only failures go over the xpcshell logger channel, but we really
 *  should not be relying on this in this fashion.
 */
wy.defineWidget({
  name: "log4moz-record-failure",
  constraint: {
    type: "log4moz-record",
    obj: { loggerName: "xpcshell" },
  },
  structure: {
    type: "failish",
    // we need to slice off/ignore the first entry
    entries: wy.stream({type: "logstream"}, wy.NONE),
  },
  impl: {
    postInit: function() {
      var amended = this.obj.messageObjects.slice(1);
      spacifyConsoleAssumingStream(amended);
      this.entries_set(amended);
    },
  },
  style: {
    root: [
      "display: block;",
      "position: relative;",
    ],
    type: [
      "position: absolute;",
      ".action-bubble(#5f084b);",
      "margin-left: 2em;",
    ],
    entries: [
      "display: block;",
      "margin-left: @logIndent;",
      "color: #5f084b;",
    ],
    "entries-item": [
      "margin-bottom: 1px;",
    ],
  },
});


wy.defineWidget({
  name: "log-test",
  constraint: {
    type: "log-entry",
    obj: { type: wy.WILD },
  },
  structure: "",
  impl: {
    postInit: function() {
      if (this.obj.hasOwnProperty("_stringRep"))
        this.domNode.textContent = this.obj._stringRep;
      else
        this.domNode.textContent = JSON.stringify(this.obj);
    },
  },
});


wy.defineWidget({
  name: "log-test",
  constraint: {
    type: "log-entry",
    obj: { type: "test" },
  },
  structure: [wy.bind("type"), ": ", wy.bind("name"), " ", wy.bind("parameter")],
});

wy.defineWidget({
  name: "log-subtest",
  constraint: {
    type: "log-entry",
    obj: { type: "subtest" },
  },
  structure: [wy.bind("type"), ": ", wy.bind("name"), " ", wy.bind("parameter")],
});

////////////////////////////////////////////////////////////////////////////////
// Specialized action handlers:

/**
 * Cram spaces between array entries as an attempt to normalize the event stream
 *  which assumes console.log semantics that put whitespaces in there.  This
 *  might also make sense as an optionally enabled behaviour in wy.stream.
 */
function spacifyConsoleAssumingStream(l) {
  if (!l)
    return;
  var i = 1;
  while (i < l.length) {
    l.splice(i, 0, " ");
    i += 2;
  }
}

wy.defineWidget({
  name: "log-action",
  constraint: {
    type: "log-entry",
    obj: { type: "action" },
  },
  structure: {
    who: wy.bind("who"),
    what: wy.bind("what"),
    stream: wy.stream({type: "logstream"}, "args"),
  },
  impl: {
    preInit: function() {
      spacifyConsoleAssumingStream(this.obj.args);
    },
  },
});

wy.defineWidget({
  name: "log-action-msgEvent",
  constraint: {
    type: "log-entry",
    obj: {
      type: "action",
      who: "msgEvent",
    },
  },
  structure: {
    what: wy.bind("what"),
    stream: wy.stream({type: "logstream"}, "args"),
  },
  impl: {
    preInit: function() {
      // fixup stupidly long event descriptions:
      if (this.obj.what == "OnItemPropertyFlagChanged")
        this.obj.what = "FlagChanged";
      spacifyConsoleAssumingStream(this.obj.args);
    },
  },
  style: {
    root: [
      "color: #006f71;",
      "position: relative;",
    ],
    what: [
      "position: absolute;",
      ".action-bubble(#006f71);",
      "margin-left: 1em;",
    ],
    stream: [
      "display: block;",
      "margin-left: @logIndent;",
    ],
  },
});

wy.defineWidget({
  name: "log-action-fdh",
  constraint: {
    type: "log-entry",
    obj: {
      type: "action",
      who: "fdh",
    },
  },
  structure: {
    what: wy.bind("what"),
    stream: wy.stream({type: "logstream"}, "args"),
  },
  impl: {
    preInit: function() {
      spacifyConsoleAssumingStream(this.obj.args);
    },
  },
  style: {
    root: [
      "color: #472255;",
      "position: relative;",
    ],
    what: [
      "position: absolute;",
      ".action-bubble(#472255);",
    ],
    stream: [
      "display: block;",
      "margin-left: @logIndent;",
    ],
  },
});

wy.defineWidget({
  name: "log-action-winhelp",
  constraint: {
    type: "log-entry",
    obj: {
      type: "action",
      who: "winhelp",
    },
  },
  structure: {
    what: wy.bind("what"),
    stream: wy.stream({type: "logstream"}, "args"),
  },
  impl: {
    preInit: function() {
      spacifyConsoleAssumingStream(this.obj.args);
    },
  },
  style: {
    root: [
      "color: #175567;",
      "position: relative;",
    ],
    what: [
      "position: absolute;",
      ".action-bubble(#175567);",
      "margin-left: 1em;",
    ],
    stream: [
      "display: block;",
      "margin-left: @logIndent;",
    ],
  },
});



wy.defineWidget({
  name: "log-check",
  constraint: {
    type: "log-entry",
    obj: { type: "check" },
  },
  structure: {
    check: "CHECK!",
  },
});

wy.defineWidget({
  name: "log-failure",
  constraint: {
    type: "log-entry",
    obj: { type: "failure" },
  },
  structure: {
    entries: wy.bind("text"),
  },
});

////////////////////////////////////////////////////////////////////////////////
// Log Entry Contents (logstream)

wy.defineWidget({
  name: "log-generic",
  constraint: {
    type: "logstream",
    obj: { type: wy.WILD },
  },
  structure: "",
  impl: {
    postInit: function() {
      if (this.obj == null)
        this.domNode.textContent = "null";
      else if (this.obj.hasOwnProperty("_stringRep"))
        this.domNode.textContent = this.obj._stringRep;
      else
        this.domNode.textContent = this.obj.toString();
    },
  },
});


wy.defineWidget({
  name: "log-folder",
  constraint: {
    type: "logstream",
    obj: { type: "folder" },
  },
  structure: ['"', wy.bind("name"), '" (', wy.bind("uri"), ")"],
});

wy.defineWidget({
  name: "log-msgHdr",
  constraint: {
    type: "logstream",
    obj: { type: "msgHdr" },
  },
  structure: {
    messageKey: wy.bind("name"),
  },
});

wy.defineWidget({
  name: "log-domNode",
  constraint: {
    type: "logstream",
    obj: { type: "domNode" },
  },
  structure: {
    name: wy.bind("name"),
  },
});

wy.defineWidget({
  name: "log-error",
  constraint: {
    type: "logstream",
    obj: { type: "error" },
  },
  structure: {
    message: wy.bind("message"),
    stack: "",
  },
  impl: {
    postInit: function () {
      if (this.obj.stack)
        this.stack_elem.textContent = this.obj.stack.join("\n");
    },
  },
  style: {
    stack: [
      "white-space: pre-wrap;",
    ],
  }
});

wy.defineWidget({
  name: "log-stackFrame",
  constraint: {
    type: "logstream",
    obj: { type: "stackFrame" },
  },
  structure: ['"', wy.bind("name"), '" @ ',
              wy.bind("fileName"), ":", wy.bind("lineNumber")],
});

wy.defineWidget({
  name: "log-XPCOM",
  constraint: {
    type: "logstream",
    obj: { type: "XPCOM" },
  },
  structure: {
  },
});

}); // end define
