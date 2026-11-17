import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../frontend/browserShortcuts.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { preventBrowserShortcut } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);

function canceled(key, modifiers = {}) {
  let prevented = false;
  preventBrowserShortcut({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, getModifierState: () => false, ...modifiers, preventDefault() { prevented = true; } });
  return prevented;
}

test("blocks browser shortcut defaults while keeping ordinary input available", () => {
  for (const [key, modifiers] of [["r", { ctrlKey: true }], ["w", { metaKey: true }], ["ArrowLeft", { altKey: true }], ["F5", {}], ["F12", {}]]) {
    assert.equal(canceled(key, modifiers), true, key);
  }
  for (const key of ["a", "Tab", "Escape", "Control"]) assert.equal(canceled(key), false, key);
  assert.equal(canceled("f", { ctrlKey: true }), false);
  assert.equal(canceled("F", { ctrlKey: true, shiftKey: true }), true);
  assert.equal(canceled("@", { ctrlKey: true, altKey: true, getModifierState: (name) => name === "AltGraph" }), false);
});

test("page shortcut handlers run before browser defaults are canceled", async () => {
  const { installBrowserShortcutGuard } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
  const capture = [];
  const bubble = [];
  const target = {
    addEventListener(_type, listener, useCapture) { (useCapture ? capture : bubble).push(listener); },
    removeEventListener(_type, listener) { const index = bubble.indexOf(listener); if (index >= 0) bubble.splice(index, 1); },
  };
  installBrowserShortcutGuard(target);
  let customRan = false;
  bubble.push((event) => { assert.equal(event.defaultPrevented, false); customRan = true; });
  const event = { key: "r", ctrlKey: true, metaKey: false, altKey: false, defaultPrevented: false, getModifierState: () => false, preventDefault() { this.defaultPrevented = true; } };
  for (const handler of capture) handler(event);
  for (const handler of [...bubble]) handler(event);
  assert.equal(customRan, true);
  assert.equal(event.defaultPrevented, true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(bubble.length, 1);
});
