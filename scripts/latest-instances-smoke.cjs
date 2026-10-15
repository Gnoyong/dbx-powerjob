// Invoked by task-ui-smoke.cjs with --latest-only; uses its restricted iframe harness.
const assert = require("node:assert/strict");
module.exports = async ({ outer, frame, calls, button, failures }) => {
  const method = "powerjob/latestJobInstances";
  const alpha = frame.locator(".job-item").filter({ hasText: "Alpha" });
  const beta = frame.locator(".job-item").filter({ hasText: "Beta" });
  const jobsBefore = (await calls("powerjob/jobs")).length;
  await frame.evaluate(method => { window.__hold[method] = true; }, method);
  await alpha.click({ button: "right" });
  const before = (await calls(method)).length;
  await outer.clock.runFor(30_100);
  assert.equal((await calls(method)).length, before + 1, "visible jobs poll after 30 seconds");
  await outer.clock.runFor(60_000);
  assert.equal((await calls(method)).length, before + 1, "pending request must not overlap");
  assert.equal(await frame.getByRole("menu").count(), 1, "polling must retain open job menu");
  await frame.evaluate(() => window.__held.shift().reject(new Error("offline")));
  await alpha.getByText("Update failed", { exact: true }).waitFor();
  await alpha.getByText("Running", { exact: true }).waitFor();
  await beta.getByText("Query failed", { exact: true }).waitFor();
  assert.equal((await calls("powerjob/jobs")).length, jobsBefore, "status polling must not reload jobs");
  assert.equal(await frame.getByRole("menu").count(), 1, "status result must retain menu");
  assert.equal(await alpha.getAttribute("aria-pressed"), "true");
  await frame.getByRole("menu").press("Escape");
  await frame.evaluate(method => { delete window.__hold[method]; }, method);
  await outer.clock.runFor(30_000);
  assert.equal((await calls(method)).length, before + 1, "failed poll backs off");
  await outer.clock.runFor(30_100);
  await alpha.getByText("Running", { exact: true }).waitFor();
  assert.equal(await alpha.getByText("Update failed", { exact: true }).count(), 0);

  // A partial error retains one job's prior state; unfamiliar status codes remain visible.
  await frame.evaluate(() => { window.__latest = {
    "7": { jobId: "7", instance: null, error: "denied" },
    "8": { jobId: "8", instance: { instanceId: "9007199254740999", status: 777 } },
  }; });
  await outer.clock.runFor(30_100);
  await alpha.getByText("Update failed", { exact: true }).waitFor();
  await beta.getByText("777", { exact: true }).waitFor();
  await frame.evaluate(() => { window.__latest = undefined; });

  // Workspace and document visibility both stop new polls and refresh when restored.
  await button("Workflow").click();
  const hiddenCount = (await calls(method)).length;
  await outer.clock.runFor(120_000);
  assert.equal((await calls(method)).length, hiddenCount);
  await button("Jobs").click();
  await alpha.getByText("Running", { exact: true }).waitFor();
  await frame.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const backgroundCount = (await calls(method)).length;
  await outer.clock.runFor(120_000);
  assert.equal((await calls(method)).length, backgroundCount);
  await frame.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await frame.waitForFunction(count => window.__calls.filter(call => call.method === "powerjob/latestJobInstances").length > count, backgroundCount);

  // Late A response cannot overwrite B even when the job IDs are identical.
  await frame.evaluate(method => { window.__hold[method] = true; }, method);
  await button("Refresh").click();
  await frame.waitForFunction(() => window.__held.length === 1);
  await frame.evaluate(() => window.__setConnection("B"));
  await alpha.getByText("Loading…", { exact: true }).waitFor();
  await frame.evaluate(method => {
    delete window.__hold[method];
    window.__held.shift().resolve({ data: [{ jobId: "7", instance: { instanceId: "111", status: "OLD_RESPONSE" } }] });
  }, method);
  await alpha.getByText("Running", { exact: true }).waitFor();
  assert.equal(await frame.getByText("OLD_RESPONSE", { exact: true }).count(), 0);
  assert.equal((await calls(method)).at(-1).params.connectionId, "B");

  // Changing page only queries the jobs on the new page; searching re-queries it.
  await frame.locator(".jobs-pane").getByRole("button", { name: "Next", exact: true }).click();
  await frame.locator(".job-item").filter({ hasText: "Last" }).getByText("No instance records", { exact: true }).waitFor();
  assert.deepEqual((await calls(method)).at(-1).params.jobIds, ["9"]);
  await frame.locator("#job-keyword").fill("Alpha");
  await frame.locator(".jobs-pane").getByRole("button", { name: "Search", exact: true }).click();
  await alpha.getByText("Running", { exact: true }).waitFor();
  assert.deepEqual((await calls(method)).at(-1).params.jobIds, ["7", "8"]);
  await outer.setViewportSize({ width: 900, height: 750 });
  assert(await frame.locator(".job-item").evaluateAll(items => items.every(item => {
    const row = item.getBoundingClientRect();
    const summary = item.querySelector(".job-latest-instance").getBoundingClientRect();
    return summary.bottom <= row.bottom && summary.right <= row.right;
  })), "status row must fit inside the job button at narrow widths");
  await outer.screenshot({ path: ".build-temp/latest-jobs.png" });
  assert.deepEqual(failures, []);
  console.log("Latest instance sandbox smoke passed: status/empty/error, retained data/menu/selection, bounded polling, backoff, hidden workspaces/documents, stale connections, current-page scope and search.");
};
