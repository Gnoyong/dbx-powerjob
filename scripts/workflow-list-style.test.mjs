import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(
  new URL("../frontend/workflow/WorkflowWorkspace.tsx", import.meta.url),
  "utf8",
);

test("workflow rows share the jobs list layout and selection semantics", () => {
  assert.match(source, /className="job-item-wrap"/);
  assert.match(source, /className="job-item"/);
  assert.match(source, /aria-pressed=\{selected === row\.id\}/);
  assert.match(source, /className="job-main"/);
  assert.match(source, /className="job-name"/);
  assert.match(source, /className="job-id"/);
  assert.match(source, /className="job-meta"/);
  assert.match(source, /className=\{`job-enable-status job-enable-status--/);
});
