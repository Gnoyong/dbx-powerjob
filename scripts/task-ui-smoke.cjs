// node scripts/task-ui-smoke.cjs <playwright-package-path> [browser-executable]
// Uses a srcdoc allow-scripts iframe and mocked RPCs only; never writes to PowerJob.
const { chromium } = require(process.argv[2] || "playwright");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

(async () => {
  const browser = await chromium.launch({
    headless: true, executablePath: process.argv[3],
    // Keep opaque-origin srcdoc frames in-process in the restricted Windows test environment.
    // The iframe sandbox and CSP remain unchanged.
    args: ["--disable-site-isolation-trials"],
  });
  try {
    const outer = await browser.newPage({ viewport: { width: 1450, height: 950 } });
    if (process.argv.includes("--latest-only")) await outer.clock.install();
    outer.setDefaultTimeout(10000);
    const failures = [];
    outer.on("pageerror", error => failures.push(String(error)));
    outer.on("console", message => {
      if (/Blocked form submission|Ignored call to|Content Security Policy|Failed to fetch dynamically imported/.test(message.text()))
        failures.push(message.text());
    });
    const root = path.resolve(__dirname, "../ui");
    const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
    const script = fs.readFileSync(path.resolve(root, html.match(/<script[^>]+src="([^"]+)"/)[1]), "utf8");
    const css = fs.readFileSync(path.resolve(root, html.match(/<link[^>]+href="([^"]+\.css)"/)[1]), "utf8");
    const srcdoc = `<html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; connect-src 'none'; img-src data: blob:;"><style>${css}</style></head><body><div id="root"></div><script type="module">${script.replaceAll("</script>", "<\\/script>")}</script></body></html>`;
    await outer.route("http://task-test.local/**", route => route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<iframe style="border:0;width:100vw;height:100vh" sandbox="allow-scripts" srcdoc="${srcdoc.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}"></iframe>`,
    }));
    await outer.addInitScript(() => {
      window.__calls = [];
      window.__held = [];
      window.__hold = {};
      window.__fail = {};
      window.__storage = new Map([
        ["local.powerjob.readonly.last-application:A", { appId: "4", pageIndex: 1 }],
      ]);
      const page = (data, index = 0, totalPages = 1) => ({ data, index, totalPages, pageSize: 20, totalItems: totalPages === 2 ? 3 : data.length });
      const jobs = [
        { id: "7", jobName: "Alpha", enable: true },
        { id: "8", jobName: "Beta", enable: true },
        { id: "9", jobName: "Last", enable: true },
      ];
      window.__jobs = jobs;
      let contextChanged;
      window.__setConnection = connectionId => contextChanged({ connectionId });
      window.dbxPlugin = {
        ready: Promise.resolve(), locale: "en", context: { connectionId: "A" },
        capabilities: { storage: true },
        storage: {
          async get(key) { return window.__storage.get(key); },
          async set(key, value) { window.__storage.set(key, value); },
        },
        onContext(callback) { contextChanged = callback; return () => {}; },
        async invoke(method, params) {
          window.__calls.push({ method, params });
          if (window.__hold[method]) return new Promise((resolve, reject) => window.__held.push({ method, params, resolve, reject }));
          if (window.__fail[method]) { delete window.__fail[method]; throw new Error("access denied"); }
          switch (method) {
            case "powerjob/apps": return page((params.index === 1 ? ["3", "4"] : ["1", "2"]).map(id => ({ id, appName: "App " + id })), params.index, 2);
            case "powerjob/jobs": return page(params.index === 1 ? jobs.slice(2) : jobs.slice(0, 2), params.index, jobs.length > 2 ? 2 : 1);
            case "powerjob/job": return {
              id: params.jobId, appId: params.appId, jobName: jobs.find(job => job.id === String(params.jobId))?.jobName || "Alpha", enable: true,
              timeExpressionType: "API", timeExpression: "", executeType: "STANDALONE", processorType: "BUILT_IN", processorInfo: "demo.Processor",
            };
            case "powerjob/instances": return page(window.__instances ?? [{ instanceId: "9007199254740993", status: 4 }]);
            case "powerjob/latestJobInstances": return { data: params.jobIds.map(jobId => window.__latest?.[jobId] ?? ({ jobId, instance: jobId === "7" ? { instanceId: "9007199254740993", status: 3 } : null })) };
            case "powerjob/instance": return { status: 4, result: "failed" };
            case "powerjob/log": {
              if (!window.__logTest) return { index: 0, totalPages: 1, data: "mock log\n" };
              if (!window.__logInstant) await new Promise(resolve => setTimeout(resolve, 5));
              if (params.index === window.__logFailIndex) {
                delete window.__logFailIndex;
                throw new Error('mock log page failure');
              }
              const panel = document.querySelector('.log-scroll');
              // Layout/virtualizer scroll events can happen before the next RAF.
              if (panel && params.index > 1) {
                panel.scrollTop = 0;
                panel.dispatchEvent(new Event('scroll'));
              }
              return { index: params.index, totalPages: window.__logTotal ?? 100,
                data: Array.from({ length: 25 }, (_, line) => `page ${params.index + 1} line ${line}\n`).join('') };
            }
            case "powerjob/setJobEnabled": jobs.find(job => job.id === params.jobId).enable = params.enabled; return { success: true };
            case "powerjob/deleteJob": jobs.splice(jobs.findIndex(job => job.id === params.jobId), 1); return { success: true };
            case "powerjob/updateJob": Object.assign(jobs.find(job => job.id === params.jobId), params.changes); return { success: true };
            case "powerjob/createJob": case "powerjob/copyJob": case "powerjob/retryFailedInstance": return { success: true };
            case "powerjob/runJob": return { instanceId: "9007199254740993" };
            case "powerjob/stopInstance": return { success: true };
            case "powerjob/workflowCapabilities": return { readOnly: false };
            case "powerjob/workflows": return page([]);
            default: throw new Error("Unexpected RPC " + method);
          }
        },
      };
    });
    const frameReady = outer.waitForEvent("framenavigated", { predicate: frame => frame.url() === "about:srcdoc" });
    await outer.goto("http://task-test.local/");
    const frame = await frameReady;
    assert(frame, "restricted iframe must be present");
    const calls = method => frame.evaluate(method => window.__calls.filter(call => call.method === method), method);
    const menu = async (name, action) => {
      await frame.locator(".job-item").filter({ hasText: name }).click({ button: "right" });
      await frame.getByRole("menuitem", { name: action, exact: true }).click();
    };
    const button = name => frame.getByRole("button", { name, exact: true });
    await frame.waitForFunction(() => document.querySelector("#app-select")?.value === "4");
    await frame.locator(".job-item").first().waitFor();
    if (process.argv.includes("--export-only")) {
      await require("./log-export-smoke.cjs")({ frame, calls, button, failures });
      return;
    }
    if (process.argv.includes("--stop-only")) {
      await require("./stop-instance-smoke.cjs")({ frame, calls, button, failures });
      return;
    }
    assert(await frame.locator(".job-item").first().evaluate(item => {
      const main = item.querySelector(".job-main");
      return main.firstElementChild.matches(".job-instance-status") &&
        main.firstElementChild.nextElementSibling.matches(".job-name") &&
        !item.querySelector(".job-latest-instance");
    }), "instance status must be an icon immediately before the job name");
    await frame.locator(".job-item").filter({ hasText: "Alpha" }).getByText("Running", { exact: true }).waitFor();
    await frame.locator(".job-item").filter({ hasText: "Beta" }).getByText("No instance records", { exact: true }).waitFor();
    if (process.argv.includes("--latest-only")) {
      await require("./latest-instances-smoke.cjs")({ outer, frame, calls, button, menu, failures });
      return;
    }
    if (process.argv.includes("--logs-only")) {
      await require("./log-viewer-smoke.cjs")({ outer, frame, calls, button, failures });
      return;
    }
    assert.equal((await calls("powerjob/apps"))[0].params.index, 1);
    await button("Previous application").click();
    await frame.waitForFunction(() => document.querySelector("#app-select").value === "3");
    await button("Previous application").click();
    await frame.waitForFunction(() => document.querySelector("#app-select").value === "2");
    await button("Next application").click();
    await frame.waitForFunction(() => document.querySelector("#app-select").value === "3");
    await frame.waitForFunction(() => window.__storage.get("local.powerjob.readonly.last-application:A").appId === "3");
    await frame.locator("#app-select").selectOption("4");
    await frame.locator(".job-item").first().waitFor();

    // Cancel, Escape and Close never issue a destructive RPC.
    await menu("Alpha", "Delete job");
    await button("Cancel").click();
    await menu("Alpha", "Delete job");
    await frame.getByRole("dialog").press("Escape");
    await menu("Alpha", "Delete job");
    await button("Close").click();
    assert.equal((await calls("powerjob/deleteJob")).length, 0);
    // A background list replacement changes the selected task while a confirmation is open.
    await menu("Alpha", "Delete job");
    await frame.evaluate(() => {
      window.__jobs.shift();
      [...document.querySelectorAll(".toolbar button")].find(button => button.textContent === "Refresh").click();
    });
    await frame.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    assert.equal((await calls("powerjob/deleteJob")).length, 0);
    await frame.evaluate(() => window.__jobs.unshift({ id: "7", jobName: "Alpha", enable: true }));
    await button("Refresh").click();
    await frame.locator(".job-item").filter({ hasText: "Alpha" }).click();

    await frame.locator("#job-keyword").fill("kept draft");
    await button("Instances & logs").click();
    await frame.locator(".instances-table tbody tr").first().waitFor();
    await frame.locator("#instance-type").selectOption("WORKFLOW");
    await frame.locator("#instance-id").fill("123");
    await frame.locator(".instance-filter").getByRole("button", { name: "Search" }).click();
    await frame.waitForFunction(() => window.__calls.some(call => call.method === "powerjob/instances" && call.params.type === "WORKFLOW"));
    await button("Workflow").click();
    const polls = (await calls("powerjob/instances")).length;
    await frame.waitForTimeout(3200);
    assert.equal((await calls("powerjob/instances")).length, polls, "hidden tasks must stop polling");
    await button("Jobs").click();
    assert.equal(await frame.locator("#job-keyword").inputValue(), "kept draft");
    assert.equal(await frame.locator("#instance-type").inputValue(), "WORKFLOW");

    // A failed run restores the form; success resets filters and retains the full instance ID.
    await menu("Alpha", "Run job");
    await frame.evaluate(() => { window.__fail["powerjob/runJob"] = true; });
    await frame.getByRole("dialog").getByRole("button", { name: "Run job", exact: true }).click();
    await frame.getByRole("dialog").getByRole("alert").waitFor();
    assert.equal(await frame.getByRole("dialog").getByRole("button", { name: "Run job", exact: true }).isEnabled(), true);
    await frame.locator("#run-instance-params").fill("payload");
    await frame.getByRole("dialog").getByRole("button", { name: "Run job", exact: true }).click();
    await frame.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    await frame.getByText("Job started. Instance ID: 9007199254740993", { exact: true }).waitFor();
    assert.equal(await frame.locator("#instance-type").inputValue(), "NORMAL");
    assert.equal(await frame.locator("#instance-id").inputValue(), "");
    assert.equal((await calls("powerjob/runJob")).at(-1).params.instanceParams, "payload");
    await frame.waitForFunction(() => window.__calls.some(call => call.method === "powerjob/latestJobInstances" && call.params.jobIds.length === 1 && call.params.jobIds[0] === "7"));
    const refreshesBeforeRetry = (await calls("powerjob/latestJobInstances")).length;
    await frame.locator(".instances-table").getByRole("button", { name: "Retry", exact: true }).click();
    await frame.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    assert.equal((await calls("powerjob/retryFailedInstance")).length, 0);
    await frame.locator(".instances-table").getByRole("button", { name: "Retry", exact: true }).click();
    await frame.getByRole("dialog").getByRole("button", { name: "Retry", exact: true }).click();
    assert.equal((await calls("powerjob/retryFailedInstance"))[0].params.instanceId, "9007199254740993");
    await frame.waitForFunction(count => window.__calls.filter(call => call.method === "powerjob/latestJobInstances").length > count, refreshesBeforeRetry);
    assert.deepEqual((await calls("powerjob/latestJobInstances")).at(-1).params.jobIds, ["7"]);

    await button("Job details").click();
    await frame.getByRole("textbox", { name: "Job name", exact: true }).fill("Alpha updated");
    await button("Save changes").click();
    await frame.locator(".job-item").filter({ hasText: "Alpha updated" }).waitFor();
    assert.deepEqual((await calls("powerjob/updateJob")).at(-1).params.changes, { jobName: "Alpha updated" });

    await button("New job").click();
    await frame.getByRole("dialog").getByRole("button", { name: "Create job", exact: true }).click();
    await frame.getByRole("dialog").getByRole("alert").waitFor();
    assert.equal((await calls("powerjob/createJob")).length, 0, "invalid draft must not issue RPC");
    await frame.getByRole("dialog").getByRole("textbox", { name: "Job name", exact: true }).fill("Created");
    await frame.getByRole("dialog").getByRole("combobox", { name: "Schedule type", exact: true }).selectOption("API");
    await frame.getByRole("dialog").getByRole("combobox", { name: "Execution type", exact: true }).selectOption("STANDALONE");
    await frame.getByRole("dialog").getByRole("combobox", { name: "Processor type", exact: true }).selectOption("BUILT_IN");
    await frame.getByRole("dialog").getByRole("textbox", { name: "Processor", exact: true }).fill("demo.Processor");
    await frame.getByRole("dialog").getByRole("button", { name: "Create job", exact: true }).click();
    await frame.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    assert.equal((await calls("powerjob/createJob")).at(-1).params.job.jobName, "Created");

    await menu("Alpha", "Copy job");
    await frame.getByRole("dialog").waitFor();
    assert.equal(await frame.getByRole("dialog").getByRole("textbox", { name: "Job name", exact: true }).inputValue(), "Alpha updated_copy");
    await frame.getByRole("dialog").getByRole("button", { name: "Create job", exact: true }).click();
    await frame.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    assert.equal((await calls("powerjob/copyJob")).at(-1).params.jobId, "7");
    assert.equal((await calls("powerjob/copyJob")).at(-1).params.job.jobName, "Alpha updated_copy");

    await menu("Alpha", "Disable job");
    await frame.getByRole("dialog").getByRole("button", { name: "Disable job", exact: true }).click();
    await frame.locator(".job-item").filter({ hasText: "Alpha" }).getByText("Disabled", { exact: true }).waitFor();
    await frame.locator(".jobs-pane").getByRole("button", { name: "Next", exact: true }).click();
    await frame.locator(".job-item").filter({ hasText: "Last" }).waitFor();
    await menu("Last", "Delete job");
    await frame.getByRole("dialog").getByRole("button", { name: "Delete job", exact: true }).click();
    await frame.locator(".job-item").filter({ hasText: "Alpha" }).waitFor();
    assert.equal((await calls("powerjob/jobs")).at(-1).params.index, 0);

    // Late A completion must not unlock or overwrite B, even when IDs are identical.
    await frame.evaluate(() => { window.__hold["powerjob/runJob"] = true; });
    await menu("Alpha", "Run job");
    await frame.getByRole("dialog").getByRole("button", { name: "Run job", exact: true }).evaluate(element => { element.click(); element.click(); });
    await frame.waitForFunction(() => window.__held.length === 1);
    await frame.evaluate(() => window.__setConnection("B"));
    await frame.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    await frame.locator(".job-item").filter({ hasText: "Alpha" }).waitFor();
    await menu("Alpha", "Run job");
    await frame.getByRole("dialog").getByRole("button", { name: "Run job", exact: true }).click();
    await frame.waitForFunction(() => window.__held.length === 2);
    await frame.evaluate(() => window.__held[0].resolve({ instanceId: "OLD" }));
    await frame.waitForTimeout(100);
    assert.equal(await frame.getByRole("dialog").getByRole("button", { name: "Starting job…", exact: true }).isDisabled(), true);
    assert.equal(await frame.getByText("Job started. Instance ID: OLD", { exact: true }).count(), 0);
    await frame.evaluate(() => window.__held[1].reject(new Error("access denied")));
    await frame.getByRole("dialog").getByRole("alert").waitFor();
    assert.equal(await frame.getByRole("dialog").getByRole("button", { name: "Run job", exact: true }).isEnabled(), true);
    await button("Cancel").click();

    // Detail requests completing out of order must leave the newer selection intact.
    await frame.evaluate(() => { window.__held = []; window.__hold["powerjob/job"] = true; });
    await frame.locator(".job-item").filter({ hasText: "Beta" }).click();
    await frame.waitForFunction(() => window.__held.length === 1);
    await frame.locator(".job-item").filter({ hasText: "Alpha" }).click();
    await frame.waitForFunction(() => window.__held.length === 2);
    await frame.evaluate(() => window.__held[1].resolve({ id: "7", jobName: "Current detail" }));
    await frame.waitForFunction(() => document.querySelector('input[aria-label="Job name"]')?.value === "Current detail");
    await frame.evaluate(() => window.__held[0].resolve({ id: "8", jobName: "Stale detail" }));
    await frame.waitForTimeout(100);
    assert.equal(await frame.getByRole("textbox", { name: "Job name", exact: true }).inputValue(), "Current detail");

    // A slow poll cannot overlap itself, and the response from a previous job is ignored.
    await frame.evaluate(() => {
      window.__held = [];
      window.__hold["powerjob/job"] = false;
      window.__hold["powerjob/instances"] = true;
    });
    await button("Instances & logs").click();
    await frame.waitForFunction(() => window.__held.length === 1);
    await frame.waitForTimeout(3200);
    assert.equal(await frame.evaluate(() => window.__held.length), 1, "slow poll must not overlap");
    await frame.locator(".job-item").filter({ hasText: "Beta" }).click();
    await frame.waitForFunction(() => window.__held.length === 2);
    await frame.evaluate(() => window.__held[1].resolve({ data: [{ instanceId: "NEW", status: 4 }], index: 0, pageSize: 20, totalPages: 1, totalItems: 1 }));
    await frame.getByRole("cell", { name: "NEW", exact: true }).waitFor();
    await frame.evaluate(() => window.__held[0].resolve({ data: [{ instanceId: "STALE", status: 4 }], index: 0, pageSize: 20, totalPages: 1, totalItems: 1 }));
    await frame.waitForTimeout(100);
    assert.equal(await frame.getByRole("cell", { name: "STALE", exact: true }).count(), 0);
    await button("Job details").click();

    assert.deepEqual(failures, []);
    console.log("Task sandbox smoke passed: application restore/paging, canceled actions, selected-job cleanup, retained state, polling, run failure/retry, filter reset, update/create/copy/enable/delete, duplicate clicks and stale completion.");
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
