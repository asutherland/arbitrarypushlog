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
 * Repo/tree/product schema definitions and current hard-coded sets.
 *
 * By having the trees and repositories be hard-coded we're simplifying our
 *  lives as long as no one is using this code for a different set of
 *  repositories.  If the day comes (speak up if this affects you!), we would
 *  probably want to migrate the definitions into a separate git repo as
 *  distinct pure-data JSON files that the initial setup phase gets pointed at
 *  and tracks changes within.
 **/

define(
  [
    "./reposchema",
    "./mozrepos",
    "exports"
  ],
  function(
    $reposchema,
    $mozrepos,
    exports
  ) {

var CodeRepoDef = $reposchema.CodeRepoDef,
    BuildTreeDef = $reposchema.BuildTreeDef;

var DEUXDROP_MAPPING = {
  clients: "Clients",
  common: "Common",
  deploy: "Deployment",
  design: "Mockups",
  servers: "Server",
};


var THISFILE_REPOS = {

  //////////////////////////////////////////////////////////////////////////////
  // deuxdrop repos
  "deuxdrop": new CodeRepoDef({
    name: "deuxdrop",
    url: "git://github.com/mozilla/deuxdrop.git",
    kind: "trunk",
    path_mapping: DEUXDROP_MAPPING,
    family: "deuxdrop",
  }),

  //////////////////////////////////////////////////////////////////////////////
};

var REPOS = exports.REPOS = {};

var THISFILE_BUILD_TREES = {
  "Deuxdrop": new BuildTreeDef({
    id: "dd",
    name: "Deuxdrop",
    desc: "Deuxdrop effective trunk",
    product: "Deuxdrop",
    repos: [THISFILE_REPOS["deuxdrop"]],
    mount: {},
    typeGroups: [
      "loggest",
    ],
  }),
};

/**
 * Local-only trees
 */
var DUMMY_LOCAL_TREES = {
  Local: new BuildTreeDef({
    id: "local",
    name: "Local",
    desc: "Local logs you imported...",
    product: "Local",
    repos: [$mozrepos.REPOS["comm-central"]],
    mount: {},
    typeGroups: [
      "mozmill",
    ],
  }),
  Logal: new BuildTreeDef({
    id: "logal",
    name: "Logal",
    desc: "Local loggest logs you imported...",
    product: "Local",
    repos: [THISFILE_REPOS["deuxdrop"]],
    mount: {},
    typeGroups: [
      "loggest",
    ],
    failuresOnly: false,
  })
};

function mix(source, target) {
  for (var key in source) {
    target[key] = source[key];
  }
}
mix($mozrepos.REPOS, REPOS);
mix(THISFILE_REPOS, REPOS);

var PUBLISHED_TREES = exports.PUBLISHED_TREES = {};
mix($mozrepos.TINDER_TREES, PUBLISHED_TREES);
mix(THISFILE_BUILD_TREES, PUBLISHED_TREES);

exports.safeGetTreeByName = function safeGetTreeByName(treeName) {
  if (PUBLISHED_TREES.hasOwnProperty(treeName)) {
    return PUBLISHED_TREES[treeName];
  }
  if (DUMMY_LOCAL_TREES.hasOwnProperty(treeName)) {
    return DUMMY_LOCAL_TREES[treeName];
  }
  return null;
};

}); // end define
