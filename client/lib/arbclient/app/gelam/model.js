/**
 * Convert GELAM log entries into a summary model.
 *
 * Coordinate spaces/timelines:
 * - Message timeline
 * - App usage timeline (inherent from log entries)
 *
 * Key summary types:
 * - Synchronizations (folder-centric): messages added, updated, removed.  Show
 *    skewed time-range.
 * - User operations: by operation type, affected messages. emergent folder-centric
 *    based on mutexed op.  Correlation is currently hard, so punt.
 **/

define(
  [
    'arbcommon/modeler',
    'exports'
  ],
  function(
    $m,
    exports
  ) {

function syncEventMapperMaker(type) {
  return function(model, ctx, logger, entry) {
    var folderId = logger.semanticIdent;
    var pendingSync = ctx.pendingSyncs[folderId];
    if (!pendingSync)
      return;

    var messageDate = entry.argsMap.date;
    ctx.messageLine.includeDate(messageDate);

    pendingSync.events.push({
      type: type,
      messageDate: messageDate,
      entry: entry,
      unique: entry.argsMap.srvid,
    });
  };
}

exports.prepareContext = function prepareContext(ctx) {
  ctx.messageLine = $m.timeline('messages');
  ctx.pendingSyncs = {};
};

var makeDeleteMarker = syncEventMapperMaker('delete');

exports.chewers = {
  //////////////////////////////////////////////////////////////////////////////
  // mailslice
  addMessageHeader: syncEventMapperMaker('add'),
  addMessageBody: null,

  updateMessageHeader: syncEventMapperMaker('change'),
  updateMessageBody: null,

  deleteFromBlock: function(model, ctx, logger, entry) {
    if (entry.argsMap.type === 'header')
      makeDeleteMarker(model, ctx, logger, entry);
  },

  //////////////////////////////////////////////////////////////////////////////
  // imap/folder

  syncDateRange: function(model, ctx, logger, entry) {
    var folderId = logger.semanticIdent, pendingSync;

    if (entry.type === 'async-begin') {
      var folderIdent = logger.semanticIdent;
      if (logger.actor && logger.actor.raw.semanticIdent)
        folderIdent = logger.actor.raw.semanticIdent;

      ctx.messageLine.includeDate(entry.argsMap.start);
      ctx.messageLine.includeDate(entry.argsMap.skewedStart);
      ctx.messageLine.includeDate(entry.argsMap.end);
      ctx.messageLine.includeDate(entry.argsMap.skewedEnd);

      pendingSync = ctx.pendingSyncs[folderId] = {
        type: 'sync',
        folderId: folderId,
        folderIdent: folderIdent,

        startEntry: entry,
        endEntry: entry,

        start: entry.argsMap.start,
        end: entry.argsMap.end,
        skewedStart: entry.argsMap.skewedStart,
        skewedEnd: entry.argsMap.skewedEnd,

        events: [],
      };
      model.events.push(pendingSync);
    }
    else {
      pendingSync = ctx.pendingSyncs[folderId];
      delete ctx.pendingSyncs[folderId];
      pendingSync.endEntry = entry;
    }
  },

  //////////////////////////////////////////////////////////////////////////////
};

}); // end define
