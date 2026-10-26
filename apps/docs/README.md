# Jev DevTools documentation app

A plain Vite multi-page app: Markdown becomes static HTML at build time; TypeScript adds local search, copy buttons, theme switching, mobile navigation, and opt-in interactive examples. No frontend framework, runtime Markdown parser, remote fonts, analytics, hosted search, or inference backend is required.

## Develop

From the repository root, with Node 22.12+:

```sh
npm ci
npm run build:package
npm run dev:docs
```

Open http://127.0.0.1:4185/. Content/example edits regenerate pages and reload the browser; CSS/TypeScript uses Vite HMR. Navigation/compiler changes restart Vite through its config dependencies. `npm run check` builds the package and checks the examples against public declarations. Existing `docs/` guides and links remain intact; `apps/docs/` follows the repository's app workspace convention.

## Initial rendering

Pages load their stylesheet through a render-blocking link in the head, independent of the client module. A small synchronous head script restores the saved theme before content can paint; unavailable storage falls back to the system preference. Keep CSS out of the deferred client entry to avoid development-mode unstyled flashes on full-page navigation.

`npm run verify:docs` also holds external scripts during initial loads and link navigation in Vite development and production preview, checking the visible styling and document canvas for saved/system themes and blocked storage.

## Author

- Add a Markdown file under `content/`, then register its title, description, group, and slug in `pages.ts`. Omit H1: the shell supplies the page title.
- Use site-relative Markdown links such as `[Quick start](@/getting-started/)`. These adapt to `DOCS_BASE`. Use ordinary fragments for headings and absolute URLs for external resources.
- Include a checked snippet with `<!-- example: server.ts -->`. Sources live in `examples/`, are type-checked, and are expanded in both HTML and downloadable Markdown. Do not execute credential-dependent examples during a docs build.
- Complete `example:` includes receive build-time Shiki highlighting, Twoslash checks against public imports, and curated API help. Examples are never executed. The docs workspace pins TypeScript 6 (and matching transitive peers) for its compiler API; repository tooling continues to use TypeScript 7.
- `api-help.ts` contains compact usage summaries and property descriptions. `api-hovers.ts` selects imported core APIs, their receivers, callback builders, and direct option objects. Locals, application-defined keys, SDK methods/options, and import statements stay plain code. Help content is static HTML outside the copyable code; identical help is reused within each page. The existing lazy browser module only positions and dismisses tooltips.
- Partial fenced snippets opt into authored help with `ts api=server`, `ts api=expressions`, `ts api=parallel`, or `tsx api=core`. These contexts match the surrounding setup described in the prose; they do not claim the fragment is a complete, type-checked program. Unmarked fences remain plain highlighted code. Add deliberate context and help entries when expanding coverage.
- Markdown and embedded HTML are trusted repository source, reviewed like code. This compiler is not an untrusted-content sanitizer.
- The API glossary at `/api/reference/` owns stable method links. Add/update the readable inputs, outputs, usage, and limitations there when changing a public API, and link related guides to it. `type-reference.ts` reads public package declarations at build time; rebuild the package after changing its API. Add a human description for new public types. Keep complete beginner flow examples in `examples/` and verify their explained results.
- `api-links.ts` maps receiver-aware hover titles to glossary targets, including property help through its owning method. Reference links render outside copyable code and work without JavaScript. API glossary headings are individual search destinations.
- Keep headings unique where possible; duplicate heading slugs receive suffixes. Heading IDs are deep links, so preserve them when editing.
- Add interactions in `src/` and dynamically import them only on pages that need them. The introduction demo uses fixed fixtures and no network inference.
- Keep current-working-tree and published behavior distinct. Avoid declaring unreleased APIs available in the published npm version.

## Build and hosting

```sh
npm run build:docs
npm run verify:docs
npm run preview -w @jev-devtools/docs
```

Browser verification uses Playwright Chromium. Install it once with `npx playwright install chromium --only-shell` if it is not already available.

Preview serves the existing `dist/` artifact without regenerating Markdown or rerunning Twoslash; rebuild to include source changes. Verification still generates the site for the build and development server and runs the browser and initial-rendering checks. CI uses the pinned Chromium headless shell with the `ubuntu-24.04` runner's system libraries, matching drawer verification.

Output is `apps/docs/dist/`. Each route has its own `index.html`; use a static host that serves directory indexes, without SPA catch-all rewrites. Raw Markdown and `llms.txt` are generated alongside the site. Search downloads its local index only when opened.

