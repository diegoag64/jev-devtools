import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";
import { changelogURL, changelogSource, renderChangelog } from "./changelog.js";
import { codeRenderer } from "./highlight.js";
import { groups, pages, type Page } from "./pages.js";

export const appRoot = dirname(fileURLToPath(import.meta.url));
const repo = "https://github.com/diegoag64/jev-devtools";
// Run in the head, before styles/content paint; a deferred module is too late
// when the saved choice differs from the operating system's color scheme.
const themeScript = `try{const theme=localStorage.getItem("jev-docs-theme");if(theme==="light"||theme==="dark")document.documentElement.dataset.theme=theme;}catch{}`;
export const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function normalizeBase(value = "/") {
  if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(value))
    throw new Error(
      "DOCS_BASE must be / or a path with trailing slash, e.g. /docs/.",
    );
  return value;
}
export async function compile(markdown: string) {
  const headings: { id: string; title: string; depth: number }[] = [];
  const ids = new Map<string, number>();
  const renderCode = await codeRenderer();
  const renderer = new Marked({
    renderer: {
      heading({ tokens, depth }) {
        const html = this.parser.parseInline(tokens);
        const title = html.replace(/<[^>]*>/g, "");
        const slug =
          title
            .toLowerCase()
            .replace(/&[^;]+;/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "") || "section";
        const count = ids.get(slug) ?? 0;
        ids.set(slug, count + 1);
        const id = count ? `${slug}-${count}` : slug;
        headings.push({ id, title, depth });
        return `<h${depth} id="${id}">${html}<a class="heading-link" href="#${id}" aria-label="Link to ${escape(title)}">#</a></h${depth}>`;
      },
      code({ text, lang }) {
        return renderCode(text, lang);
      },
    },
  });
  return { html: await renderer.parse(markdown), headings };
}
async function expandExamples(source: string) {
  const matches = [
    ...source.matchAll(/<!-- example: ([\w-]+\.(?:ts|tsx))( twoslash)? -->/g),
  ];
  for (const match of matches) {
    const code = await readFile(resolve(appRoot, "examples", match[1]), "utf8");
    source = source.replace(
      match[0],
      `\n\x60\x60\x60${match[1].endsWith("tsx") ? "tsx" : "ts"} twoslash file=${match[1]}\n${code.trim()}\n\x60\x60\x60\n`,
    );
  }
  return source;
}
export async function generate(
  base: string,
  generated: string,
  changelogSourceMode: "local" | "github" = "local",
) {
  const href = (slug: string) => base + (slug ? slug + "/" : "");
  const search: { title: string; group: string; url: string; text: string }[] =
    [];
  const inputs: Record<string, string> = {};
  await mkdir(resolve(generated, "public/raw"), { recursive: true });
  const remoteChangelog = changelogSourceMode === "github"
    ? await fetch(changelogURL, { signal: AbortSignal.timeout(10000), cache: "no-cache" }).then(async (response) => {
        if (!response.ok) throw new Error(`GitHub changelog: ${response.status}`);
        return response.text();
      })
    : undefined;
  for (const [index, page] of pages.entries()) {
    const isChangelog = page.slug === "changelog";
    const markdown = await expandExamples(
      isChangelog
        ? remoteChangelog ?? await readFile(resolve(appRoot, "../../CHANGELOG.md"), "utf8")
        : await readFile(resolve(appRoot, "content", page.file), "utf8"),
    );
    // @/ is a site-relative link; leave external URLs and fragment links untouched.
    const linked = markdown.replace(
      /\]\(@\/([^)]*)\)/g,
      (_, path: string) => `](${base}${path})`,
    );
    const { html, headings } = isChangelog ? renderChangelog(linked) : await compile(linked);
    const changelogStatus = `Saved ${new Date().toISOString().slice(0, 10)} · ${remoteChangelog ? "GitHub main" : "working-tree copy"}.`;
    const editURL = isChangelog ? `${repo}/edit/main/CHANGELOG.md` : `${repo}/edit/main/apps/docs/content/${page.file}`;
    const file = resolve(generated, page.slug, "index.html");
    const source = (name: string) =>
      relative(dirname(file), resolve(appRoot, "src", name))
        .split("\\")
        .join("/");
    const nav = groups
      .map(
        (group) =>
          `<section class="nav-group"><h2>${group}</h2>${pages
            .filter((p) => p.group === group)
            .map(
              (p) =>
                `<a href="${href(p.slug)}" ${p.slug === page.slug ? 'aria-current="page"' : ""}>${escape(p.title)}</a>`,
            )
            .join("")}</section>`,
      )
      .join("");
    const neighbour = (p: Page | undefined, label: string) =>
      p
        ? `<a href="${href(p.slug)}"><small>${label}</small><span>${escape(p.title)} ${label === "Next" ? "→" : ""}</span></a>`
        : "<span></span>";
    const doc = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${escape(page.description)}"><meta name="color-scheme" content="light dark"><script>${themeScript}</script><link rel="stylesheet" href="${source("style.css")}"><title>${escape(page.title)} · Jev DevTools</title><link rel="icon" href="${base}favicon.svg" type="image/svg+xml"></head><body>
