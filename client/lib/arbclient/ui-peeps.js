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
    "wmsy/examples/md5",
    "./lstore",
    "text!./ui-peeps.css"
  ],
  function(
    $wmsy,
    $md5,
    $lstore,
    $_css
  ) {

var wy = new $wmsy.WmsyDomain({id: "ui-peeps", domain: "arbpl", css: $_css});

wy.defineWidget({
  name: "mozperson",
  constraint: {
    type: "person",
  },
  structure: wy.block({
    pic: wy.bindImage(wy.computed("gravatarUrl")),
    displayName: wy.bind("displayName"),
  }, {title: ["emails", 0]}),
  popups: {
    person: {
      constraint: {
        type: "person-details"
      },
      clickAway: true,
      popupWidget: wy.libWidget({type: "popup"}),
      position: {
        abovish: "root",
      },
      size: {
        maxWidth: 0.95,
        maxHeight: 0.95,
      }
    }
  },
  impl: {
    gravatarUrl: function() {
      return "http://www.gravatar.com/avatar/" +
               $md5.hex_md5(this.obj.emails[0]) +
               "?s=16&d=retro";
    },
  },
  events: {
    root: {
      click: function() {
        this.popup_person(this.obj, this);
      }
    },
  },
});

wy.defineWidget({
  name: "email-address",
  constraint: {
    type: "email-address",
  },
  structure: {
    address: wy.bind(wy.SELF),
  },
});

wy.defineWidget({
  name: "mozperson-details",
  constraint: {
    type: "person-details",
  },
  structure: {
    identBlock: {
      pic: wy.bindImage(wy.computed("gravatarUrl")),
      words: {
        displayName: wy.bind("displayName"),
        emails: wy.vertList({type: "email-address"}, "emails"),
      },
    },
    contextBlock: {
      contextHeaderLabel: "Context:",

      contextActions: {
        //recentBugzillaComments: wy.hyperlink("Bugs commented on..."),
        recentPushes: wy.hyperlink("recent pushed commits...",
                                   {href: wy.computed("linkCommitsThisTree")}),
      }
    },
  },
  impl: {
    gravatarUrl: function() {
      return "http://www.gravatar.com/avatar/" +
               $md5.hex_md5(this.obj.emails[0]) +
               "?s=64&d=retro";
    },
    linkCommitsThisTree: function() {
      this.__context.urlMaker({ pusher: this.obj.emails.join(",") });
    },
  },
});

}); // end define
