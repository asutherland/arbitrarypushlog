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
    "text!./ui-page-pushes.css"
  ],
  function(
    $wmsy,
    $_css
  ) {

var wy = new $wmsy.WmsyDomain({id: "ui-page-pushes", domain: "arbpl",
                               css: $_css});

wy.defineWidget({
  name: "page-pushes",
  constraint: {
    type: "page",
    obj: { page: "pushes" },
  },
  focus: wy.focus.domain.vertical("pushes"),
  structure: {
    newer: wy.widget({type: "subscription", subtype: "newer"}, wy.SELF),
    pushes: wy.vertList({type: "push"}, "pushes"),
    older: wy.widget({type: "subscription", subtype: "older"}, wy.SELF),
  }
});

wy.defineWidget({
  name: "subscription-newer",
  constraint: {
    type: "subscription",
    subtype: "newer",
  },
  structure: wy.block({
    label: [wy.computed("connectionStatusLabel"),
            wy.computed("dataAccurateAsOfLabel"),
            wy.computed("subscriptionLabel")],
  }, {mode: "mode", connected: ["rstore", "_connected"]}),
  emit: ["subDelta"],
  receive: {
    connectionStateChanged: function() {
      this.update();
    },
    subModeChanged: function() {
      this.update();
    },
  },
  impl: {
    // XXX all of these should be localizable...
    connectionStatusLabel: function() {
      if (this.obj.rstore._connected)
        return "You are connected to the server. ";
      else
        return "You are NOT connected to the server. ";
    },
    dataAccurateAsOfLabel: function() {
      var accurateAsOfMillis = this.obj.rstore._accurateAsOfMillis;
      if (accurateAsOfMillis === null)
        return "Our data is BAD. ";
      return "Data is accurate as of " +
        (new Date(accurateAsOfMillis)).toTimeString().substring(0, 5) + ". ";
    },
    subscriptionLabel: function() {
      if (this.obj.rstore._subMode === "recent") {
        if (!this.obj.rstore._connected)
          return "NO new/updated pushes until we reconnect.";
        if (this.obj.rstore._modeAcked)
          return "New/updated pushes will show up automatically.";
        return "Negotiating with server about new pushes.";
      }
      else {
        return "Click to see Newer Pushes.";
      }
    },
  },
  events: {
    root: {
      click: function() {
        if (this.obj.mode !== "recent")
          this.emit_subDelta(1);
      },
    },
  }
});

wy.defineWidget({
  name: "subscription-older",
  constraint: {
    type: "subscription",
    subtype: "older",
  },
  structure: {
    label: "Older",
  },
  emit: ["subDelta"],
  events: {
    root: {
      click: function() {
        this.emit_subDelta(-1);
      },
    },
  }
});

}); // end define
