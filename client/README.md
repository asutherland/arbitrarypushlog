What are all these awesome files?

- index.html: Full ArbPL UI for use in development-mode.  JS is not optimized,
  files are individual.
- index-optimized.html: Full ArbPL UI for use in production.  JS is optimized
  using "optibuild" script.
- index-standalone.html: Just the test results UI; loads its data from a JSON
  file in the same dir.  Only has the "production" form.  Uses the
 "standalonebuild" script to optimize its JS.
- index-tb-devmode.html: ArbPL test results UI that is hooked up to the mozmill
  log parsing logic.  Intended for hacking on ArbPL for Thunderbird's mozmill
  log use case.
- index-tb-standalone.html: (Production) ArbPL test results UI for TB that has
  mozmill log parsing logic.  Uses the "standalone-tb-build" script to optimize
  its JS.
- index-post-devmode.html: ArbPL test results UI that gets its data via
  postMessage from some other window in a time-sliced form that gets mildly
  processed to look like a unit test.  This is derived from deuxdrop's LogUI
  for providing real-time logs.
- index-postalone.html: The optimized production version of index-post-devmode
