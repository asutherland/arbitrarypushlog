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
    "wmsy/wlib/objdict",
    "text!./ui-loghelper.css"
  ],
  function(
    $wmsy,
    $_wlib_objdict, // unused, just a dependency.
    $_css
  ) {

var wy = new $wmsy.WmsyDomain({id: "ui-loghelper", domain: "arbpl",
                               css: $_css});

/**
 * Generic log4moz record handler which has to be smart to deal with a number
 *  of possible permutations:
 *
 * - We may have a context object supplied as the first argument; if so, we
 *   want to ignore it because we are not currently using context stuff.
 *
 * - The messageObjects may not have an action record associated.  Because
 *   action records redundantly encode a lot of information, their widgets
 *   provide the exciting action bubble stuff.  We still want bubbles for
 *   generic logging, so in the event we don't see an action, we can
 *   transform the record to another widget type or deal with it here.
 *   We currently choose to reformulate it which allows us to avoid using
 *   a 'stream' child construct (which would otherwise be somewhat overkill.)
 */
wy.defineWidget({
  name: "log4moz-record",
  constraint: {
    type: "log4moz-record",
  },
  structure: {
    // we need to slice off/ignore the first entry if it's a context
    entry: wy.widget({type: "log-entry"}, wy.NONE),
  },
  impl: {
    postInit: function() {
      if (!this.obj.messageObjects.length)
        return;
      var useMessages;
      if (this.obj.messageObjects[0] == null ||
          this.obj.messageObjects[0].hasOwnProperty("_isContext"))
        useMessages = this.obj.messageObjects.slice(1);
      else
        useMessages = this.obj.messageObjects;
      var action;
      if (useMessages.length && useMessages[0] &&
          typeof(useMessages[0]) === "object" &&
          useMessages[0].type === "action") {
        // control flow capture
        action = useMessages[0];
      }
      // normalize into a fake action...
      else {
        var wasUse = useMessages;
        action = {
          type: "action",
          who: this.obj.loggerName,
          what: this.obj.loggerName,
          args: wasUse,
        };
      }
      this.entry_set(action);
    },
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
  name: "log-action-generic",
  constraint: {
    type: "log-entry",
    obj: {
      type: "action",
    },
  },
  structure: {
    what: wy.bind("what", {who: "who"}),
    stream: wy.stream({type: "logstream"}, "args"),
  },
  impl: {
    preInit: function() {
      spacifyConsoleAssumingStream(this.obj.args);
    },
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

////////////////////////////////////////////////////////////////////////////////
// Log Entry Contents (logstream)

wy.defineWidget({
  name: "logdetails-wild",
  constraint: {
    type: "logdetail",
    obj: { type: wy.WILD },
  },
  structure: {
    table: wy.libWidget({
        type: "objdict",
        valueConstraint: {type: "logdetail"},
      }, wy.SELF),
  },
});


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
  name: "log-array",
  constraint: {
    type: "logstream",
    obj: { type: "array" },
  },
  structure: wy.stream({type: "logstream"}, "items"),
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
  structure: wy.bind("name"),
  impl: {
    SHOW_LOG_DETAIL: true,
  },
});

wy.defineWidget({
  name: "log-tabmail-tab",
  constraint: {
    type: "logstream",
    obj: { type: "tabmail-tab" },
  },
  structure: [
    wy.bind("typeName"), ":", wy.bind("modeName"), " ",
    wy.bind("title"),
  ],
  impl: {
    SHOW_LOG_DETAIL: true,
  },
});


wy.defineWidget({
  name: "log-domNode",
  constraint: {
    type: "logstream",
    obj: { type: "domNode" },
  },
  structure: wy.bind("name"),
  impl: {
    SHOW_LOG_DETAIL: true,
  },
});


/**
 * Take a potentialy stupidly long URL and inject ellipsis as reasonable.
 */
function elideUrl(url) {
  if (url.length < 40)
    return url;
  var protoIdx = url.indexOf("://");
  var lslash = url.lastIndexOf("/");
  if (lslash != -1)
    lslash = url.lastIndexOf("/", lslash - 1);
  if (lslash == -1)
    return url;
  return url.substring(0, protoIdx + 3) + "..." + url.substring(lslash);
}

wy.defineWidget({
  name: "log-domWindow",
  constraint: {
    type: "logstream",
    obj: { type: "domWindow" },
  },
  structure: wy.computed("label"),
  impl: {
    SHOW_LOG_DETAIL: true,
    label: function() {
      var obj = this.obj;
      if (obj.id == "n/a" && obj.title == "no document") {
        return "DomWindow:" + elideUrl(obj.location);
      }
      return "DomWindow: " + obj.id + ": " + obj.title;
    },
  },
});

wy.defineWidget({
  name: "error-details",
  constraint: {
    type: "logdetail",
    obj: { type: "error" },
  },
  structure: {
    stack: "",
  },
  impl: {
    postInit: function() {
      this.stack_element.textContent = this.obj.stack.join("\n");
    },
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
  },
  impl: {
    SHOW_LOG_DETAIL: true,
  },
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
  name: "log-failure",
  constraint: {
    type: "logstream",
    obj: { type: "failure" },
  },
  structure: {
    stack: wy.widget({type: "logstream"}, "stack"),
  },
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
