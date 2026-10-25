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
- `src/product-showcases.ts`: real drawer recording, Flow API definition/diagram comparison, and local sample-outcome controls.
- `src/flows.ts`: six self-contained, abbreviated cookbook-inspired illustrations. Values are authored samples, not captured inference. RAG shows three illustrative passages, not the full twelve-item cookbook. Model probabilities are separate from application routing policies.
- `src/style.css`: landing-only palette, responsive layouts, primitive illustrations, and signal animation.
- `public/favicon.svg`: local brand mark; no remote fonts, images, analytics, or SDKs are loaded.

The designs reference the Jev DevTools drawer and [diagram-motion-lab](https://github.com/diegoag64/diagram-motion-lab). The renderer, graph data, and illustrations are newly authored; no third-party implementation or cookbook datasets are copied.

Diagrams sit directly beneath the hero without an explorer frame, header, or tabs. Six examples cycle automatically, with a hold after each build animation. Previous, pause/play, and next controls sit beneath the diagram; offscreen and hidden-tab playback suspends. Reduced motion displays the complete graph without animation or automatic cycling. All controls support keyboard navigation. On narrow screens, diagrams scroll horizontally to preserve readable node labels.

The installation snippet shows only the browser mount. Visitors must follow the linked docs to connect their server adapter. The website itself has no server integration.

## Product showcases

The drawer section serves a web-optimized copy of the project-owner-supplied “Screen Recording 2026-10-24 at 2.27.41 PM.mov”: a 31-second skill-suggestion cookbook recording, converted to 1920 × 1066 H.264 MP4 at 30 fps with fast-start enabled. It starts at the beginning and uses native playback controls. There is no autoplay, audio, embedded app, or live transport. A written description accompanies the video. Playback pauses offscreen or when the tab is hidden.

The Flow API section uses a valid definition based on `docs/flows.md`. Its displayed source is documentation, not executed browser code. Two authored sample values highlight approve/manual-review branches of the matching diagram. The 0.90 threshold is illustrative application policy, and the output does not issue a refund. Actual integrations run the Flow API on the server with the connected inspector.
