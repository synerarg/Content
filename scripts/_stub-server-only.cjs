/*
  Lets a probe script import modules that begin with `import "server-only"`.

  The real package exports nothing and exists purely to throw when it is pulled
  into a client bundle — which also means it throws under plain Node, where
  there is no bundler to satisfy it. Redirecting the specifier to an empty
  module makes `lib/**` importable from a script without weakening the guard in
  the app itself.

  Usage:
    npx tsx --require ./scripts/_stub-server-only.cjs scripts/yourprobe.ts
*/
const Module = require("node:module");
const path = require("node:path");

const EMPTY = path.join(__dirname, "_empty.cjs");
const original = Module._resolveFilename;

Module._resolveFilename = function (request, ...rest) {
  if (request === "server-only" || request === "client-only") return EMPTY;
  return original.call(this, request, ...rest);
};
