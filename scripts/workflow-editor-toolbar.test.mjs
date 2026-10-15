import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(
  new URL("../frontend/workflow/WorkflowEditor.tsx", import.meta.url),
  "utf8",
);

test("editing controls precede the definition section and stay outside the canvas toolbar", () => {
  const editor = source.slice(source.indexOf("  return (\n    <div className=\"wf-editor\">"));
  const actions = editor.indexOf('className="wf-editor-toolbar"');
  const definition = editor.indexOf('className="wf-definition-config"');
  const canvas = editor.indexOf("<WorkflowCanvas");
  assert.ok(actions > 0 && actions < definition);
  assert.ok(definition < canvas);
  assert.ok(!editor.slice(canvas).includes('className="wf-editor-toolbar"'));
});
