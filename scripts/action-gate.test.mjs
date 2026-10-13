import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../frontend/tasks/actionGate.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { createActionGate } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("two synchronous clicks start only one operation; completion permits retry", () => {
  const gate = createActionGate();
  gate.setScope("A");
  const first = gate.begin();
  assert(first);
  assert.equal(gate.begin(), null);
  assert.equal(gate.busy, true);
  assert.equal(gate.finish(first), true);
  assert.equal(gate.busy, false);
  assert(gate.begin());
});

test("switching A to B to A still rejects the original result", () => {
  const gate = createActionGate();
  gate.setScope("A");
  const first = gate.begin();
  gate.setScope("B");
  gate.setScope("A");
  assert.equal(gate.isCurrent(first), false);
});

test("an old finally cannot unlock a newer operation", () => {
  const gate = createActionGate();
  gate.setScope("A");
  const old = gate.begin();
  gate.setScope("B");
  const current = gate.begin();
  assert.equal(gate.finish(old), false);
  assert.equal(gate.busy, true);
  assert.equal(gate.begin(), null);
  assert.equal(gate.isCurrent(current), true);
  assert.equal(gate.finish(current), true);
});

test("unmount invalidates pending work and allows a fresh mount", () => {
  const gate = createActionGate();
  gate.setScope("A");
  const old = gate.begin();
  gate.invalidate();
  assert.equal(gate.isCurrent(old), false);
  assert.equal(gate.busy, false);
  assert(gate.begin());
});
