# Documentation site direction

Research date: October 24, 2026. This is the contributor design note for `apps/docs`, not a new consumer API contract.

## What established docs do well

| Source                                                                            | Pattern                                                                      | Application here                                                                                          |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [React Quick Start](https://react.dev/learn)                                      | Introduce a concept with a small example and explain the result.             | Examples next to the prose, followed by what readers should observe.                                      |
| [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/overview) | Separate Getting Started, Guides, API, and Examples.                         | Stable task-oriented sidebar; reference does not interrupt first setup.                                   |
| [Vite](https://vite.dev/guide/)                                                   | Begin with requirements and a runnable path, then link deeper configuration. | Quick start identifies runtime boundaries and leads to one captured request.                              |
| [VitePress](https://vitepress.dev/guide/what-is-vitepress)                        | Compile content to static HTML and allow enhanced interactions.              | Static output with small, opt-in client modules.                                                          |
| [Starlight](https://starlight.astro.build/guides/project-structure/)              | Keep documentation content distinct from presentation/components.            | Markdown content, navigation metadata, examples, and UI have separate homes.                              |
| [Diátaxis](https://diataxis.fr/)                                                  | Tutorials, how-to guides, reference, and explanation answer different needs. | Quick start teaches; guides solve tasks; reference explains contracts; concepts explain the architecture. |

These are selected useful patterns, not a benchmark or popularity ranking. The recommendation is our synthesis of them and this repository's constraints.

## Proposed information architecture

- Getting started: an Introduction that explains what the inspector captures and where to begin, a Quick start for setup, and an explanation of how the client, recorder, and drawer fit together. Keep installation steps in the setup guides.
- Guides: Next.js, connected flows, privacy/access, troubleshooting; later dedicated Vite proxy and custom viewer guides.
- API reference: React component and styles, server adapter, flow builder, expressions, recorder and public types.
- Resources: independent examples and cookbooks, coding-agent guidance, integrated changelog.

Every mature reference page should state the import/runtime, the problem solved, a minimal valid example, parameters/defaults, return value, errors/lifecycle, compatibility, and related tasks. Avoid dumping declarations without explaining when to use them. Advanced operations need their own runnable examples as the reference expands.

## Why apps/docs

`docs/` already contains published integration links, assets, architecture, and release process. `apps/docs/` fits the existing npm `apps/*` workspace and keeps executable app dependencies separate from contributor documentation. Existing paths stay stable.

## Stack decision

Use the repository's Vite and TypeScript with build-only Marked, Shiki, and opt-in Twoslash. Generate one HTML document per page with highlighted code, local links, navigation, and a table of contents. The browser gets CSS and small TypeScript modules. Complete examples use Twoslash to check real types at build time. Curated help covers core React, server, recorder, flow, replay, and expression APIs, including explicitly marked partial fragments; a small lazy-loaded module positions the generated tooltips. Content stays readable with JavaScript disabled. Search is a local index loaded on demand; demos are separate chunks.

VitePress is a strong lower-maintenance alternative if its Vue-based theme/customization model becomes desirable. Starlight offers a complete Astro docs system and islands. A React SPA would fit package demos but needs additional prerendering and route/hosting work to provide static documents. This small Vite app honors the requested stack and leaves interactions open, at the cost of owning the shell, search, content pipeline, and accessibility checks. Revisit a docs framework if those responsibilities outgrow the app.

## Compatibility and authoring

The pages identify source version 0.5.3 and link to its verified publication status; hosted snapshots update separately from npm. Checked TypeScript source snippets use public exports. Partial snippets identify their context. Detailed legacy guides remain linked while reference coverage grows. Agent Markdown and the bundled setup skill are a separate reading path, with normal human onboarding first.

## Verification and future work

Build output and browser checks should cover deep links, subdirectory paths, search, keyboard controls, no-JavaScript reading, responsive layouts, and example typing. Static hosting should serve directory indexes and real 404s. Do not add a server or live inference to the docs by default.

Before public hosting: choose the canonical URL, add sitemap/social metadata, keep the complete API glossary and beginner examples aligned with public exports. The hosted docs are the primary human reference; legacy repository guides remain detailed companions with stable paths, and the bundled skill remains the installed-version agent reference. The static site is hosted on GPT Sites at https://docs.jevtools.dev. The publication build uses one clean, reviewed checkout for content, declarations, and changelog, and emits a source/version manifest. Follow [the manual publishing policy](docs-publishing.md); CI never deploys, and visitors do not fetch GitHub or load a Markdown parser.

## Reference and beginner flow guide

`/api/reference/` owns stable links for all public callable APIs and their methods. Readable entries describe arguments, return values, lifecycle/errors, and usage. Public type declarations are extracted from the installed package exports at build time, with explanatory summaries and separately labeled supporting structural types. Rebuild the package when its source changes. The browser gets only HTML; exact declarations expand with native details elements.

`/guides/flow-basics/` builds a greeting flow through a no-network tutorial with runnable commands and expected output. The glossary retains complete examples and contracts for the other builder operations. Complete source examples are type-checked with Twoslash and their stated outputs are executed in the docs tests. SDK examples are verified with saved responses, not live inference. Existing connected-flow and advanced reference URLs remain valid. Inline API names and receiver-aware code-reference lists point to glossary anchors, which are also individual search results.

`/concepts/` explains the client, adapter, drawer, inspection copies, and flow lifecycle. Guides focus on concrete setup and debugging tasks: Next.js wiring, message routing, privacy controls, and symptom-based troubleshooting. Keep explanations consistent with the detailed repository references and installed setup skill, and preserve existing section links when reorganizing a page.

API explanations separate parameter rules, execution behavior, and failures. Keep signatures and checked examples intact during prose edits, and distinguish builder references from resolved values, capture limits from execution limits, and replayed answers from application tasks that run again.

Resource pages direct readers to runnable sample apps, cookbook workflows, and checked method examples. Coding-agent guidance points to the installed setup skill and adjacent references, distinguishes online snapshots from installed contracts, and asks for observable integration evidence.
