# Jev DevTools documentation app

A plain Vite multi-page app: Markdown becomes static HTML at build time; TypeScript adds local search, copy buttons, theme switching, mobile navigation, and opt-in interactive examples. No frontend framework, runtime Markdown parser, remote fonts, analytics, hosted search, or inference backend is required.

## Develop

From the repository root, with Node 22.12+:

```sh
npm ci
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
- Regular fenced snippets can be partial illustrations; explicitly identify their missing application context. They are not automatically type-checked.
- Markdown and embedded HTML are trusted repository source, reviewed like code. This compiler is not an untrusted-content sanitizer.
- Keep headings unique where possible; duplicate heading slugs receive suffixes. Heading IDs are deep links, so preserve them when editing.
- Add interactions in `src/` and dynamically import them only on pages that need them. The introduction demo uses fixed fixtures and no network inference.
- Keep current-working-tree and published behavior distinct. Avoid declaring unreleased APIs available in the published npm version.

## Build and future hosting

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

Open `/docs/` on the preview server. The base must start and end with `/`; only simple path segments are accepted. No hosting configuration or deployment is included yet. Choose the final origin before adding canonical URLs, sitemap, or social metadata. Missing routes should retain the host's 404 response.

## Content direction and next steps

See [the research and architecture notes](../../docs/documentation-site.md). This first pass includes onboarding, framework/privacy/troubleshooting guides, an overview of every public entry point and runtime operation, example links, and a separate agent page. It is not an exhaustive field-by-field SDK or wire-protocol manual. Prioritize independently runnable examples for each advanced operation and expand options/results/error sections as feedback arrives.

The original integration, flow, and Next.js documents remain the detailed companion references. If promoting this site to the canonical source, migrate those sections deliberately and replace duplicates with links in the same PR.
