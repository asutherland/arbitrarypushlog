Mozilla Tinderbox processor and UI.

## The Server:

- Pulls build info from tinderbox.mozilla.org in its JSON-ish format.
- Pulls push/revision info from hg.mozilla.org in its real JSON format.
- Parses xpcshell and mozmill build logs downloaded from tinderbox.mozilla.org.
- Is not Mozilla Pulse aware.
- Uses hbase for storage.


## The UI/client:

- Talks to the server.


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
- thrift: for hbase talkin'
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


## Server HBase Setup

If you don't have hbase already, you might want to consider using the cloudera
distribution.  Instructions on how to set things up using a package manager for
linux distros can be found here:
https://ccp.cloudera.com/display/CDHDOC/HBase+Installation

You will want to pay particular attention to the file limits stuff, don't skip
that.  You will want the hadoop-hbase-master configuration.  You will also want
hadoop-hbase-thrift.  You will want to start both and make sure that thrift
is operating in framed mode bound to your loopback address.  For me on Fedora,
I had to modify /etc/init.d/hadoop-hbase-thrift so that its start line looked
like this:

    su -s /bin/sh hbase -c "${DAEMON_SCRIPT} start thrift -f -b 127.0.0.1" 

Without that, it binds to the wrong address and does not operate in framed mode
and nothing works and it's all very sad.


There is an example hbase-site.xml file in server (example-hbase-site.xml)
which has some reasonable settings to use to make sure your hbase server does
not explode if you give it a small heap.  (Heap size is set in hbase-env.sh.)

You will strongly want to consider modifying hbase-env.sh to set the heap used
by Hbase.  arbpl.visophyte.org is currently using a 400m heap for the master
and 200m for the thrift daemon.  This is hackily accomplished by modifying
/usr/lib/hbase/bin/hbase to include the following block where it currently sets
JAVA_HEAP_MAX.

    # check envvars which might override default args
    if [ "$HBASE_HEAPSIZE" != "" ]; then
      #echo "run with heapsize $HBASE_HEAPSIZE"
      if [ "$COMMAND" != "thrift" ]; then
        JAVA_HEAP_MAX="-Xmx""$HBASE_HEAPSIZE""m"
      else
        JAVA_HEAP_MAX="-Xmx200m"
      fi
      #echo $JAVA_HEAP_MAX
    fi

