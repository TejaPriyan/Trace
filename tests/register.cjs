const Module = require("node:module");
const path = require("node:path");

const distSrc = path.resolve(__dirname, "..", ".test-dist", "src");
const stubPath = path.resolve(__dirname, "server-only-stub.cjs");
const origResolve = Module._resolveFilename;

Module._resolveFilename = function resolveWithAlias(request, parent, isMain, options) {
  if (request === "server-only") {
    return stubPath;
  }
  if (typeof request === "string" && request.startsWith("@/")) {
    const mapped = path.join(distSrc, request.slice(2));
    return origResolve.call(this, mapped, parent, isMain, options);
  }
  return origResolve.call(this, request, parent, isMain, options);
};
