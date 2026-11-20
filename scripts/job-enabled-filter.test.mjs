import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const jobsPane = readFileSync(
  new URL("../frontend/components/JobsPane.tsx", import.meta.url),
  "utf8",
);
const useJobs = readFileSync(
  new URL("../frontend/tasks/useJobs.ts", import.meta.url),
  "utf8",
);

test("jobs list exposes an enabled-state filter", () => {
  assert.match(jobsPane, /NativeSelect/);
  assert.match(jobsPane, /id="job-enabled-filter"/);
  assert.match(jobsPane, /onEnabledFilterChange/);
  assert.match(jobsPane, /t\("allJobStates"\)/);
  assert.match(jobsPane, /t\("enabled"\)/);
  assert.match(jobsPane, /t\("disabled"\)/);
});

test("jobs hook sends the enabled filter and resets pagination", () => {
  assert.match(useJobs, /enabledFilter/);
  assert.match(useJobs, /enabled: enabledFilter/);
  assert.doesNotMatch(useJobs, /filterJobs/);
  assert.match(useJobs, /setJobsIndex\(0\)/);
  assert.match(useJobs, /enabledFilter !== "all"[\s\S]*?refreshJobs\(\)/);
});
