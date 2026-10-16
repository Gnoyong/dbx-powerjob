// Uses the installed Playwright runtime: node scripts/workflow-ui-smoke.cjs <playwright-package-path>
// All URLs and PowerJob RPCs are intercepted; no real server writes or services.
const { chromium } = require(process.argv[2] || "playwright");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.argv[3],
    // Avoid a separate opaque-origin renderer in the restricted Windows test environment.
    // This does not change the iframe sandbox or CSP.
    args: ["--disable-site-isolation-trials"],
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1450, height: 950 },
    });
    const browserPage = await context.newPage();
    let page = browserPage;
    const failures = [];
    page.on("pageerror", (e) => { failures.push(String(e)); console.error("Sandbox page error:", String(e)); });
    page.on("console", message => {
      if (message.type() === "error" && /Content Security Policy|Failed to fetch dynamically imported/.test(message.text())) failures.push(message.text());
    });
    await page.route("http://localhost:15191/**", (route) => {
      const pathname = new URL(route.request().url()).pathname;
      const root = path.resolve(process.argv[4] || path.resolve(__dirname, "../ui"));
      const file = path.resolve(
        root,
        "." + (pathname === "/" ? "/index.html" : pathname),
      );
      if (!file.startsWith(root + path.sep)) {
        return route.fulfill({ status: 403, body: "forbidden" });
      }
      const ext = path.extname(file);
      if (pathname === "/") {
        const html = fs.readFileSync(file,"utf8");
        const jsPath = html.match(/<script[^>]+src="([^"]+)"/)[1];
        const cssPath = html.match(/<link[^>]+href="([^"]+\.css)"/)[1];
        const js = fs.readFileSync(path.resolve(root,jsPath),"utf8").replaceAll("</script>","<\\/script>");
        const css = fs.readFileSync(path.resolve(root,cssPath),"utf8");
        const document = `<html><head><meta charset="utf-8"><base href="http://127.0.0.1:15190/"><meta http-equiv="Content-Security-Policy" content="script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; connect-src 'none'; img-src data: blob:;"><style>${css}</style></head><body><div id="root"></div><script type="module">${js}</script></body></html>`;
        return route.fulfill({contentType:"text/html; charset=utf-8",body:`<iframe style="border:0;width:100vw;height:100vh" sandbox="allow-scripts" srcdoc="${document.replaceAll("&","&amp;").replaceAll('"',"&quot;")}"></iframe>`});
      }
      route.fulfill({
        body: fs.readFileSync(file),
        contentType:
          ext === ".js"
            ? "application/javascript"
            : ext === ".css"
              ? "text/css"
              : "text/html",
      });
    });
    await page.addInitScript(() => {
      window.__calls = [];
      const storage = new Map();
      window.__storage = storage;
      const operations = new Map();
      const def = {
        id: "77",
        appId: "2",
        wfName: "演示流程",
        wfDescription: "测试流程",
        timeExpressionType: "API",
        timeExpression: "",
        maxWfInstanceNum: 1,
        enable: true,
        notifyUserIds: [],
        lifeCycle: null,
        fingerprint: "base",
        peworkflowDAG: {
          nodes: [
            {
              nodeId: "101",
              nodeType: 1,
              jobId: "7",
              nodeName: "清洗数据",
              nodeParams: "{}",
              enable: true,
              skipWhenFailed: false,
            },
            {
              nodeId: "102",
              nodeType: 3,
              jobId: "78",
              nodeName: "子流程",
              nodeParams: "",
              enable: true,
              skipWhenFailed: false,
            },
          ],
          edges: [{ from: "101", to: "102", property: "" }],
        },
      };
      const parent = {
        wfInstanceId: "981844507211334656",
        workflowId: "77",
        workflowName: "演示流程",
        status: 3,
        wfInitParams: "{}",
        wfContext: '{"count":"2"}',
        result: "failed",
        actualTriggerTime: "2026-10-13 12:00:00",
        finishedTime: "2026-10-13 12:01:00",
        peworkflowDAG: {
          nodes: [
            {
              ...def.peworkflowDAG.nodes[0],
              instanceId: "991",
              status: 4,
              result: "failed",
            },
            {
              ...def.peworkflowDAG.nodes[1],
              instanceId: "992",
              status: 5,
              result: "ok",
            },
          ],
          edges: def.peworkflowDAG.edges,
        },
      };
      const child = {
        ...parent,
        wfInstanceId: "992",
        workflowId: "78",
        workflowName: "子流程",
        status: 4,
        peworkflowDAG: {
          nodes: [
            { ...def.peworkflowDAG.nodes[0], status: 5, instanceId: "993" },
          ],
          edges: [],
        },
      };
      const paged = (data) => ({
        index: 0,
        pageSize: 20,
        totalPages: 1,
        totalItems: data.length,
        data,
      });
      window.dbxPlugin = {
        ready: Promise.resolve(),
        locale: "zh-CN",
        context: { connectionId: "mock" },
        capabilities: { storage: true },
        storage: {
          async get(k) {
            return storage.get(k);
          },
          async set(k, v) {
            storage.set(k, v);
          },
          async delete(k) {
            storage.delete(k);
          },
        },
        onContext(callback) {
          callback(this.context);
          return () => {};
        },
        async invoke(method, p) {
          window.__calls.push({ method, p });
          switch (method) {
            case "powerjob/users":
              return [{ id: "2", showName: "PWJB_ADMIN", enable: true }, { id: "4", showName: "PWJB_python", enable: true }];
            case "powerjob/apps":
              return paged([{ id: "2", appName: "Demo" }]);
            case "powerjob/jobs":
              {
                const all = [
                  { id: "7", jobName: "清洗数据", enable: true },
                  ...Array.from({ length: 20 }, (_, i) => ({ id: String(i + 10), jobName: `任务 ${i + 10}`, enable: true })),
                ];
                const matches = all.filter(job => job.jobName.includes(p.keyword || ""));
                return {
                  index: p.index,
                  pageSize: 20,
                  totalPages: Math.ceil(matches.length / 20),
                  totalItems: matches.length,
                  data: matches.slice(p.index * 20, (p.index + 1) * 20),
                };
              }
            case "powerjob/job":
              return { id: "7", appId: "2", jobName: "清洗数据", enable: true };
            case "powerjob/workflowCapabilities":
              return { readOnly: !!window.__readOnly };
            case "powerjob/workflows":
              return paged([def, { ...def, id: "88", wfName: "另一个流程" }]);
            case "powerjob/workflow":
              return structuredClone(p.workflowId === "88" ? { ...def, id: "88", wfName: "另一个流程" } : def);
            case "powerjob/workflowInstances":
              if (window.__holdWorkflowInstances && p.workflowId === "77") {
                return new Promise(resolve => { window.__releaseWorkflowInstances = () => resolve(paged([parent])); });
              }
              return paged(p.workflowId === "88" ? [] : [parent]);
            case "powerjob/workflowInstance":
              return structuredClone(p.wfInstanceId === "992" ? child : parent);
            case "powerjob/log":
              return { index: 0, totalPages: 1, data: "test log\n" };
            case "powerjob/instance":
              return {
                status: 4,
                result: "failed",
                actualTriggerTime: "2026-10-13 12:00:00",
              };
            case "powerjob/saveWorkflow": {
              const draft = p.draft;
              const saved = {
                ...draft.config,
                id: draft.id ?? "79",
                appId: "2",
                fingerprint: "saved",
                peworkflowDAG: {
                  nodes: draft.nodes.map((n, i) => ({
                    ...n,
                    nodeId: n.nodeId ?? String(200 + i),
                  })),
                  edges: draft.edges.map((e) => ({
                    ...e,
                    from:
                      draft.nodes.findIndex((n) => n.key === e.from) < 0
                        ? e.from
                        : (draft.nodes.find((n) => n.key === e.from).nodeId ??
                          String(
                            200 +
                              draft.nodes.findIndex((n) => n.key === e.from),
                          )),
                    to:
                      draft.nodes.find((n) => n.key === e.to).nodeId ??
                      String(
                        200 + draft.nodes.findIndex((n) => n.key === e.to),
                      ),
                  })),
                },
              };
              Object.assign(def, saved);
              const op = {
                operationId: p.operationId,
                workflowId: saved.id,
                state: "running",
                stage: "nodes",
                nodeIds: {},
                updatedAt: Date.now(),
              };
              operations.set(p.operationId, op);
              setTimeout(
                () =>
                  Object.assign(op, {
                    state: "succeeded",
                    stage: "verifying",
                    definition: saved,
                  }),
                200,
              );
              return structuredClone(op);
            }
            case "powerjob/workflowSaveStatus":
              if (!operations.has(p.operationId))
                throw new Error("missing operation");
              return structuredClone(operations.get(p.operationId));
            case "powerjob/markWorkflowNodeSuccess":
              parent.peworkflowDAG.nodes[0].status = 5;
              return {
                success: true,
                verified: true,
                instance: structuredClone(parent),
              };
            case "powerjob/retryWorkflowInstance":
            case "powerjob/stopWorkflowInstance":
              return { success: true, verified: true, instance: structuredClone(parent) };
            case "powerjob/runWorkflow":
              return { wfInstanceId: parent.wfInstanceId };
            default:
              throw new Error("unexpected mock RPC " + method);
          }
        },
      };
    });
    const initialFrame = browserPage.waitForEvent("framenavigated", { predicate: frame => frame.url() === "about:srcdoc" });
    await browserPage.goto("http://localhost:15191/");
    page = await initialFrame;
    assert(page, "sandbox iframe did not load");
    await page.getByRole("button", { name: "工作流", exact: true }).click();
    await page.getByRole("button", { name: /演示流程/ }).click();
    await page.getByText("清洗数据", { exact: true }).last().waitFor();
    if (process.argv.includes("--notification-users-only")) {
      const picker = page.getByRole("button", { name: "通知用户", exact: true });
      assert(await picker.isDisabled(), "view mode must lock notification users");
      await page.getByRole("button", { name: "编辑", exact: true }).click();
      const pickerSize = await picker.evaluate(el => ({ height: el.getBoundingClientRect().height, fontSize: getComputedStyle(el).fontSize }));
      const inputSize = await page.getByRole("textbox", { name: "名称", exact: true }).evaluate(el => ({ height: el.getBoundingClientRect().height, fontSize: getComputedStyle(el).fontSize }));
      assert.deepEqual(pickerSize, inputSize, "notification picker must match adjacent input height and font size");
      await picker.click();
      const popup = page.locator('[data-slot="popover-content"]');
      const popupSize = await popup.evaluate(el => ({ width: el.getBoundingClientRect().width, fontSize: getComputedStyle(el).fontSize }));
      assert.equal(popupSize.fontSize, inputSize.fontSize, "portal must preserve compact typography");
      assert(Math.abs(popupSize.width - (await picker.boundingBox()).width) <= 1, "dropdown must match the field width");
      assert.equal(await page.getByRole("textbox", { name: "搜索用户", exact: true }).evaluate(el => el.getBoundingClientRect().height), inputSize.height);
      await page.getByRole("checkbox", { name: "PWJB_ADMIN", exact: true }).check();
      await page.getByRole("checkbox", { name: "PWJB_python", exact: true }).check();
      await page.getByRole("textbox", { name: "搜索用户", exact: true }).fill("python");
      assert.equal(await page.locator('[data-slot="popover-content"]').getByRole("checkbox").count(), 1);
      await page.getByRole("checkbox", { name: "PWJB_python", exact: true }).uncheck();
      await page.getByRole("textbox", { name: "搜索用户", exact: true }).press("Escape");
      assert.match(await picker.innerText(), /PWJB_ADMIN/);
      await page.getByRole("button", { name: "保存工作流", exact: true }).click();
      await page.getByText("保存并验证成功", { exact: true }).waitFor();
      assert.deepEqual(await page.evaluate(() => window.__calls.find(c => c.method === "powerjob/saveWorkflow").p.draft.config.notifyUserIds), ["2"]);
      assert(await picker.isDisabled());
      assert.deepEqual(failures, []);
      console.log("Notification user sandbox smoke passed: view lock, multi-selection, search, deselection and saved IDs.");
      return;
    }
    assert.equal(await page.locator('.wf-nav').count(), 0, 'global workflow tabs should be removed');
    assert.equal(await page.getByRole('tab', { name: '编排', exact: true }).count(), 1);
    const configToggle = page.getByRole('button', { name: '定义与编排', exact: true });
    assert.equal(await configToggle.count(), 1, 'workflow configuration has a collapse control');
    assert.equal(await configToggle.getAttribute('aria-expanded'), 'true');
    const configBox = await page.locator('.wf-definition-config').boundingBox();
    const actionsBox = await page.locator('.wf-editor-toolbar').boundingBox();
    assert(configBox.y + configBox.height <= actionsBox.y + 1, 'configuration must be above orchestration actions');
    const expandedCanvasHeight = await page.locator('.workflow-canvas').evaluate(el => el.getBoundingClientRect().height);
    const toolbarLayout = await page.locator('.wf-editor .wf-canvas-toolbar').evaluate(el => {
      const groups = [...el.querySelectorAll('.wf-toolbar-group')];
      return { rows: groups.map(group => Math.round(group.getBoundingClientRect().top)), gap: getComputedStyle(el).gap, innerGap: getComputedStyle(groups[0]).gap };
    });
    assert.equal(new Set(toolbarLayout.rows).size, 1, 'canvas actions stay in one row');
    assert(Number.parseFloat(toolbarLayout.gap) > Number.parseFloat(toolbarLayout.innerGap), 'larger gaps separate action categories');
    await configToggle.click();
    assert.equal(await page.getByRole('textbox', { name: '名称', exact: true }).isVisible(), false);
    assert(await page.locator('.workflow-canvas').evaluate(el => el.getBoundingClientRect().height) > expandedCanvasHeight, 'collapse releases canvas space');
    await configToggle.focus();
    await configToggle.press('Enter');
    assert.equal(await configToggle.getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('.wf-editor').getByRole('button', { name: '运行', exact: true }).count(), 0);
    const otherWorkflow = page.getByRole('button', { name: /另一个流程/ });
    await otherWorkflow.focus();
    await otherWorkflow.press('Shift+F10');
    assert.equal(await page.getByRole('menuitem').count(), 4);
    await page.getByRole('menuitem', { name: '运行', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__calls.filter(c => c.method === 'powerjob/runWorkflow').length), 0);
    await page.getByRole('button', { name: /演示流程/ }).click();
    await page.getByRole('textbox', { name: '名称', exact: true }).waitFor();
    assert.equal(await page.locator(".react-flow__node").count(), 2);
    const density = await page.evaluate(() => {
      const style = (selector) => getComputedStyle(document.querySelector(selector));
      return {
        inputHeight: style('.wf-fieldset input[data-slot="input"]').height,
        inputFont: style('.wf-fieldset input[data-slot="input"]').fontSize,
        rowFont: style('.wf-list-item strong').fontSize,
        metaFont: style('.wf-list-item small').fontSize,
        buttonHeight: style('.wf-detail-tabs button').height,
      };
    });
    assert.deepEqual(density, {
      inputHeight: '28px', inputFont: '12px', rowFont: '12px',
      metaFont: '11px', buttonHeight: '28px',
    }, 'workflow controls should match Jobs density');
    const listHandle = page.getByRole('separator', { name: '调整工作流列表与详情宽度' });
    const inspectorHandle = page.getByRole('separator', { name: '调整画布与节点属性区域宽度' });
    const width = (selector) => page.locator(selector).evaluate(el => el.getBoundingClientRect().width);
    const listBefore = await width('.wf-list');
    const handleBox = await listHandle.boundingBox();
    await browserPage.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await browserPage.mouse.down();
    await browserPage.mouse.move(handleBox.x + 85, handleBox.y + handleBox.height / 2, { steps: 8 });
    await browserPage.mouse.up();
    assert(await width('.wf-list') > listBefore + 40, 'list separator should resize the list');
    const inspectorBefore = await width('.wf-editor .wf-inspector');
    await inspectorHandle.focus();
    await inspectorHandle.press('ArrowLeft');
    assert(await width('.wf-editor .wf-inspector') > inspectorBefore, 'keyboard should resize definition panel');
    await page.waitForFunction(() => window.__storage.has('local.powerjob.readonly.workflow-list-width') && window.__storage.has('local.powerjob.readonly.workflow-inspector-width'));
    const savedWidths = await page.evaluate(() => [
      window.__storage.get('local.powerjob.readonly.workflow-list-width'),
      window.__storage.get('local.powerjob.readonly.workflow-inspector-width'),
    ]);
    await page.getByRole('button', { name: '任务', exact: true }).click();
    await page.getByRole('button', { name: '工作流', exact: true }).click();
    await page.getByRole('button', { name: /演示流程/ }).click();
    await page.locator('.wf-editor .wf-inspector').waitFor();
    assert(Math.abs(await width('.wf-list') - savedWidths[0]) < 3, 'list width should restore after remount');
    assert(Math.abs(await width('.wf-editor .wf-inspector') - savedWidths[1]) < 3, 'inspector width should restore after remount');
    await browserPage.setViewportSize({ width: 900, height: 750 });
    assert(await width('.wf-list') >= 179, 'list minimum width');
    assert(await width('.wf-editor .wf-inspector') >= 219, 'inspector minimum width');
    assert(await width('.wf-editor-graph') >= 319, 'canvas minimum width');
    await page.getByRole('textbox', { name: '查找节点', exact: true }).fill('清洗数据');
    await page.getByRole('textbox', { name: '查找节点', exact: true }).press('Enter');
    const narrowNode = page.locator('.react-flow__node').filter({ hasText: '清洗数据' });
    await narrowNode.click();
    assert.match(await narrowNode.getAttribute('class'), /selected/, 'node stays interactive in narrow canvas');
    await browserPage.setViewportSize({ width: 1450, height: 950 });
    await browserPage.screenshot({ path: path.resolve(__dirname, '../.ui-preview/workflow-density.png') });
    await page.getByRole("button", { name: "编辑", exact: true }).click();
    await page.getByRole("button", { name: "通知用户", exact: true }).click();
    await page.getByRole("checkbox", { name: "PWJB_ADMIN", exact: true }).check();
    await page.getByRole("checkbox", { name: "PWJB_python", exact: true }).check();
    await page.getByRole("textbox", { name: "搜索用户", exact: true }).fill("python");
    assert.equal(await page.locator('[data-slot="popover-content"]').getByRole("checkbox").count(), 1);
    await page.getByRole("checkbox", { name: "PWJB_python", exact: true }).uncheck();
    await page.getByRole("textbox", { name: "搜索用户", exact: true }).press("Escape");
    assert.match(await page.getByRole("button", { name: "通知用户", exact: true }).innerText(), /PWJB_ADMIN/);
    await page
      .getByRole("textbox", { name: "名称", exact: true })
      .fill("更新后的流程");
    await otherWorkflow.click({ button: 'right' });
    await page.getByRole('menuitem', { name: '删除', exact: true }).click();
    await page.getByRole('button', { name: '继续编辑', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: '名称', exact: true }).inputValue(), '更新后的流程');
    assert.equal(await page.evaluate(() => window.__calls.filter(c => c.method === 'powerjob/deleteWorkflow').length), 0);
    await configToggle.click();
    await configToggle.click();
    assert.equal(await page.getByRole('textbox', { name: '名称', exact: true }).inputValue(), '更新后的流程', 'collapse preserves draft values');
    await page
      .locator(".react-flow__node")
      .filter({ hasText: "清洗数据" })
      .click();
    await page.getByRole("button", { name: "复制节点", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelectorAll(".react-flow__node").length === 3,
    );
    assert.equal(await page.locator(".react-flow__node").count(), 3);
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelectorAll(".react-flow__node").length === 2,
    );
    assert.equal(await page.locator(".react-flow__node").count(), 2);
    await page.getByRole("button", { name: "任务", exact: true }).click();
    await page.getByRole("dialog").waitFor();
    await page.getByRole("button", { name: "继续编辑", exact: true }).click();
    await page.getByRole('tab', { name: '实例', exact: true }).click();
    await page.getByRole('dialog').waitFor();
    await page.getByRole('button', { name: '继续编辑', exact: true }).click();
    assert.equal(await page.getByRole('tab', { name: '编排', exact: true }).getAttribute('aria-selected'), 'true');
    await page.getByRole("button", { name: "保存工作流", exact: true }).click();
    await page.getByText("保存并验证成功", { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.__calls.find(c => c.method === "powerjob/saveWorkflow").p.draft.config.notifyUserIds), ["2"]);
    assert.equal(
      await page.evaluate(
        () =>
          window.__calls.filter((c) => c.method === "powerjob/saveWorkflow")
            .length,
      ),
      1,
    );
    await page
      .getByRole("tab", { name: "实例", exact: true })
      .last()
      .click();
    assert.equal(await page.locator('.wf-list').isVisible(), true);
    assert.equal(await page.getByRole('textbox', { name: '工作流 ID', exact: true }).count(), 0);
    await page.waitForFunction(() => window.__calls.some(c => c.method === 'powerjob/workflowInstances' && c.p.workflowId === '77'));
    await page.evaluate(() => { window.__holdWorkflowInstances = true; });
    await page.locator('.wf-filters').getByRole('button', { name: '刷新', exact: true }).click();
    await page.waitForFunction(() => !!window.__releaseWorkflowInstances);
    await page.getByRole('button', { name: /另一个流程/ }).click();
    await page.waitForFunction(() => window.__calls.some(c => c.method === 'powerjob/workflowInstances' && c.p.workflowId === '88'));
    assert.equal(await page.getByRole('tab', { name: '实例', exact: true }).getAttribute('aria-selected'), 'true');
    assert.equal(await page.getByRole('cell', { name: '981844507211334656', exact: true }).count(), 0);
    await page.evaluate(() => { window.__holdWorkflowInstances = false; window.__releaseWorkflowInstances(); });
    await browserPage.waitForTimeout(100);
    assert.equal(await page.getByRole('cell', { name: '981844507211334656', exact: true }).count(), 0, 'late result must not cross workflow contexts');
    await page.getByRole('button', { name: /更新后的流程/ }).click();
    const workflowRow = page.getByRole('row', { name: /981844507211334656/ });
    const rowSelectionBeforeAction = await workflowRow.getAttribute('aria-selected');
    await workflowRow.getByRole('button', { name: '重试', exact: true }).click();
    assert.equal(await workflowRow.getAttribute('aria-selected'), rowSelectionBeforeAction);
    await page.getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__calls.filter(c => c.method === 'powerjob/retryWorkflowInstance').length), 0);
    await workflowRow.getByRole('button', { name: '重试', exact: true }).click();
    await page.getByRole('button', { name: '确认', exact: true }).click();
    await page.waitForFunction(() => window.__calls.some(c => c.method === 'powerjob/retryWorkflowInstance'));
    assert.equal(await page.evaluate(() => window.__calls.find(c => c.method === 'powerjob/retryWorkflowInstance').p.wfInstanceId), '981844507211334656');
    await page
      .getByRole("cell", { name: "981844507211334656", exact: true })
      .click();
    await page
      .locator(".react-flow__node")
      .filter({ hasText: "清洗数据" })
      .click();
    await page.getByText("test log", { exact: true }).waitFor();
    const instanceHeightHandle = page.getByRole('separator', { name: '调整工作流实例列表与画布高度' });
    const instanceListHeight = await page.locator('.wf-instance-list').evaluate(el => el.getBoundingClientRect().height);
    const heightBox = await instanceHeightHandle.boundingBox();
    await browserPage.mouse.move(heightBox.x + heightBox.width / 2, heightBox.y + heightBox.height / 2);
    await browserPage.mouse.down();
    await browserPage.mouse.move(heightBox.x + heightBox.width / 2, heightBox.y + heightBox.height / 2 + 35, { steps: 8 });
    await browserPage.mouse.up();
    assert.notEqual(await page.locator('.wf-instance-list').evaluate(el => el.getBoundingClientRect().height), instanceListHeight);
    await page.waitForFunction(() => typeof window.__storage.get('local.powerjob.workflow.instance-list-height') === 'number');
    const instanceWidthHandle = page.getByRole('separator', { name: '调整画布与节点属性区域宽度' });
    const inspectorWidth = await page.locator('.wf-inspector').evaluate(el => el.getBoundingClientRect().width);
    const widthBox = await instanceWidthHandle.boundingBox();
    await browserPage.mouse.move(widthBox.x + widthBox.width / 2, widthBox.y + widthBox.height / 2);
    await browserPage.mouse.down();
    await browserPage.mouse.move(widthBox.x + widthBox.width / 2 - 35, widthBox.y + widthBox.height / 2, { steps: 8 });
    await browserPage.mouse.up();
    assert.notEqual(await page.locator('.wf-inspector').evaluate(el => el.getBoundingClientRect().width), inspectorWidth);
    await page.waitForFunction(() => typeof window.__storage.get('local.powerjob.workflow.instance-inspector-width') === 'number');
    await page.getByRole('button', { name: '折叠详情' }).click();
    await page.getByRole('button', { name: '展开详情' }).click();
    await page.locator('.wf-inspector').getByText('节点参数').click();
    assert.equal(await page.locator('.wf-inspector pre').first().evaluate(el => getComputedStyle(el).fontFamily.includes('mono')), true);
    await page
      .getByRole("button", { name: "标记节点成功", exact: true })
      .click();
    await page.getByRole("button", { name: "取消", exact: true }).click();
    assert.equal(
      await page.evaluate(
        () =>
          window.__calls.filter(
            (c) => c.method === "powerjob/markWorkflowNodeSuccess",
          ).length,
      ),
      0,
    );
    await page
      .getByRole("button", { name: "标记节点成功", exact: true })
      .click();
    await page.getByRole("button", { name: "确认", exact: true }).click();
    await page.getByText("操作已提交", { exact: true }).last().waitFor();
    await page
      .locator(".react-flow__node")
      .filter({ hasText: "子流程" })
      .click();
    await page
      .locator(".wf-inspector")
      .getByRole("button", { name: "嵌套工作流", exact: true })
      .click();
    await page
      .getByRole("button", { name: "返回父实例", exact: true })
      .waitFor();
    await page.getByRole("button", { name: "返回父实例", exact: true }).click();
    await page
      .getByText("#981844507211334656", { exact: false })
      .first()
      .waitFor();
    assert.deepEqual(failures, []);
    await browserPage.screenshot({
      path: path.resolve(__dirname, "../.ui-preview/workflow.png"),
      fullPage: true,
    });
    await page.getByRole("tab", { name: "编排", exact: true }).click();
    const pollCount = await page.evaluate(() => window.__calls.filter(c => c.method === 'powerjob/workflowInstances').length);
    await browserPage.waitForTimeout(3200);
    assert.equal(await page.evaluate(() => window.__calls.filter(c => c.method === 'powerjob/workflowInstances').length), pollCount, 'hidden instances must stop polling');
    await page.getByRole('button', { name: /更新后的流程/ }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: '运行', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '运行', exact: true }).click();
    await page.locator('.wf-instance-list .instance-actions').waitFor();
    assert.equal(await page.getByRole('tab', { name: '实例', exact: true }).getAttribute('aria-selected'), 'true');
    const runQuery = await page.evaluate(() => window.__calls.filter(c => c.method === 'powerjob/workflowInstances').at(-1).p);
    assert.equal(runQuery.workflowId, '77');
    assert.equal(runQuery.wfInstanceId, '', 'run selects the new instance without narrowing the list');
    await page.getByRole('tab', { name: '编排', exact: true }).click();
    await page.getByRole("button", { name: "新建工作流", exact: true }).click();
    await page
      .getByRole("textbox", { name: "名称", exact: true })
      .fill("新流程");
    await page
      .getByRole("button", { name: "添加节点 · 任务节点", exact: true })
      .click();
    await page.getByRole("button", { name: "选择任务", exact: true }).click();
    const jobPicker = page.getByRole("dialog", { name: "选择任务" });
    await jobPicker.getByRole("button", { name: "下一页" }).click();
    await jobPicker.getByText("2 / 2").waitFor();
    await jobPicker.getByRole("button", { name: "取消" }).click();
    assert.equal(await page.getByTestId("selected-job-reference").textContent(), "—");
    await page.getByRole("button", { name: "选择任务", exact: true }).click();
    await jobPicker.getByRole("searchbox", { name: "搜索任务" }).fill("清洗");
    await jobPicker.getByRole("button", { name: "搜索", exact: true }).click();
    await jobPicker.getByRole("button", { name: /清洗数据.*#7/ }).click();
    assert.match(await page.getByTestId("selected-job-reference").textContent(), /#7/);
    const firstNode = await page
      .locator(".react-flow__node")
      .first()
      .getAttribute("data-id");
    await page
      .getByRole("button", { name: "添加节点 · 判断节点", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Groovy 脚本", exact: true })
      .fill("return true");
    await page.waitForFunction(
      () => document.querySelectorAll(".react-flow__node").length === 2,
    );
    const decisionNode = await page
      .locator(".react-flow__node")
      .filter({ hasText: "判断节点" })
      .getAttribute("data-id");
    await page
      .getByRole("button", { name: "添加节点 · 任务节点", exact: true })
      .click();
    await page.getByRole("button", { name: "选择任务", exact: true }).click();
    await page.getByRole("dialog", { name: "选择任务" }).getByRole("button", { name: /清洗数据.*#7/ }).click();
    await page.waitForFunction(
      () => document.querySelectorAll(".react-flow__node").length === 3,
    );
    const lastNode = await page
      .locator(".react-flow__node")
      .last()
      .getAttribute("data-id");
    await page
      .locator(
        `.react-flow__node[data-id="${decisionNode}"] .react-flow__handle[data-handleid="true"]`,
      )
      .dragTo(
        page.locator(
          `.react-flow__node[data-id="${firstNode}"] .react-flow__handle.target`,
        ),
      );
    await page
      .locator(
        `.react-flow__node[data-id="${decisionNode}"] .react-flow__handle[data-handleid="false"]`,
      )
      .dragTo(
        page.locator(
          `.react-flow__node[data-id="${lastNode}"] .react-flow__handle.target`,
        ),
      );
    await page.waitForFunction(
      () => document.querySelectorAll(".react-flow__edge").length === 2,
    );
    await page.getByRole("button", { name: "保存工作流", exact: true }).click();
    await page.getByRole("textbox", { name: "名称", exact: true }).waitFor();
    await page.waitForFunction(
      () =>
        window.__calls.filter((c) => c.method === "powerjob/saveWorkflow")
          .length === 2,
    );
    await page.getByText("工作流已保存", { exact: true }).waitFor();
    await page.locator(".wf-editor-toolbar").waitFor();
    assert.equal(
      await page
        .getByRole("textbox", { name: "名称", exact: true })
        .inputValue(),
      "新流程",
    );
    await browserPage.addInitScript(() => {
      window.__readOnly = true;
    });
    const reloadedFrame = browserPage.waitForEvent("framenavigated", { predicate: frame => frame.url() === "about:srcdoc" });
    await browserPage.reload();
    page = await reloadedFrame;
    await page.getByRole("button", { name: "工作流", exact: true }).click();
    await page.getByText("只读连接", { exact: true }).waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "新建工作流", exact: true })
        .isDisabled(),
      true,
    );
    assert.deepEqual(failures, []);
    console.log(
      "Sandbox UI smoke passed: restrictive CSP, canvas, dirty navigation, staged save, log, canceled/confirmed action and nested navigation.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
