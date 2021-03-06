({
  baseUrl: "./",
  optimize: "none",
  paths: {
    "text": "deps/requirejs/text",
    "d3": "deps/d3.min",
    "jsdiff": "deps/diff",
    "requireLib": "deps/requirejs/require",
    "socket.io/socket.io": "deps/fake-socket-io",
  },
      packages: [
        { name: "arbclient", location: "lib/arbclient" },
        { name: "arbcommon", location: "lib/arbcommon" },

        // jstut family
        { name: "jstut", location: "deps/jtstut/lib/jstut" },
        { name: "narscribblus", location: "deps/jstut/lib/narscribblus" },
        { name: "narscribblus-plat",
          location: "deps/jstut/lib-requirejs/narscribblus-plat" },
        { name: "wmsy", location: "deps/wmsy/lib/wmsy" },
      ],
  include: ["requireLib"],
  name: "arbclient/app-tb-mozmill",
  out: "standalone-tb-arbclient.js"
})
