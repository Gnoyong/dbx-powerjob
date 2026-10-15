import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const toolbar = readFileSync(new URL("../frontend/components/Toolbar.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../frontend/App.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../frontend/workflow/WorkflowWorkspace.tsx", import.meta.url), "utf8");

test("workflow creation and refresh live in the top toolbar and retain guarded actions", () => {
  assert.match(toolbar, /onClick=\{workflowControls\.onCreate\}/);
  assert.match(toolbar, /onClick=\{workflowControls\.onRefresh\}/);
  assert.match(app, /registerActions=\{registerWorkflowActions\}/);
  assert.match(app, /workflowActions\?\.connectionId === connectionId/);
  assert.match(app, /workflowActions\.appId === appId/);
  assert.match(workspace, /registerActions\(\{/);
  assert.match(workspace, /create: createWorkflow/);
  assert.match(workspace, /refresh: refreshWorkflow/);
  assert.match(workspace, /navigate\(\(\) => \{\s*setTab\("definitions"\)/);
  assert.doesNotMatch(workspace.slice(workspace.indexOf('<aside className="wf-list">'), workspace.indexOf('className="wf-list-rows"')), /w\("newWorkflow"\)|w\("refresh"\)/);
});
