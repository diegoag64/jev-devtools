# Changelog

User-facing changes, newest first. **Unreleased** means not published to npm. On `main`, these changes are merged; on feature branches, they are proposed changes awaiting review. See [work in progress](https://github.com/diegoag64/jev-devtools/pulls).

Dates below use UTC and were checked against npm's publication history. The historical entries were reconstructed from the release PRs and merged changes. Versions remain experimental before 1.0.

## At a glance

| Version | Published (UTC) | Highlights |
| --- | --- | --- |
| [Unreleased](#unreleased) | Not published | No changes yet. |
| [0.4.0](#040--pending-publication) | Pending publication | Flow API extensions, six cookbooks, React/Next.js setup documentation, SDK peer dependency, loopback-only inspector middleware without authorization, and Windows support for the package and Next.js verification scripts. |
| [0.3.0](#030--october-24-2026-experimental) | 2026-10-24 | Connected flow API, complete request diagrams, readable branch requirements, structured content, and bundled AI flow guidance. |
| [0.2.0](#020--october-23-2026-experimental) | 2026-10-23 | Batched updates, changed-trace streaming, frame-coalesced rendering, less work while the drawer is closed, virtualized Questions, compact Choice diagrams, and reuse of unchanged inspector views. |
| [0.1.3](#013--october-23-2026-experimental) | 2026-10-23 | Isolated drawer styles, diagram pan/zoom, and version-specific npm links. |
| [0.1.2](#012--october-23-2026-experimental) | 2026-10-23 | Bundled AI setup skill and framework recipes. |
| [0.1.1](#011--october-23-2026-experimental) | 2026-10-23 | Full inline demo GIF and published-package installation instructions. |
| [0.1.0](#010--october-23-2026-experimental) | 2026-10-23 | First public package: React inspector, Jev diagrams, Node adapter, and Next.js integration. |

## Unreleased

No changes yet.

## 0.4.0 — Pending publication

Experimental minor release prepared for review; npm publication has not occurred. The flow extensions are part of the 0.4.0 package. Cookbook apps and fixtures remain repository examples. This section records the release contents, not a publication date.

### Compatibility and upgrade

- Install `@typesafe-ai/sdk` explicitly alongside `jev-devtools`: the SDK is now a peer dependency (`>=0.7.0 <0.8.0`, verified with 0.7.0).
- Existing React mounting, static Jev requests, and terminal branch behavior remain supported. Keep the 0.4.0 server and drawer together to inspect task, map, merge, and loop captures.
- Without `authorize`, Node middleware now accepts only loopback connections. Docker/VM/proxy setups may need application authorization. Web Request handlers must run on a loopback-bound server or configure authorization.
- Tasks and loops are in-process, with explicit bounds and cooperative cancellation. They do not add persistent workflows, automatic task retries, or rollback.

### Release preparation

- Set workspace/package versions and example archives to 0.4.0, update README badges and links, and align documentation and bundled skills with the complete flow API. Correct stale claims about missing `.gt()`, maps, and loops, and make the skill's sample transport handle compressed SDK requests. No additional runtime changes. ([#34](https://github.com/diegoag64/jev-devtools/pull/34))

### Changes

- Lead the repository README with React/Next.js setup and a parallel-flow example; make runnable cookbooks easier to discover and move sandbox/contributor details into their guides. Published and unreleased APIs remain explicitly distinguished; no runtime or API compatibility changes. ([#33](https://github.com/diegoag64/jev-devtools/pull/33))

- Run `verify:package` and `verify:nextjs` on Windows through Node instead of spawning `npm.cmd`, which current Node refuses without a shell. ([#26](https://github.com/diegoag64/jev-devtools/pull/26))

- Refuse non-loopback connections in `middleware` when `authorize` is unset. `Host` and `Origin` are client-controlled, so a network client could read captures and clear history on servers listening on all interfaces, such as Express `listen(port)` and `next dev`. Web Request handlers can't see the connection's address; run those servers on `127.0.0.1` or set `authorize`. Setups where the browser reaches the dev server through Docker port publishing, a VM, or a network-reachable proxy now need `authorize`. ([#27](https://github.com/diegoag64/jev-devtools/pull/27))

- Make `@typesafe-ai/sdk` a peer dependency (`>=0.7.0 <0.8.0`, tested with 0.7.0) instead of a pinned dependency, so `createClient` uses the application's SDK copy. Install it with the package: `npm install jev-devtools @typesafe-ai/sdk`. Applications on another SDK version must move to 0.7.x. ([#28](https://github.com/diegoag64/jev-devtools/pull/28))

Flow API extensions and cookbook demos for 0.4.0 were merged in [#30](https://github.com/diegoag64/jev-devtools/pull/30).

- Preserve the original failure when a map fails inside parallel work; cancelling sibling lanes no longer misreports the run as cancelled.

- Keep all six cookbook sample transports compatible with Node 22.12, including the SDK’s uncompressed request fallback when Zstandard is unavailable.

- Require conventional PR titles (`feat: …`, `fix: …`, etc.), with contributor/agent instructions and a lightweight metadata check that reruns on title edits.

- Format function and merge-card outputs as typed, collapsible properties instead of cut-off JSON strings. Nested objects and arrays expand on demand; long values and additional properties remain accessible without growing the canvas indefinitely.

- Add the Simple Memory cookbook using existing flow APIs: sequential customer ticket replay, explicit per-customer memory, original-ticket/readable-answer capture and the inclusive 50% save gate. Four no-key samples show before/after routing, all team probabilities, transient-only tickets and threshold boundaries. Responses are synthetic; each run starts empty and no persistence API is added.

- Bound playground request waits (30 seconds for samples, five minutes for live flows), including stalled response bodies. Timeouts restore the controls and explain recovery; Cancel now aborts the browser wait immediately and requests server cancellation in the background.

- Add the sample-only Structure Recovery cookbook using existing flow APIs: two sequential batched requests, visible line-merge and Markdown-render tasks, a safe original/preview comparison, every join/type probability, and cases for threshold boundaries, separated text and empty input. Prompts and rendering rules follow the official executable recipe; documents and answers are synthetic. No new flow primitive or live provider is introduced.

- Add typed, pre-test `flow.loop()` with state carried between iterations, explicit `FlowLoopLimitError` on unfinished iteration-limit exhaustion, zero-iteration support and cancellation. Loops may contain maps; all expanded work shares one run-wide step budget. Loop templates and nested item templates count toward the definition limit. Nested loops and loops inside maps remain unsupported.
- Inspect loop iterations inline with selectors and navigation arrows, preserving the parent graph and camera. Initial/latest state, continuation decisions and nested request captures use the existing redaction limits. New loop records require a matching server/drawer build.
- Add a sample-only hierarchical classification cookbook comparing beam and greedy traversal, including retained/pruned paths, every child probability, deterministic single-child bypass, an initial leaf, and intentional limit exhaustion. The taxonomy and scores are authored fixtures; scoring and separate concurrent frontier requests follow the official executable recipe.

- Add `flow.if()` for typed value-returning paths that rejoin shared work, strict numeric `.gt()`, and a visible Selected result merge with captured values and only the chosen incoming edge highlighted. Branch-local references remain scoped; failures/cancellation prevent continuation. New `if`/`merge` records require the matching updated server and drawer; published `flow.branch()` semantics are unchanged.
- Add a sample-only SDE cascade cookbook with dynamic per-field verification, conditional stronger extraction, before/after records, every flag accessible, and four no-key cases covering both routes and the strict 70% boundary. The overall judge is excluded from escalation; extraction and probabilities are labeled synthetic fixtures.

- Animate collection item changes with a short directional fade/slide, respecting reduced motion. Center previews beneath their collection, move navigation arrows outside the frame with subtle corner rounding, and include their bounds when fitting the canvas. The camera and original nodes stay fixed during navigation.

- Add previous/next arrows beside expanded collection flows. Navigation wraps between the first and last items, stays synchronized with the selector, and preserves the original graph and camera.

- Keep original flow nodes and the camera fixed when opening or switching collection previews. Place previews below the graph with connectors anchored to the center of each wrapper’s top edge.

- Inspect collection items inline: choose an item and View Flow inside the collection card to expand its connected diagram underneath. Cycle items without leaving the parent canvas, with shared pan/zoom, collapsible item flows, and explicit queued/empty states.

- Size flow cards and request headings to their text instead of clipping titles and descriptions. Recalculate spacing and connectors when content grows or shrinks, while preserving the camera.

- Add typed `flow.map()` with bounded concurrency, stable input-order results, isolated item programs, fail-fast cancellation, empty-list support and explicit item/execution limits. Collection cards show progress and let users inspect every started item’s full request/function diagram.
- Add the RAG passage-classification cookbook with twelve candidates, official question/policy semantics, separate evidence/conflict blocks, and three sample cases. Retrieval and generation are explicitly labeled stand-ins; no live providers are called.

- Collapse flow metadata behind a Show details bar by default. The expanded panel scrolls independently and supports vertical pointer/keyboard resizing; selecting another step keeps the chosen panel height and does not open it automatically.

- Add the full skill-suggestion selection flow using the official 182-skill roster, exact request/fit gates, dynamic shortlist questions, and agent-hint formatting. Provide three labeled synthetic cases, an adaptive result UI, and optional explicit live mode; the external-agent benchmark is not run.
- Expose `.answers` references on Jev steps so functions can consume answers with runtime-generated names.
- Preserve up to 256 criteria/probability map entries in captures, allowing all 182 skills to remain inspectable. General collection, byte, and depth bounds still apply.

- Add server-side `flow.task()` with typed resolved inputs/results, asynchronous callbacks, cooperative cancellation and optional timeouts. Late results cannot advance failed/cancelled flows; tasks do not retry automatically.
- Add a synchronous request-factory overload to `flow.jev()` for questions/criteria built from preceding results while retaining SDK request capture and linkage. Existing static requests remain supported.
- Display function cards, captured input/output property views, duration/status, capture warnings, and task-derived condition values. Task data is bounded/redacted independently of runtime values; exception messages and callback code are not sent to the browser.
- Add a clearly labeled synthetic shortlist playground flow and human/AI API guidance. The map and loop additions are described above; distributed execution is not included.

## 0.3.0 — October 24, 2026 (experimental)

Experimental minor release. Includes the flow API and diagrams merged in [#23](https://github.com/diegoag64/jev-devtools/pull/23), plus complete README and bundled agent guidance. Existing root component props, server setup, and single-request calls remain compatible. Flow adoption is optional; `jev-devtools/flow` is a new Node-only entry point. [Published package](https://www.npmjs.com/package/jev-devtools/v/0.3.0) · [Documentation and release preparation #24](https://github.com/diegoag64/jev-devtools/pull/24). Published at 01:36:28 UTC from commit `559cfd3074176e39965365c00267f4c794b0e454`.

### Documentation

- Add a version-matched, npm-bundled AI flow recipe with a complete parallel-checks/decision/branch example, static titles/descriptions, reference scope, error/cancellation behavior, sample verification, privacy rules, and troubleshooting. Link it from both READMEs, the setup skill, and `llms.txt`.
- Expand README flow examples and clarify that the custom drawer uses TanStack Virtual internally. Package verification requires the bundled flow instructions.

### Added

- Separate condition cards into named incoming values and plain-language requirements (for example, Ready: 94% / At least 90%). Read values only from retained, redacted request captures; keep technical references in the selected-step details.
- Show executable branching rules on condition cards, including exact thresholds, comparisons, and AND/OR/NOT grouping. Noul thresholds display as percentages; the recorded decision identifies the taken route. Rule literals use bounded capture and the configured redaction callback.
- Weight Noul True/False output-card borders and text by their respective probabilities, with minimum visibility for near-zero values and opaque backgrounds. Equal probabilities receive equal emphasis.
- Render diagram state and instructions as compact, scrollable property views, with lazy object/array expansion, typed values, paged properties, and expandable long text. Preserve sibling fields and camera position while browsing captured content.
- Add optional titles and descriptions to every flow step without changing request payloads or outcome IDs. Show explanatory outcome cards, per-lane parallel progress, and a softer zoom-aware grid; untaken cards keep opaque backgrounds. Existing definitions remain compatible.
- Add the Node `jev-devtools/flow` API for typed input/answer references, sequential Jev calls, terminal branching, named parallel lanes with joins, and named output values. Definitions build without requests; runs preserve SDK retries and propagate failures/cancellation without automatic flow retries.
- Capture versioned definitions separately from bounded, session-scoped runs, including actual decisions, step timings and request links. Connect complete request diagrams on one shared flow canvas, preserving camera/selection and per-request question/probability controls. Explain parallel waits with named lanes and a “Wait for both checks” marker. Full tabbed request inspection remains available on selection. Existing single-request integrations remain compatible.
- Add sample-only refund outcomes, parallel checks, failure and cancellation playground scenarios, execution/UI checks, and local-only flow scaling tooling. No distributed/durable execution, loops, or automatic business actions. See [the flow guide](docs/flows.md) for v1 limits.
- Make diagram background dots sparser, smaller and softer when zooming out, keeping connected flows readable at overview scale. ([#23](https://github.com/diegoag64/jev-devtools/pull/23))

## 0.2.0 — October 23, 2026 (experimental)

[Published package](https://www.npmjs.com/package/jev-devtools/v/0.2.0) · [Release preparation #21](https://github.com/diegoag64/jev-devtools/pull/21). Published at 22:15:46 UTC from commit `b3bcb1097246a5065b6608397ff535ad71bb7648`.

### Performance

- Reuse unchanged request rows and the selected detail view during incoming updates. Keep changed responses, selection, filtering, and tab navigation live; tab changes no longer rerender the request list. Public APIs are unchanged. ([#20](https://github.com/diegoag64/jev-devtools/pull/20))

- Show a compact Flow overview for Choice responses with more than six categories: the top three probabilities, the returned choice when different, **Show More** to reveal three additional branches per click, and access to every captured probability through a searchable, paginated table. **Show fewer** resets the overview; opening the table preserves expanded branches. Newly revealed cards and connections animate in with a short stagger (disabled for reduced motion). Expanding or collapsing preserves pan and zoom; **Fit** explicitly reframes the diagram. Exact captured values remain available; summaries do not renormalize probabilities. ([#19](https://github.com/diegoag64/jev-devtools/pull/19))

- Virtualize the Questions tab and show lightweight previews during rapid scrolling. Preserve the complete picker, keyboard navigation, focused controls, expanded legends, and scroll position; restore full answers as scrolling slows or stops. This reduces opening work but moves some work to scrolling; browser Find and screen-reader document browsing see only mounted cards, with all answers still accessible through the picker and Raw. ([#17](https://github.com/diegoag64/jev-devtools/pull/17))

- Batch outgoing inspector updates and share serialization across viewers in the same session, reducing repeated server work. Recording stays immediate; very fast calls can appear directly as completed. ([#14](https://github.com/diegoag64/jev-devtools/pull/14))
- After the initial snapshot, stream changed traces instead of resending the full history. Keep compatibility with older clients and servers, and recover interrupted streams with a fresh snapshot. ([#15](https://github.com/diegoag64/jev-devtools/pull/15))
- Apply received events in order, but publish accumulated browser state to React once per animation frame to reduce repeated rendering during bursts. This can add about one frame of display latency. ([#15](https://github.com/diegoag64/jev-devtools/pull/15))
- Defer the inspector's first render until opening; suspend trace-driven React updates and SVG animation while closed. Reopening shows current history while preserving controls and the retained request's selection and camera. Capture, transport, and parsing continue while hidden; the previously opened panel stays in memory. ([#16](https://github.com/diegoag64/jev-devtools/pull/16))

Public component props and server setup APIs are unchanged. Upgrading from 0.1.3 does not require integration changes. Performance gains depend on workload; the changes do not eliminate initial snapshot transfer, hidden transport/parsing, or retained history memory. See the linked PRs for measured workloads, comparisons, and tradeoffs, and the [local benchmark guide](docs/performance.md) to reproduce them.

### Documentation and developer tooling

- Add a sample-only playground sandbox for 150-choice responses, ties, zero probabilities, long labels, large context, and unusual returned choices. Add a local Choice overview/pan/zoom comparison suite; results stay outside Git. ([#19](https://github.com/diegoag64/jev-devtools/pull/19))

- Add repeatable server and isolated-browser benchmarks for large histories, large inputs, diagram rendering, and streaming updates, with before/after findings summarized in the PRs. ([#13](https://github.com/diegoag64/jev-devtools/pull/13), [#14](https://github.com/diegoag64/jev-devtools/pull/14), [#15](https://github.com/diegoag64/jev-devtools/pull/15), [#16](https://github.com/diegoag64/jev-devtools/pull/16))
- Add browser correctness checks for closing/reopening, preserved controls, clear, and eviction on React 18 and 19. ([#16](https://github.com/diegoag64/jev-devtools/pull/16))
- Refocus the README introduction on visualizing Jev flows. ([#12](https://github.com/diegoag64/jev-devtools/pull/12))
- Keep generated benchmark evidence and per-run reports out of Git, retain local reproduction scripts, and retire the hosted benchmark workflow. Store results in PR descriptions or discussions. ([#18](https://github.com/diegoag64/jev-devtools/pull/18))
- Make the changelog discoverable from both READMEs and the agent documentation index; add a release overview and a contribution policy for keeping it current. ([#18](https://github.com/diegoag64/jev-devtools/pull/18))

## 0.1.3 — October 23, 2026 (experimental)

[Published package](https://www.npmjs.com/package/jev-devtools/v/0.1.3) · Included PRs: [#9](https://github.com/diegoag64/jev-devtools/pull/9), [#10](https://github.com/diegoag64/jev-devtools/pull/10), [#11](https://github.com/diegoag64/jev-devtools/pull/11).

- Isolate the drawer in a custom Shadow DOM host so application styles cannot add padding or alter the inspector. Host-page CSS overrides no longer reach internal elements.
- Add a diagram canvas with pointer-centered wheel zoom, drag-to-pan, pinch gestures, keyboard controls, and fit-to-view.
- Keep README npm badges and links aligned with the package version, using exact-version URLs.
- Clarify the main README feature heading and keep prepack diagnostics out of machine-readable npm output.
- Public component props and server APIs are unchanged.

## 0.1.2 — October 23, 2026 (experimental)

[Published package](https://www.npmjs.com/package/jev-devtools/v/0.1.2) · Included PRs: [#7](https://github.com/diegoag64/jev-devtools/pull/7), [#8](https://github.com/diegoag64/jev-devtools/pull/8).

- Remove the MP4 download link from the npm README; retain the complete inline GIF.
- Bundle a `setup-jev-devtools` agent skill with React/Node/Vite and Next.js recipes, no-key sample verification, and troubleshooting.
- Add copyable setup prompts and a repository `llms.txt` documentation index; clarify installation versus contributor instructions.
- Verify that the published archive includes the complete skill and its references. No runtime or public API changes.

## 0.1.1 — October 23, 2026 (experimental)

[Published package](https://www.npmjs.com/package/jev-devtools/v/0.1.1) · Included PRs: [#5](https://github.com/diegoag64/jev-devtools/pull/5), [#6](https://github.com/diegoag64/jev-devtools/pull/6).

- Refresh the npm README with the published installation command and npm badge; remove obsolete migration guidance.
- Show the complete 28-second demo inline in the GitHub and npm READMEs as an optimized GIF.
- Reduce the optional MP4 to 1280 × 716 at 30 fps and link directly to the download instead of GitHub’s file viewer.
- Documentation and media only; no changes to the React component, server APIs, or runtime behavior.

## 0.1.0 — October 23, 2026 (experimental)

[Published package](https://www.npmjs.com/package/jev-devtools/v/0.1.0) · Included PRs: [#1](https://github.com/diegoag64/jev-devtools/pull/1), [#2](https://github.com/diegoag64/jev-devtools/pull/2), [#3](https://github.com/diegoag64/jev-devtools/pull/3), [#4](https://github.com/diegoag64/jev-devtools/pull/4).

First public npm release as **[`jev-devtools`](https://www.npmjs.com/package/jev-devtools/v/0.1.0)**. This is a development tool with APIs that may change before 1.0.

### Included

- A single `<JevDevtools />` React root component with a custom drawer, scoped CSS, searchable request history, and Flow, Questions, Context, Transport, and Raw views.
- Animated diagrams for Jev Choice, Score, Noul, and Box inputs and results.
- A Node adapter that captures calls made through its TypeSafe SDK client, including retries, errors, cancellation, timing, and returned values. Capture preserves the SDK's APIPromise behavior.
- Same-origin SSE, bounded in-memory history, redaction hooks, authorization and session scoping, and explicit opt-in for both capture and display.
- Next.js App Router integration for Route Handlers, Server Actions, and Server Components, including shared history across server module reloads.
- Independent packed-package examples and verification for React 18/19, Node 22.12+/24, and Next.js.

### Limits and validation

This release targets React and a Node server. Capture is limited to instrumented clients in one Node realm/process; there is no edge runtime support, distributed/serverless aggregation, persistence, or automatic interception of unrelated clients. Diagrams show captured data, not hidden model reasoning or inferred application policies.

Verification uses sample responses through the real SDK. Live inference and browser visual verification are separate from the automated React/Next.js checks. Project code remains MIT licensed; bundled third-party notices and TypeSafe branding attribution are preserved.

## Registry staging entry

npm also lists `0.0.0-stage`, created on October 23, 2026 during the initial publishing flow. It is a staging placeholder, not a separate feature release. The first public release was `0.1.0`; `latest` pointed to `0.3.0` when this history was checked. Use the exact-version package links above to inspect a specific release.
