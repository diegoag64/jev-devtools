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

Output is `apps/docs/dist/`. Each route has its own `index.html`; use a static host that serves directory indexes, without SPA catch-all rewrites. Raw Markdown and `llms.txt` are generated alongside the site. Search downloads its local index only when opened.

For a subdirectory deployment:

```sh
DOCS_BASE=/docs/ npm run build:docs
DOCS_BASE=/docs/ npm run preview -w @jev-devtools/docs
```

Open `/docs/` on the preview server. The base must start and end with `/`; only simple path segments are accepted. The public site is hosted on GPT Sites at https://docs.jevtools.dev. Choose canonical URL, sitemap, and social metadata deliberately when adding them. Missing routes should retain the host's 404 response.

## Content direction and next steps

See [the research and architecture notes](../../docs/documentation-site.md). This first pass includes onboarding, framework/privacy/troubleshooting guides, a full public API glossary with readable contracts and exact declarations, a beginner flow guide with checked examples for every operation, example links, and a separate agent page. The TypeSafe SDK itself and wire-protocol transport semantics remain separate references.

The original integration, flow, and Next.js documents remain the detailed companion references. If promoting this site to the canonical source, migrate those sections deliberately and replace duplicates with links in the same PR.

## Changelog and publishing

`/changelog/` renders `CHANGELOG.md` into release sections with dates, unreleased status, source links, and GitHub-compatible anchors. The overview table is collapsible; all source notes remain available. Categorized entries use the headings authored in `CHANGELOG.md`, with per-release jump links and counts; the renderer does not infer categories or rewrite release facts. Follow `CONTRIBUTING.md#changelog-categories` when adding entries. Relative links resolve against the GitHub repository. There is no separate manually maintained changelog content file and no browser fetch or Markdown parser.

- `npm run build:docs` and local development use the working-tree changelog, labeled as a working-tree copy. Changes to the root file trigger a docs reload.
- **Before publishing**, run `npm run build:docs:publish`. This fetches `main/CHANGELOG.md` from GitHub and embeds it in HTML, raw Markdown, and the search index. Failed fetches or malformed content stop publication builds. The saved date and source appear on the page. The published copy updates only with the next deployment.
- Publish the resulting `apps/docs/dist/` to the existing public GPT Sites project `appgprj_6add5705dbec8191b56b1c9555078a2d`. Reuse its identity and public audience. The dedicated Sites source checkout stores the generated static files; GitHub remains the editable source. The local deployment checkout and archives live under ignored `benchmarks/results/docs/`.
