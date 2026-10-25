import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHighlighter } from "shiki";
import { createTransformerFactory } from "@shikijs/twoslash/core";
import { createTwoslasher } from "twoslash";
import ts from "typescript";
import { apiHovers } from "./api-hovers.js";

const app = dirname(fileURLToPath(import.meta.url));
const themes = { light: "github-light", dark: "github-dark" } as const;
const highlighter = createHighlighter({
  themes: Object.values(themes),
  langs: ["typescript", "tsx", "javascript", "jsx", "bash", "json"],
});
// Twoslash needs the JS compiler API. Keep its compiler and standard library
// together; the repository's TypeScript 7 CLI does not expose that API.
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
  const popupIds = new Map<string, string>();
  return (text: string, meta = "text") => {
    const [language, ...flags] = meta.split(/\s+/);
    const checked = flags.includes("twoslash");
    const profile = flags.find((flag) => flag.startsWith("api="))?.slice(4);
    const annotations =
      checked || profile ? apiHovers(text, language, profile) : [];
    const popups: string[] = [];
    const lang = shiki.getLoadedLanguages().includes(language)
      ? language
      : "text";
    let source = text;
    const transformers = [];
    if (checked) {
      const filename = flags.find((flag) => flag.startsWith("file="))?.slice(5);
      if (!filename || !/^[\w-]+\.tsx?$/.test(filename))
        throw new Error("Twoslash examples need a local example filename.");
      // Isolate each virtual project: Twoslash clears analyzed files afterward.
      // Reusing its filesystem would hide a previous example from later imports.
      const twoslasher = createTwoslasher({
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
          types: ["node", "vite/client"],
          jsx: ts.JsxEmit.ReactJSX,
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
        },
      });
      // Resolve imports beside the checked source. Only the original example
      // is displayed or copied; compiler setup never reaches the page.
      source = `// @filename: examples/${filename}\n// ---cut---\n${text}`;
      transformers.push(
        createTransformerFactory(twoslasher)({
          renderer: {
            nodeStaticInfo(_info, node) {
              return node;
            },
          },
        }),
      );
    }
    // The same static decorations render help for checked examples and explicit
    // partial fragments. Hover content never comes from expanded compiler types.
    const decorations = annotations.map((annotation) => {
      const { help } = annotation;
      const key = JSON.stringify(help);
      let id = popupIds.get(key);
      if (!id) {
        id = `type-info-${sequence++}`;
        popupIds.set(key, id);
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
      }
      return {
        start: annotation.start,
        end: annotation.end,
        alwaysWrap: true,
        properties: {
          class: "type-token",
          tabindex: 0,
          role: "button",
          "aria-label": `${annotation.target}: API help`,
          "aria-describedby": id,
          "aria-expanded": "false",
          "data-type-info": id,
        },
      };
    });
    const html = shiki.codeToHtml(source, {
      lang,
      themes,
      defaultColor: false,
      transformers,
      decorations,
    });
    return `<div class="code-block"><div class="code-toolbar"><span>${escape(language)}${annotations.length ? " · API help" : ""}</span><button type="button" class="copy-code" hidden>Copy code</button></div>${html}</div>${popups.join("")}`;
  };
}
