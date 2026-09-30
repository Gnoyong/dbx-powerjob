import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { toast } from "sonner";

globalThis.requestAnimationFrame = callback => setTimeout(() => callback(performance.now()), 0);
globalThis.cancelAnimationFrame = clearTimeout;

const source = readFileSync(new URL("../frontend/notifications.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
  .replace('from "sonner"', `from ${JSON.stringify(import.meta.resolve("sonner"))}`);
const { notifyAction } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const t = (key, vars) => `${key}${vars?.id ? `:${vars.id}` : ""}`;

test("loading, success and failure replace one notification and preserve error details", () => {
  notifyAction(t, "savingJob");
  let item = toast.getHistory().find(item => item.id === "powerjob-action");
  assert.equal(item.type, "loading");
  assert.equal(item.duration, Infinity);
  notifyAction(t, "jobUpdated");
  item = toast.getHistory().find(item => item.id === "powerjob-action");
  assert.equal(item.type, "success");
  assert.equal(item.duration, 4000);
  notifyAction(t, "jobUpdateFailed", "actionSessionExpired");
  item = toast.getHistory().find(item => item.id === "powerjob-action");
  assert.equal(item.type, "error");
  assert.equal(item.description, "actionSessionExpired");
  assert.equal(toast.getHistory().filter(item => item.id === "powerjob-action").length, 1);
});

test("run result retains the instance ID", () => {
  notifyAction(t, "jobRunRequested", null, { id: "9007199254740993" });
  const item = toast.getHistory().find(item => item.id === "powerjob-action");
  assert.equal(item.title, "jobRunRequested:9007199254740993");
});

test("context reset dismisses the previous action toast", () => {
  notifyAction(t, "savingJob");
  assert.ok(toast.getToasts().some(item => item.id === "powerjob-action"));
  notifyAction(t, null);
  assert.ok(!toast.getToasts().some(item => item.id === "powerjob-action"));
});
