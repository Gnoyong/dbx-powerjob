import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packagePath = resolve(projectRoot, "package.json");
const manifestPath = resolve(projectRoot, "manifest.json");
const tasksPath = resolve(projectRoot, ".vscode", "tasks.json");

function parseVersion(value, label) {
  const normalized = value.trim().replace(/^v/, "");
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(normalized);
  if (!match) throw new Error(`${label} must use the x.y.z format.`);
  return {
    value: normalized,
    parts: match.slice(1).map(Number),
  };
}

function compareVersions(left, right) {
  for (let index = 0; index < left.parts.length; index += 1) {
    if (left.parts[index] !== right.parts[index]) {
      return left.parts[index] - right.parts[index];
    }
  }
  return 0;
}

function nextPatch(version) {
  const [major, minor, patch] = version.parts;
  return `${major}.${minor}.${patch + 1}`;
}

function runGit(args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`git ${args.join(" ")} failed with exit code ${result.status}.`);
  }
  return result;
}

function replaceTopLevelVersion(source, currentVersion, newVersion, fileName) {
  const currentEntry = `"version": "${currentVersion}"`;
  const replacement = `"version": "${newVersion}"`;
  const firstIndex = source.indexOf(currentEntry);
  if (firstIndex === -1 || source.indexOf(currentEntry, firstIndex + 1) !== -1) {
    throw new Error(`Unable to update the top-level version in ${fileName}.`);
  }
  return source.replace(currentEntry, replacement);
}

async function main() {
  const requestedVersion = process.argv[2];
  if (!requestedVersion) throw new Error("A release version is required.");

  const [packageSource, manifestSource, tasksSource] = await Promise.all([
    readFile(packagePath, "utf8"),
    readFile(manifestPath, "utf8"),
    readFile(tasksPath, "utf8"),
  ]);
  const packageJson = JSON.parse(packageSource);
  const manifestJson = JSON.parse(manifestSource);
  const tasksJson = JSON.parse(tasksSource);

  if (packageJson.version !== manifestJson.version) {
    throw new Error(
      `Version mismatch: package.json=${packageJson.version}, manifest.json=${manifestJson.version}.`,
    );
  }

  const currentVersion = parseVersion(packageJson.version, "Current version");
  const newVersion = parseVersion(requestedVersion, "New version");
  if (compareVersions(newVersion, currentVersion) <= 0) {
    throw new Error(`New version ${newVersion.value} must be greater than ${currentVersion.value}.`);
  }

  const status = runGit(["status", "--porcelain"], { capture: true });
  if (status.stdout.trim()) {
    throw new Error("The working tree must be clean before creating a release.");
  }

  const tag = `v${newVersion.value}`;
  const existingTag = runGit(["tag", "--list", tag], { capture: true });
  if (existingTag.stdout.trim()) throw new Error(`Tag ${tag} already exists locally.`);
  const branchResult = runGit(["symbolic-ref", "--short", "HEAD"], {
    capture: true,
    allowFailure: true,
  });
  const branch = branchResult.stdout.trim();
  if (branchResult.status !== 0 || !branch) {
    throw new Error("Releases cannot be created from a detached HEAD.");
  }

  const releaseInput = tasksJson.inputs?.find((input) => input.id === "releaseVersion");
  if (!releaseInput) throw new Error("VS Code releaseVersion input is missing.");
  releaseInput.default = nextPatch(newVersion);

  await Promise.all([
    writeFile(
      packagePath,
      replaceTopLevelVersion(packageSource, currentVersion.value, newVersion.value, "package.json"),
    ),
    writeFile(
      manifestPath,
      replaceTopLevelVersion(manifestSource, currentVersion.value, newVersion.value, "manifest.json"),
    ),
    writeFile(tasksPath, `${JSON.stringify(tasksJson, null, 2)}\n`),
  ]);

  runGit(["add", "package.json", "manifest.json", ".vscode/tasks.json"]);
  runGit(["commit", "-m", `chore: bump plugin version to ${newVersion.value}`]);
  runGit(["tag", "-a", tag, "-m", `Release ${tag}`]);

  try {
    runGit([
      "push",
      "--atomic",
      "origin",
      `HEAD:refs/heads/${branch}`,
      `refs/tags/${tag}`,
    ]);
  } catch (error) {
    console.error(`The release commit and ${tag} remain local. Retry the atomic push after fixing the error.`);
    throw error;
  }

  console.log(`Released ${tag}. The next suggested version is ${releaseInput.default}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