For a subdirectory deployment:

```sh
DOCS_BASE=/docs/ npm run build:docs
DOCS_BASE=/docs/ npm run preview -w @jev-devtools/docs
```

Open `/docs/` on the preview server. The base must start and end with `/`; only simple path segments are accepted. The public site is hosted on GPT Sites at https://docs.jevtools.dev. Choose canonical URL and sitemap deliberately when adding them. Missing routes should retain the host's 404 response.

Every page emits Open Graph and Twitter metadata in its static HTML, using its existing title and description and requesting `summary_large_image`. The shared image is `assets/social/jevtools-docs.png`, copied to `dist/social/jevtools-docs.png`. Social page and image URLs use the public docs origin and honor `DOCS_BASE`. Keep the image dimensions and alt text in `site.ts` aligned when replacing the asset. Publication is manual; merging these files does not update live previews.

## Content direction and next steps

See [the research and architecture notes](../../docs/documentation-site.md). This first pass includes onboarding, framework/privacy/troubleshooting guides, a full public API glossary with readable contracts and exact declarations, a greeting-flow tutorial and checked reference examples for every operation, example links, and a separate agent page. The TypeSafe SDK itself and wire-protocol transport semantics remain separate references.

The hosted site is the primary human documentation. The original integration, flow, and Next.js documents remain detailed companion references with stable repository paths. READMEs and the landing page lead to the site; the bundled skill remains self-contained for installed-version/offline use. Update the affected companion guidance alongside API changes; the static changelog links prepared releases to GitHub release notes for verified publication status.

## Changelog and publishing

`/changelog/` renders `CHANGELOG.md` into release sections with historical dates, prepared/unreleased labels, source links, and GitHub-compatible anchors. The overview table is collapsible; all source notes remain available. Categorized entries use the headings authored in `CHANGELOG.md`, with per-release jump links and counts; the renderer does not infer categories or rewrite release facts. Follow `CONTRIBUTING.md#changelog-categories` when adding entries. Relative links resolve against the GitHub repository. There is no separate manually maintained changelog content file and no browser fetch or Markdown parser.

- Local development and `npm run build:docs` use the working-tree changelog and emit a labeled `version.json` manifest. The sidebar links to its source package version and build details.
- **Before an explicitly requested publication**, use a clean, reviewed commit on `main` and run `npm run build:docs:publish`. This rebuilds package declarations, rejects uncommitted/untracked changes, and embeds that checkout's changelog with commit-pinned source links. It does not fetch a different revision from GitHub. Verify the resulting artifact with `npm run verify -w @jev-devtools/docs` without rebuilding it.
- Follow [the manual publishing policy](../../docs/docs-publishing.md) and its `docs:publication` inspection/staging/readback helpers for triggers, checks, the version manifest, the existing public GPT Sites identity, publication receipts, and recovery. CI validates and retains previews; it never deploys. GitHub remains the editable source. Generated deployment checkouts/archives stay under ignored `benchmarks/results/docs/`.

## GitHub header

The header uses bundled GitHub Octicons and a star count fetched once per build or dev-server process from the public GitHub repository API. It does not make visitor-side GitHub requests. Rebuild/restart to refresh the count. The count is a non-interactive statistic, with no hover/selected state or tab stop. Unavailable or invalid counts display an em dash with an accessible explanation; zero is a valid count. Icon attribution is retained in `assets/octicons-LICENSE.txt` and the published `third-party-notices.txt`.

## Method documentation style

Use **Parameters** for positional arguments, **Options** or **Properties** for object fields, and **Props** for React component props. API reference method sections must show both input and return interfaces in tables with types. Tutorials should build toward one concrete result, show expected output after each run, and link to those method contracts. Keep optional operations and exhaustive interface tables in the reference. Preserve old heading IDs when restructuring a tutorial. Distinguish a builder's expression reference from its resolved runtime value; do not imply that `FlowOutcome.value` has an inferred concrete public type. Explain each code example using its actual variables, operations, and result. Avoid vague labels such as “Part” or “What comes back.” Use short method names in on-page navigation through `tocLabels`, preserving existing heading IDs and deep links.

Complete flow examples must pair the synchronous definition with an explicit `await program.run(...)`, concrete input, client setup (or a link to it), and use of the resolved outcome/value. Keep execution inside a callable async function so importing examples never triggers inference. Before Jev examples, explain that `flow.jev()` creates future-answer references and the runner awaits the SDK request. Label partial reference fragments with their required scope and link to a complete define-and-run example.

