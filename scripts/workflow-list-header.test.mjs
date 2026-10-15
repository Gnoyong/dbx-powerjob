import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const workspace = readFileSync(new URL("../frontend/workflow/WorkflowWorkspace.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../frontend/style.css", import.meta.url), "utf8");

test("workflow list uses the jobs header structure and search action", () => {
  const list = workspace.slice(workspace.indexOf('<aside className="wf-list">'), workspace.indexOf('className="wf-list-rows"'));
  assert.match(list, /className="pane-bar"/);
  assert.match(list, /<strong>\{w\("workflows"\)\}<\/strong>/);
  assert.match(list, /className="search-form"\s+role="search"/);
  assert.match(list, /type="search"/);
  assert.match(list, /onClick=\{searchWorkflows\}/);
  assert.match(list, /onKeyDown=\{[^]*searchWorkflows\(\)/);
  assert.match(styles, /\.wf-list \{[^}]*width: 100%;/);
});
