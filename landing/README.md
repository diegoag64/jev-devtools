# JevTools landing page

Independent, static Vite + TypeScript app for `jevtools.dev`. It is intentionally outside the npm workspace graph, with its own lockfile, styles, and authored diagrams. It imports no package or playground code, has no runtime dependencies, and makes no inference or API requests. Docs and GitHub links navigate externally only when clicked.

## Local development

Use Node **22.12+** (the repository currently uses Node 26 locally):

```sh
cd landing
npm ci
npm run dev
```

Open the printed localhost URL (default `http://127.0.0.1:4190`). Run `npm run build` for a type-checked static build in `dist/`, or `npm run preview` to serve it locally. No credentials or environment variables are needed. Hosting and DNS are not configured by this change.

## Editing

- `src/main.ts`: page sections, SVG renderer, playback, accessible controls, and clipboard feedback.
- `src/flows.ts`: six self-contained, abbreviated cookbook-inspired illustrations. Values are authored samples, not captured inference. RAG shows three illustrative passages, not the full twelve-item cookbook. Model probabilities are separate from application routing policies.
- `src/style.css`: landing-only palette, responsive layouts, primitive illustrations, and signal animation.
- `public/favicon.svg`: local brand mark; no remote fonts, images, analytics, or SDKs are loaded.

The designs reference the Jev DevTools drawer and [diagram-motion-lab](https://github.com/diegoag64/diagram-motion-lab). The renderer, graph data, and illustrations are newly authored; no third-party implementation or cookbook datasets are copied.

Diagrams sit directly beneath the hero without an explorer frame, header, or tabs. Six examples cycle automatically, with a hold after each build animation. Previous, pause/play, and next controls sit beneath the diagram; offscreen and hidden-tab playback suspends. Reduced motion displays the complete graph without animation or automatic cycling. All controls support keyboard navigation. On narrow screens, diagrams scroll horizontally to preserve readable node labels.

The installation snippet shows only the browser mount. Visitors must follow the linked docs to connect their server adapter. The website itself has no server integration.
