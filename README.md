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

All of these are present as git submodules, you need do nothing if you check us
out with "--recursive".  If you forgot to do that, do "git submodule init" then
"git submodule update".

- RequireJS: module loader.
- wmsy: widgeting framework.
- jstut: uh, reusing my visualizable promise work, documentation eventually.


## Server Deps:

You need to install these via npm; I probably need to make a useful
package.json...

- q, q-http: promises stuff
- carrier: simple line-reader stream filter
- express/connect: web serving framework, used very shallowly.
- thrift: for hbase talkin'
- nomnom: option parsing

The npm version is no good and so you need to git clone the below and then
install using npm somehow.  (I use "npm link".)

- compress: decompress, npm packageable one from git://github.com/sjmulder/node-compress.git

## Server Development Notes:

There appears to be a bug in connect where it serves an incorrect cache-control
header that is space delimited rather than comma delimited.  I saw a connect
rewrite going on, so I have not tried to upstream.  You may want to hack your
connect install in the event the caching screw-up is harshing your development.
