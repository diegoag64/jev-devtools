import { referenceGroups, referenceKind } from "./reference-layout.js";

export type ApiPreview = {
  title: string;
  kind: string;
  source: string;
  summaryHtml: string;
};

// Use the same compiled glossary as the full page. These fragments contain
// trusted repository HTML, never user input or remote documentation.
export function apiPreviews(html: string, base: string) {
  const index: Record<string, ApiPreview> = {};
  const fragments: Record<string, string> = {};
  // The highlighter shares tooltip definitions across the full page. Include
  // definitions used by each standalone entry, even when first emitted earlier.
  const tooltips = new Map<string, string>();
  for (const match of html.matchAll(
    /<div id="([^"]+)" class="type-popup"[^>]*>/g,
  )) {
    const tags = /<\/?div\b[^>]*>/g;
    tags.lastIndex = match.index + match[0].length;
    let depth = 1;
    let tag: RegExpExecArray | null;
    while ((tag = tags.exec(html))) {
      depth += tag[0].startsWith("</") ? -1 : 1;
      if (depth === 0) {
        tooltips.set(match[1], html.slice(match.index, tags.lastIndex));
        break;
      }
    }
  }
  let source = "";
  for (const section of html.split(/(?=<h[23] id=")/)) {
    const heading = section.match(/^<h([23]) id="([^"]+)">([\s\S]*?)<\/h\1>/);
    if (!heading) continue;
    const [, depth, id, label] = heading;
    if (depth === "2") {
      source = referenceGroups[id]?.source ?? "";
      continue;
    }
    let body = section.slice(heading[0].length);
    const helpIds = new Set(
      [...body.matchAll(/data-type-info="([^"]+)"/g)].map((match) => match[1]),
    );
    for (const helpId of helpIds) {
      if (body.includes(`id="${helpId}"`)) continue;
      const tooltip = tooltips.get(helpId);
      if (!tooltip) throw new Error(`Missing API tooltip: ${helpId}`);
      body += tooltip;
    }
    const title = label
      .replace(/<a\b[\s\S]*?<\/a>/g, "")
      .replace(/<[^>]+>/g, "");
    index[id] = {
      title,
      kind: referenceKind(id),
      source,
      summaryHtml:
        body.match(/<p>([\s\S]*?)<\/p>/)?.[1] ??
        "Read the API contract and examples.",
    };
    // Fragment links belong to the glossary, not the reader's current guide.
    fragments[id] = body.replace(/href="#/g, `href="${base}api/reference/#`);
    index[id].summaryHtml = index[id].summaryHtml.replace(
      /href="#/g,
      `href="${base}api/reference/#`,
    );
  }
  return { index, fragments };
}

export function markApiLinks(
  html: string,
  base: string,
  index: Record<string, ApiPreview>,
  glossary: boolean,
) {
  return html.replace(
    /<a\b([^>]*?)href="([^"]+)"([^>]*)>/g,
    (tag, before: string, href: string, after: string) => {
      if (/class="[^"]*heading-link/.test(tag)) return tag;
      const prefix = `${base}api/reference/#`;
      const id = href.startsWith(prefix)
        ? href.slice(prefix.length)
        : glossary && href.startsWith("#")
          ? href.slice(1)
          : "";
      return Object.hasOwn(index, id)
        ? `<a${before}href="${href}"${after} data-api-preview="${id}">`
        : tag;
    },
  );
}
