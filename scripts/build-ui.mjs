import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Keep esbuild temporary files in the writable project directory on Windows.
const env = { ...process.env };
if (process.platform === "win32") {
  const temp = path.join(root, ".build-temp");
  mkdirSync(temp, { recursive: true });
  Object.assign(env, { TEMP: temp, TMP: temp, TMPDIR: temp });
}
for (const args of [
  ["node_modules/typescript/bin/tsc", "--noEmit"],
  ["node_modules/vite/bin/vite.js", "build", "--configLoader", "runner"],
  ["scripts/test-ui-bundle.mjs"],
]) {
  const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
