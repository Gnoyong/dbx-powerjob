import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path, { delimiter } from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "node_modules", "@dbx-app", "plugin-cli", "bin", "dbx-plugin.js");
const env = { ...process.env };

if (process.platform === "win32") {
  const pathKey = Object.keys(env).find(key => key.toLowerCase() === "path") ?? "Path";
  const goBinCandidates = [
    env.ProgramFiles && path.join(env.ProgramFiles, "Go", "bin"),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, "Programs", "Go", "bin"),
  ].filter(Boolean);
  const goBin = goBinCandidates.find(candidate => existsSync(path.join(candidate, "go.exe")));
  const pathEntries = (env[pathKey] ?? "").split(delimiter).filter(Boolean);

  if (goBin && !pathEntries.some(entry => path.resolve(entry).toLowerCase() === path.resolve(goBin).toLowerCase())) {
    env[pathKey] = [goBin, ...pathEntries].join(delimiter);
  }
}

const go = spawnSync("go", ["version"], { env, stdio: "ignore" });
if (go.error?.code === "ENOENT") {
  process.stderr.write("Go 1.22+ is required. Install Go or add its bin directory to PATH, then restart the terminal.\n");
  process.exit(1);
}
if (go.status !== 0) {
  process.stderr.write("Unable to run `go version`. Check the Go installation and PATH.\n");
  process.exit(1);
}

const child = spawn(process.execPath, [cli, "dev", "--path", root, "--port", "15190"], {
  cwd: root,
  env: {
    ...env,
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
