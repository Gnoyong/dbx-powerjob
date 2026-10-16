const assert = require("node:assert/strict");

module.exports = async ({ frame, calls, button, failures }) => {
  await frame.evaluate(() => {
    window.__logTest = true;
    window.__logTotal = 3;
    window.__fileCalls = [];
    window.__fileBytes = [];
    window.dbxPlugin.capabilities.fileTransfer = { beginSave: true };
    window.dbxPlugin.fileTransfer = {
      async beginSave(options) {
        window.__fileCalls.push({ method: "begin", options });
        if (window.__cancelSave) return null;
        if (window.__holdSave) await new Promise(resolve => { window.__releaseSave = resolve; });
        window.__fileBytes = [];
        return { handleId: "log-file", chunkBytes: 128 };
      },
      async write(handleId, offset, data) {
        window.__fileCalls.push({ method: "write", handleId, offset, length: data.length });
        if (window.__failWrite) throw Error("disk write failed");
        window.__fileBytes.push(...data);
        return { written: data.length, nextOffset: offset + data.length };
      },
      async finish(handleId) { window.__fileCalls.push({ method: "finish", handleId }); },
      async cancel(handleId) { window.__fileCalls.push({ method: "cancel", handleId }); },
    };
  });
  await frame.locator(".job-item").filter({ hasText: "Alpha" }).click();
  await button("Instances & logs").click();
  const exportButton = frame.locator(".logs-pane").getByRole("button", { name: "Export", exact: true });
  await exportButton.waitFor();
  await frame.evaluate(() => { window.__cancelSave = true; });
  await exportButton.click();
  await frame.waitForFunction(() => window.__fileCalls.length === 1);
  await frame.waitForFunction(() => ![...document.querySelectorAll('.logs-pane button')].find(el => el.textContent === 'Export').disabled);
  assert.deepEqual(await frame.evaluate(() => window.__fileCalls.map(c => c.method)), ["begin"]);
  assert.equal(await frame.getByText("Exported 3 pages", { exact: true }).count(), 0);
  await frame.evaluate(() => { window.__cancelSave = false; window.__fileCalls = []; });
  await exportButton.click();
  await frame.getByText("Exported 3 pages", { exact: true }).waitFor();
  const saved = await frame.evaluate(() => ({ calls: window.__fileCalls, content: new TextDecoder().decode(new Uint8Array(window.__fileBytes)) }));
  assert.equal(saved.calls[0].options.name, "powerjob-instance-9007199254740993.log");
  assert.equal(saved.calls.at(-1).method, "finish");
  assert.equal(saved.content, Array.from({ length: 3 }, (_, page) => Array.from({ length: 25 }, (_, line) => `page ${page + 1} line ${line}\n`).join("")).join(""));
  assert(saved.calls.filter(c => c.method === "write").length > 1);
  await frame.evaluate(() => { window.__fileCalls = []; window.__failWrite = true; });
  await exportButton.click();
  await frame.getByText("Failed to export all logs", { exact: true }).waitFor();
  assert.equal(await frame.evaluate(() => window.__fileCalls.at(-1).method), "cancel");
  assert.equal(await frame.evaluate(() => window.__fileCalls.some(c => c.method === "finish")), false);
  await frame.evaluate(() => { window.__fileCalls = []; window.__failWrite = false; window.__holdSave = true; });
  await exportButton.click();
  await frame.waitForFunction(() => !!window.__releaseSave);
  assert.equal(await exportButton.isDisabled(), true);
  await frame.locator(".job-item").filter({ hasText: "Beta" }).click();
  await frame.evaluate(() => window.__releaseSave());
  await frame.waitForFunction(() => window.__fileCalls.some(c => c.method === "cancel"));
  assert.equal(await frame.evaluate(() => window.__fileCalls.some(c => c.method === "write" || c.method === "finish")), false);
  await frame.evaluate(() => { delete window.dbxPlugin.capabilities.fileTransfer; window.__fileCalls = []; });
  await exportButton.click();
  await frame.getByText("This DBX host does not support file export. Please update DBX and reopen the plugin.", { exact: true }).waitFor();
  assert.equal(await frame.evaluate(() => window.__fileCalls.length), 0);
  assert((await calls("powerjob/log")).some(c => c.params.index === 2));
  assert.deepEqual(failures, []);
  console.log("Log export sandbox smoke passed: full content, host chunked writes, finish, dialog cancellation, write failure cleanup, context cancellation and unsupported host.");
};
