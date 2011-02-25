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

define(
  [
    "wmsy/wmsy",
  ],
  function(
    $wmsy
  ) {

var wy = new $wmsy.WmsyDomain({id: "ui-page-testlog", domain: "arbpl"});

wy.defineWidget({
  name: "page-testlog",
  constraint: {
    type: "page",
    obj: { page: "testlog" },
  },
  focus: wy.focus.domain.vertical("failures"),
  structure: {
    failures: wy.vertList({type: "build-test-failure"}, "failures"),
  }
});

wy.defineWidget({
  name: "build-test-failure",
  constraint: {
    type: "build-test-failure",
  },
  focus: wy.focus.domain.vertical("windows", "preEvents", "events"),
  structure: {
    header: {
      testName: wy.bind("testName"),
      fileName: wy.bind("fileName"),
    },
    body: {
      windowsLabel: "Windows:",
      windows: wy.vertList({type: "window"},
                           ["failureContext", "windows", "windows"]),
      preEventsLabel: "Events preceding the test:",
      preEvents: wy.vertList({type: "log4moz-record"},
                             ["failureContext", "preEvents"]),
      eventsLabel: "Events from the test:",
      events: wy.vertList({type: "log4moz-record"},
                          ["failureContext", "events"]),
    },
  },
  style: {
    root: [
      "border-radius: 4px;",
      "border: 2px solid black;",
      "background-color: white;",
      "margin-bottom: 16px;",
    ],
    header: [
      "background-color: #eee;",
      "border-top-left-radius: 4px;",
      "border-top-right-radius: 4px;",
      "border-bottom: 1px solid #ccc;",
      "padding: 4px;",
    ],
    testName: [
      "display: inline-block;",
      "font-size: 150%;",
      "margin-right: 1em;",
    ],
    fileName: [
      "display: inline-block;",
      "font-size: 125%;",
    ],
    body: [
      "padding: 4px;",
    ],
    windows: [
      "vertical-align: 50%;",
      "margin-left: 8px;",
    ],
  },
});


wy.defineWidget({
  name: "window",
  constraint: {
    type: "window",
  },
  structure: wy.block({
    header: {
      id: wy.bind("id"),
      title: wy.bind("title"),
    },
    screenshotContainer: {
      screenshot: wy.bindImage("screenshotDataUrl"),
      focusBox: {},
    },
    focusedElem: wy.widget({type: "log-entry"}, "focusedElem"),
  }, {active: "isActive"}),
  impl: {
    postInitUpdate: function() {
      if (!this.obj.focusedElem)
        return;

      var dims = this.obj.dims;
      var shotElem = this.screenshot_element;
      var focusElem = this.focusBox_element;
      var scale = 480 / dims.width;
      console.log(scale, shotElem.clientWidth, dims.width);
      var focusBounds = this.obj.focusedElem.boundingClientRect;

      focusElem.setAttribute("style",
        "display: block; " +
        "top: " + Math.floor(scale * focusBounds.top - 1) + "px; " +
        "left: " + Math.floor(scale * focusBounds.left - 1) + "px; " +
        "height: " + Math.floor(scale * focusBounds.height) + "px; " +
        "width: " + Math.floor(scale * focusBounds.width) + "px;");
    },
  },
  style: {
    root: {
      _: [
        "display: inline-block;",
        "border: 1px solid black;",
        "border-radius: 2px;",
        "margin-right: 8px;",
      ],
      '[active="true"]': {
        _: [
        ],
        header: {
          id: [
            "font-weight: bold;",
            "background-color: #34beda;",
          ],
        }
      },
    },
    header: [
      "margin-bottom: 2px;",
    ],
    id: [
      "display: inline-block;",
      "padding: 2px;",
      "border-right: 1px solid black;",
      "border-bottom: 1px solid black;",
      "border-bottom-right-radius: 2px;",
      "margin-right: 0.5em;",
    ],
    title: [
      "display: inline-block;",
      "font-size: 75%;",
    ],
    screenshotContainer: [
      "position: relative;",
    ],
    screenshot: {
      _: [
        //"image-fit: fill;",
        "width: 480px;",
      ],
      ':not(mode="full")': [
      ],
    },
    focusBox: {
      _: [
        "position: absolute;",
        "border: 2px dashed #34beda;",
        "background-color: rgba(52, 190, 218, 0.1);",
        "display: none;",
      ],
      ":hover": [
        "border: 2px solid 34beda;",
        "background-color: rgba(52, 190, 218, 0.3);",
      ],
    },
  },
});

}); // end define
