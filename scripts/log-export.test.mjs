import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const code = ts.transpile(readFileSync(new URL("../frontend/host.ts", import.meta.url), "utf8"), { module: ts.ModuleKind.CommonJS });
const api = {};
new Function("exports", code)(api);

function mock(overrides = {}) {
  const calls = [], chunks = [];
  const transfer = {
    async beginSave(options) { calls.push(["begin", options]); return { handleId: "file-1", chunkBytes: 7 }; },
    async write(handle, offset, data) { calls.push(["write", handle, offset]); chunks.push(data.slice()); return { written: data.length, nextOffset: offset + data.length }; },
    async finish(handle) { calls.push(["finish", handle]); },
    async cancel(handle) { calls.push(["cancel", handle]); },
    ...overrides,
  };
  globalThis.window = { dbxPlugin: { ready: Promise.resolve(), capabilities: { fileTransfer: { beginSave: true } }, fileTransfer: transfer } };
  return { calls, chunks, transfer };
}

test("log export uses host save dialog and byte offsets, preserving UTF-8", async () => {
  const { calls, chunks } = mock();
  const content = "第一页：中文😀\r\nsecond page\n";
  assert.equal(await api.saveLogFile(content, "9007199254740993"), true);
  assert.deepEqual(calls[0], ["begin", { name: "powerjob-instance-9007199254740993.log", contentType: "text/plain;charset=utf-8", size: new TextEncoder().encode(content).length }]);
  assert.equal(Buffer.concat(chunks).toString("utf8"), content);
  assert.deepEqual(calls.at(-1), ["finish", "file-1"]);
  assert(!calls.some(c => c[0] === "cancel"));
  assert.deepEqual(calls.filter(c => c[0] === "write").map(c => c[2]), chunks.map((_, i) => i * 7));
});

test("canceling the save dialog writes nothing", async () => {
  const { calls } = mock({ async beginSave() { return null; } });
  assert.equal(await api.saveLogFile("log", "7"), false);
  assert.deepEqual(calls, []);
});

test("unsupported hosts are rejected before opening a dialog", async () => {
  const { calls } = mock();
  delete window.dbxPlugin.capabilities.fileTransfer;
  await assert.rejects(() => api.saveLogFile("log", "7"), /file transfer unavailable/i);
  assert.deepEqual(calls, []);
});

test("write/finish errors and invalid acknowledgements cancel the handle", async () => {
  for (const overrides of [
    { async write() { throw Error("disk write failed"); } },
    { async write() { return { written: 0, nextOffset: 0 }; } },
    { async finish() { throw Error("flush failed"); } },
    { async beginSave() { return { handleId: "file-1", chunkBytes: 0 }; } },
  ]) {
    const { calls } = mock(overrides);
    await assert.rejects(() => api.saveLogFile("log", "7"));
    assert.deepEqual(calls.at(-1), ["cancel", "file-1"]);
  }
});

test("context cancellation after the dialog or a write discards unfinished files", async () => {
  for (const at of ["begin", "write"]) {
    const controller = new AbortController();
    const { calls, transfer } = mock();
    const method = at === "begin" ? "beginSave" : "write";
    const original = transfer[method];
    transfer[method] = async (...args) => { const result = await original(...args); controller.abort(); return result; };
    await assert.rejects(() => api.saveLogFile("long log content", "7", controller.signal), { name: "AbortError" });
    assert(!calls.some(c => c[0] === "finish"));
    assert.deepEqual(calls.at(-1), ["cancel", "file-1"]);
  }
});

test("empty logs still finish a zero-byte file and the viewer avoids browser downloads", async () => {
  const { calls } = mock();
  assert.equal(await api.saveLogFile("", "7"), true);
  assert(!calls.some(c => c[0] === "write"));
  assert.deepEqual(calls.at(-1), ["finish", "file-1"]);
  const viewer = readFileSync(new URL("../frontend/components/LogViewer.tsx", import.meta.url), "utf8");
  assert(!/createObjectURL|createElement\("a"\)/.test(viewer));
  assert.match(viewer, /await saveLogFile/);
});
