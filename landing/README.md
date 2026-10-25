# JevTools landing page

Independent, static Vite + TypeScript app for `jevtools.dev`. It is intentionally outside the npm workspace graph, with its own lockfile, styles, and authored diagrams. It imports no package or playground code, has no runtime dependencies, and makes no inference or API requests. Docs and GitHub links navigate externally only when clicked.

## Local development

Use Node **22.12+** (Node 24 is the repository CI baseline):

```sh
cd landing
npm ci
npm run dev
```

Open the printed localhost URL (default `http://127.0.0.1:4190`). Run `npm run build` for a type-checked static build in `dist/`, or `npm run preview` to serve it locally. No credentials or environment variables are needed. The standalone `landing` CI job installs this lockfile, runs the tests, and builds on Node 24 for every PR/main push; it does not deploy. Hosting uses the Sites project recorded in `.openai/hosting.json`; see Publishing below.

## Editing

- `src/main.ts`: page sections, SVG renderer, playback, accessible controls, and clipboard feedback.
- `src/product-showcases.ts`: real drawer recording, Flow API definition/diagram comparison, and local sample-outcome controls.
- `src/flows.ts`: six self-contained, abbreviated cookbook-inspired illustrations. Values are authored samples, not captured inference. RAG shows three illustrative passages, not the full twelve-item cookbook. Model probabilities are separate from application routing policies.
- `src/style.css`: landing-only palette, responsive layouts, primitive illustrations, and signal animation.
- `public/favicon.svg`: local brand mark; no remote fonts, images, analytics, or SDKs are loaded.
- `index.html` and `public/social/jevtools.png`: Open Graph and Twitter sharing metadata and the selected prismatic sharing image. Both image tags use the public HTTPS URL, and the card metadata requests `summary_large_image`; keep the declared image dimensions and alt text aligned when replacing it. Sharing-image publication follows the manual workflow below.

The designs reference the Jev DevTools drawer and [diagram-motion-lab](https://github.com/diegoag64/diagram-motion-lab). The renderer, graph data, and illustrations are newly authored; no third-party implementation or cookbook datasets are copied.

Diagrams sit directly beneath the hero without an explorer frame, header, or tabs. Six examples cycle automatically, with a hold after each build animation. Previous, pause/play, and next controls sit beneath the diagram; offscreen and hidden-tab playback suspends. Reduced motion displays the complete graph without animation or automatic cycling. All controls support keyboard navigation. On narrow screens, diagrams scroll horizontally to preserve readable node labels.

The installation snippet shows only the browser mount. Visitors must follow the linked docs to connect their server adapter. The website itself has no server integration.

## Hero color animation

The hero uses the chosen Prism foil and Jade & gold treatment in development and production. Each 32-second color takeover randomly picks a transition different from the previous one: left-to-right, right-to-left, sides-to-center, center-to-sides, or scattered spots. The mask stays fixed throughout that takeover; a new mask begins only when the incoming palette is fully revealed. Facet motion stays continuous, and only narrow local edges blend.

`src/hero-effects/transition-cycle.ts` owns palette timing and transition selection. The painters, bounded working canvases, and native-text mask live alongside it. Animation suspends offscreen and in hidden tabs; reduced motion freezes the field, forced colors restores native text, and unavailable canvas/letter-spacing support retains solid pink. No experiment picker, alternate palette catalog, or CSS pearl animation remains. `npm test` verifies the takeover boundary and non-repeating random selection.

## Section themes

Full-width sections use `section-band` with an inner `.wrap` for content alignment. Add `data-theme="plum"` for the alternate aubergine surface (`#19131e`), a soft rose glow, lighter muted text, and fine borders; omit it for the default near-black surface. The drawer, Flow API, and closing sections currently alternate with the default sections. Spacing is shared through `--section-space`; visual demos retain their original dark surfaces.

## Product showcases

The drawer section serves a web-optimized copy of the project-owner-supplied “Screen Recording 2026-10-24 at 2.27.41 PM.mov”: a 31-second skill-suggestion cookbook recording, converted to 1920 × 1066 H.264 MP4 at 30 fps with fast-start enabled. It starts at the beginning and uses native playback controls. There is no autoplay, audio, embedded app, or live transport. A written description accompanies the video. Playback pauses offscreen or when the tab is hidden.

The Flow API section uses a valid definition based on `docs/flows.md`. Its displayed source is documentation, not executed browser code. Two authored sample values highlight approve/manual-review branches of the matching diagram. The 0.90 threshold is illustrative application policy, and the output does not issue a refund. Actual integrations run the Flow API on the server with the connected inspector.

## Publishing

The public Sites project is **jevtools landing**, with the generated URL [jevtools-landing.diego-arias94.chatgpt.site](https://jevtools-landing.diego-arias94.chatgpt.site). `.openai/hosting.json` retains its project identity and declares `dist/` as the static build output.

The public website is [jevtools.dev](https://jevtools.dev/), with documentation at [docs.jevtools.dev](https://docs.jevtools.dev/). GitHub `main` is the reviewed source; changes use a new feature PR. Publishing requires an explicit maintainer request and is separate from merging or npm releases: use the Sites workflow with the existing project ID, synchronize this directory into the Site's dedicated source checkout, run the landing tests and production build, and save/deploy the exact pushed Site source and matching archive. Do not push the parent monorepo, dependencies, or generated verification evidence into the Site source. A GitHub push alone does not deploy.

Custom-domain setup for `jevtools.dev` is managed through Sites. Use the routing and validation records returned for that hostname; keep the existing `docs.jevtools.dev` DNS record intact.
