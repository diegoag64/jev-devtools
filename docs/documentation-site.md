# Documentation site direction

Research date: October 24, 2026. This is the contributor design note for `apps/docs`, not a new consumer API contract.

## What established docs do well

| Source | Pattern | Application here |
| --- | --- | --- |
| [React Quick Start](https://react.dev/learn) | Introduce a concept with a small example and explain the result. | Examples next to the prose, followed by what readers should observe. |
| [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/overview) | Separate Getting Started, Guides, API, and Examples. | Stable task-oriented sidebar; reference does not interrupt first setup. |
| [Vite](https://vite.dev/guide/) | Begin with requirements and a runnable path, then link deeper configuration. | Quick start identifies runtime boundaries and leads to one captured request. |
| [VitePress](https://vitepress.dev/guide/what-is-vitepress) | Compile content to static HTML and allow enhanced interactions. | Static output with small, opt-in client modules. |
| [Starlight](https://starlight.astro.build/guides/project-structure/) | Keep documentation content distinct from presentation/components. | Markdown content, navigation metadata, examples, and UI have separate homes. |
| [Diátaxis](https://diataxis.fr/) | Tutorials, how-to guides, reference, and explanation answer different needs. | Quick start teaches; guides solve tasks; reference explains contracts; concepts explain the architecture. |

These are selected useful patterns, not a benchmark or popularity ranking. The recommendation is our synthesis of them and this repository's constraints.

## Proposed information architecture

- Getting started: introduction, quick start, how the client/recorder/drawer fit together.
- Guides: Next.js, connected flows, privacy/access, troubleshooting; later dedicated Vite proxy and custom viewer guides.
- API reference: React component and styles, server adapter, flow builder, expressions, recorder and public types.
- Resources: independent examples and cookbooks, coding-agent guidance, changelog link.

Every mature reference page should state the import/runtime, the problem solved, a minimal valid example, parameters/defaults, return value, errors/lifecycle, compatibility, and related tasks. Avoid dumping declarations without explaining when to use them. Advanced operations need their own runnable examples as the reference expands.

## Why apps/docs

`docs/` already contains published integration links, assets, architecture, and release process. `apps/docs/` fits the existing npm `apps/*` workspace and keeps executable app dependencies separate from contributor documentation. Existing paths stay stable.

## Stack decision

Use the repository's Vite and TypeScript with build-only Marked and Highlight.js. Generate one HTML document per page with highlighted code, local links, navigation, and a table of contents. The browser gets CSS and small TypeScript modules. Content stays readable with JavaScript disabled. Search is a local index loaded on demand; demos are separate chunks.

VitePress is a strong lower-maintenance alternative if its Vue-based theme/customization model becomes desirable. Starlight offers a complete Astro docs system and islands. A React SPA would fit package demos but needs additional prerendering and route/hosting work to provide static documents. This small Vite app honors the requested stack and leaves interactions open, at the cost of owning the shell, search, content pipeline, and accessibility checks. Revisit a docs framework if those responsibilities outgrow the app.

## Compatibility and authoring

The pages track the working tree and explicitly label unreleased changes; npm 0.4.1 is not assumed to contain everything on main. Checked TypeScript source snippets use public exports. Partial snippets identify their context. Detailed legacy guides remain linked while reference coverage grows. Agent Markdown and the bundled setup skill are a separate reading path, with normal human onboarding first.

## Verification and future work

Build output and browser checks should cover deep links, subdirectory paths, search, keyboard controls, no-JavaScript reading, responsive layouts, and example typing. Static hosting should serve directory indexes and real 404s. Do not add a server or live inference to the docs by default.

Before public hosting: choose the canonical URL, add sitemap/social metadata, decide whether working-tree docs should be versioned, complete field-level API coverage and more runnable advanced examples, and settle whether legacy guides become redirects or stay companion references. There is no deployment in this change.
