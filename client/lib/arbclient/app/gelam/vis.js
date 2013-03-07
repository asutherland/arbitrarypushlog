/**
 *
 **/

define(
  [
    'arbclient/vis-modeler',
    'd3',
    'exports'
  ],
  function(
    $vism,
    _d3isnotrequirejsaware,
    exports
  ) {

function renderSync() {
}

exports.prepareVisContext = function prepareVisContext(model, ctx, vctx) {
  var SYNC_EVENT_WIDTH = 400,
      SYNC_EVENT_HEIGHT = 60;
  var MESSAGE_TIMELINE_WIDTH = 300, MESSAGE_TIMELINE_X_OFF = 80,
      MESSAGE_TIMELINE_BASE_Y = 50;

  var messageScale = d3.scale.linear()
        .domain(ctx.messageLine.start, ctx.messageLine.end)
        .range(0, MESSAGE_TIMELINE_WIDTH);

  var makeSyncScale = function(sync) {
    var scale = d3.time.scale.utc()
      .domain(sync.start, sync.end)
      .range(messageScale(sync.start), messageScale(sync.end));
    return scale;
  };

  vctx.syncEvent = function(sync, domNode) {
    var svg = d3.select(domNode).selectAll('svg')
      .enter().append('svg:svg')
        .attr('width', SYNC_EVENT_WIDTH)
        .attr('height', SYNC_EVENT_HEIGHT);

    // -- message timeline
    var msgTL = svg.append('svg:g')
      .attr('transform',
            'translate(' + MESSAGE_TIMELINE_X_OFF + ',' +
            MESSAGE_TIMELINE_BASE_Y + ')');

    // - sync timespan as axis
    var syncScale = makeSyncScale(sync);
    var msgAxis = d3.svg.axis()
      .scale(syncScale)
      .orient('bottom');
    msgTL.append('svg:g')
      .call(msgAxis);

    // - sync skewed timespan as overlay above axis


    // - events

  };
};

exports.renderEvent = function render(domNode, model, ctx, vctx, event) {
  vctx.syncEvent(event, domNode);
};

}); // end define
