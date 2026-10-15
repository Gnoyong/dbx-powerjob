import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path, { delimiter } from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "node_modules", "@dbx-app", "plugin-cli", "bin", "dbx-plugin.js");
const manifestVersion = JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8")).version;
const backendSource = readFileSync(path.join(root, "backend", "main.go"), "utf8");
const backendVersions = [...backendSource.matchAll(/^\s*Version:\s*"([^"]+)"\s*,/gm)];
if (backendVersions.length !== 1 || backendVersions[0][1] !== manifestVersion) {
  process.stderr.write(`Sidecar version ${backendVersions[0]?.[1] ?? "unknown"} does not match manifest version ${manifestVersion}. Update backend/main.go before running dev.\n`);
  process.exit(1);
}
const env = { ...process.env };
env.GOCACHE = path.join(root, "backend", ".go-cache");
mkdirSync(env.GOCACHE, { recursive: true });

if (process.platform === "win32") {
  // Go compilation happens before ui_build, so its temp directory must be
  // configured here rather than only in the frontend build script.
  const temp = path.join(root, ".dbx-dev", "tmp");
  mkdirSync(temp, { recursive: true });
  Object.assign(env, { TEMP: temp, TMP: temp, TMPDIR: temp, GOTMPDIR: temp });
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
  env,
  stdio: "inherit",
});

child.on("error", (error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = signal ? 130 : (code ?? 1);
});