## Glossary layout and reading position

Start every glossary entry with one or two concise sentences explaining what it does and when to use it, before its signature or declaration. Generated callable declarations reuse the introduction from the matching entry; supporting types require their own description in `type-reference.ts`.

The glossary uses h2 headings for API groups, h3 headings for individual APIs, and h4 headings for Signature, Inputs, Returns, Example, and How it works. The build adds labeled method sections and group headers without changing their permanent IDs. Keep the source Markdown structured this way; do not manually add card markup around methods. Grouped outline links are generated from the same headings. Declarations remain native disclosures, and all groups and method links are available without JavaScript.

The shared outline script marks one link with `aria-current="location"` using the reader's scroll position. It follows native fragment navigation, browser history, and content resizing; it never rewrites the URL or moves keyboard focus. On the glossary it opens the current method's group and scrolls only the outline to keep that link visible. Readers can also expand other groups manually. The vertical line under each group fills with the accent color to the center of the method label being reached, then advances toward the next label while reading that method. Each method occupies its own span of the sidebar track, regardless of its content length or label wrapping. It updates on resize and expanded declarations, fills completed sections, and reverses when scrolling up. CSS paints the fill from a custom property set by the existing scroll handler; there is no timed animation, and the ordinary line remains without JavaScript.

## Type help in reference code

`type-help.ts` is the curated registry for important package types. Add a concise description, readable signature, import source, and optional property explanations there; keep them aligned with the public declarations. The generated type cards reuse these descriptions. Reference-page TypeScript blocks automatically include this help, including signatures and expandable declarations. Elsewhere, opt in with a `ts types` fence; this flag can accompany an existing `api=...` profile or checked example. Identifier scanning supports abbreviated signatures and skips comments/string contents. Built-in types and unregistered names stay undecorated. This is authored help, not runtime type inference or a replacement for exact declarations.

Method and type permalinks belong to the stationary card, with a separate ID for its sticky heading. Preserve this separation so jumps from below, repeated clicks, history, and no-JavaScript navigation reveal the start of the content.

## Package installation blocks

Use a `sh install` fence containing one `pnpm add` command for package installation. The build emits pnpm, npm, Yarn, and Bun variants; the small selector module loads only on pages with these blocks. pnpm is the default in both HTML and raw Markdown. The reader’s selection is remembered when storage is available, and copying uses only the selected command. Keep repository checkout/packing scripts in ordinary shell fences because they follow the repository’s npm workflow. Install fences currently accept package names and versions, not flags or multiline scripts; extend the command mapping explicitly before documenting other install modes.

Command syntax follows the official [pnpm](https://pnpm.io/cli/add), [npm](https://docs.npmjs.com/cli/v11/commands/npm-install/), [Yarn](https://yarnpkg.com/cli/add), and [Bun](https://bun.sh/docs/pm/cli/add) documentation. Selecting Bun here changes the install command; the package’s documented Node runtime requirement still applies.

### Brand assets

`assets/logo.svg` reuses the landing page’s flow symbol (`landing/src/main.ts` on `codex/landing`). It inherits the docs text color so it stays light in dark mode and dark in light mode. The header uses the same `jevtools.` wordmark. `assets/favicon-light.svg` preserves the landing favicon geometry with a pale pink background and dark pink symbol. Both SVGs render without JavaScript; the favicon is copied at build time.

## API link previews

Links to individual glossary methods and public types get an adjacent preview button. Hovering or focusing the link opens a summary with **Open reference** and **Read in side panel** actions. Ordinary link activation keeps native navigation, including new-tab shortcuts. Touch users use the preview button. Escape, the close button, or the panel backdrop dismiss the panel and return focus to its source control without changing the guide URL or scroll position. Without JavaScript, links remain ordinary anchors.

`api-previews.ts` derives summaries and per-entry HTML fragments from the same compiled glossary used for the reference page. Only known glossary entries are enhanced, and section links in fragments resolve to the full reference under the configured base path. The browser lazily fetches the metadata index on first use and each full entry on demand. Failed loads retain the full-page link and allow a retry. No external preview service is used.

The panel namespaces IDs and accessibility references to coexist with the original glossary, preserves code help, and uses the shared delegated copy handler. Keep generated fragments free of application scripts. `verify-api-previews.mjs`, called by `verify:docs`, checks pointer/keyboard/touch access, native navigation, reader position, copy, focus restoration, ID uniqueness, and network-failure recovery. Run it with a subdirectory `DOCS_BASE` when changing link resolution.
