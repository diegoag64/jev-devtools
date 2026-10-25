import { Marked } from "marked";

export const changelogURL = "https://raw.githubusercontent.com/diegoag64/jev-devtools/main/CHANGELOG.md";
export const changelogSource = "https://github.com/diegoag64/jev-devtools/blob/main/CHANGELOG.md";
const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Preserve GitHub-style release anchors, including the two hyphens around an em dash.
export function renderChangelog(markdown: string) {
  if (markdown.length > 1_000_000 || !/^# Changelog\s*$/m.test(markdown) || !/^## /m.test(markdown))
    throw new Error("Invalid changelog response");
  const headings: { id: string; title: string; depth: number }[] = [];
  const counts = new Map<string, number>();
  const idFor = (text: string) => {
    const slug = text.toLowerCase().replace(/[^\p{L}\p{N}_\- ]/gu, "").replace(/ /g, "-") || "section";
    const count = counts.get(slug) ?? 0;
    counts.set(slug, count + 1);
    return count ? `${slug}-${count}` : slug;
  };
  const parser = new Marked({ async: false, renderer: {
    html({ text }) { return escape(text); },
    image({ text }) { return escape(text); },
    link({ href, tokens }) {
      const text = this.parser.parseInline(tokens);
      let url: URL;
      try { url = new URL(href, changelogSource.replace(/CHANGELOG.md$/, "")); }
      catch { return text; }
      if (!["http:", "https:", "mailto:"].includes(url.protocol)) return text;
      return `<a href="${escape(href.startsWith("#") ? href : url.href)}">${text}</a>`;
    },
    heading({ text, tokens, depth }) {
      const id = idFor(text);
      return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}<a class="heading-link" href="#${id}" aria-label="Link to ${escape(text)}">#</a></h${depth}>`;
    },
  }});
  const tokens = parser.lexer(markdown.replace(/^# Changelog\s*\n/, ""));
  const sections: { title?: string; body: typeof tokens }[] = [{ body: Object.assign([], { links: tokens.links }) }];
  for (const token of tokens) {
    if (token.type === "heading" && token.depth === 2)
      sections.push({ title: token.text, body: Object.assign([], { links: tokens.links }) });
    else sections.at(-1)!.body.push(token);
  }
  const html = sections.map(({ title, body }) => {
    if (!title) return `<div class="changelog-intro">${parser.parser(body)}</div>`;
    const id = idFor(title);
    const release = /^(\d+\.\d+\.\d+(?:-[\w.-]+)?) — (.+?)(?: \(([^)]+)\))?$/.exec(title);
    const label = release?.[1] ?? title;
    headings.push({ id, title: label, depth: 2 });
    const content = parser.parser(body);
    if (title === "At a glance")
      return `<details class="release-overview" id="${id}"><summary>${escape(title)}</summary>${content}</details>`;
    const badge = title === "Unreleased" ? "Not published to npm" : release?.[3];
    return `<section class="release"><header class="release-header"><h2 id="${id}">${escape(label)}<a class="heading-link" href="#${id}" aria-label="Link to ${escape(label)}">#</a></h2>${release ? `<p class="release-date">${escape(release[2])}</p>` : ""}${badge ? `<span class="release-badge">${escape(badge)}</span>` : ""}</header><div class="release-body">${content}</div></section>`;
  }).join("");
  return { html, headings };
}
