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
    "text!./ui-page-testlog.css"
  ],
  function(
    $wmsy,
    $_css
  ) {

var wy = new $wmsy.WmsyDomain({id: "ui-page-testlog", domain: "arbpl",
                               css: $_css});

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

wy.defineWidget({
  name: "page-testlog-no-failures",
  constraint: {
    type: "page",
    obj: { page: "testlog",
           failures: {length: 0 }},
  },
  structure: {
    noFailuresLabel: "No Failures!",
  },
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
});

wy.defineWidget({
  name: "build-test-failure-loggest",
  constraint: {
    type: "build-test-failure",
    obj: { type: "loggest" },
  },
  focus: wy.focus.container.vertical("permutations"),
  structure: {
    testHeader: {
      testName: wy.bind("testName"),
      fileName: wy.bind("fileName"),
    },
    permutations: wy.vertList({type: "loggest-test-perm"}, "permutations"),
  },
});

wy.defineWidget({
  name: "build-test-failure-xpcshell",
  constraint: {
    type: "build-test-failure",
    obj: { type: "xpcshell" },
  },
  structure: {
    detLogGroup: {
      detLogLabel: '"Deterministic Log"',
      detLog: "",
    },
    rawLogGroup: {
      rawLogLabel: "Raw Log",
      rawLog: "",
    },
  },
  impl: {
    postInit: function() {
      this.detLog_element.textContent = this.obj.deterministicLog.join("\n");
      this.rawLog_element.textContent = this.obj.rawLog.join("\n");
    }
  },
});

wy.defineWidget({
  name: "build-test-failure-mochitest",
  constraint: {
    type: "build-test-failure",
    obj: { type: "mochitest" },
  },
  structure: {
    screenshotGroup: {
      screenshotLabel: "Screenshot",
      screenshot: wy.bindImage(wy.NONE),
    },
    rawLogGroup: {
      rawLogLabel: "Raw Log",
      rawLog: "",
    },
  },
  impl: {
    postInit: function() {
      this.rawLog_element.textContent = this.obj.rawLog.join("\n");
      this.screenshotGroup_element.setAttribute(
        "hasScreenshot", this.obj.screenshotDataUrl != null);
      if (this.obj.screenshotDataUrl)
        this.screenshot_element.setAttribute("src", this.obj.screenshotDataUrl);
    }
  },
});


wy.defineWidget({
  name: "build-test-failure-mozmill",
  constraint: {
    type: "build-test-failure",
    obj: { type: "mozmill" },
  },
  focus: wy.focus.domain.vertical("windows", "preEvents", "events"),
  popups: {
    details: {
      constraint: {
        type: "logdetail"
      },
      clickAway: true,
      popupWidget: wy.libWidget({type: "popup"}),
      position: {
        above: "root",
      }
    }
  },
  structure: {
    testHeader: {
      testName: wy.bind("testName"),
      fileName: wy.bind("fileName"),
    },
    failureHeader: {
      failMessage: wy.bind(["exception", "message"]),
    },
    body: {
      stackLabel: "Stack:",
      stack: wy.widget({type: "SpiderStack"}, ["exception", "stackFrames"]),
      windowsLabel: "Windows:",
      windows: wy.vertList({type: "window"},
                           ["failureContext", "windows", "windows"]),
      eventsLabel: "Events from the test:",
      events: wy.vertList(eventDelayInterposer(
                            {type: "interposed-delay"},
                            {type: "log4moz-record"}),
                          ["failureContext", "events"]),
      preEventsLabel: "Events preceding the test:",
      preEvents: wy.vertList(eventDelayInterposer(
                               {type: "interposed-delay"},
                               {type: "log4moz-record"}),
                             ["failureContext", "preEvents"]),
    },
  },
  impl: {
    /**
     * Rather than have every log atom be able to trigger a popup or require
     *  them to emit something on click, we just provide our own click handler
     *  that checks if the bindings want to have their data shown in a pop-up
     *  (which is generically parameterized anyways).
     */
    maybeShowLogDetailForBinding: function(binding) {
      if ("SHOW_LOG_DETAIL" in binding && binding.SHOW_LOG_DETAIL) {
        this.popup_details(binding.obj, binding);
      }
    },
  },
  events: {
    body: {
      click: function(binding) {
        this.maybeShowLogDetailForBinding(binding);
      }
    },
  },
});


wy.defineWidget({
  name: "SpiderStackFrame",
  constraint: {
    type: "SpiderStackFrame",
  },
  structure: {
    scriptName: wy.bind("fileName"),
    scriptLine: ["line ", wy.bind("lineNumber")],
    functionName: wy.bind("func"),
  },
});

wy.defineWidget({
  name: "SpiderStack",
  constraint: {
    type: "SpiderStack",
  },
  structure: {
    frames: wy.vertList({type: "SpiderStackFrame"}, wy.SELF),
  },
});

wy.defineWidget({
  name: "SpiderStack",
  constraint: {
    type: "SpiderStack",
    obj: null,
  },
  structure: {
    message: "No JS stack available.",
  },
});

wy.defineWidget({
  name: "screenshot",
  constraint: {
    type: "screenshot",
  },
  structure: {
    screenshot: wy.bindImage("screenshotDataUrl"),
  },
  events: {
    root: {
      click: function() {
        // trigger the closure of the popup when clicked
        this.done();
      }
    }
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
    openPopups: ["Open Popups: ", wy.stream({type: "logstream"}, "openPopups")],
  }, {active: "isActive"}),
  popups: {
    screenshot: {
      constraint: {
        type: "screenshot"
      },
      clickAway: true,
      popupWidget: wy.libWidget({type: "popup"}),
      position: {
        centerOn: "screenshot",
      },
      size: {
        maxWidth: 0.95,
        maxHeight: 0.95,
      }
    }
  },
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
  events: {
    screenshotContainer: {
      click: function() {
        this.popup_screenshot(this.obj, this);
      },
    },
  },
});

}); // end define