<a class="skip-link" href="#main">Skip to content</a>
<header class="topbar"><a class="brand" href="${base}" aria-label="Jev DevTools home"><span class="brand-mark" aria-hidden="true">j<span>•</span></span><strong>jev<span> / devtools</span></strong></a><span class="docs-label">Documentation</span><button class="search-trigger" type="button" hidden><span>Search documentation</span><kbd>⌘ K</kbd></button><a class="github-link" href="${repo}">GitHub ↗</a><button class="theme-toggle" type="button" aria-label="Switch color theme" hidden>◐</button><button class="menu-toggle" type="button" aria-expanded="false" aria-controls="sidebar" hidden>Menu</button></header>
<div class="layout"><aside id="sidebar" class="sidebar"><div class="version">Working tree docs <span>pre-1.0</span></div><nav aria-label="Documentation">${nav}</nav></aside>
<main id="main" tabindex="-1"><div class="breadcrumb">Docs <span>/</span> ${page.group}</div><div class="page-heading"><p class="eyebrow">${page.group}</p><h1>${page.title}</h1><p class="lead">${page.description}</p></div>${isChangelog ? `<div class="changelog-source"><a href="${changelogSource}">Source on GitHub ↗</a><p>${changelogStatus}</p></div>` : ""}<article>${html}</article><footer class="article-footer"><a href="${editURL}">Edit this page ↗</a><a href="${base}raw/${page.slug || "introduction"}.md">Read as Markdown</a></footer><nav class="page-nav" aria-label="Previous and next pages">${neighbour(pages[index - 1], "Previous")}${neighbour(pages[index + 1], "Next")}</nav><p class="site-note">Jev DevTools is an independent, open-source community project. It is not affiliated with TypeSafe AI.</p></main>
<aside class="toc"><nav aria-label="On this page"><p>On this page</p>${headings
      .filter((h) => h.depth === 2)
      .map((h) => `<a href="#${h.id}">${escape(h.title)}</a>`)
      .join(
        "",
      )}</nav></aside></div>
<dialog id="search-dialog" aria-labelledby="search-title"><div class="search-header"><label id="search-title" for="search-input">Search the docs</label><button type="button" class="close-search" aria-label="Close search">Esc</button></div><input id="search-input" type="search" placeholder="Try ‘Next.js’ or ‘createClient’" autocomplete="off"><p id="search-status" role="status"></p><ul id="search-results"></ul></dialog>
<script type="module" src="${source("client.ts")}"></script></body></html>`;
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, doc);
    inputs[page.slug || "index"] = file;
    const raw = resolve(
      generated,
      "public/raw",
      `${page.slug || "introduction"}.md`,
    );
    await mkdir(dirname(raw), { recursive: true });
    await writeFile(raw, isChangelog ? markdown : `# ${page.title}\n\n${page.description}\n\n${linked}`);
    search.push({
      title: page.title,
      group: page.group,
      url: href(page.slug),
      text: `${page.description} ${markdown.replace(/<[^>]*>/g, "").replace(/[#*`|]/g, " ")}`,
    });
  }
  await writeFile(
    resolve(generated, "public/search-index.json"),
    JSON.stringify(search),
  );
  await writeFile(
    resolve(generated, "public/llms.txt"),
    `# Jev DevTools\n\nWorking-tree documentation. Check the changelog before using unreleased APIs.\n\n${pages.map((p) => `- [${p.title}](${base}raw/${p.slug || "introduction"}.md): ${p.description}`).join("\n")}\n`,
  );
  await writeFile(
    resolve(generated, "public/favicon.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#e73676"/><text x="13" y="28" font-size="30" font-family="monospace" fill="white">j</text></svg>',
  );
  return inputs;
}
