const assert = require("node:assert/strict");

module.exports = async ({ frame, calls, button, failures }) => {
  await frame.evaluate(() => {
    window.__instances = [
      { instanceId: "9007199254740993", status: 3 },
      { instanceId: "9007199254740994", status: 2 },
      { instanceId: "9007199254740995", status: 4 },
      { instanceId: "9007199254740996", status: 5 },
    ];
  });
  await frame.locator(".job-item").filter({ hasText: "Alpha" }).click();
  await button("Instances & logs").click();
  const stop = () => frame.locator(".instances-table").getByRole("button", { name: "Stop", exact: true });
  await stop().waitFor();
  assert.equal(await stop().count(), 1);
  await stop().click();
  await frame.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  assert.equal((await calls("powerjob/stopInstance")).length, 0);
  await stop().click();
  await frame.getByRole("dialog").press("Escape");
  assert.equal((await calls("powerjob/stopInstance")).length, 0);
  await stop().click();
  // Changing jobs invalidates a pending confirmation.
  await frame.evaluate(() => document.querySelectorAll(".job-item")[1].click());
  await frame.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  assert.equal((await calls("powerjob/stopInstance")).length, 0);
  await frame.locator(".job-item").filter({ hasText: "Alpha" }).click();
  await stop().click();
  await frame.evaluate(() => { window.__fail["powerjob/stopInstance"] = true; });
  await frame.getByRole("dialog").getByRole("button", { name: "Stop", exact: true }).click();
  await frame.getByText("Failed to stop instance. Refresh and check permissions or current state.", { exact: true }).waitFor();
  assert.equal(await stop().isEnabled(), true);
  const before = (await calls("powerjob/instances")).length;
  await frame.evaluate(() => { window.__hold["powerjob/stopInstance"] = true; });
  await stop().click();
  await frame.getByRole("dialog").getByRole("button", { name: "Stop", exact: true }).evaluate(el => { el.click(); el.click(); });
  await frame.waitForFunction(() => window.__held.length === 1);
  assert.equal((await calls("powerjob/stopInstance")).length, 2);
  assert.equal(await stop().isDisabled(), true);
  assert.deepEqual((await calls("powerjob/stopInstance")).at(-1).params, {
    connectionId: "A", appId: "4", jobId: "7", instanceId: "9007199254740993", type: "NORMAL",
  });
  await frame.evaluate(() => {
    window.__instances[0].status = 10;
    window.__held.shift().resolve({ success: true });
    delete window.__hold["powerjob/stopInstance"];
  });
  await frame.waitForFunction(count => window.__calls.filter(call => call.method === "powerjob/instances").length > count, before);
  await stop().waitFor({ state: "detached" });
  await frame.getByText("Instance stop requested", { exact: true }).waitFor();
  assert.equal(failures.length, 0, failures.join("\n"));
  console.log("Stop instance sandbox smoke passed: status gate, cancel/Escape, context cleanup, failure recovery, duplicate suppression and refresh.");
};
