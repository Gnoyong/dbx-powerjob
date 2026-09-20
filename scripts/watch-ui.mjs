import { build } from "vite";
import { fileURLToPath } from "node:url";
import path from "node:path";

process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
const watcher = await build({ build: { watch: {} } });
let failed = false;
watcher.on("event", event => {
  if (event.code === "START") failed = false;
  if (event.code === "ERROR") {
    failed = true;
    process.stderr.write(`${event.error}\n`);
  }
  if (event.code === "END" && !failed) process.stdout.write("DBX_UI_BUILD_SUCCESS\n");
});

const stop = async () => {
  await watcher.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
