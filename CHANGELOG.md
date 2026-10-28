# Changelog

User-facing changes, newest first. **Unreleased** means not published to npm. On `main`, these changes are merged; on feature branches, they are proposed changes awaiting review. See [work in progress](https://github.com/diegoag64/jev-devtools/pulls).

Dates below use UTC and were checked against npm's publication history. The historical entries were reconstructed from the release PRs and merged changes. Versions remain experimental before 1.0.

## At a glance

| Version                                     | Published (UTC)                                                                    | Highlights                                                                                                 |
| ------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [Unreleased](#unreleased)                   | Not published                                                                      | One request covers the complete release; checked environment setup.                                        |
| [0.6.0](#060--prepared-release)             | [See release notes](https://github.com/diegoag64/jev-devtools/releases/tag/v0.6.0) | Cookbook workbench and narrated guides; embedded flow viewer; reliable multi-tab inspection.               |
| [0.5.6](#056--prepared-release)             | [See release notes](https://github.com/diegoag64/jev-devtools/releases/tag/v0.5.6) | Clearer Flow diagnostics; custom playground ports; focused CI checks.                                      |
| [0.5.5](#055--prepared-release)             | [See release notes](https://github.com/diegoag64/jev-devtools/releases/tag/v0.5.5) | TypeScript fixes; capture and stream validation; clearer setup guidance.                                   |
| [0.5.4](#054--prepared-release)             | [See release notes](https://github.com/diegoag64/jev-devtools/releases/tag/v0.5.4) | Thirteen Flow cookbooks; routine browser verification; rewritten docs.                                     |
| [0.5.3](#053--prepared-release)             | [See release notes](https://github.com/diegoag64/jev-devtools/releases/tag/v0.5.3) | Shared flow encoding; simpler releases and publication helpers; flow regression coverage.                  |
| [0.5.2](#052--october-25-2026-experimental) | 2026-10-25                                                                         | Responsive drawer navigation; flow template types, limits, and capture warnings; contributor verification. |
| [0.5.1](#051--october-25-2026-experimental) | 2026-10-25                                                                         | Task input validation and expression types; setup guidance; release and website maintenance.               |
| [0.5.0](#050--october-25-2026-experimental) | 2026-10-25                                                                         | Replay and comparison; capture reliability/privacy; website and docs.                                      |
| [0.4.1](#041--october-24-2026-experimental) | 2026-10-24                                                                         | CSS isolation; stricter published flow types; approved release workflow.                                   |
| [0.4.0](#040--october-24-2026-experimental) | 2026-10-24                                                                         | Tasks, maps and loops; six cookbooks; SDK and inspector access changes.                                    |
| [0.3.0](#030--october-24-2026-experimental) | 2026-10-24                                                                         | Connected flow API; readable diagrams; bundled flow guidance.                                              |
| [0.2.0](#020--october-23-2026-experimental) | 2026-10-23                                                                         | Faster streaming and rendering; virtualized questions; compact Choice views.                               |
| [0.1.3](#013--october-23-2026-experimental) | 2026-10-23                                                                         | Isolated drawer styles; diagram pan and zoom; versioned package links.                                     |
| [0.1.2](#012--october-23-2026-experimental) | 2026-10-23                                                                         | Bundled setup skill; agent prompts; framework recipes.                                                     |
| [0.1.1](#011--october-23-2026-experimental) | 2026-10-23                                                                         | Installation guidance; complete inline demo; smaller video download.                                       |
| [0.1.0](#010--october-23-2026-experimental) | 2026-10-23                                                                         | React inspector; Node capture; Next.js integration.                                                        |

## Unreleased

### Compatibility and upgrade

- **Builder scope types match runtime legality.** Helpers that require a full `FlowBuilder` may need a narrower `FlowValueBuilder` or `Pick` parameter in map, loop, and `if()` bodies. Valid nested lane outputs and branches remain supported. Existing explicit-input two-argument definitions keep their broad result type. ([#140](https://github.com/diegoag64/jev-devtools/pull/140))

- **Output templates preserve opaque values.** Direct object outputs include original-or-projected fields that may be absent because structural types encode neither prototypes nor enumerability. Direct arrays retain positional types but do not promise attached properties. Narrow direct Date/asset values before calling methods, or output a whole expression for exact values and methods. Runtime identity and input inference are unchanged. ([#140](https://github.com/diegoag64/jev-devtools/pull/140))

### Changes

#### Added

- **Capture fidelity.** Add optional exact, modified, or unknown provenance for captured requests, responses, rules, step data, and outcomes. Legacy captures remain readable; custom callbacks cannot certify exactness, detachment omissions downgrade fidelity even after root replacement, and fixture export semantics stay unchanged. ([#141](https://github.com/diegoag64/jev-devtools/pull/141))

- **Capture-kind redaction context.** Distinguish requests, responses, step data, condition rules, and outcomes with a frozen third callback argument. Existing `(path, value)` policies and paths remain valid; reused captures respect their path, and custom callbacks receive bounded detached views, including SDK images. Identity policies keep shallow data with omission warnings; policies that read omitted content fail closed. ([#138](https://github.com/diegoag64/jev-devtools/pull/138))

- **Inferred Flow outcomes.** Use `defineJevFlow<Input>(name)(build)` to infer terminal names, branch unions, and resolved output values after specifying the input type. `DefinedJevFlow` and `FlowResult` name executable definitions and application results. ([#140](https://github.com/diegoag64/jev-devtools/pull/140))

#### Changed

- **One cookbook playground.** Retire the legacy Request lab, result dashboards, manual sandbox, and live-mode form. Keep source, diagrams, guides, and complete sample results in the workbench. Remove unused form dependencies and move shared browser verification to the workbench; recipe runtime and package inspector checks remain. ([#137](https://github.com/diegoag64/jev-devtools/pull/137))

- **Playground controls and navigation.** Use one select component in the cookbook workbench with the diagram chevron and control styling. Rename the sidebar header to jevtools playground, remove the redundant library close button, and link to docs.jevtools.dev. ([#137](https://github.com/diegoag64/jev-devtools/pull/137))

#### Fixed

- **Scope-specific Flow builders.** Reject unsupported terminal calls and collection nesting in TypeScript, including nested paths and lanes. Runtime validation and diagnostics remain unchanged. ([#140](https://github.com/diegoag64/jev-devtools/pull/140))

#### Documentation

- **Unreleased Flow API reference.** Distinguish the working tree's builder and result types from version 0.6.0 in the API reference and definition signatures. ([#140](https://github.com/diegoag64/jev-devtools/pull/140))

- **Explore cookbooks without setup.** Point guides, cookbook READMEs, and bundled agent guidance to playground.jevtools.dev. Add a Cookbook Playground hero button and a Flow API learning link to the landing page. Local contributor setup remains available. ([#137](https://github.com/diegoag64/jev-devtools/pull/137))

#### Maintenance

- **Verification fixture cleanup.** Remove independent React and Next.js test installations and temporary playground builds after success, failure, and handled cancellation. Stop owned workers before deletion, report cleanup failures, and keep full-suite logs under ignored `benchmarks/results/`. ([#142](https://github.com/diegoag64/jev-devtools/pull/142))

- **Releases without repeated approvals.** A versioned release request covers its release PR merge, npm and GitHub publication, and matching docs deployment while preserving verification and request limits. Add a read-only environment preflight and document the one-time GitHub setup to remove required reviewers while retaining the main-only environment and OIDC trust. ([#135](https://github.com/diegoag64/jev-devtools/pull/135))

## 0.6.0 — Prepared release

[See release notes for verified publication status.](https://github.com/diegoag64/jev-devtools/releases/tag/v0.6.0)

### Compatibility and upgrade

- **Supported environments are unchanged.** Node 22.12+, React and React DOM 18 or 19, ESM, TypeScript 5.4+, and TypeSafe SDK 0.7.x remain supported. No migration is required from 0.5.6. Existing package entry points and version-1 captures remain compatible.
- **Embedded viewer is opt-in.** Import `JevFlowViewer` and `useJevInspection` from the new browser-safe `jev-devtools/viewer` entry point. The hook connects only when enabled and requires a same-origin inspector endpoint. Keep `/server` and `/flow` imports and API credentials in Node code.
- **Cookbook samples remain synthetic.** The local playground opens the workbench by default. Use `?legacy=1` for the individual request lab. Previews and sample runs use fixed responses and do not establish live model behavior.

### Changes

#### Added

- **Walkthrough navigation in expanded panes.** Keep Previous and Next controls and the current step title in expanded code and diagram views. Advance the guide without closing the popup, and retain the reached step when returning to the split view. ([#130](https://github.com/diegoag64/jev-devtools/pull/130))

- **Expanded and single-pane workbench views.** Open code or diagrams in a large popup using compact header controls. Show either pane alone, snap the divider to an edge, and restore the previous split without resetting source or diagram state. ([#130](https://github.com/diegoag64/jev-devtools/pull/130))

- **Self-contained cookbook guides.** Each cookbook has an overview popup and step explanations that teach the recipe and its Flow API method choices. A single Original Cookbook link replaces the repeated chapter links; library controls now use a separate panel icon. ([#130](https://github.com/diegoag64/jev-devtools/pull/130))

- **Optional cookbook code comments.** Read concise step explanations beside the Flow API source in all 19 cookbooks. A small comment toggle beside Copy source remembers your preference; copying includes the notes only when shown, while original line numbers and diagram links stay intact. ([#130](https://github.com/diegoag64/jev-devtools/pull/130))
- **Cookbook Flow Workbench.** Explore all 19 cookbooks with actual Flow API source beside the drawer's diagram renderer, compact narrated tutorials, animated graph construction, and linked timeline/code highlights. The workspace fills the viewport with resizable code and diagram panels; synthetic runs expose requests and results inline, and the original request lab remains at `?legacy=1`. ([#130](https://github.com/diegoag64/jev-devtools/pull/130))
- **Embedded flow viewer.** The new browser-safe `jev-devtools/viewer` export provides `JevFlowViewer` and the opt-in `useJevInspection` hook. Definitions can be displayed before execution, with optional presentation filters, selection, and color cues; the Node runner remains separate. ([#130](https://github.com/diegoag64/jev-devtools/pull/130))

#### Changed

- **Compact source copying.** Use a copy icon in the workbench header, with a checkmark after copying and an accessible label and tooltip. ([#130](https://github.com/diegoag64/jev-devtools/pull/130))

- **Cookbook color cues and focus.** Keep each ribbon's step color visible when inactive. Highlight embedded diagram cards with a subtle, card-toned backdrop glow while retaining their colored top accents and keyboard focus indicators. ([#130](https://github.com/diegoag64/jev-devtools/pull/130))
- **More room for cookbook flows.** Remove the playground's top header and use a compact horizontal ribbon for cookbook steps. Library access stays in the view toolbar, leaving more height for the code and diagram. ([#130](https://github.com/diegoag64/jev-devtools/pull/130))

#### Fixed

- **Focus expanded collection flows.** Opening a collection or loop in the workbench frames its measured item flow instead of focusing the parent card. The expanded flow stays framed when resizing the panels; closing it or choosing another step restores step focus. ([#130](https://github.com/diegoag64/jev-devtools/pull/130))
- **Smooth Fit flow controls.** Animate user-triggered fitting in the embedded flow viewer, including its keyboard shortcut. Initial and automatic fits remain immediate, and reduced-motion preferences suppress the transition. ([#130](https://github.com/diegoag64/jev-devtools/pull/130))
- **Full cookbook request diagrams.** Show the drawer's request internals and collection item previews in both workbench views using isolated synthetic captures. Run samples from the walkthrough without losing the current step, and inspect streaming requests, probabilities, and animated diagrams inline. ([#130](https://github.com/diegoag64/jev-devtools/pull/130))
- **Stable final-step controls.** Keep a disabled Next button on the last walkthrough step instead of replacing it with a wider complete-flow button. ([#130](https://github.com/diegoag64/jev-devtools/pull/130))
- **Walkthrough focus follows its step.** Keep the narrated step and its highlights fixed while hovering, selecting text, or clicking line numbers in earlier code. Guide navigation stays with Previous, Next, and the timeline; complete-flow code inspection remains interactive. ([#130](https://github.com/diegoag64/jev-devtools/pull/130))
- **Stable playground opening view.** Keep cookbook source at its first line and fit the diagram before its first visible frame. Automatic fitting no longer animates on load; selecting code or advancing the walkthrough still scrolls and focuses the corresponding nodes. ([#130](https://github.com/diegoag64/jev-devtools/pull/130))
- **Refresh with multiple playground tabs.** Pages release their live inspector streams when hidden or starting navigation, so occupied HTTP/1 connections cannot block a refresh. The workbench and drawer reconnect with fresh retained captures when a tab becomes visible again or navigation is cancelled. ([#130](https://github.com/diegoag64/jev-devtools/pull/130))

## 0.5.6 — Prepared release

[See release notes for verified publication status.](https://github.com/diegoag64/jev-devtools/releases/tag/v0.5.6)

### Compatibility and upgrade

- **Supported environments are unchanged.** Node 22.12+, React/React DOM 18 or 19, ESM, TypeScript 5.4+, and TypeSafe SDK 0.7.x remain supported. No migration is required from 0.5.5; package exports and the version-1 capture format are unchanged.
- **Flow error diagnostics.** Runtime loop-limit errors now include the loop's `stepId` and identify it in the message. Zero-argument `FlowLoopLimitError` construction remains supported. Code that compares exact error messages must account for the loop identifier; captured error fields continue to contain only error names.

### Changes

#### Fixed

- **Flow diagnostics.** Loop limit errors identify the failing loop through `stepId` and the message while preserving zero-argument construction. Unsupported terminal calls in map, loop, and `if` bodies report their definition context; parallel-lane terminals remain supported. Captured error fields keep only error names. ([#132](https://github.com/diegoag64/jev-devtools/pull/132))

- **Playground ports.** Sample runs and DevTools requests now use Vite's configured port for same-origin checks, so a playground started with `--port 4184` accepts requests from its own page. ([#129](https://github.com/diegoag64/jev-devtools/pull/129))

#### Maintenance

- **Deduplicated CI builds and checks.** Run shared verification once per Node version while retaining all four Node/React consumer combinations. Build the docs site only in its Node 24 job and keep the complete docs browser suite; docs example type checks and execution tests still run on both Node versions. ([#131](https://github.com/diegoag64/jev-devtools/pull/131))

- **Focused cookbook CI coverage.** Run one cookbook capture-to-result probe on React 19 instead of the full browser suite on both React versions. Keep direct Flow contract tests and shared viewer checks in CI; the full cookbook suite remains in local `verify:all`. ([#131](https://github.com/diegoag64/jev-devtools/pull/131))

## 0.5.5 — Prepared release

[See release notes for verified publication status.](https://github.com/diegoag64/jev-devtools/releases/tag/v0.5.5)

### Compatibility and upgrade

- **Supported environments are unchanged.** Node 22.12+, React/React DOM 18 or 19, ESM, TypeScript 5.4+, and TypeSafe SDK 0.7.x remain supported. Upgrade the server adapter and drawer together to receive the capture fixes.
- **Flow type corrections.** Flow expression types now reject non-scalar equality and array method selection that already fail during execution. Generic field-selection helpers must derive supported keys from `Parameters<FlowExpression<T>["get"]>[0]` instead of accepting every `keyof T`. Runtime behavior is unchanged.

### Changes

#### Fixed

- **Redacted condition operators.** Branch and loop views show an unavailable rule when a custom redactor replaces its operator with non-string JSON, instead of crashing or displaying a different comparison. Execution and captured values stay unchanged. ([#126](https://github.com/diegoag64/jev-devtools/pull/126))

- **Malformed stream recovery.** Validate trace and nested flow records before publishing updates, and reconnect without partially changing cached history. Preserve version-1 optional metadata, compatible unknown fields, redacted content, and parallel flows with more than 256 lanes sharing existing nodes. ([#122](https://github.com/diegoag64/jev-devtools/pull/122))

- **Render transformed captures safely.** Custom redactors can replace request roots or numeric answer fields without crashing the drawer. The drawer keeps usable questions, answer fields, and context visible beside unavailable-field placeholders; display masking preserves SDK map names in partial captures. `Trace.capture` retains bounded redacted JSON with warnings; application execution and complete-response fixture requirements stay unchanged. ([#123](https://github.com/diegoag64/jev-devtools/pull/123))
- **Scalar equality types.** Reject object, array, and `undefined` receivers for `.eq()` while preserving literal, branded, and generic scalar comparisons. Finite numbers and matching resolved scalar types remain runtime requirements. ([#121](https://github.com/diegoag64/jev-devtools/pull/121))
- **Array selection types.** Limit `.get()` on arrays to indices and `length`, preserving readonly arrays, tuple inference, common union fields, and constrained generic helpers. Array bounds and missing optional fields remain runtime checks. ([#121](https://github.com/diegoag64/jev-devtools/pull/121))

#### Documentation

- **Package README and AI agent guidance.** Rewrite the npm README around installation, runtime and privacy limits, and a shorter flow example. Add task-based AI agent sections to both READMEs and link the repository-only flow-porting skill from the docs agent guide, while preserving installed-version guidance and existing section links. ([#125](https://github.com/diegoag64/jev-devtools/pull/125))

- **README for new users.** Lead with request inspection and the no-key playground, link to complete framework setup guides, and introduce optional flows with one request and one branch. Preserve existing section links, compatibility requirements, security boundaries, and attribution. ([#125](https://github.com/diegoag64/jev-devtools/pull/125))

- **Shared porting skill.** Version `port-jev-to-flow` in the repository with semantic guidance, cookbook examples, and agent discovery links. The skill supports Jev-to-Flow ports and capability audits; npm contents and public APIs are unchanged. ([#124](https://github.com/diegoag64/jev-devtools/pull/124))

## 0.5.4 — Prepared release

[See release notes for verified publication status.](https://github.com/diegoag64/jev-devtools/releases/tag/v0.5.4)

### Compatibility and upgrade

- **Supported environments are unchanged.** Node 22.12+, React/React DOM 18 or 19, ESM, TypeScript 5.4+, and TypeSafe SDK 0.7.x remain supported. No migration is required from 0.5.3; public APIs, package exports, and the version-1 capture format are unchanged.
- **Cookbooks use the existing Flow API.** The playground now includes nineteen cookbooks: thirteen new ports and six existing examples. The new ports use synthetic samples and require no API key. Autoresearch remains excluded. No live inference, measured model accuracy, or provider performance is claimed.
- **Verification improvements are separate from the ports.** Full verification now runs the existing cookbook browser checks and validates evidence against the current source. These development tools do not change installed package behavior.

### Changes

#### Added

- **Parallel Questions cookbook.** Compare five batched requests with 65 sequential single-question requests over a fixed synthetic sample, with all 13 original questions, inspectable loops and computed answer statistics. No live timing or cost savings are claimed. ([#106](https://github.com/diegoag64/jev-devtools/pull/106))
- **Twitch chat filter cookbook.** Replay the original 29-message feed with eight concurrent sample requests, inspect exact moderation precedence, and compare normal/quiet policies without additional inference. Includes a separate threshold-boundary feed; ongoing Twitch ingestion is outside this sample. ([#108](https://github.com/diegoag64/jev-devtools/pull/108))
- **Entity alignment cookbook.** Inspect attributed beer pairs with one Score, three companion Nouls and exact unlink/review/proposed-sameAs boundaries. Includes no-key synthetic examples and boundary cases; no database mutation or full evaluation. ([#109](https://github.com/diegoag64/jev-devtools/pull/109))
- **Citation checking cookbook.** Inspect exact normalized quote matches against RFC 7519, a zero-request fabricated path and Choice-confidence review routing in five no-key synthetic samples. ([#107](https://github.com/diegoag64/jev-devtools/pull/107))
- **Confidence fallback cookbook.** Explore one 75-group industry Choice, the inclusive API-confidence cutoff and a deterministic parent-division task with four synthetic no-key cases. Preserves the original SIC taxonomy; no SEC evaluation or live inference. ([#110](https://github.com/diegoag64/jev-devtools/pull/110))
- **Line-by-line search cookbook.** Search the complete pinned document with synthetic Choice and Noul responses, inspect exact existence routing and view every line option in the playground. ([#113](https://github.com/diegoag64/jev-devtools/pull/113))
- **Inspect candidate re-ranking.** Run a no-key cookbook with an authored retrieval fixture, independent synthetic Nouls, bounded candidate requests and a stable sorting task. Compare before/after order and tied probabilities without claiming benchmark accuracy. ([#112](https://github.com/diegoag64/jev-devtools/pull/112))
- **Date extraction cookbook.** Add a no-key playground adaptation with seven Choice questions per role, fixed-reference calendar assembly, ISO dates, and inspectable confidence review. Synthetic fixtures cover official examples, calendar boundaries, invalid dates and the strict 0.60 gate; missing used confidence requires review. ([#114](https://github.com/diegoag64/jev-devtools/pull/114))
- **Pre-parsed extraction cookbook.** Explore document-order regex candidates, separate email/phone/money Choice helpers, amount-dependent credit routing and deterministic normalization with fixed synthetic samples. Includes missing-value routes and exact decimal strings; no live inference or public API changes. ([#111](https://github.com/diegoag64/jev-devtools/pull/111))
- **Function calling cookbook.** Explore a proposed tool call from a batched request, with selected-argument branches, omitted defaults, set membership and source-faithful confidence arithmetic. Synthetic samples only; no tool execution. ([#115](https://github.com/diegoag64/jev-devtools/pull/115))
- **LLM guardrails cookbook.** Screen input or output samples with the official hazard batteries, compare strict/permissive policies on one synthetic assessment, and inspect severity upgrades and action precedence. No live inference or LLM generation. ([#117](https://github.com/diegoag64/jev-devtools/pull/117))
- **Choice self-consistency cookbook.** Run the original eight-question rubric through 15 sequential synthetic requests, inspect exact probability gates and compare raw agreement, abstention and probability variation in an interactive heatmap. No paid inference or measured consistency claims. ([#118](https://github.com/diegoag64/jev-devtools/pull/118))
- **Noul self-consistency cookbook.** Explore fifteen sequential fourteen-question requests, exact uncertainty-band decisions and computed statistics from authored synthetic fixtures. Preserve every answer and requested/returned model labels; no measured consistency or provider comparison is claimed. ([#116](https://github.com/diegoag64/jev-devtools/pull/116))

- **Explore API references in place.** Follow API links within the docs side panel and use Back to return to earlier entries with their reading positions preserved, without leaving the guide. ([#104](https://github.com/diegoag64/jev-devtools/pull/104))

- **API reference previews.** Hover or focus a supported API link for its summary, then open the full reference or read its contract and examples in a side panel. Touch controls, keyboard navigation, copy buttons, and failed-load recovery keep reference reading available without losing the current page. ([#104](https://github.com/diegoag64/jev-devtools/pull/104))

#### Changed

- **Clearer landing copy.** Explain captured requests, sample flows, and application-defined decisions in plain language, and add a community-project and TypeSafe AI non-affiliation notice beneath the hero actions. Preserve the drawer and Flow API heading treatments, accent the second line of the System One primitives heading, and remove decorative card numbers. ([#105](https://github.com/diegoag64/jev-devtools/pull/105))

#### Fixed

- **Search from an API reading panel.** Opening search dismisses the reference panel and keeps focus in search, so glossary results appear without an old panel covering the destination. ([#104](https://github.com/diegoag64/jev-devtools/pull/104))

#### Documentation

- **Current cookbook collection guide.** Separate the thirteen new ports from the six existing examples, document routine browser verification, and replace outdated API-fit proposals with current implementation status. Preserve the original research as historical context and identify Autoresearch as excluded. ([#119](https://github.com/diegoag64/jev-devtools/pull/119))

- **Even API panel close control.** Give the close button a square touch target with a centered X in desktop and mobile layouts. ([#104](https://github.com/diegoag64/jev-devtools/pull/104))

- **Current API reference links.** Mute links inside the reading panel that point to its open entry and label them “current,” updating the indication when following references or going Back. ([#104](https://github.com/diegoag64/jev-devtools/pull/104))

- **Useful resource entry points.** Rewrite Examples & cookbooks with sample run instructions, expected results, and clearer cookbook descriptions. Rewrite For coding agents around the installed setup skill, version-matched contracts, Markdown access, and verification evidence. Preserve existing section links. ([#104](https://github.com/diegoag64/jev-devtools/pull/104))

- **Clearer API explanations.** Revise the glossary and React, server, flow, expression, and recorder references. Separate parameter rules, execution behavior, and errors; explain replay and comparison results; add missing server parameter types. Preserve examples, signatures, and section links. ([#104](https://github.com/diegoag64/jev-devtools/pull/104))

- **Concepts and practical guides.** Rename How it fits together to Concepts and explain capture, flows, and drawer controls. Rewrite the Next.js, Build a flow, Privacy & access, and Troubleshooting guides with setup steps, expected results, and diagnostic checks. Preserve existing page and section links. ([#104](https://github.com/diegoag64/jev-devtools/pull/104))

- **Introduction for new users.** Explain request inspection, optional flows, the React and Node connection, and capture privacy before directing readers to setup guides. Keep the fixed-answer demo and existing section links. ([#104](https://github.com/diegoag64/jev-devtools/pull/104))

- **Guided first runs.** Rewrite Quick start around a Vite and Express setup and Flows from scratch around a no-network greeting. Add expected results and keep full method contracts and examples in the API reference, preserving existing section links. ([#104](https://github.com/diegoag64/jev-devtools/pull/104))

- **Readable API contracts.** Fix the server options table and replace stale unreleased labels in type descriptions, hover help, and the replay example with their 0.5.0 availability. ([#104](https://github.com/diegoag64/jev-devtools/pull/104))

#### Maintenance

- **Routine cookbook browser verification and current evidence.** Run the existing recipe and collection browser checks in full verification and React 18/19 CI, with matching playground/root React versions and color-independent server readiness. Preserve each run’s source identity and evidence separately, and validate current source/reviewed HEAD before handoff. ([#119](https://github.com/diegoag64/jev-devtools/pull/119))

## 0.5.3 — Prepared release

[See release notes for verified publication status.](https://github.com/diegoag64/jev-devtools/releases/tag/v0.5.3)

### Compatibility and upgrade

- **Supported environments are unchanged.** Node 22.12+, React/React DOM 18 or 19, ESM, TypeScript 5.4+, and TypeSafe SDK 0.7.x remain supported. No migration is required from 0.5.2; public APIs, package exports, and the version-1 capture format are unchanged.
- **Shared encoding preserves isolation.** Matching flow viewers reuse encoding work while retaining independent response buffers and session filtering. Aggregate capture budgets and finer-grained deltas remain follow-up work.

### Changes

#### Performance

- **Shared flow stream encoding.** Matching viewers share the server's flow projection and encoding within each delivery turn, while retaining independent response buffers, session isolation, and reader catch-up state. The version-1 wire format and capture policy are unchanged; whole-run budgets and finer-grained deltas remain follow-up work. ([#97](https://github.com/diegoag64/jev-devtools/pull/97))

#### Documentation

- **0.5.2 publication records.** Record verified npm publication, archive integrity/provenance, fresh registry consumers, and the exact Git tag and GitHub Latest release. Update source installation and API guidance to describe the published version. Hosted docs were subsequently published as Sites version 22 from the merged record commit; see the [publication receipt](docs/docs-publishing.md#publication-receipt-and-recovery). ([#96](https://github.com/diegoag64/jev-devtools/pull/96), [receipt #99](https://github.com/diegoag64/jev-devtools/pull/99))

#### Maintenance

- **Simpler releases.** Keep one release-preparation PR and record verified package and manual docs publication results in GitHub release notes, without routine receipt PRs or a custom receipt store. Preserve artifact checks, independent verification, and explicit approvals. ([#102](https://github.com/diegoag64/jev-devtools/pull/102))

- **Focused contributor guidance.** Shorten the always-loaded agent instructions with task-specific links, and keep boundary and regression requirements in the contributor guide. Verification, review, and publication requirements remain unchanged. ([#101](https://github.com/diegoag64/jev-devtools/pull/101))

- **Release publication tooling.** Add reusable docs artifact inspection, staging, and live readback helpers, plus a restricted local verification path for existing receipt edits. Check committed, staged, and working changes independently, and reject dangling provenance symlinks before staging writes. Replace self-referential pending-merge receipt text with durable PR links. Full CI, explicit publishing authorization, public APIs, and package behavior remain unchanged. Related to [#77](https://github.com/diegoag64/jev-devtools/issues/77). ([#100](https://github.com/diegoag64/jev-devtools/pull/100))

- **Flow lifecycle regression coverage.** Assert exact loop body calls, retained iterations and latest completed state, and distinguish task timeouts from cancellation in recorded step errors. Runtime behavior and public APIs are unchanged. ([#95](https://github.com/diegoag64/jev-devtools/pull/95))

- **Nested flow browser coverage.** Extend the existing sample verifier with map-item and loop-iteration navigation, request inspection, direct child clicks and selection ownership, maps inside iterations, and shared-camera retention through updates and reopening. No runtime or public API changes. ([#98](https://github.com/diegoag64/jev-devtools/pull/98))

## 0.5.2 — October 25, 2026 (experimental)

**[Published to npm](https://www.npmjs.com/package/jev-devtools/v/0.5.2) at 21:35:38.942 UTC on October 25, 2026**, from `20e7dc0d9d81285e2c6e17b75dae5c8e37f2d0e4` after [release PR #94](https://github.com/diegoag64/jev-devtools/pull/94). The [approved release workflow](https://github.com/diegoag64/jev-devtools/actions/runs/40235875410) passed, and [GitHub release v0.5.2](https://github.com/diegoag64/jev-devtools/releases/tag/v0.5.2) is published. npm latest, archive integrity/provenance, fresh registry consumers, the exact tag, and GitHub Latest were verified. Hosted docs were published at 21:54:01 UTC as Sites version 22, with the live manifest and changelog verified against the reviewed source; see the [release record](docs/releases.md#release-052--published-october-25-2026).

### Compatibility and upgrade

- **Supported environments are unchanged.** Node 22.12+, React/React DOM 18 or 19, ESM, TypeScript 5.4+, and TypeSafe SDK 0.7.x remain supported. Review the type, expression-limit, and capture-metadata notes below before upgrading from 0.5.1.

- **Resolved template types.** Map items and loop state now infer resolved values from nested reference templates. Code that treated resolved task values as `FlowExpression` objects must use ordinary value operations instead; runtime behavior is unchanged.

- **Composed expression limits.** Expressions now reject depth greater than 80 or more than 4,096 expanded nodes during construction, including repeated uses of a shared child. Split larger generated logic into task results or smaller steps. Accepted expressions retain their semantics and public types; long legacy condition descriptions now end with `[condition truncated]` within a 4,096-code-unit cap.

- **Flow capture metadata.** Optional warning arrays extend version-1 records; older captures remain readable, but absent metadata cannot establish completeness. Update both server and drawer to see the new warnings. Execution values and decisions are unchanged.

### Changes

#### Changed

- **Simpler diagram footer.** Keep only the pan, zoom, and fit instructions below request diagrams at all screen widths. ([#92](https://github.com/diegoag64/jev-devtools/pull/92))

- **Mobile request navigation.** Show a full-height, searchable request list on small screens; selecting a request opens its details with an **All requests** button to switch back. Retain search, status filters, and selection while navigating, and keep the desktop split view. Hide the selected-step summary beside **Show details** on mobile. Public APIs are unchanged. ([#92](https://github.com/diegoag64/jev-devtools/pull/92))

- **Flow canvas boundary.** Move the step selector beside **Copy fixture** in the run header and darken the diagram viewport so its pan/zoom area is easier to distinguish. Float zoom, Fit, and Focus controls in the canvas’s top-right corner to free vertical space. Header and canvas controls wrap in narrow drawers; public APIs and zoom behavior are unchanged. ([#92](https://github.com/diegoag64/jev-devtools/pull/92))

#### Fixed

- **Controls in short drawers.** Reserve the floating panel’s rendered height inside the flow canvas, including wrapped buttons, and let flow metadata scroll when drawer space is limited. Zoom, Fit, and Focus remain reachable in small unexpanded drawers and after reopening; public APIs are unchanged. ([#92](https://github.com/diegoag64/jev-devtools/pull/92))

- **Consistent step selection.** Stop automatically focusing the first selected step, including flows with no request steps. Flows start with the normal overview fit, and clicking steps preserves pan and zoom; the step picker and explicit Focus/Fit controls keep their existing behavior. Public APIs are unchanged. ([#92](https://github.com/diegoag64/jev-devtools/pull/92))

- **Select arrow spacing.** Inset dropdown chevrons consistently across drawer selects and reserve space between their labels and arrows. Keep native menus and keyboard interaction, with the system arrow restored in forced-colors mode. Public APIs are unchanged. ([#92](https://github.com/diegoag64/jev-devtools/pull/92))

- **Resolved map and loop types.** Map item builders and loop gates, iteration state, body returns and final results now agree with runtime template resolution, including nested objects and arrays, while preserving generic whole-reference/scalar types and branded scalar values. ([#85](https://github.com/diegoag64/jev-devtools/pull/85))

- **Bound composed expressions.** Account for complete subtree depth and expanded size before recursive validation, projection, and evaluation; cap legacy descriptions independently of the structured rule projection. Fixes [#43](https://github.com/diegoag64/jev-devtools/issues/43). ([#86](https://github.com/diegoag64/jev-devtools/pull/86))

- **Flow capture warnings.** Retain and display outcome and condition-rule truncation, redaction, and unavailable-capture warnings, including rule projection limits, nested item runs, and non-JSON merge values. Warnings are separate metadata; user strings are never treated as capture signals. Fixes [#45](https://github.com/diegoag64/jev-devtools/issues/45). ([#88](https://github.com/diegoag64/jev-devtools/pull/88))

#### Documentation

- **0.5.1 publication records.** Record verified npm publication, archive integrity/provenance, fresh registry consumers, and the exact Git tag and GitHub Latest release. Update source documentation to describe the published fixes and preserve their compatibility notes. Hosted docs were subsequently published as Sites version 21 from the merged record commit; see the [publication receipt](docs/docs-publishing.md#publication-receipt-and-recovery). ([#87](https://github.com/diegoag64/jev-devtools/pull/87), [receipt #89](https://github.com/diegoag64/jev-devtools/pull/89))

#### Maintenance

- **Reproducible contributor verification.** Add a pinned development runtime and formatter, a complete local verification command with source/archive provenance, and CI-connected sample flow browser checks. Document capture owners so upstream projection and snapshot losses remain visible during maintenance. Package runtime requirements and public APIs are unchanged. ([#91](https://github.com/diegoag64/jev-devtools/pull/91))

- **Boundary and contract verification.** Require agents to identify affected guarantees, reproduce bugs on current main, and verify composed expressions, resolved template types, capture metadata, and meaningful regressions at their owning boundaries. Keep required repository checks and public package behavior unchanged. ([#84](https://github.com/diegoag64/jev-devtools/pull/84))

- **Faster docs verification.** Serve the built preview without repeating documentation generation and reuse the CI runner's browser system libraries. Existing build, development, and browser checks remain enabled; package APIs are unchanged. ([#90](https://github.com/diegoag64/jev-devtools/pull/90))

- **Local expression benchmarks.** Add a reproducible comparison of normal flow construction and execution, with isolated installs, alternating process order, local sample SDK responses, and recorder-on/off cases. ([#86](https://github.com/diegoag64/jev-devtools/pull/86))

## 0.5.1 — October 25, 2026 (experimental)

**[Published on npm](https://www.npmjs.com/package/jev-devtools/v/0.5.1)** at 18:19:01.066 UTC on October 25, 2026 from `c88aea5d615a65bcda1d820b5abc63bb6fbe05e6`, after [PR #83](https://github.com/diegoag64/jev-devtools/pull/83) and [main CI](https://github.com/diegoag64/jev-devtools/actions/runs/40219281499) passed. This patch release includes task-input validation, expression typing, and setup documentation fixes. The [release workflow](https://github.com/diegoag64/jev-devtools/actions/runs/40220097820) verified npm integrity/provenance and fresh registry consumers, then created the [GitHub release](https://github.com/diegoag64/jev-devtools/releases/tag/v0.5.1) at 18:20:25 UTC. The tag resolves to the exact published commit; npm latest and GitHub Latest are both verified. See the [release record](docs/releases.md#release-051--published-october-25-2026). The corresponding docs were published and verified at 18:37:34 UTC as Sites version 21; see the [publication receipt](docs/docs-publishing.md#publication-receipt-and-recovery).

### Compatibility and upgrade

- **Supported environments are unchanged.** Node 22.12+, React/React DOM 18 or 19, ESM, and TypeSafe SDK 0.7.x remain supported. The documented TypeScript 5.4+ minimum clarifies the existing declaration requirement. Review the two stricter validation/type rules below before upgrading from 0.5.0.
- **Task input symbol keys.** Task input literals containing own symbol keys now throw instead of silently discarding those keys. Remove symbol metadata from task data or represent needed values with string keys; valid JSON inputs and SDK request assets are unaffected.
- **Primitive expression properties.** `.get()` now requires an object or array receiver, including every member of a union. Calls such as string `.get("length")` or `.get(0)` become TypeScript errors instead of failing only at execution. Move primitive operations into a task callback. Generic helpers calling `.get()` must constrain their receiver type with `extends object`; unions must contain only object/array members. Object fields, array indexes, array `length`, and runtime missing-value checks retain their behavior.

### Changes

#### Changed

- **Landing navigation.** Remove the "Explore the flows" header link and keep Docs visible on mobile. Package APIs are unchanged. ([#78](https://github.com/diegoag64/jev-devtools/pull/78))

- **Website sharing previews.** Add the selected prismatic landing image and documentation image to Open Graph and Twitter metadata, requesting large image cards on both sites. The landing artwork uses a smaller, punctuation-free headline with clear separation between the “y” and “i”. Docs keep page-specific titles and descriptions with one shared image. Package APIs are unchanged; the previews become available after each site's manual publication. ([#78](https://github.com/diegoag64/jev-devtools/pull/78))

#### Fixed

- **Task input symbol keys.** Reject own symbol keys in literal task inputs before template copying can silently discard them, including nested objects and arrays. Literal inputs fail during definition; referenced values retain their runtime rejection before the task callback. String-keyed JSON inputs and SDK request handling are unchanged. ([#81](https://github.com/diegoag64/jev-devtools/pull/81))

- **Expression property types.** Reject primitive `.get()` receivers during type checking, aligning source and shipped declarations with the existing evaluator. Document object/array selection and a task-based string-length example. Fixes [#49](https://github.com/diegoag64/jev-devtools/issues/49). ([#82](https://github.com/diegoag64/jev-devtools/pull/82))

#### Documentation

- **Compatibility docs published.** Publish the reviewed import and setup guidance from [PR #79](https://github.com/diegoag64/jev-devtools/pull/79) as GPT Sites version 20, preserving the existing sharing metadata. Record the verified source, deployment, and live checks in the [publication receipt](docs/docs-publishing.md#publication-receipt-and-recovery). Package APIs and npm contents are unchanged. ([#80](https://github.com/diegoag64/jev-devtools/pull/80))

- **Package compatibility and public imports.** Include the `/flow` export in setup guidance and align the docs site, READMEs, and bundled agent instructions on Node, React, SDK, ESM, and the verified TypeScript 5.4+ declaration requirement. Focus setup on the three JavaScript entry points and automatic drawer styling, removing obsolete stylesheet-import guidance. Clarify required peers and server-only boundaries; package APIs and runtime requirements are unchanged. ([#79](https://github.com/diegoag64/jev-devtools/pull/79))

- **Verified 0.5.0 docs publication.** Publish the reviewed release guidance as GPT Sites version 18 and record its canonical commit, hosting deployment, and matching live version/changelog checks. Package bytes and the landing Site are unchanged. ([#76](https://github.com/diegoag64/jev-devtools/pull/76))

- **README hero.** Replace the root README's looping demo section with a static browser capture of the landing page heading and illustrative hierarchical flow, linked to the website. Include a reproducible capture script. Package APIs and the npm README are unchanged. ([#74](https://github.com/diegoag64/jev-devtools/pull/74))

- **0.5.0 publication records.** Record verified npm publication, archive integrity, registry consumers, and the recovered GitHub release/tag. Update mutable documentation to describe the published APIs. Docs version 18 was subsequently deployed and verified; see the publication receipt. ([#75](https://github.com/diegoag64/jev-devtools/pull/75))

#### Maintenance

- **Release verification dependencies.** Install locked repository dependencies in the fresh release completion job before registry-consumer checks. This supplies the TypeScript compiler those checks use; it does not rebuild or republish the approved archive. The original 0.5.0 finish job failed because this install was missing. ([#75](https://github.com/diegoag64/jev-devtools/pull/75))

## 0.5.0 — October 25, 2026 (experimental)

**[Published on npm](https://www.npmjs.com/package/jev-devtools/v/0.5.0)** at 06:30:45.073 UTC from `64efa4c494a83207e94c67b42f6744802db18c11`, after [PR #73](https://github.com/diegoag64/jev-devtools/pull/73). This release adds replay and fixture comparison, capture reliability/privacy improvements, and the website and docs. npm integrity/provenance and fresh registry consumers are verified. The [GitHub release](https://github.com/diegoag64/jev-devtools/releases/tag/v0.5.0) and exact-commit tag were completed at 06:33:23 UTC after recovering from a missing verification dependency in the workflow. Both Latest designations are verified. See the [release record](docs/releases.md#release-050--published-october-25-2026); docs version 18 was deployed on October 25 at 06:45:14 UTC, with its live manifest verified against reviewed source `c22f7695ac83333fed7b34ea3487ed6b86e4c714`.

### Compatibility and upgrade

- **Runtime support is unchanged.** React 18/19, Node 22.12+, and TypeSafe SDK `>=0.7.0 <0.8.0` remain supported. Existing request and flow integrations keep their public entry points; APIs remain experimental before 1.0. Websites are separate private apps and are not included in the npm archive.
- **Inspection data may differ.** Expanded credential redaction and default-on `redactAdditionalSensitiveData` mask more captured/displayed fields. The display prop does not remove values from transport or memory; use server-side redaction for data that must never reach a browser. These policies do not alter SDK requests or application execution data.
- **Replay and comparison are opt-in.** Replay supplies captured Jev answers without inference, but tasks and request factories run again and can have side effects. Comparison executes both a replay and the supplied client's run; inspect answer differences as well as the top-level `changed` flag. Review exported fixtures and live responses before sharing them.

### Changes

#### Added

- **JevTools website.** Add [jevtools.dev](https://jevtools.dev/) with six simulated flow diagrams, System One primitive illustrations, a drawer recording, and a Flow API example. Include responsive navigation, reduced-motion support, and an animated hero. The standalone Vite app has isolated dependencies/styles and makes no inference requests. Docs and GitHub links lead to setup and source. ([#72](https://github.com/diegoag64/jev-devtools/pull/72))

- **Compare live runs with fixtures.** Add `compareWithFixture` and `formatComparison` to `jev-devtools/flow`: compare a live client's run with a saved fixture, print the differences for CI logs, and get the live run back as a new fixture. Map items and loop iterations are reported under their composed ids; a step that ran on only one side sets `changed`. Recording observer failures and mutations to run snapshots cannot corrupt the comparison; captured response snapshots also prevent later observer mutations from hiding answer drift or rewriting the live fixture. Tasks run on both sides. ([#32](https://github.com/diegoag64/jev-devtools/pull/32))

- **Replay captured flows.** Add **Copy fixture** to the Flows run header and `replayClient(fixture)` to `jev-devtools/flow`, so flow routing can be tested from captured answers with no network or API key. Map items and loop iterations are keyed by their request link (`parent-id/index/step-id`); tasks run locally on replay. `flowFixture` builds fixtures from captures in code. Fixture controls are scoped to DevTools; the clipboard fallback uses the drawer theme and keyboard focus styles. The repository's `npm run replay` helper accepts a macOS clipboard fixture, a JSON file or stdin for the refund, parallel and synthetic skill-shortlist examples, with optional input and expected-outcome checks. ([#29](https://github.com/diegoag64/jev-devtools/pull/29))

#### Changed

- **Fixture copy feedback.** Confirm fixture copying with a brief animated **Copied** button state, respecting reduced-motion preferences. Keep partial-capture warnings and the clipboard fallback visible; clear stale feedback and fallback JSON when the display projection changes, including after pending clipboard operations. Document what fixtures contain and how to replay/share them in the flow guide. ([#29](https://github.com/diegoag64/jev-devtools/pull/29))

#### Fixed

- **Flow stream reconnections.** Deliver required flow definitions to each inspector connection, including shared definitions first used by another session and definitions reused after clear or eviction. Avoid repeating definitions the reader still retains, preserve slow-reader catch-up, and reset browser flow caches and pending updates on reconnect. Public APIs and the version-1 stream format are unchanged. Fixes [#42](https://github.com/diegoag64/jev-devtools/issues/42). ([#68](https://github.com/diegoag64/jev-devtools/pull/68))

- **Observer failures.** Contain flow request observer failures before or after SDK dispatch, preserving the real result, request error, and cancellation without invoking the client twice. Custom observers should call through synchronously for trace linkage; failed or deferred recording can lose linkage but cannot replace execution. Public signatures and SDK retry behavior remain unchanged. Fixes [#40](https://github.com/diegoag64/jev-devtools/issues/40). ([#67](https://github.com/diegoag64/jev-devtools/pull/67))

- **Observer data isolation.** Detach task inputs, loop state, nested runs' data, and final values before exposing them to flow observers or redactors, so in-place capture edits cannot change execution. Reuse unchanged data snapshots for recorder caching and preserve shared references within each detached copy to avoid expanding small graphs into large trees. Runtime results and public APIs remain unchanged; non-JSON direct outputs remain available to callers but appear as `[capture unavailable]` in observer snapshots. Fixes [#38](https://github.com/diegoag64/jev-devtools/issues/38). ([#66](https://github.com/diegoag64/jev-devtools/pull/66))

- **Response capture failures.** Preserve successful request status when response parsing or redaction fails during recording. Omit the unavailable captured result and show a fixed safe warning without exposing redactor error messages or stacks. SDK results, genuine request errors/cancellation, and public APIs remain unchanged. Fixes [#37](https://github.com/diegoag64/jev-devtools/issues/37). ([#65](https://github.com/diegoag64/jev-devtools/pull/65))

#### Security

- **Credential and personal-data redaction.** Always redact documented credential aliases such as `x-api-key`, `client_secret` and `sessionToken` from DevTools inspection copies without changing SDK or runtime data. Add the default-on `redactAdditionalSensitiveData` component prop to mask supported email, phone, postal address, SSN and card-number fields in DevTools views only. Preserve question IDs and Choice labels/probabilities that resemble sensitive field names while masking personal data inside their content. Changing the prop updates existing views immediately and independently per viewer; additional personal values remain in capture/stream/browser memory, while credentials and custom server-redacted values cannot be revealed. No settings endpoint, checkbox, stream change or new Next.js route export is required. Actual HTTP headers/options remain uncaptured; field-name matching is not universal secret detection. Fixes [#41](https://github.com/diegoag64/jev-devtools/issues/41). ([#69](https://github.com/diegoag64/jev-devtools/pull/69))

#### Documentation

- **Human-friendly docs and complete API reference.** Add [docs.jevtools.dev](https://docs.jevtools.dev/) with 17 static pages: setup, framework guides, beginner flow examples, a public API glossary, and agent-readable Markdown. Show inputs, returns, and explained examples; pair synchronous flow definitions with awaited execution. Shiki/Twoslash and curated method/type help run at build time. Preserve deep links, label sticky method sections, and track reading position in the outline. ([#70](https://github.com/diegoag64/jev-devtools/pull/70))

- **Docs navigation and presentation.** Add local search, copyable pnpm/npm/Yarn/Bun installation tabs, mobile navigation, persistent themes without unstyled page flashes, shared JevTools branding, and a passive GitHub star count. Clarify the independent community-project status. Keep interactions small and lazily loaded, with readable pages and links without JavaScript. ([#70](https://github.com/diegoag64/jev-devtools/pull/70))

- **Traceable docs publication.** Build content, declarations, and the categorized changelog from one checkout. Emit a source/package-version manifest, reject dirty publication builds, and run browser checks with preview artifacts in CI. Keep GPT Sites deployment manual and separate from merging and npm publication, with an explicit release checklist and publication receipts. ([#70](https://github.com/diegoag64/jev-devtools/pull/70))

- **Website and documentation consolidation.** Make [jevtools.dev](https://jevtools.dev/) and the hosted docs the primary README/package entry points. Align repository guides, the offline setup skill, agent indexes, example archives, and version labels with the 0.5.0 candidate. Preserve repository reference paths and old docs anchors; clearly distinguish pending publication from npm availability. ([#73](https://github.com/diegoag64/jev-devtools/pull/73))

#### Maintenance

- **Landing validation.** Add a separate read-only CI job that installs the landing app’s own lockfile, runs its tests, and builds it on Node 24. Keep website validation separate from package publishing and both manual Site deployments. ([#73](https://github.com/diegoag64/jev-devtools/pull/73))

- **Drawer CI setup.** Run the React 18/19 drawer CI checks and release preparation on Ubuntu 24.04 using the runner's system libraries and Playwright's pinned Chromium headless shell, skipping per-run system package installation. In drawer CI, reuse matching installed React packages and read the lockfile for version overrides, verifying both React packages before browser checks. Package APIs, verification coverage, release approval, and publishing safeguards are unchanged. ([#64](https://github.com/diegoag64/jev-devtools/pull/64))

- **Release verification records.** Record verified npm/GitHub publication for 0.4.1, including recovery from delayed npm visibility, exact-commit provenance, and archive integrity. Update installation guides to reflect publication.

- **Registry processing timeout.** Allow nearly ten minutes for npm version/latest verification after upload instead of about one minute. Keep manual approval, integrity/provenance checks, and the no-republish recovery rule unchanged; no package runtime or API changes.

## 0.4.1 — October 24, 2026 (experimental)

Patch release containing the CSS isolation fixes, corrected published flow declarations, and contributor/release workflow updates merged since 0.4.0. [Published package](https://www.npmjs.com/package/jev-devtools/v/0.4.1) · [GitHub release](https://github.com/diegoag64/jev-devtools/releases/tag/v0.4.1) · [Release preparation #61](https://github.com/diegoag64/jev-devtools/pull/61). Published at 17:33:19.570 UTC from commit `4ce235dd950b8b2f94e97d268ecbd5ae2b5b96ea`. npm integrity and provenance match the approved candidate; the GitHub release was completed at 17:35:21 UTC after recovering from the workflow's npm verification timeout. Both services' Latest designations were verified. See the [release verification and recovery record](docs/releases.md#release-041--published-october-24-2026).

### Compatibility and upgrade

- **Supported versions.** React 18/19, Node 22.12+, SDK `>=0.7.0 <0.8.0`, public exports, and runtime flow behavior remain unchanged from 0.4.0.

- **Stricter flow expression types.** Published `FlowExpression` types now preserve their value types. Code relying on unsafe union narrowing or optional/nullable numeric comparisons may stop compiling; supply correctly typed values before comparing them.

- **Drawer styling.** The drawer loads its own styles. Existing public CSS imports remain supported, but host styles and theme variables no longer affect internal flow styling. Document-level transforms and page JavaScript remain outside CSS isolation.

### Changes

#### Fixed

- **Published flow expression types.** Fix published `FlowExpression` declarations so they reject unsafe union narrowing and optional or nullable numeric comparisons, with packed-consumer type coverage. Runtime behavior is unchanged. Fixes [#39](https://github.com/diegoag64/jev-devtools/issues/39). ([#56](https://github.com/diegoag64/jev-devtools/pull/56))

- **CSS isolation.** Scope connected-flow styles to the DevTools boundary and namespace their animation so the optional public stylesheet does not restyle host content. Keep the host reset in the shadow stylesheet instead of an expanded inline style attribute. Suppress page-authored host decorations, reset text direction and internal CSS-variable defaults, and keep flow hint colors independent of app theme variables. Remove redundant CSS imports from sample apps and setup snippets, and document automatic drawer styling in the guides and bundled skill. Existing component APIs and CSS imports remain compatible; document-level transforms and page JavaScript remain outside CSS isolation. ([#36](https://github.com/diegoag64/jev-devtools/pull/36))

#### Documentation

- **Verified installation links.** Record verified npm publication metadata for 0.4.0, remove pending-publication instructions from installation docs, and link the published release. Documentation only; package behavior is unchanged. ([#35](https://github.com/diegoag64/jev-devtools/pull/35))

#### Maintenance

- **Approved npm publishing.** Add a manually dispatched GitHub Actions release workflow using npm trusted publishing, with a required GitHub environment approval, exact-archive checks, registry consumer verification, and GitHub release completion. Support checking an existing tarball or registry version in the consumer scripts. Package APIs and runtime behavior are unchanged; publishing needs the configured npm trust and GitHub environment protection. ([#60](https://github.com/diegoag64/jev-devtools/pull/60))

- **Release completion checklist.** Require a version-independent release checklist covering npm, the exact release tag, GitHub publication and Latest status, and explicit partial-completion reporting. Record the recovered v0.4.0 GitHub release and explain authentication options for remote publishing. Documentation only; existing checks and package compatibility are unchanged. ([#59](https://github.com/diegoag64/jev-devtools/pull/59))

- **PR description format.** Standardize PR descriptions around Problem, Change, Scope and compatibility, Verification, and CSS review, with matching contributor and agent guidance. Preserve existing required checks and CSS review requirements; no automated description check or package compatibility change. ([#58](https://github.com/diegoag64/jev-devtools/pull/58))

- **Unused CSS cleanup.** Remove confirmed unused legacy layout, dot animation, caption, mark and instruction styles, unused textarea selectors, and declarations superseded by current rules or inline geometry. Preserve the public CSS export and current component appearance. Flow cascade conflicts and the question-connector/suppression rules remain deferred to [#57](https://github.com/diegoag64/jev-devtools/issues/57). ([#36](https://github.com/diegoag64/jev-devtools/pull/36))

## 0.4.0 — October 24, 2026 (experimental)

Experimental minor release. The flow extensions are part of the 0.4.0 package; cookbook apps and fixtures remain repository examples. [Published package](https://www.npmjs.com/package/jev-devtools/v/0.4.0) · [Release preparation #34](https://github.com/diegoag64/jev-devtools/pull/34). Published at 07:41:04 UTC from commit `bc7f1609a6e94bf8fd9be4351db6983e8d0442ea`. Registry integrity matches the inspected archive; see [release verification](docs/releases.md#release-040--published-october-24-2026).

Flow API extensions and cookbook demos for 0.4.0 were merged in [#30](https://github.com/diegoag64/jev-devtools/pull/30).

### Compatibility and upgrade

- **SDK peer dependency.** Install `@typesafe-ai/sdk` explicitly alongside `jev-devtools`: the SDK is now a peer dependency (`>=0.7.0 <0.8.0`, verified with 0.7.0).

- **Server and drawer versions.** Existing React mounting, static Jev requests, and terminal branch behavior remain supported. Keep the 0.4.0 server and drawer together to inspect task, map, merge, and loop captures.

- **Non-loopback access.** Without `authorize`, Node middleware now accepts only loopback connections. Docker/VM/proxy setups may need application authorization. Web Request handlers must run on a loopback-bound server or configure authorization.

- **Execution limits.** Tasks and loops are in-process, with explicit bounds and cooperative cancellation. They do not add persistent workflows, automatic task retries, or rollback.

### Changes

#### Added

- **Bounded flow loops.** Add typed, pre-test `flow.loop()` with state carried between iterations, explicit `FlowLoopLimitError` on unfinished iteration-limit exhaustion, zero-iteration support and cancellation. Loops may contain maps; all expanded work shares one run-wide step budget. Loop templates and nested item templates count toward the definition limit. Nested loops and loops inside maps remain unsupported.

- **Loop iteration inspection.** Inspect loop iterations inline with selectors and navigation arrows, preserving the parent graph and camera. Initial/latest state, continuation decisions and nested request captures use the existing redaction limits. New loop records require a matching server/drawer build.

- **Returning conditionals.** Add `flow.if()` for typed value-returning paths that rejoin shared work, strict numeric `.gt()`, and a visible Selected result merge with captured values and only the chosen incoming edge highlighted. Branch-local references remain scoped; failures/cancellation prevent continuation. New `if`/`merge` records require the matching updated server and drawer; published `flow.branch()` semantics are unchanged.

- **Collection navigation arrows.** Add previous/next arrows beside expanded collection flows. Navigation wraps between the first and last items, stays synchronized with the selector, and preserves the original graph and camera.

- **Inline collection inspection.** Inspect collection items inline: choose an item and View Flow inside the collection card to expand its connected diagram underneath. Cycle items without leaving the parent canvas, with shared pan/zoom, collapsible item flows, and explicit queued/empty states.

- **Bounded flow maps.** Add typed `flow.map()` with bounded concurrency, stable input-order results, isolated item programs, fail-fast cancellation, empty-list support and explicit item/execution limits. Collection cards show progress and let users inspect every started item’s full request/function diagram.

- **Dynamic answer references.** Expose `.answers` references on Jev steps so functions can consume answers with runtime-generated names.

- **Server tasks.** Add server-side `flow.task()` with typed resolved inputs/results, asynchronous callbacks, cooperative cancellation and optional timeouts. Late results cannot advance failed/cancelled flows; tasks do not retry automatically.

- **Dynamic request factories.** Add a synchronous request-factory overload to `flow.jev()` for questions/criteria built from preceding results while retaining SDK request capture and linkage. Existing static requests remain supported.

- **Task inspection.** Display function cards, captured input/output property views, duration/status, capture warnings, and task-derived condition values. Task data is bounded/redacted independently of runtime values; exception messages and callback code are not sent to the browser.

#### Changed

- **Application-owned SDK dependency.** Make `@typesafe-ai/sdk` a peer dependency (`>=0.7.0 <0.8.0`, tested with 0.7.0) instead of a pinned dependency, so `createClient` uses the application's SDK copy. Install it with the package: `npm install jev-devtools @typesafe-ai/sdk`. Applications on another SDK version must move to 0.7.x. ([#28](https://github.com/diegoag64/jev-devtools/pull/28))

- **Expandable output properties.** Format function and merge-card outputs as typed, collapsible properties instead of cut-off JSON strings. Nested objects and arrays expand on demand; long values and additional properties remain accessible without growing the canvas indefinitely.

- **Collection transitions.** Animate collection item changes with a short directional fade/slide, respecting reduced motion. Center previews beneath their collection, move navigation arrows outside the frame with subtle corner rounding, and include their bounds when fitting the canvas. The camera and original nodes stay fixed during navigation.

- **Collapsible flow metadata.** Collapse flow metadata behind a Show details bar by default. The expanded panel scrolls independently and supports vertical pointer/keyboard resizing; selecting another step keeps the chosen panel height and does not open it automatically.

- **Larger probability captures.** Preserve up to 256 criteria/probability map entries in captures, allowing all 182 skills to remain inspectable. General collection, byte, and depth bounds still apply.

#### Fixed

- **Windows package verification.** Run `verify:package` and `verify:nextjs` on Windows through Node instead of spawning `npm.cmd`, which current Node refuses without a shell. ([#26](https://github.com/diegoag64/jev-devtools/pull/26))

- **Parallel map failure reporting.** Preserve the original failure when a map fails inside parallel work; cancelling sibling lanes no longer misreports the run as cancelled.

- **Node 22 cookbook transport.** Keep all six cookbook sample transports compatible with Node 22.12, including the SDK’s uncompressed request fallback when Zstandard is unavailable.

- **Playground request timeouts.** Bound playground request waits (30 seconds for samples, five minutes for live flows), including stalled response bodies. Timeouts restore the controls and explain recovery; Cancel now aborts the browser wait immediately and requests server cancellation in the background.

- **Collection preview positioning.** Keep original flow nodes and the camera fixed when opening or switching collection previews. Place previews below the graph with connectors anchored to the center of each wrapper’s top edge.

- **Flow card sizing.** Size flow cards and request headings to their text instead of clipping titles and descriptions. Recalculate spacing and connectors when content grows or shrinks, while preserving the camera.

#### Security

- **Inspector access checks.** Refuse non-loopback connections in `middleware` when `authorize` is unset. `Host` and `Origin` are client-controlled, so a network client could read captures and clear history on servers listening on all interfaces, such as Express `listen(port)` and `next dev`. Web Request handlers can't see the connection's address; run those servers on `127.0.0.1` or set `authorize`. Setups where the browser reaches the dev server through Docker port publishing, a VM, or a network-reachable proxy now need `authorize`. ([#27](https://github.com/diegoag64/jev-devtools/pull/27))

#### Documentation

- **React and Next.js onboarding.** Lead the repository README with React/Next.js setup and a parallel-flow example; make runnable cookbooks easier to discover and move sandbox/contributor details into their guides. Published and unreleased APIs remain explicitly distinguished; no runtime or API compatibility changes. ([#33](https://github.com/diegoag64/jev-devtools/pull/33))

- **Simple Memory cookbook.** Add the Simple Memory cookbook using existing flow APIs: sequential customer ticket replay, explicit per-customer memory, original-ticket/readable-answer capture and the inclusive 50% save gate. Four no-key samples show before/after routing, all team probabilities, transient-only tickets and threshold boundaries. Responses are synthetic; each run starts empty and no persistence API is added.

- **Structure Recovery cookbook.** Add the sample-only Structure Recovery cookbook using existing flow APIs: two sequential batched requests, visible line-merge and Markdown-render tasks, a safe original/preview comparison, every join/type probability, and cases for threshold boundaries, separated text and empty input. Prompts and rendering rules follow the official executable recipe; documents and answers are synthetic. No new flow primitive or live provider is introduced.

- **Hierarchical classification cookbook.** Add a sample-only hierarchical classification cookbook comparing beam and greedy traversal, including retained/pruned paths, every child probability, deterministic single-child bypass, an initial leaf, and intentional limit exhaustion. The taxonomy and scores are authored fixtures; scoring and separate concurrent frontier requests follow the official executable recipe.

- **SDE cascade cookbook.** Add a sample-only SDE cascade cookbook with dynamic per-field verification, conditional stronger extraction, before/after records, every flag accessible, and four no-key cases covering both routes and the strict 70% boundary. The overall judge is excluded from escalation; extraction and probabilities are labeled synthetic fixtures.

- **RAG classification cookbook.** Add the RAG passage-classification cookbook with twelve candidates, official question/policy semantics, separate evidence/conflict blocks, and three sample cases. Retrieval and generation are explicitly labeled stand-ins; no live providers are called.

- **Skill suggestion cookbook.** Add the full skill-suggestion selection flow using the official 182-skill roster, exact request/fit gates, dynamic shortlist questions, and agent-hint formatting. Provide three labeled synthetic cases, an adaptive result UI, and optional explicit live mode; the external-agent benchmark is not run.

- **Synthetic shortlist example.** Add a clearly labeled synthetic shortlist playground flow and human/AI API guidance. The map and loop additions are described above; distributed execution is not included.

#### Maintenance

- **Release preparation.** Set workspace/package versions and example archives to 0.4.0, update README badges and links, and align documentation and bundled skills with the complete flow API. Correct stale claims about missing `.gt()`, maps, and loops, and make the skill's sample transport handle compressed SDK requests. No additional runtime changes. ([#34](https://github.com/diegoag64/jev-devtools/pull/34))

- **Conventional PR titles.** Require conventional PR titles (`feat: …`, `fix: …`, etc.), with contributor/agent instructions and a lightweight metadata check that reruns on title edits.

## 0.3.0 — October 24, 2026 (experimental)

Experimental minor release. Includes the flow API and diagrams merged in [#23](https://github.com/diegoag64/jev-devtools/pull/23), plus complete README and bundled agent guidance. Existing root component props, server setup, and single-request calls remain compatible. Flow adoption is optional; `jev-devtools/flow` is a new Node-only entry point. [Published package](https://www.npmjs.com/package/jev-devtools/v/0.3.0) · [Documentation and release preparation #24](https://github.com/diegoag64/jev-devtools/pull/24). Published at 01:36:28 UTC from commit `559cfd3074176e39965365c00267f4c794b0e454`.

### Changes

#### Added

- **Branch requirement inspection.** Show executable branching rules on condition cards, including exact thresholds, comparisons, and AND/OR/NOT grouping. Noul thresholds display as percentages; the recorded decision identifies the taken route. Rule literals use bounded capture and the configured redaction callback.

- **Flow display metadata.** Add optional titles and descriptions to every flow step without changing request payloads or outcome IDs. Show explanatory outcome cards, per-lane parallel progress, and a softer zoom-aware grid; untaken cards keep opaque backgrounds. Existing definitions remain compatible.

- **Connected flow API.** Add the Node `jev-devtools/flow` API for typed input/answer references, sequential Jev calls, terminal branching, named parallel lanes with joins, and named output values. Definitions build without requests; runs preserve SDK retries and propagate failures/cancellation without automatic flow retries.

- **Connected flow recording.** Capture versioned definitions separately from bounded, session-scoped runs, including actual decisions, step timings and request links. Connect complete request diagrams on one shared flow canvas, preserving camera/selection and per-request question/probability controls. Explain parallel waits with named lanes and a “Wait for both checks” marker. Full tabbed request inspection remains available on selection. Existing single-request integrations remain compatible.

#### Changed

- **Readable condition cards.** Separate condition cards into named incoming values and plain-language requirements (for example, Ready: 94% / At least 90%). Read values only from retained, redacted request captures; keep technical references in the selected-step details.

- **Probability-weighted output cards.** Weight Noul True/False output-card borders and text by their respective probabilities, with minimum visibility for near-zero values and opaque backgrounds. Equal probabilities receive equal emphasis.

- **Expandable structured data.** Render diagram state and instructions as compact, scrollable property views, with lazy object/array expansion, typed values, paged properties, and expandable long text. Preserve sibling fields and camera position while browsing captured content.

- **Diagram grid.** Make diagram background dots sparser, smaller and softer when zooming out, keeping connected flows readable at overview scale. ([#23](https://github.com/diegoag64/jev-devtools/pull/23))

#### Documentation

- **Bundled flow recipe.** Add a version-matched, npm-bundled AI flow recipe with a complete parallel-checks/decision/branch example, static titles/descriptions, reference scope, error/cancellation behavior, sample verification, privacy rules, and troubleshooting. Link it from both READMEs, the setup skill, and `llms.txt`.

- **README flow examples.** Expand README flow examples and clarify that the custom drawer uses TanStack Virtual internally. Package verification requires the bundled flow instructions.

- **Sample flows and scaling tools.** Add sample-only refund outcomes, parallel checks, failure and cancellation playground scenarios, execution/UI checks, and local-only flow scaling tooling. No distributed/durable execution, loops, or automatic business actions. See [the flow guide](docs/flows.md) for v1 limits.

## 0.2.0 — October 23, 2026 (experimental)

[Published package](https://www.npmjs.com/package/jev-devtools/v/0.2.0) · [Release preparation #21](https://github.com/diegoag64/jev-devtools/pull/21). Published at 22:15:46 UTC from commit `b3bcb1097246a5065b6608397ff535ad71bb7648`.

### Compatibility and upgrade

Public component props and server setup APIs are unchanged. Upgrading from 0.1.3 does not require integration changes. Performance gains depend on workload; the changes do not eliminate initial snapshot transfer, hidden transport/parsing, or retained history memory. See the linked PRs for measured workloads, comparisons, and tradeoffs, and the [local benchmark guide](docs/performance.md) to reproduce them.

### Changes

#### Changed

- **Compact Choice overview.** Show a compact Flow overview for Choice responses with more than six categories: the top three probabilities, the returned choice when different, **Show More** to reveal three additional branches per click, and access to every captured probability through a searchable, paginated table. **Show fewer** resets the overview; opening the table preserves expanded branches. Newly revealed cards and connections animate in with a short stagger (disabled for reduced motion). Expanding or collapsing preserves pan and zoom; **Fit** explicitly reframes the diagram. Exact captured values remain available; summaries do not renormalize probabilities. ([#19](https://github.com/diegoag64/jev-devtools/pull/19))

#### Performance

- **Reuse unchanged views.** Reuse unchanged request rows and the selected detail view during incoming updates. Keep changed responses, selection, filtering, and tab navigation live; tab changes no longer rerender the request list. Public APIs are unchanged. ([#20](https://github.com/diegoag64/jev-devtools/pull/20))

- **Virtualized questions.** Virtualize the Questions tab and show lightweight previews during rapid scrolling. Preserve the complete picker, keyboard navigation, focused controls, expanded legends, and scroll position; restore full answers as scrolling slows or stops. This reduces opening work but moves some work to scrolling; browser Find and screen-reader document browsing see only mounted cards, with all answers still accessible through the picker and Raw. ([#17](https://github.com/diegoag64/jev-devtools/pull/17))

- **Batched server updates.** Batch outgoing inspector updates and share serialization across viewers in the same session, reducing repeated server work. Recording stays immediate; very fast calls can appear directly as completed. ([#14](https://github.com/diegoag64/jev-devtools/pull/14))

- **Incremental streaming.** After the initial snapshot, stream changed traces instead of resending the full history. Keep compatibility with older clients and servers, and recover interrupted streams with a fresh snapshot. ([#15](https://github.com/diegoag64/jev-devtools/pull/15))

- **Frame-coalesced updates.** Apply received events in order, but publish accumulated browser state to React once per animation frame to reduce repeated rendering during bursts. This can add about one frame of display latency. ([#15](https://github.com/diegoag64/jev-devtools/pull/15))

- **Suspend closed drawers.** Defer the inspector's first render until opening; suspend trace-driven React updates and SVG animation while closed. Reopening shows current history while preserving controls and the retained request's selection and camera. Capture, transport, and parsing continue while hidden; the previously opened panel stays in memory. ([#16](https://github.com/diegoag64/jev-devtools/pull/16))

#### Documentation

- **Large Choice sandbox.** Add a sample-only playground sandbox for 150-choice responses, ties, zero probabilities, long labels, large context, and unusual returned choices. Add a local Choice overview/pan/zoom comparison suite; results stay outside Git. ([#19](https://github.com/diegoag64/jev-devtools/pull/19))

- **README introduction.** Refocus the README introduction on visualizing Jev flows. ([#12](https://github.com/diegoag64/jev-devtools/pull/12))

- **Changelog discovery.** Make the changelog discoverable from both READMEs and the agent documentation index; add a release overview and a contribution policy for keeping it current. ([#18](https://github.com/diegoag64/jev-devtools/pull/18))

#### Maintenance

- **Local performance benchmarks.** Add repeatable server and isolated-browser benchmarks for large histories, large inputs, diagram rendering, and streaming updates, with before/after findings summarized in the PRs. ([#13](https://github.com/diegoag64/jev-devtools/pull/13), [#14](https://github.com/diegoag64/jev-devtools/pull/14), [#15](https://github.com/diegoag64/jev-devtools/pull/15), [#16](https://github.com/diegoag64/jev-devtools/pull/16))

- **Drawer regression checks.** Add browser correctness checks for closing/reopening, preserved controls, clear, and eviction on React 18 and 19. ([#16](https://github.com/diegoag64/jev-devtools/pull/16))

- **Benchmark artifact policy.** Keep generated benchmark evidence and per-run reports out of Git, retain local reproduction scripts, and retire the hosted benchmark workflow. Store results in PR descriptions or discussions. ([#18](https://github.com/diegoag64/jev-devtools/pull/18))

## 0.1.3 — October 23, 2026 (experimental)

[Published package](https://www.npmjs.com/package/jev-devtools/v/0.1.3) · Included PRs: [#9](https://github.com/diegoag64/jev-devtools/pull/9), [#10](https://github.com/diegoag64/jev-devtools/pull/10), [#11](https://github.com/diegoag64/jev-devtools/pull/11).

### Compatibility and upgrade

- **API compatibility.** Public component props and server APIs are unchanged.

### Changes

#### Added

- **Diagram navigation.** Add a diagram canvas with pointer-centered wheel zoom, drag-to-pan, pinch gestures, keyboard controls, and fit-to-view.

#### Fixed

- **Drawer style isolation.** Isolate the drawer in a custom Shadow DOM host so application styles cannot add padding or alter the inspector. Host-page CSS overrides no longer reach internal elements.

#### Documentation

- **Version-specific npm links.** Keep README npm badges and links aligned with the package version, using exact-version URLs.

#### Maintenance

- **Release output cleanup.** Clarify the main README feature heading and keep prepack diagnostics out of machine-readable npm output.

## 0.1.2 — October 23, 2026 (experimental)

[Published package](https://www.npmjs.com/package/jev-devtools/v/0.1.2) · Included PRs: [#7](https://github.com/diegoag64/jev-devtools/pull/7), [#8](https://github.com/diegoag64/jev-devtools/pull/8).

### Changes

#### Documentation

- **Inline demo media.** Remove the MP4 download link from the npm README; retain the complete inline GIF.

- **Bundled setup skill.** Bundle a `setup-jev-devtools` agent skill with React/Node/Vite and Next.js recipes, no-key sample verification, and troubleshooting.

- **Agent setup prompts.** Add copyable setup prompts and a repository `llms.txt` documentation index; clarify installation versus contributor instructions.

#### Maintenance

- **Package content verification.** Verify that the published archive includes the complete skill and its references. No runtime or public API changes.

## 0.1.1 — October 23, 2026 (experimental)

[Published package](https://www.npmjs.com/package/jev-devtools/v/0.1.1) · Included PRs: [#5](https://github.com/diegoag64/jev-devtools/pull/5), [#6](https://github.com/diegoag64/jev-devtools/pull/6).

### Compatibility and upgrade

- **API compatibility.** Documentation and media only; no changes to the React component, server APIs, or runtime behavior.

### Changes

#### Documentation

- **npm installation instructions.** Refresh the npm README with the published installation command and npm badge; remove obsolete migration guidance.

- **Complete inline demo.** Show the complete 28-second demo inline in the GitHub and npm READMEs as an optimized GIF.

- **Smaller video download.** Reduce the optional MP4 to 1280 × 716 at 30 fps and link directly to the download instead of GitHub’s file viewer.

## 0.1.0 — October 23, 2026 (experimental)

[Published package](https://www.npmjs.com/package/jev-devtools/v/0.1.0) · Included PRs: [#1](https://github.com/diegoag64/jev-devtools/pull/1), [#2](https://github.com/diegoag64/jev-devtools/pull/2), [#3](https://github.com/diegoag64/jev-devtools/pull/3), [#4](https://github.com/diegoag64/jev-devtools/pull/4).

First public npm release as **[`jev-devtools`](https://www.npmjs.com/package/jev-devtools/v/0.1.0)**. This is a development tool with APIs that may change before 1.0.

### Compatibility and upgrade

This release targets React and a Node server. Capture is limited to instrumented clients in one Node realm/process; there is no edge runtime support, distributed/serverless aggregation, persistence, or automatic interception of unrelated clients. Diagrams show captured data, not hidden model reasoning or inferred application policies.

Verification uses sample responses through the real SDK. Live inference and browser visual verification are separate from the automated React/Next.js checks. Project code remains MIT licensed; bundled third-party notices and TypeSafe branding attribution are preserved.

### Changes

#### Added

- **React inspector.** A single `<JevDevtools />` React root component with a custom drawer, scoped CSS, searchable request history, and Flow, Questions, Context, Transport, and Raw views.

- **Request diagrams.** Animated diagrams for Jev Choice, Score, Noul, and Box inputs and results.

- **Node request capture.** A Node adapter that captures calls made through its TypeSafe SDK client, including retries, errors, cancellation, timing, and returned values. Capture preserves the SDK's APIPromise behavior.

- **Next.js integration.** Next.js App Router integration for Route Handlers, Server Actions, and Server Components, including shared history across server module reloads.

#### Security

- **Capture access and redaction.** Same-origin SSE, bounded in-memory history, redaction hooks, authorization and session scoping, and explicit opt-in for both capture and display.

#### Documentation

- **Independent consumer examples.** Independent packed-package examples and verification for React 18/19, Node 22.12+/24, and Next.js.

## Registry staging entry

npm also lists `0.0.0-stage`, created on October 23, 2026 during the initial publishing flow. It is a staging placeholder, not a separate feature release. The first public release was `0.1.0`; `latest` pointed to `0.4.1` when this history was checked. Use the exact-version package links above to inspect a specific release.
