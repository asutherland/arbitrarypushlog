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

wy.defineWidget({
  name: "log4moz-record",
  constraint: {
    type: "log4moz-record",
  },
  structure: wy.flow({
    logger: wy.bind("loggerName"),
    entries: wy.stream({type: "log-entry"}, "messageObjects"),
  }),
  style: {
    root: [
      "display: block;",
    ],
    logger: [
      "display: inline-block;",
      "width: 12em;",
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
  name: "log-test",
  constraint: {
    type: "log-entry",
    obj: { type: "subtest" },
  },
  structure: [wy.bind("type"), ": ", wy.bind("name"), " ", wy.bind("parameter")],
});


wy.defineWidget({
  name: "log-action",
  constraint: {
    type: "log-entry",
    obj: { type: "action" },
  },
  structure: {
  },
});

wy.defineWidget({
  name: "log-check",
  constraint: {
    type: "log-entry",
    obj: { type: "check" },
  },
  structure: {
  },
});

wy.defineWidget({
  name: "log-failure",
  constraint: {
    type: "log-entry",
    obj: { type: "failure" },
  },
  structure: {
  },
});



wy.defineWidget({
  name: "log-folder",
  constraint: {
    type: "log-entry",
    obj: { type: "folder" },
  },
  structure: {
  },
});

wy.defineWidget({
  name: "log-msgHdr",
  constraint: {
    type: "log-entry",
    obj: { type: "msgHdr" },
  },
  structure: {
  },
});

wy.defineWidget({
  name: "log-domNode",
  constraint: {
    type: "log-entry",
    obj: { type: "domNode" },
  },
  structure: {
  },
});

wy.defineWidget({
  name: "log-error",
  constraint: {
    type: "log-entry",
    obj: { type: "error" },
  },
  structure: {
  },
});

wy.defineWidget({
  name: "log-stackFrame",
  constraint: {
    type: "log-entry",
    obj: { type: "stackFrame" },
  },
  structure: {
  },
});

wy.defineWidget({
  name: "log-XPCOM",
  constraint: {
    type: "log-entry",
    obj: { type: "XPCOM" },
  },
  structure: {
  },
});

}); // end define
