Mozilla Tinderbox processor and UI.

## The Server:

- Pulls build info from tinderbox.mozilla.org in its JSON-ish format.
- Pulls push/revision info from hg.mozilla.org in its real JSON format.
- Parses xpcshell and mozmill build logs downloaded from tinderbox.mozilla.org.
- Is not Mozilla Pulse aware.
- Uses hbase for storage.


## The UI/client:

- Talks to the server.


## Client Deps:

- RequireJS: module loader
- wmsy: widgeting framework
- jstut: uh, reusing my visualizable promise work, documentation eventually.


## Server Deps:

- q, q-http: promises stuff
- carrier: simple line-reader stream filter
- express/connect: web serving framework, used very shallowly.
- thrift: for hbase talkin'
- compress: decompress, npm packageable one from git://github.com/sjmulder/node-compress.git
- nomnom: option parsing
