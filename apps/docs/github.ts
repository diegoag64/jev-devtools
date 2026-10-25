import { readFileSync } from "node:fs";

export const repositoryURL = "https://github.com/diegoag64/jev-devtools";
// GitHub Octicons (MIT); retain assets/octicons-LICENSE.txt in published output.
const icon = (name: string) => readFileSync(new URL(`./assets/${name}.svg`, import.meta.url), "utf8")
  .replace("<svg ", '<svg aria-hidden="true" focusable="false" fill="currentColor" ');
const githubIcon = icon("github");
const starIcon = icon("star");
let stars: Promise<number | undefined> | undefined;

export async function renderGitHubLinks() {
  // One lookup per build/dev-server process, not per page or hot reload. A
  // missing optional count must not prevent offline docs work or publication.
  stars ??= fetch("https://api.github.com/repos/diegoag64/jev-devtools", {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "jev-devtools-docs" },
    signal: AbortSignal.timeout(5000),
  }).then(async (response) => {
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
    const data = await response.json() as { stargazers_count?: unknown };
    const count = data.stargazers_count;
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0)
      throw new Error("GitHub returned an invalid star count");
    return count;
  }).catch((error: unknown) => {
    console.warn(`GitHub star count unavailable; showing an unavailable count. ${String(error)}`);
    return undefined;
  });
  const count = await stars;
  const label = count === undefined ? "GitHub star count unavailable" : `${count.toLocaleString("en-US")} GitHub stars`;
  const display = count === undefined ? "—" : new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(count);
  return `<div class="github-links"><a class="github-link" href="${repositoryURL}" aria-label="GitHub repository">${githubIcon}<span class="github-label">GitHub</span></a><span class="github-stars" role="img" aria-label="${label}" title="${label}${count === undefined ? "" : " at docs build time"}">${starIcon}<span aria-hidden="true">${display}</span></span></div>`;
}
