A log viewing UI with a pushlog UI that also hangs around.

ArbPL is four things, in decreasing order of importance/relevance:
- A log viewing UI for the Deuxdrop "loggest" logging / testing framework.
- A log viewing UI for Thunderbird's mozmill logging framework.
- A live-updating 'pushlog' interface that tracks new builds/test runs.  A lot
   of fanciness exists for dealing with complicated build setups like
   the comm-central and mozilla-central trees.
- A tinderbox scraper capable of dealing with the comm-central tree.

## The Largely Mooted Tinderbox Scraper Server:

- Pulls build info from tinderbox.mozilla.org in its JSON-ish format.
- Pulls push/revision info from hg.mozilla.org in its real JSON format.
- Parses xpcshell and mozmill build logs downloaded from tinderbox.mozilla.org.
- Is not Mozilla Pulse aware.


## The UI/client:

- Talks to the server.
- Can also operate in a standlone log viewer mode.


## Client Deps (Included):

All of these are present as git submodules, you need do nothing if you check us
out with "--recursive".  If you forgot to do that, do "git submodule init" then
"git submodule update".

- RequireJS: module loader.
- wmsy: widgeting framework.
- jstut: uh, reusing my visualizable promise work, documentation eventually.


## Server NPM Deps:

Just do "npm install" in server and the stuff should show up.  Read
package.json to know what shows up.

- q, q-http: promises stuff
- carrier: simple line-reader stream filter
- express/connect: web serving framework, used very shallowly.
- sqlite3: For database storage.  You might need to "npm install -g node-gyp"
  for this bit to install correctly.
- nomnom: option parsing
- socket.io: realtime updates

Note: we also locally have a git submodule for a modified version of the
compress module that actually works.  "npm install" will see it and do the
right thing (build it).


## Server Program Deps

If using the "loggest" processing functionality for deuxdrop, you need:

- graphviz: We use dot/neato/circo what not to perform some offline graph
   layout.  If you don't have this installed logalchew will apparently silently
   hang and then automatically kill itself based on a timeout.

## Server Optional Deps

For development:
- node-dev: Auto-restart helper; the webserve scripts use this if present on
   the path.

