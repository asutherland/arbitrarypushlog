({
  baseUrl: "./",
  optimize: "none",
  packages: [
    { name: "arbclient", location: ".", lib: "lib/arbclient" },
    { name: "arbcommon", location: ".", lib: "lib/arbcommon" },
    // jstut family
    { name: "jstut", location: "deps/jtstut",
      lib: "lib/jstut" },
    { name: "narscribblus", location: "deps/jstut",
      lib: "lib/narscribblus" },
    { name: "narscribblus-plat", location: "deps/jstut",
      lib: "lib-requirejs/narscribblus-plat" },
    { name: "wmsy", location: "deps/wmsy", lib: "lib/wmsy" },
  ],
  name: "arbclient/app-main",
  out: "built-arbclient.js"
})
