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

wy.defineStyleBase("coolio-bars", [
  ".coolio-bar (@height: 16px) {",
  "  display: inline-block;",
  "  background-color: #e8e8e8;",
  "  margin-left: -4px;",
  "  margin-top: 8px;",
  "  margin-bottom: 2px;",
  "  padding-left: 4px;",
  "  padding-right: @height / 2 - 4;",
  "  height: @height;",
  "  vertical-align: middle;",
  "  border-top-right-radius: @height / 2;",
  "  border-bottom-right-radius: @height / 2;",
  "}",
]);

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

/**
 * Quantize to 100ms intervals as a pre-filter to the actual 200ms filter in
 *  the maker.
 */
var eventDelayInterposer = wy.defineInterposingViewSlice({
  classifier: function(logMessage) {
    return logMessage.time / 100;
  },
  maker: function(pre, post) {
    var delta = post.time - pre.time;
    if (delta < 200)
      return undefined;
    return {timeDelta: delta};
  },
  makeFirst: false,
  makeLast: false,
});

wy.defineWidget({
  name: "time-delta",
  constraint: {
    type: "interposed-delay",
  },
  structure: {
    delay: [wy.bind("timeDelta"), " ms"],
  },
  style: {
    root: [
      "text-align: center;",
      "color: gray;",
      "font-size: 80%;",
    ]
  }
});

wy.defineWidget({
  name: "build-test-failure",
  constraint: {
    type: "build-test-failure",
  },
  focus: wy.focus.domain.vertical("windows", "preEvents", "events"),
  structure: {
    testHeader: {
      testName: wy.bind("testName"),
      fileName: wy.bind("fileName"),
    },
    failureHeader: {
      failMessage: wy.bind(["exception", "message"]),
    },

    body: {
      windowsLabel: "Windows:",
      windows: wy.vertList({type: "window"},
                           ["failureContext", "windows", "windows"]),
      preEventsLabel: "Events just preceding the test:",
      preEvents: wy.vertList({type: "log4moz-record"},
                             ["failureContext", "preEvents"]),
      eventsLabel: "Events from the test:",
      events: wy.vertList(eventDelayInterposer(
                            {type: "interposed-delay"},
                            {type: "log4moz-record"}),
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
    testHeader: [
      "background-color: #eee;",
      "border-top-left-radius: 4px;",
      "border-top-right-radius: 4px;",
      "border-bottom: 1px solid #ccc;",
      "padding: 4px;",
    ],
    failureHeader: [
      "display: block;",
      "font-size: 150%;",
      "padding: 8px;",
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
    windowsLabel: ".coolio-bar;",
    windows: [
      "vertical-align: 50%;",
      "margin-left: 8px;",
    ],
    preEventsLabel: ".coolio-bar;",
    preEvents: [
      "margin-left: 4px;",
    ],
    "preEvents-item": [
      "border-bottom: 1px solid #eeeeee;",
      "margin-bottom: 1px;",
    ],
    eventsLabel: ".coolio-bar;",
    events: [
      "margin-left: 4px;",
    ],
    "events-item": [
      "border-bottom: 1px solid #eeeeee;",
      "margin-bottom: 1px;",
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
    focusedElem: ["Focused: ", wy.widget({type: "logstream"}, "focusedElem")],
  }, {active: "isActive"}),
  impl: {
    postInitUpdate: function() {
      if (!this.obj.focusedElem)
        return;

      var dims = this.obj.dims;
      var shotElem = this.screenshot_element;
      var focusElem = this.focusBox_element;
      var scale = 480 / dims.width;
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
    screenshot: [
      "width: 480px;",
    ],
    focusBox: {
      _: [
        "position: absolute;",
        "border: 2px dashed #34beda;",
        "background-color: rgba(52, 190, 218, 0.1);",
        "display: none;",
      ],
      ":hover": [
        "border: 2px solid #34beda;",
        "background-color: rgba(52, 190, 218, 0.3);",
      ],
    },
  },
});

}); // end define
