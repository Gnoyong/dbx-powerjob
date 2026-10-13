import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

// Exercise the real launcher while replacing process creation. An inherited
// unusable system Temp must never reach either Go or the DBX dev runtime.
const script = new URL("./dev.mjs", import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(script)), "..");
const source = readFileSync(script, "utf8")
  .replace(/^import .*;\r?\n/gm, "")
  .replaceAll("import.meta.url", JSON.stringify(script.href));
const expectedTemp = path.join(root, ".dbx-dev", "tmp");
let calls = 0;
function verify(env) {
  for (const key of ["TEMP", "TMP", "TMPDIR", "GOTMPDIR"]) {
    assert.equal(env[key], expectedTemp, `${key}: system Temp leaked into the build environment`);
  }
  assert.equal(env.GOCACHE, path.join(root, "backend", ".go-cache"));
  assert(existsSync(expectedTemp), "Go temp directory must exist before launching");
  assert.equal(env.UNRELATED_OPTION, "keep-me");
}
vm.runInNewContext(source, {
  path, delimiter: path.delimiter, fileURLToPath, existsSync, mkdirSync,
  process: {
    platform: "win32", execPath: process.execPath,
    env: { TEMP: "Z:/unwritable/system-temp", TMP: "Z:/unwritable/system-temp", TMPDIR: "Z:/unwritable/system-temp", GOTMPDIR: "Z:/unwritable/system-temp", GOCACHE: "Z:/unwritable/cache", UNRELATED_OPTION: "keep-me" },
    stderr: { write: message => { throw new Error(message); } },
    exit: code => { throw new Error(`Launcher exited ${code}`); },
  },
  spawnSync(command, args, options) { assert.equal(command, "go"); verify(options.env); calls++; return {status: 0}; },
  spawn(command, args, options) { assert(args.includes("dev")); verify(options.env); calls++; return {on() {}}; },
});
assert.equal(calls, 2);
console.log("Windows dev environment regression passed (Go probe and DBX runtime).");
