import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../frontend/style.css", import.meta.url), "utf8");

test("generic button rules exclude Switch tracks in every interaction state", () => {
  const selectors = css.match(/[^{}]+(?=\{)/g) ?? [];
  const genericButtonSelectors = selectors.flatMap(selector => selector.split(","))
    .filter(selector => selector.includes('button:not([data-slot="button"])'));
  assert.ok(genericButtonSelectors.length > 0);
  for (const selector of genericButtonSelectors) {
    assert.ok(selector.includes(':not([data-slot="switch"])'),
      `Generic button CSS overrides Switch: ${selector.trim()}`);
  }
});
