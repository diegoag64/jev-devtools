// These labels describe documentation groups, not additional package exports.
export const referenceGroups: Record<string, { label: string; source?: string }> = {
  "find-an-api": { label: "Browse APIs" },
  react: { label: "React", source: "jev-devtools" },
  "server-adapter": { label: "Server", source: "jev-devtools/server" },
  "flow-definitions-and-steps": { label: "Flows", source: "jev-devtools/flow" },
  "expressions-and-conditions": { label: "Expressions", source: "jev-devtools/flow" },
  "fixtures-and-comparison": { label: "Fixtures", source: "jev-devtools/flow" },
  recorder: { label: "Recorder", source: "jev-devtools/server" },
  "observer-hooks": { label: "Observer hooks", source: "jev-devtools/flow" },
  "public-types": { label: "Public types" },
  "exact-callable-declarations": { label: "Exact declarations" },
  "supporting-structural-types": { label: "Supporting types" },
};

export function referenceKind(id: string) {
  if (id.startsWith("type-")) return "Type";
  if (id === "jevdevtools") return "Component";
  if (id === "styles-css") return "Stylesheet";
  if (id === "flowexpression" || id === "jevrecorder") return "Class";
  if (id === "flowlooplimiterror") return "Error";
  if (["flow-input", "flow-definition", "request-answers", "adapter-middleware"].includes(id)) return "Property";
  return /^(flow|request|expression|adapter|recorder|observer)-/.test(id) ? "Method" : "Function";
}

export function referenceLabel(id: string, title: string) {
  const label = title.replace(/^Type: /, "").replace(/^(flow|request|expression|adapter|recorder|observer)\./, "");
  return ["Method", "Function"].includes(referenceKind(id)) ? `${label}()` : label;
}

// The compiler owns these h2/h3 tags. Code examples are already escaped, so
// their source cannot be mistaken for document boundaries. Preserve every ID.
export function layoutReference(html: string) {
  let groupOpen = false;
  let entryOpen = false;
  const closeEntry = () => {
    if (!entryOpen) return "";
    entryOpen = false;
    return "</div></section>";
  };
  const closeGroup = () => {
    if (!groupOpen) return "";
    groupOpen = false;
    return "</section>";
  };
  let output = "";
  for (const part of html.split(/(?=<h[23] id=")/)) {
    const heading = part.match(/^<h([23]) id="([^"]+)">[\s\S]*?<\/h\1>/);
    if (!heading) { output += part; continue; }
    const [, depth, id] = heading;
    const rest = part.slice(heading[0].length);
    if (depth === "2") {
      output += closeEntry() + closeGroup();
      groupOpen = true;
      const source = referenceGroups[id]?.source;
      output += `<section class="reference-group" aria-labelledby="${id}"><header class="reference-group-header">${source ? `<p class="reference-source">${source}</p>` : ""}${heading[0]}</header>${rest}`;
    } else {
      output += closeEntry();
      entryOpen = true;
      output += `<section class="api-entry" aria-labelledby="${id}"><header class="api-entry-header"><span class="api-kind">${referenceKind(id)}</span>${heading[0]}</header><div class="api-entry-body">${rest}`;
    }
  }
  return output + closeEntry() + closeGroup();
}
