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

var wy = new $wmsy.WmsyDomain({id: "ui-pushes", domain: "arbpl"});

wy.defineWidget({
  name: "generic-push",
  constraint: {
    type: "push",
  },
  structure: {
    headingBox: {
      pushDate: wy.libWidget({type: "relative-date"}, ["push", "pushDate"]),
      pusher: wy.widget({type: "person"}, ["push", "pusher"]),
    },

    kids: {
      changesets: wy.vertList({type: "changeset"}, ["push", "changesets"]),
      subPushes: wy.vertList({type: "push"}, "subPushes"),
    }
  },
  style: {
    root: [
    ],
    headingBox: [
      "border-top: 1px solid #357fa5;",
      "background-color: #b9e4ff;",
      "margin-bottom: 0.3em;",
      "padding: 2px;",
    ],
    pushDate: [
      "display: inline-block;",
      "margin-right: 1em",
    ],

    kids: [
      "padding-left: 2em;",
    ],
    changesets: [
      "margin-bottom: 0.5em;",
    ],
  },
});

wy.defineWidget({
  name: "changeset",
  constraint: {
    type: "changeset",
  },
  structure: {
    // The revision does not seem tremendously useful until you want more
    //  information about the push or want to cite it to someone else, so
    //  let's forget about it for now.
    //shortRev: wy.bind("shortRev"),
    author: wy.widget({type: "person"}, "author"),
    desc: wy.bind("rawDesc"),
    summaryGroups: wy.vertList({type: "change-summary-group"},
                               ["changeSummary", "changeGroups"]),
  },
  style: {
    root: [
      "border-top: 1px solid #dddddd;",
      "background-color: #eeeeee;",
      "padding: 2px;",
      "margin-bottom: 1em;",
    ],
    author: [
      "width: 12em;",
    ],
    desc: [
      "font-weight: bolder;",
    ],
    summaryGroups: [
      "margin-top: 0.5em;",
    ],
  },
});

wy.defineWidget({
  name: "change-summary-group",
  constraint: {
    type: "change-summary-group",
  },
  structure: {
    summaryRow: wy.flow({
      name: wy.bind("name"),
      colonStr: ": ",
      fileTypes: "",
    }),
    // the file list should start out collapsed...
    fileList: wy.vertList({type: "changed-file"}, wy.NONE),
  },
  impl: {
    postInitUpdate: function() {
      this.collapsed = true;
      this.fileTypes_element.textContent = this.obj.fileTypes.join(", ");
    },
  },
  events: {
    root: {
      command: function() {
        this.collapsed = !this.collapsed;
        if (this.collapsed)
          this.fileList_set(null);
        else
          this.fileList_set(this.obj.files);
      },
    },
  },
  style: {
    root: [
      "display: block;",
      "cursor: default;",
    ],
    fileList: [
      "margin-left: 1em;",
    ],
  },
});

wy.defineWidget({
  name: "changed-file",
  constraint: {
    type: "changed-file",
  },
  structure: wy.bind(wy.SELF),
});


}); // end define
