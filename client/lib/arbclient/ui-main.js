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
 * Defines top-level app state ui binding (app lives in app-main); when things
 *  are "good", specific pages are displayed, which are defined in ui-page-*.js
 *  files.
 **/

define(
  [
    "wmsy/wmsy",
    "./ui-page-pushes",
    "./ui-pushes",
    "./ui-peeps",
    "./ui-page-testlog",
    "./ui-loghelper",
    "text!./ui-main.css",
    "exports"
  ],
  function(
    $wmsy,
    $ui_page_pushes,
    $ui_pushes,
    $ui_peeps,
    $ui_page_testlog,
    $ui_loghelper,
    $_css,
    exports
  ) {

var wy = new $wmsy.WmsyDomain({id: "ui-main", domain: "arbpl", css: $_css});

wy.defineWidget({
  name: "app-root",
  doc: "App Root Container; immediate child varies on high-level app state.",
  constraint: {
    type: "app-root",
  },
  provideContext: {
    tinderTree: "tinderTree",
  },
  focus: wy.focus.domain.vertical("state"),
  structure: {
    state: wy.widget({type: "app-state"}, wy.SELF),
  },
  impl: {
    postInit: function() {
      this.obj.binding = this;
    }
  },
  receive: {
    navigate: function(keyDeltas) {
      this.obj.navigate(keyDeltas);
    },
  },
});

wy.defineWidget({
  name: "state-picktree",
  doc: "Lists the trees you can look at, lets you pick one.",
  constraint: {
    type: "app-state",
    obj: {
      state: "picktree",
    },
  },
  focus: wy.focus.container.vertical("possibleTrees"),
  structure: {
    heading: "Pick a tree:",
    possibleTrees: wy.vertList({type: "pickable-tree"},
                               wy.dictAsList("possibleTrees")),
  },
  emit: ["navigate"],
  events: {
    possibleTrees: {
      command: function(pickedBinding) {
        this.emit_navigate({tree: pickedBinding.obj.name});
      },
    },
  },
});

wy.defineWidget({
  name: "pickable-tree",
  doc: "Represent a tree for pickin' purposes",
  constraint: {
    type: "pickable-tree",
  },
  focus: wy.focus.item,
  structure: {
    name: wy.bind("name"),
    url: wy.bind(["repos", 0, "url"]),
  },
});


wy.defineWidget({
  name: "state-connecting",
  doc: "The connecting splash screen.",
  constraint: {
    type: "app-state",
    obj: {
      state: "connecting",
    },
  },
  structure: {
    heading: "Connecting..."
  },
});

wy.defineWidget({
  name: "state-error",
  doc: "Error page for when things go massively wrong; like a dead server.",
  constraint: {
    type: "app-state",
    obj: {
      state: "error",
    },
  },
  structure: {
    heading: "Something is rotten in the state of this state machine.",
  },
});

wy.defineWidget({
  name: "state-good",
  doc: "Nominal operation state.",
  constraint: {
    type: "app-state",
    obj: {
      state: "good",
    },
  },
  structure: {
    header: {
      pathNodes: wy.horizList({type: "header-pathnode"}, ["page", "pathNodes"]),
    },
    page: wy.widget({type: "page"}, "page"),
  },
  events: {
    pathNodes: {
      command: function pathNodes_command() {

      },
    },
  },
});

wy.defineWidget({
  name: "pathnode-root",
  doc: "Root pathnode, shows ArbPL's name.",
  constraint: {
    type: "header-pathnode",
    obj: {type: "root"},
  },
  structure: {
    label: "ArbPL",
  },
});

wy.defineWidget({
  name: "pathnode-generic",
  doc: "Generic pathnode where the only desired behaviour is to be clicked.",
  constraint: {
    type: "header-pathnode",
    obj: {type: wy.WILD},
  },
  structure: {
    label: wy.bind("value"),
  },
});


exports.bindApp = function bindApp(appObj) {
  var emitter = wy.wrapElement(document.getElementById("body"));
  emitter.emit({type: "app-root", obj: appObj});
};

}); // end define
