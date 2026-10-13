import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import ts from "typescript";

const assets = new URL("../ui/assets/", import.meta.url);
const scripts = readdirSync(assets).filter(name => name.endsWith(".js"));
assert.equal(scripts.length, 1, "DBX CSP requires a single self-contained UI script; external chunks cannot load in srcdoc");
const source = ts.createSourceFile(scripts[0], readFileSync(new URL(scripts[0], assets), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
function inspect(node) {
  assert(!(ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword), "Dynamic import is incompatible with DBX script-src policy");
  assert(!ts.isImportDeclaration(node), "External static import escaped the UI bundle");
  assert(!(ts.isExportDeclaration(node) && node.moduleSpecifier), "External module export escaped the UI bundle");
  ts.forEachChild(node, inspect);
}
inspect(source);
console.log("DBX bundle regression passed: one script, no external module imports.");
