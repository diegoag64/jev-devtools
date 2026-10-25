import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHighlighter } from "shiki";
import { createTransformerFactory } from "@shikijs/twoslash/core";
import { createTwoslasher } from "twoslash";
import ts from "typescript";
import { flowHovers } from "./flow-hovers.js";

const app = dirname(fileURLToPath(import.meta.url));
const themes = { light: "github-light", dark: "github-dark" } as const;
const highlighter = createHighlighter({
  themes: Object.values(themes),
  langs: ["typescript", "tsx", "javascript", "jsx", "bash", "json"],
});
// Twoslash needs the JS compiler API. Keep its compiler and standard library
// together; the repository's TypeScript 7 CLI does not expose that API.
let twoslasher: ReturnType<typeof createTwoslasher> | undefined;
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]!,
  );

export async function codeRenderer() {
  const shiki = await highlighter;
  let sequence = 0;
  return (text: string, meta = "text") => {
    const [language, ...flags] = meta.split(/\s+/);
    const interactive = flags.includes("twoslash");
    const popups: string[] = [];
    const lang = shiki.getLoadedLanguages().includes(language)
      ? language
      : "text";
    let source = text;
    const transformers = [];
    if (interactive) {
      const filename = flags.find((flag) => flag.startsWith("file="))?.slice(5);
      if (!filename || !/^[\w-]+\.tsx?$/.test(filename))
        throw new Error("Twoslash examples need a local example filename.");
      twoslasher ??= createTwoslasher({
        tsModule: ts,
        vfsRoot: app,
        cache: false,
        fsCache: false,
        tsLibDirectory: dirname(
          fileURLToPath(import.meta.resolve("typescript")),
        ),
        compilerOptions: {
          strict: true,
          skipLibCheck: true,
          types: ["node"],
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
        },
      });
      // Resolve imports beside the checked source. Only the original example
      // is displayed or copied; compiler setup never reaches the page.
      source = `// @filename: examples/${filename}\n// ---cut---\n${text}`;
      const selected =
        filename === "flow.ts" ? flowHovers(text) : new Map<number, never>();
      transformers.push(
        createTransformerFactory(twoslasher)({
          renderer: {
            nodeStaticInfo(info, node) {
              const help = selected.get(info.start);
              if (!help) return node;
              const id = `type-info-${sequence++}`;
              const signature = shiki.codeToHtml(help.signature, {
                lang: "ts",
                themes,
                defaultColor: false,
              });
              popups.push(
                `<div id="${id}" class="type-popup" role="tooltip" hidden><div class="type-popup-label">${escape(help.title)}</div><p>${escape(help.description)}</p>${signature}${
                  help.props
                    ? `<dl>${Object.entries(help.props)
                        .map(
                          ([name, description]) =>
                            `<dt>${escape(name)}</dt><dd>${escape(description)}</dd>`,
                        )
                        .join("")}</dl>`
                    : ""
                }</div>`,
              );
              return {
                type: "element",
                tagName: "span",
                properties: {
                  class: "type-token",
                  tabindex: 0,
                  role: "button",
                  "aria-label": `${info.target}: API help`,
                  "aria-describedby": id,
                  "aria-expanded": "false",
                  "data-type-info": id,
                },
                children: [node],
              };
            },
          },
        }),
      );
    }
    const html = shiki.codeToHtml(source, {
      lang,
      themes,
      defaultColor: false,
      transformers,
    });
    return `<div class="code-block"><div class="code-toolbar"><span>${escape(language)}${interactive ? " · API help" : ""}</span><button type="button" class="copy-code" hidden>Copy code</button></div>${html}</div>${popups.join("")}`;
  };
}
