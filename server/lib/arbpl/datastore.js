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
 * HBase interaction.
 *
 *
 **/

define(
  [
    "thrift", "hbase-thrift/Hbase", "hbase-thrift/Hbase_types",
    "q/util",
    "exports"
  ],
  function(
    $thrift, $thriftHbase, $baseTypes,
    $Q,
    exports
  ) {

var TABLE_PUSH_FOCUSED = "arbpl_pushy";

// mozilla-central is currently at ~20000
var BIG_PUSH_NUMBER = 9999999;
var PUSH_DIGIT_COUNT = 7;
var ZEROES = "0000000";

function transformPushId(pushId) {
  var nonpaddedString = (BIG_PUSH_NUMBER - pushId) + "";
  return ZEROES.substring(nonpaddedString.length) + nonpaddedString;
}

/**
 * Push-centric table representation.
 *
 * Key is [tree identifier, (BIG NUMBER - push number)].
 *
 * We use a BIG NUMBER less the push number because scans can only scan in a
 *  lexically increasing direction and we want our scans to always go backwards
 *  in time.  This enables us to easily find the most recent push by seeking to
 *  [tree identifier, all zeroes].
 *
 * Column family "s" is used for everything, and stands for summary.  It is
 *  further sub-divided like so:
 * - "r": Stores the push info and changeset information for this push for the
      root repo.
 * - "r:PUSHID": Stores the push and changeset information for sub-repo pushes.
 * - "b:(PUSHID:)BUILDID": Stores the build info scraped from the tinderbox
 *    without augmentation.  In the event of a complex tree (ex: comm-central)
 *    we include the push id of the sub-repo used to perform the build.  This
 *    information can change and be updated it the build status progresses or
 *    the note changes because of starring or what not.
 * - "l:(PUSHID:)BUILDID": Stores any information derived from processing the
 *    build log for information.
 */
var TDEF_PUSH_FOCUSED = {
  name: TABLE_PUSH_FOCUSED,
  columnFamilies: [
    new $baseTypes.ColumnDescriptor({
      name: "s",
      maxVersions: 1,
      compression: "RECORD",
      bloomFilterType: "ROW",
      blockCacheEnabled: 1,
    }),
  ]
};

/**
 * Map revisions to the push they correspond to.  We could alternatively require
 *  requesters to just bounce things off of the hg repo which has this mapping
 *  (at least until the try server repo gets nuked).
 */
var TDEF_REV_TO_PUSH = {
};

var SCHEMA_TABLES = [
  TDEF_PUSH_FOCUSED,
];

function HStore() {
  this.connection = $thrift.createConnection("localhost", 9090);
  this.client = $thrift.createClient($thriftHbase, this.connection);

  this.connection.on("connect", this._onConnect.bind(this));
  this.connection.on("error", this._errConnection.bind(this));

  this.state = "connecting";
  this._iNextTableSchema = 0;

  this._bootstrapDeferred = null;
}
HStore.prototype = {
  _onConnect: function() {
    this.state = "connected";
    this._ensureSchema();
  },
  _errConnection: function(err) {
    console.error(err);
  },

  _ensureSchema: function() {
    var schema = SCHEMA_TABLES[this._iNextTableSchema++];
    var self = this;
    client.createTable(
      schema.name,
      schema.columnFamilies,
      function(err) {
        // We don't care if there is an error right now; we are striving for
        //  idempotency and this gets us that.

        // If we are all done, resolve.
        if (self._iNextTableSchema >= SCHEMA_TABLES.length) {
          self._bootstrapDeferred.resolve();
          return;
        }

        self._ensureSchema();
      });
  },

  bootstrap: function() {
    this._bootstrapDeferred = Q.defer();
    return this._bootstrapDeferred.promise;
  },

  getMostRecentKnownPush: function(treeId) {
    var deferred = $Q.defer();
    var self = this;
    this.client.scannerOpen(
      TABLE_PUSH_RECORD, treeId + "," + ZEROES, ["s"],
      function(err, scannerId) {
        if (err) {
          console.error("Failed to get scanner for most recent on tree",
                        treeId);
          deferred.reject(err);
        }
        else {
          self.client.scannerGet(
            scannerId,
            function(err, rowResults) {
              self.client.scannerClose(scannerId);
              if (err)
                deferred.reject(err);
              else
                deferred.resolve(rowResults);
            });
        }
      });
    return deferred.promise;
  },

  getPushInfo: function(treeId, pushId) {
    var deferred = $Q.defer();
    this.client.get(
      TABLE_PUSH_RECORD, treeId + "," + transformPushId(pushId),
      function(err, rowResults) {
        if (err) {
          console.error("Unhappiness getting row: " +
                        treeId + "," + transformPushId(pushId));
          deferred.reject(err);
        }
        else {
          deferred.resolve(rowResults);
        }
      });
    return deferred.promise;
  },

  normalizeRowResults: function(rowResults) {
    var dbstate = {};
    for (var iRow = 0; iRow < rowResults.length; iRow++) {
      var rr = rowResults[iRow];

      var cols = rr.columns;
      for (var key in cols) {
        var value = cols[key].value; // also knows timestamp

        dbstate[key] = value;
      }
    }

    return dbstate;
  },

  putPushStuff: function(treeId, pushId, keysAndValues) {
    var deferred = $Q.defer();
    var mutations = [];
    for (var key in keysAndValues) {
      var value = keysAndValues[key];
      mutations.push(new $baseTypes.Mutation({
        column: key,
        value: value,
      }));
    }

    this.client.mutateRow(
      TABLE_PUSH_RECORD, treeId + "," + transformPushId(pushId),
      mutations,
      function(err) {
        if (err) {
          console.error("Problem saving row: " +
                        treeId + "," + transformPushId(pushId));
          deferred.reject(err);
        }
        else {
          deferred.resolve();
        }
      });
    return deferred.promise;
  },
};
exports.HStore = HStore;

}); // end define
