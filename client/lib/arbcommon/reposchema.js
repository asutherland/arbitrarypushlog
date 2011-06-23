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
 * The Original Code is Mozilla Raindrop Code.
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
 *
 **/

define(
  [
    'exports'
  ],
  function(
    exports
  ) {

/**
 * There is but one bug-tracker, and all code repositories orbit around it.
 */
function BugTracker(name, desc, url, showBugUrl) {
  this.name = name;
  this.desc = desc;
  this.url = url;
  this._showBugUrl = showBugUrl;
}
BugTracker.prototype = {
  showUrlForBugId: function(bugId) {
    return this._showBugUrl + bugId;
  }
};
exports.BugTracker = BugTracker;

var MOZBUGZILLA = new BugTracker(
  "BMO", "bugzilla.mozilla.org", "https://bugzilla.mozilla.org",
  "https://bugzilla.mozilla.org/show_bug.cgi?id="
);

/**
 * @typedef[CodeRepoKind @oneof[
 *   @case["trunk"]{
 *     Active development branch; may be fed into by feature or team branches
 *     depending on usage.
 *   }
 *   @case["team"]{
 *     A branch which serves as a working area for a development team and is
 *     periodically merged into a trunk/release branch.  For example, the
 *     places or tracemonkey branches.
 *   }
 *   @case["feature"]{
 *     Development branch for a targeted feature (as opposed to a team) and
 *     tracks a trunk/release branch.
 *   }
 *   @case["try"]{
 *     A try-server branch with no meaningful chronology that generally
 *     tracks/forks off of a specific underlying branch, but could also
 *     periodically receive pushes relating to other branches that forked
 *     off of the nominal underlying branch at some point.
 *   }
 *   @case["release"]{
 *     A stabilized product release branch.
 *   }
 * ]]
 **/

/**
 * Specific mercurial code repository information.
 */
function CodeRepoDef(def) {
  this.name = def.name;
  this.url = def.url;
  this.kind = def.kind;
  this.relto = ("relto" in def) ? def.relto : null;
  this.path_mapping = def.path_mapping;
  this.dependent = def.dependent || false;
  this.family = def.family;
  this.bugTracker = MOZBUGZILLA;
}
CodeRepoDef.prototype = {
  toString: function() {
    return ["repo: " + this.name];
  },
  revDetailUrlForShortRev: function(shortRev) {
    return this.url + "rev/" + shortRev;
  },
};
exports.CodeRepoDef = CodeRepoDef;

/**
 * Build tree definition; consists of one or more code repositories
 *  associated with a specific product.
 *
 * @args[
 *   @param[def @dict[
 *     @key[id String]{
 *       The string to use for the tree in the hbase repo.  This should be short
 *       but human-understandable.
 *     }
 *     @key[name String]{
 *       The (build) tree name as known to tinderbox/jenkins etc.
 *     }
 *     @key[desc String]{
 *       The description string to show in the UI when elaborating on what this
 *       tree gets up to.
 *     }
 *     @key[product String]{
 *       An unused product identifier intended for UI grouping purposes.
 *     }
 *     @key[repos @listof[CodeRepoDef]]{
 *       A list of code repositories that make up a build.  Support for more
 *       than 1 is limited to moztinder-style builds.
 *     }
 *     @key[mount @dictof[
 *       @key[path String]{
 *         Mount path.
 *       }
 *       @value["repo" CodeRepoDef]{
 *         The repo mounted under that point.
 *       }
 *     ]]{
 *       Mount-points for sub-directories; specifically the directories into
 *       which they are checked out.  This was intended for being able to
 *       reverse file paths from build steps back to their proper repository
 *       and underlying file.  Not currently used, and probably best to be
 *       auto-deduced for for git repostories where .gitmodules is available.
 *     }
 *     @key[typeGroups]{
 *       Defines the columns and their groups for build matrix display.  For
 *       moztinder builds this also includes mapping data from generic builder
 *       types to the specific build/test type.
 *     }
 *   ]]
 * ]
 */
function BuildTreeDef(def) {
  this.id = def.id;
  this.name = def.name;
  this.desc = def.desc;
  this.product = def.product;
  this.repos = def.repos;
  this.mount = def.mount;
  this.failuresOnly = def.hasOwnProperty("failuresOnly") ?
                        def.failuresOnly : true;
  if (def.hasOwnProperty("typeGroups")) {
    this.typeGroupBundles = [
      {
        name: "all",
        platforms: {_: true},
        typeGroups: def.typeGroups
      }
    ];
  }
  else if (def.hasOwnProperty("typeGroupBundles")) {
    this.typeGroupBundles = def.typeGroupBundles;
  }
  else
    throw new Error("tinder tree def needs typeGroups or typeGroupBundles");
}
BuildTreeDef.prototype = {
  toString: function() {
    return "[tinderbox: " + this.id + "]";
  },
};
exports.BuildTreeDef = BuildTreeDef;

}); // end define
