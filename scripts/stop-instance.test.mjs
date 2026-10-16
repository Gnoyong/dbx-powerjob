import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
test("stop is offered only for running task instances in either list type", () => {
  const source = ts.transpile(read("frontend/format.ts"), { module: ts.ModuleKind.CommonJS });
  const exports = {};
  new Function("exports", "require", source)(exports, () => ({}));
  for (const type of ["NORMAL", "WORKFLOW"]) {
    for (const status of [3, "3", "RUNNING", "running"]) assert.equal(exports.isRunningInstance(status, type), true);
    for (const status of [1, 2, 4, 5, 9, 10, "WAITING_DISPATCH", "FAILED", "SUCCEED", "STOPPED", undefined])
      assert.equal(exports.isRunningInstance(status, type), false);
  }
  const pane = read("frontend/components/RunsPane.tsx");
  assert.match(pane, /isRunningInstance\(instance.status, filterType\) &&/);
  assert.match(pane, /event.stopPropagation\(\);\s*onStopInstance\(instance\)/);
  const workspace = read("frontend/tasks/TaskWorkspace.tsx");
  assert.match(workspace, /onStopInstance=\{requestStopInstance\}/);
  assert.match(workspace, /actions.stop\(jobId, instance.instanceId, type\)/);
  assert.match(read("frontend/tasks/useJobActions.ts"), /"powerjob\/stopInstance"/);
  assert.match(read("backend/main.go"), /case [^\n]*"powerjob\/stopInstance"/);
});
