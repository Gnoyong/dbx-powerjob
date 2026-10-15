import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const files = [
  "NodeEditor.tsx",
  "WorkflowCanvas.tsx",
  "WorkflowEditor.tsx",
  "WorkflowInstances.tsx",
  "WorkflowWorkspace.tsx",
];

test("workflow notifications use toast while save recovery remains actionable", () => {
  for (const file of files) {
    const source = readFileSync(new URL(`../frontend/workflow/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /className="wf-feedback"|className="wf-save-status"|role="alert"|role="status"/, file);
  }
  const editor = readFileSync(new URL("../frontend/workflow/WorkflowEditor.tsx", import.meta.url), "utf8");
  assert.match(editor, /toast\.loading/);
  assert.match(editor, /toast\.success/);
  assert.match(editor, /setClearRecord\(true\)/);
  assert.match(editor, /resumeOperation/);
  assert.match(editor, /dismissible: !unresolved/);
  assert.match(editor, /event\.preventDefault\(\)/);
  assert.match(editor, /setOperation\(null\);\s*setRecoverToken\(""\);/);
  const canvas = readFileSync(new URL("../frontend/workflow/WorkflowCanvas.tsx", import.meta.url), "utf8");
  assert.match(canvas, /dismissible: false,/);
  assert.match(canvas, /event\.preventDefault\(\);\s*persist\(\);/);
});
