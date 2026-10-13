import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = readFileSync(
  new URL("../frontend/workflow/model.ts", import.meta.url),
  "utf8",
);
const code = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const {
  definitionDraft,
  draftErrors,
  hasCycle,
  canMarkSuccess,
  draftSignature,
} = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);
const d = definitionDraft();
d.config.wfName = "Test";
d.nodes = [
  {
    key: "a",
    nodeType: 1,
    jobId: "981844507211334656",
    nodeName: "A",
    nodeParams: "{}",
    enable: true,
    skipWhenFailed: false,
  },
];
assert.deepEqual(draftErrors(d), []);
const signature = draftSignature(d);
d.nodes[0].position = { x: 20, y: 40 };
assert.equal(
  draftSignature(d),
  signature,
  "layout must not dirty business configuration",
);
assert.equal(
  hasCycle(
    ["a", "b"],
    [
      { from: "a", to: "b" },
      { from: "b", to: "a" },
    ],
  ),
  true,
);
d.nodes.push({
  key: "decision",
  nodeType: 2,
  nodeName: "D",
  nodeParams: "return true",
  enable: true,
  skipWhenFailed: false,
});
assert(draftErrors(d).includes("decisionExits"));
d.nodes.push({ ...d.nodes[0], key: "b" });
d.edges = [
  { from: "decision", to: "a", property: "true" },
  { from: "decision", to: "b", property: "false" },
];
assert.deepEqual(draftErrors(d), []);
assert.equal(
  canMarkSuccess(
    { status: 3 },
    { status: 4, instanceId: "981844507211334656", skipWhenFailed: false },
  ),
  true,
);
assert.equal(
  canMarkSuccess(
    { status: 2 },
    { status: 4, instanceId: "1", skipWhenFailed: false },
  ),
  false,
);
assert.equal(
  canMarkSuccess(
    { status: 3 },
    { status: 4, instanceId: "1", skipWhenFailed: true },
  ),
  false,
);
// Sandbox contract: buttons always use direct click handlers and cannot submit forms.
for (const file of [
  "WorkflowEditor.tsx",
  "NodeEditor.tsx",
  "WorkflowInstances.tsx",
  "WorkflowWorkspace.tsx",
  "WorkflowCanvas.tsx",
]) {
  const text = readFileSync(
    new URL(`../frontend/workflow/${file}`, import.meta.url),
    "utf8",
  );
  assert(
    !/\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/.test(text),
    `${file}: native modal`,
  );
  assert(
    !/type=["']submit|requestSubmit\s*\(|\.submit\s*\(/.test(text),
    `${file}: native submission`,
  );
  for (const button of text.matchAll(/<Button\b[^>]*>/g))
    assert(/type="button"/.test(button[0]), `${file}: implicit submit button`);
}
console.log(
  "Workflow graph, recovery prerequisites and sandbox checks passed.",
);
