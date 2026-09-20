import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "node_modules", "@dbx-app", "plugin-cli", "bin", "dbx-plugin.js");
const child = spawn(process.execPath, [cli, "dev", "--path", root, "--port", "5190"], {
  cwd: root,
  env: {
    ...process.env,
    GOCACHE: path.join(root, "backend", ".go-cache"),
  },
  stdio: "inherit",
});

child.on("error", (error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = signal ? 130 : (code ?? 1);
});
