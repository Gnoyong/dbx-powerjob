import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const root = new URL("../frontend/", import.meta.url);
function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
    return entry.isDirectory() ? walk(url) : /\.tsx?$/.test(entry.name) ? [url] : [];
  });
}

test("frontend keeps the DBX sandbox button and modal contract", () => {
  for (const url of walk(root)) {
    const source = readFileSync(url, "utf8");
    assert(!/\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/.test(source), `${url}: native modal`);
    assert(!/type=["']submit|requestSubmit\s*\(|\.submit\s*\(/.test(source), `${url}: native submission`);
    const file = ts.createSourceFile(url.pathname, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node) {
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
          ["Button", "button"].includes(node.tagName.getText(file))) {
        assert(node.attributes.properties.some(attribute => ts.isJsxAttribute(attribute) &&
          attribute.name.getText(file) === "type" && attribute.initializer &&
          ts.isStringLiteral(attribute.initializer) && attribute.initializer.text === "button"),
        `${url}: button must explicitly declare type=button`);
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
  }
});

test("changing selected job clears unconfirmed task actions", () => {
  const workspace = new URL("tasks/TaskWorkspace.tsx", root);
  const source = readFileSync(existsSync(workspace) ? workspace : new URL("App.tsx", root), "utf8");
  const file = ts.createSourceFile("workspace.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let clearsConfirmation = false;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(file) === "useEffect" &&
        node.arguments[1]?.getText(file).includes("selectedJobId") &&
        node.arguments[0]?.getText(file).includes("setConfirmation(null)")) clearsConfirmation = true;
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert(clearsConfirmation, "selected-job lifecycle must clear pending confirmation before another task can be acted on");
});
