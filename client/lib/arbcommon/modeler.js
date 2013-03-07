/**
 * Simple modeling support for building summary data structures from processing
 * log entries that are intended to be visualized.  The goal is that the summary
 * structures will be fairly simple and can just reference existing loggest
 * entries and the like rather than building fancy representations.
 **/

define(
  [
    'exports'
  ],
  function(
    exports
  ) {

/**
 * Simple date-range tracking that expands the range based on the data that
 * passes through.  Alternatively, we could
 */
function Timeline(name) {
  this.name = name;
  this.start = -1;
  this.end = -1;
}
Timeline.prototype = {
  includeDate: function(date) {
    var start = this.start, end = this.end;
    if (start === -1)
      this.start = date;
    else if (date < start)
      this.start = date;
   if (end === -1)
     this.end = date;
   else if (date > end)
     this.end = date;
  },

  // return the dates as an array for ease of visualization
  datePoints: function() {
    return [this.start, this.end];
  },
};

exports.timeline = function makeTimeline(name) {
  return new Timeline(name);
};

exports.processPermWithModule = function processPermWithModule(perm, module) {
  var model = { events: [] };
  var ctx = {};
  module.prepareContext(ctx);

  var chewers = module.chewers;

  var rows = perm._perStepPerLoggerEntries;
  for (var iRow = 0; iRow < rows.length; iRow++) {
    var row = rows[iRow];
    for (var iCol = 0; iCol < row.length; iCol++) {
      var entries = row[iCol];
      if (!entries)
        continue;

      var logger = perm.loggers[iCol];
      for (var iEntry = 0; iEntry < entries.length; iEntry++) {
        var entry = entries[iEntry];

        var chewer = chewers[entry.name];
        if (!chewer)
          continue;
        chewer(model, ctx, logger, entry);
      }
    }
  }
  console.log('model', model, 'ctx', ctx);
};

}); // end define
