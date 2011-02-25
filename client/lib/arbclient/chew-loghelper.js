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
 * Process the logHelper.js formatted log records into a more usable
 *  representation.
 *
 * In a nutshell, logHelper.js tunnels a rich representation over a slightly
 *  upgraded but backwards compatible log4moz (in the vein of log4j).  This was
 *  primarily so that we could interoperate with more traditional log4moz
 *  consumers while also providing rich representations for UI, all the while
 *  still providing simple human readable text representations as a fallback.
 *  (Oh, and those log4moz consumers could also follow certain idioms to help
 *  out fancy UIs in terms of request tracking, etc.)  Because of these
 *  competing needs, the representation is something that benefits from
 *  additional processing (which we conveniently already wrote for logsploder.)
 *
 * The log4moz message representation is:
 * @typedef[Log4MozJsonMessage @dict[
 *   @key[level Number]{
 *     Log level.  logHelper uses 40 for everything.
 *   }
 *   @key[loggerName String]{
 *     The hierarchical logger name, ex: "foo.bar".
 *   }
 *   @key[time Number]{
 *     JS milliseconds date rep; new Date(message.time) to get a date.
 *   }
 *   @key[messageObjects @listof[Object]]{
 *     The message objects, which are probably strings or a full-out
 *     dictionary style object.
 *   }
 * ]]
 *
 * In the case of logHelper.js generated messages, the first entry will always
 *  be a context object.  They are pretty verbose and are always just about
 *  the currently executing test and its parent test file.
 *
 * @typedef[LoggerContext @dict[
 *   @key[_isContext true]{
 *     Indicates this is a context object and obeys the conventions defined
 *     here.
 *   }
 *   @key[type String]{
 *     The type of the context which defines the expectations of how the
 *     non-underscore prefixed attributes should be interpreted.  It's
 *     assumed people will avoid colliding with other types somehow.
 *   }
 *   @key[name String]{
 *     Human-readable name for this context, by convention.  In theory,
 *     this is left up to the discretion of the specific type.
 *   }
 *   @key[_contextDepth Number]{
 *     The number of ancestor contexts; zero for none.
 *   }
 *   @key[_contextParentId #:optional String]{
 *     The `_id` of the immediate parent context if `_contextDepth` is non-zero.
 *   }
 *   @key[_id String]{
 *     Opaque identifier for the context that will, by convention, be prefixed
 *     with the loggerName (and a colon) in order to provide namespacing
 *     to avoid collisions with other context allocators.
 *
 *     (The idea was that code might pass the context around to other subsystems
 *     to provide context, which is why we can't just implicitly namespace
 *     based on the logger the context is emitted by.)
 *   }
 *   @key[_state String]{
 *     Initially set to "start" by log4moz when the logger is created and set
 *     to "finished" when officially marked as finished.  The set of other
 *     acceptable values is defined by the type.
 *   }
 *   @key[_started Number]{
 *     Start timestamp of the context in JS millis.
 *   }
 *   @key[_lastStateChange Number]{
 *     Timestamp of the last state change for the context in JS millis.
 *   }
 * ]]{
 *   Log4Moz LoggerContext as used by logHelper.js.
 * }
 **/

define(
  [
    "exports"
  ],
  function(
    exports
  ) {

}); // end define
