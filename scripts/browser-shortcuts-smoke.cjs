// Run with: node scripts/browser-shortcuts-smoke.cjs <playwright-core path> [browser executable]
const { chromium } = require(process.argv[2] || "playwright-core");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const ts = require("typescript");

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.argv[3] });
  try {
    const page = await browser.newPage();
    const source = fs.readFileSync(path.join(__dirname, "../frontend/browserShortcuts.ts"), "utf8");
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText.replaceAll("export ", "");
    const html = `<input autofocus><script>
      window.addEventListener('keydown', e => { if (e.ctrlKey && (e.key === 'p' || e.key === 'f')) { window.eventSeen = e; window.customSawCanceled = e.defaultPrevented; } });
      ${js}
      installBrowserShortcutGuard(window);
    </script>`;
    await page.setContent(`<iframe sandbox="allow-scripts" srcdoc="${html.replaceAll('"', '&quot;')}"></iframe>`);
    const frame = page.frames()[1];
    await frame.locator("input").focus();
    await page.keyboard.press("Control+p");
    assert.equal(await frame.evaluate(() => window.customSawCanceled), false, "custom shortcut handler should run before cancellation");
    assert.equal(await frame.evaluate(() => window.eventSeen.defaultPrevented), true, "Ctrl+P browser default should be canceled");
    await page.keyboard.press("Control+f");
    assert.equal(await frame.evaluate(() => window.eventSeen.key), "f");
    assert.equal(await frame.evaluate(() => window.eventSeen.defaultPrevented), false, "Ctrl+F browser default should remain available");
    console.log("Browser shortcut smoke test passed.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
