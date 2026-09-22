import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const serverUrl = process.env.GITEA_SERVER_URL || process.env.GITHUB_SERVER_URL;
const repository = process.env.GITHUB_REPOSITORY;
const commitSha = process.env.GITHUB_SHA;
const sourceTag = process.env.GITHUB_REF_NAME;
const token = process.env.GITEA_TOKEN || process.env.GITHUB_TOKEN;
const assetPaths = process.argv.slice(2);

const requiredValues = { serverUrl, repository, commitSha, sourceTag, token };
for (const [name, value] of Object.entries(requiredValues)) {
  if (!value) throw new Error(`Missing required release environment value: ${name}`);
}
if (assetPaths.length === 0) throw new Error("No release assets were provided.");

const apiBase = `${serverUrl.replace(/\/$/, "")}/api/v1/repos/${repository}`;
const latestTag = "latest";

async function apiRequest(path, options, allowedStatuses) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      Authorization: `token ${token}`,
      ...options.headers,
    },
  });

  if (!allowedStatuses.includes(response.status)) {
    const responseBody = await response.text();
    throw new Error(
      `${options.method} ${path} failed with ${response.status}: ${responseBody || response.statusText}`,
    );
  }

  return response;
}

await apiRequest(
  `/releases/tags/${encodeURIComponent(latestTag)}`,
  { method: "DELETE" },
  [204, 404],
);
await apiRequest(`/tags/${encodeURIComponent(latestTag)}`, { method: "DELETE" }, [204, 404]);

const releaseResponse = await apiRequest(
  "/releases",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tag_name: latestTag,
      target_commitish: commitSha,
      name: "Latest",
      body: `Built from ${sourceTag} (${commitSha.slice(0, 12)}).`,
      draft: false,
      prerelease: false,
    }),
  },
  [201],
);
const release = await releaseResponse.json();

for (const assetPath of assetPaths) {
  const assetName = basename(assetPath);
  const form = new FormData();
  form.append("attachment", new Blob([await readFile(assetPath)]), assetName);

  await apiRequest(
    `/releases/${release.id}/assets?name=${encodeURIComponent(assetName)}`,
    { method: "POST", body: form },
    [201],
  );
  console.log(`Uploaded ${assetName}`);
}

console.log(`Published ${repository} ${latestTag} from ${sourceTag}.`);

