
require(
  {
    baseUrl: "../",
    packages: [
    ],
    paths: {
    },
  },
  ["thrift", "hbase-thrift/Hbase", "hbase-thrift/Hbase_types"],
  function($thrift, $thriftHbase, $baseTypes) {

var connection = $thrift.createConnection("localhost", 9090);
var client = $thrift.createClient($thriftHbase, connection);

connection.on("connect", function() {
  console.log("connected!");
});
connection.on("error", function(err) {
  console.error(err);
});

client.isTableEnabled("hello", function(error, response) {
  console.log("error", error, "response", response);
});

var helloColumnDefs = [
  new $baseTypes.ColumnDescriptor({
    name: "helloTo",
  }),
];

function makeTable() {
  client.createTable(
    "hello",
    helloColumnDefs,
    function(error) {
      console.log("table creation", error);
      addRow();
    }
  );
}

function addRow() {
  client.mutateRow(
    "hello",
    "bob",
    [
      new $baseTypes.Mutation({
        column: "helloTo:world",
        value: "yo!",
      }),
      new $baseTypes.Mutation({
        column: "helloTo:moon",
        value: "wassup?",
      }),
    ],
    function(error) {
      console.log("row updation", error);
      getRow();
    }
  );
}

function getRow() {
  client.getRow(
    "hello",
    "bob",
    function(error, rowResults) {
      console.log("getRow", error);
      if (rowResults)
        dumpRowResults(rowResults);
    }
  );
}

function dumpRowResults(rowResults) {
  for (var i = 0; i < rowResults.length; i++) {
    var rr = rowResults[i];
    console.log("row:", rr.row);
    var cols = rr.columns;
    for (var key in cols) {
      var cell = cols[key];
      console.log("  key:", key, "value", cell.value, "ts", cell.timestamp);
    }
  }
}

makeTable();

  }
);

