import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../frontend/host.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const hostApi = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
globalThis.window = {};

test("storage reads wait for host initialization and accept numeric JSON", async () => {
  let initialize;
  let calls = 0;
  window.dbxPlugin = {
    ready: new Promise(resolve => { initialize = resolve; }),
    capabilities: { storage: true },
    storage: { get: async key => { calls++; assert.equal(key, "width"); return 320; } },
  };
  const read = hostApi.readPanelSize("width", 240);
  await Promise.resolve();
  assert.equal(calls, 0);
  initialize();
  assert.equal(await read, 320);
});

test("missing capability never probes storage", async () => {
  window.dbxPlugin = { ready: Promise.resolve(), storage: {
    get: () => assert.fail("unsupported read"), set: () => assert.fail("unsupported write"),
  } };
  assert.equal(await hostApi.readPanelSize("width", 240), null);
  await hostApi.writePanelSize("width", 320);
});

test("invalid persisted values use the default", async () => {
  for (const value of [null, "", "320", {}, false, 0, 239, NaN, Infinity]) {
    window.dbxPlugin = { ready: Promise.resolve(), capabilities: { storage: true }, storage: { get: async () => value } };
    assert.equal(await hostApi.readPanelSize("width", 240), null);
  }
});

test("writes use JSON numbers and surface host failures", async () => {
  const calls = [];
  window.dbxPlugin = { ready: Promise.resolve(), capabilities: { storage: true }, storage: {
    set: async (...args) => { calls.push(args); }, get: async () => { throw new Error("read failed"); },
  } };
  await hostApi.writePanelSize("width", 320.7);
  assert.deepEqual(calls, [["width", 321]]);
  await assert.rejects(hostApi.readPanelSize("width", 240), /read failed/);
  window.dbxPlugin.storage.set = async () => { throw new Error("write failed"); };
  await assert.rejects(hostApi.writePanelSize("width", 320), /write failed/);
});

test("application selection uses connection-scoped host JSON storage", async () => {
  const calls = [];
  window.dbxPlugin = { ready: Promise.resolve(), capabilities: { storage: true }, storage: {
    get: async key => {
      calls.push(["get", key]);
      return { appId: "42", pageIndex: 3 };
    },
    set: async (key, value) => { calls.push(["set", key, value]); },
  } };
  assert.deepEqual(await hostApi.readSavedApplication("connection-a"), { appId: "42", pageIndex: 3 });
  await hostApi.writeSavedApplication("connection-a", { appId: "43", pageIndex: 4 });
  assert.deepEqual(calls, [
    ["get", "local.powerjob.readonly.last-application:connection-a"],
    ["set", "local.powerjob.readonly.last-application:connection-a", { appId: "43", pageIndex: 4 }],
  ]);
});

test("application selection ignores malformed host data", async () => {
  for (const value of [null, "42", {}, { appId: "", pageIndex: 0 }, { appId: "42", pageIndex: -1 }, { appId: "42", pageIndex: 1.5 }]) {
    window.dbxPlugin = { ready: Promise.resolve(), capabilities: { storage: true }, storage: { get: async () => value } };
    assert.equal(await hostApi.readSavedApplication("connection-a"), null);
  }
});

test("sandbox UI uses no browser persistence and manifest grants host storage", () => {
  for (const file of ["App.tsx", "components/RunsPane.tsx"]) {
    assert.doesNotMatch(readFileSync(new URL(`../frontend/${file}`, import.meta.url), "utf8"), /localStorage|sessionStorage|indexedDB/);
  }
  const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
  assert.ok(manifest.permissions.includes("host.storage"));
});
