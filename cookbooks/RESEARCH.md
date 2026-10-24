# Cookbook research and proposed local runner

Research date: **2026-10-23**. Baseline: **jev-devtools 0.3.0**, commit `a229b328ce742cf2a15fb01514d62e7a52cb0839`, SDK dependency `@typesafe-ai/sdk@0.7.0`.

Status: this is the baseline research, local and unpushed. A subsequent function-step experiment is now documented in [the flow guide](../docs/flows.md#function-steps-and-runtime-requests-unreleased-experiment); API limitations below describe the reviewed 0.3.0 baseline. This document proposes implementation; it does not claim that the cookbook runner, extra APIs, or fixtures exist.

## Scope and evidence

Reviewed all 20 pages linked by the [official cookbook index](https://docs.typesafe.ai/cookbooks), including their executable examples and routing rules, then compared them with:

- [Flow implementation](../packages/jev-devtools/flow/index.ts) and [public guide](../docs/flows.md).
- [Current playground server](../apps/playground/server/plugin.ts), [example flows](../apps/playground/server/flows.ts), and [playground UI](../apps/playground/src/Playground.tsx).
- The [official examples repository](https://github.com/typesafe-ai/typesafe-public-examples/tree/25e9d373f4853b3e7e300e55a194f50e54838f68), its file tree, license, and the memory/chat caches.

The [catalog](README.md) accounts for every indexed recipe. Extra directories in the upstream examples repository are not automatically additional published cookbooks. [sources.json](sources.json) records page URLs, byte counts, and SHA-256 hashes of the Markdown fetched for this review. The docs pages themselves are not revision-pinned, so those hashes identify the reviewed content, not a retrievable immutable URL.

No Jev calls, paid evaluations, performance benchmarks, or browser UI validation were run for this research. Feasibility conclusions below come from source/API inspection. A port still needs execution and fidelity checks.

## What the API can represent today

We can build a useful collection without changing the public API:

- One request with multiple typed questions, inspectable answers and probabilities.
- Sequential requests whose state incorporates known fields from earlier answers.
- Explicit conditions, named outputs, and static explanatory titles/descriptions.
- A fixed set of parallel request lanes and a join waiting for their completion.
- A finite definition created after input preprocessing. For example, regex candidates extracted **before** execution can become static Choice criteria for that run's definition. This does not enable questions computed from a later answer.

The important boundary is **application computation between requests**. The current builder has no general transform/task callback, dynamic lookup by a returned label, arithmetic, top-k, runtime question factory, loop, or dynamic fan-out. `.get(key)` takes a static key. Branches terminate their block; they cannot fall through into a shared continuation. Definitions have a 256-node and 16-nested-block limit.

Consequently, a connected diagram of “request A → rank its answers → request B with new options” needs more than writing another example. Putting a fabricated answer in an input or predetermining the shortlist would change the recipe.

The viewer also shows one selected question diagram per request, with every answer accessible through the question picker and Questions tab. A batch of 54 questions will not automatically render 54 simultaneous question diagrams. Parallel lanes are separate requests, not a visual substitute for questions sharing one request.

## Fidelity notes for implementation

These are the details most likely to be lost in a superficial port. Recipe links in the catalog are the primary sources.

### Straightforward decision examples

**Twitch chat filter.** One message produces a category plus toxicity and spoiler Nouls. Preserve policy order: toxicity at least 0.70 hides first, a category hide rule comes next, spoilers at least 0.70 blur next, then the category's remaining action. Use separate flow runs per message. The source's eight-worker feed and ordered presentation belong to the runner, not an ever-growing parallel definition. Keep policy changes separate from new inference.

**Entity alignment.** One request contains a three-level Score and three Nouls about name, brewery, and style. The route rounds to the nearest Score level: below 0.5 leave unlinked, from 0.5 to below 1.5 queue for review, and at least 1.5 propose `sameAs`. These cut points come from rounding semantic levels, not a calibrated probability threshold. The companion Nouls explain field agreement; they do not independently decide the merge. Test pairs on both sides of each boundary.

**Citation checking.** Application code normalizes and matches the quoted span. A missing quote becomes fabricated without inference; a citation without quoted text takes the source-section path. Otherwise a Choice assesses support, and API confidence below 0.80 sends the verdict for review. Put the quote-match evidence in the flow input and make the bypass visible. Do not present the string matcher as a model request.

**Confidence fallback.** The industry example uses the returned Choice **confidence**, accepting the detailed industry at 0.90 or higher. The broader division comes from a lookup table. Return the industry and specificity from the flow, then resolve the parent in application code. The current API cannot dynamically index that table using an answer reference. Returning a general “broader classification” box is possible, but displaying the actual division requires the external lookup or explicit finite branches.

**Guardrails.** Preserve `support > block > review > pass` precedence. Strict/permissive action thresholds are 0.70/0.85; the review threshold is 0.35. Crucially, severity at least 2 upgrades an existing review action to block; it does **not** independently block a message with no triggered hazard. Input and output use different question batteries. A full LLM round trip between them needs external execution support; screening either side independently works now.

**Line search.** One Choice supplies relative line weights and a Noul checks whether an answer exists. The latter routes at `>= 0.70` for answered, `< 0.35` for absent, and otherwise partial. A highly ranked line does not prove that the document answers the question. Render ranked lines outside the graph, with selection linked to the corresponding answer. Keep the large option list accessible through the existing compact Choice UI.

### Multiple-request examples

**RAG passage classification.** Preserve one request per query/passage pair, containing four Nouls. The routing order is injection `> 0.70` → exclude; contradiction `> 0.70` → conflicting evidence; relevance `< 0.45` → exclude; answer evidence `> 0.55` → include; otherwise exclude. A fixed three-passage adaptation makes the lanes readable; the original retrieves twelve candidates. Label the reduced candidate count. Retrieval, collection into evidence buckets, and answer generation remain outside capture. Do not treat one passage's scores as normalized against another's.

**Re-ranking.** The Jev unit is one Noul request per query/candidate pair. Bounded parallel lanes are a good fit, but sorting scores and moving result cards are application work. Start with three or six passages and offer a separately labeled larger preset. The original evaluates thirty retrieved candidates; a smaller UI demo is not a reproduction of its retrieval evaluation.

**Memory.** The sequence is routing with previous customer memory, then a Noul gate on the **original** ticket plus its answer, then optional storage at `>= 0.5`. The source converts a chosen label into its criterion description before the gate. Our references can pass the label but cannot directly perform that lookup. Options are: generate finite label branches with the exact descriptions; add a future transform; or disclose an adapted gate state containing the label and criteria map. Prefer the finite approach for fidelity if the diagram remains readable. Store after the flow returns, preserve the routing result on both paths, isolate customers, and support reset. Do not recursively save the injected memory as part of the original ticket.

**Parallel questions.** The source compares thirteen questions in one call with thirteen individual calls. Use a single batched request diagram and a separate individual-call view. Its timing comparison sums individual request latencies; it is not a comparison against thirteen concurrent calls. An additional concurrent mode would be our experiment and must say so. Replay time cannot establish live latency or token savings.

**Pre-parsed values.** The source makes separate helper calls: email receipt/sender selection; phone/country selection; and money selection/currency plus later credit checks. Do not silently batch them while describing a faithful port. Candidates can be computed before definition. Phone/date/money formatting belongs to deterministic application code. Money checks interpolate the chosen amount into later instructions: moving it into state is a reasonable adaptation, but it is not the exact original request. Handle no-match/`none` before parsing a number.

### Useful inspector examples with substantial application work

**Function calling.** The original speculates the tool and closed-set arguments in one 54-question request for ten tools. Inspect all answers, but only assemble arguments for the selected tool. Optional “stated” flags, defaults, and minimum confidence across relevant decisions are application policy. A smaller two-tool demo should say it is reduced. Return a proposed call; do not imply that an output node invokes a tool.

**Date extraction.** Seven Choice questions determine date components/mode. Code handles the calendar, relative dates, validity, and the minimum confidence of components actually used. Keep the reference date fixed and visible for replay. Do not threshold unused fields or attribute calendar arithmetic to Jev. The post-request transformation cannot currently appear as an executed flow node.

**Choice consistency.** Repeat requests and retain every answer. The source's action gate uses the maximum label probability at 0.60, not API confidence, and selects the argmax label. Its fifteen-repeat evaluation and other-provider comparisons are larger than a small local replay demo. Compute heatmaps and agreement outside the flow. Fixtures demonstrate recorded variation; repeating one fixture cannot measure consistency.

**Noul consistency.** The source uses fourteen questions over fifteen repeats. Values below 0.30 are no, above 0.70 yes, and the inclusive interval between them is uncertain. A bounded repeat definition is possible, while distribution statistics live in the app. Keep historical replay and new sampling distinct; varying an irrelevant identifier is not the same experiment as identical-input sampling.

### Recipes that should drive a later API discussion

**Skill suggestion** is the strongest candidate. It needs an oriented mean of three gate Nouls, top-three selection from 182 skills, and a second request built from those skills. The second Choice chooses the suggestion; candidate-fit Nouls provide a separate abstention gate. They can disagree. Do not replace this with “largest fit wins,” and do not substitute a fixed shortlist while claiming the original flow.

**Structure recovery** needs code to merge lines after the first batch, then create questions about the resulting blocks. Formatting output is also deterministic code. Fixed premerged blocks would only showcase its second phase.

**Hierarchical classification** uses repeated frontier expansion and pruning; the beam method includes path-score computation. A fixed shallow greedy tree is feasible but does not demonstrate the beam search or full taxonomies. Do not unroll a large taxonomy into the current bounded flow model.

**SDE cascade** includes external cheap/strong extraction models and verification questions dependent on the candidate fields. A verifier-only example with a supplied extraction is feasible now. Preserve escalation when any relevant field flag is strictly above 0.70; the overall judge is displayed but is not the escalation rule.

**Autoresearch** combines an external question proposer, changing Noul/Score feature questions, CatBoost training, and error-driven iteration. A fixed feature panel is feasible now; the whole research loop is not. Preserve development/test separation in any future evaluation. A diagram replay is not evidence that retraining reproduces the source's metrics.

### Shared semantic requirements

- Preserve exact boundary operators. With current expressions, `x > t` can be `all(x.gte(t), not(x.eq(t)))`; `x <= t` can be `any(x.lt(t), x.eq(t))`. These are proposed translations, not new API methods.
- Keep Choice probability, API confidence, Noul probability, and Score values distinct in both routing and labels.
- A `parallel` join means every declared lane finished, not every assessment passed. Lane failure currently aborts sibling work; choose and explain the intended failure behavior.
- Outputs return data. Storage, merging records, contacting support, tool execution, and text generation are not implicit effects of output names.
- Explanations describe developer-authored policy and observable results, not hidden model reasoning.

## Proposed repository and application structure

Use one cookbook gallery in the existing playground, not twenty independent applications. A local `/cookbooks/` route would be a good entry point. **This route does not exist yet.**

Proposed ownership:

```text
cookbooks/
  README.md / RESEARCH.md / sources.json
  <slug>/
    README.md          source, adaptation, run instructions, expected cases
    flow.ts            server-only definition, public package imports
    fixtures.json      small, explicit cases with provenance
    NOTICE             attribution for material actually copied
apps/playground/
  server/cookbooks/    allowlisted registry, adapters, replay/live execution
  src/cookbooks/       gallery, input forms, result views
```

Keep package internals independent of these examples. Import `jev-devtools/flow`, `jev-devtools/server`, and the official SDK, not package source files. Keep `/flow` out of browser bundles. A server registry should control available recipes and input limits; never evaluate submitted code or accept arbitrary upstream URLs from the UI.

Each recipe's metadata should include its official source URL, reviewed snapshot, supported modes, input schema, initial case, adaptation notes, primitive types, and visible external boundaries. Human and AI instructions should use this same inventory. Publish AI links only when runnable instructions exist; do not put speculative APIs into the installed setup skill.

### Runner experience

1. Select a recipe and a named case. Show the official source and exactly what has been adapted.
2. Review the input and choose replay or live. Editing input invalidates an unmatched replay rather than silently showing an unrelated response.
3. Run through the shared instrumented SDK client and the same inspector used by ordinary apps.
4. Show an outcome UI appropriate to the recipe: moderated chat, compared records, cited passage, evidence buckets, or memory timeline.
5. Open the corresponding flow and inspect every request, question, answer, condition, and untaken path. Preserve normal pan/zoom and request navigation.

Use title/description metadata on every request, branch, join, and output. Keep it static; request redaction does not cover definition metadata. Put external computations in a clearly labeled application-results area. Do not manufacture a Jev request to fill a missing graph step.

Use a few visible lanes initially. The flow canvas is not fully virtualized; a large pipeline expands into full request diagrams. Optional large presets should state request count and remain separate from the default teaching examples.

Changing a policy against a completed assessment should not automatically dispatch new paid requests. A future comparison mode can rerun the policy against the captured response in explicit replay mode; preserve the original result and make the simulated policy evaluation distinguishable.

## Replay, live mode, and source material

Use three explicit kinds of evidence:

| Mode | What it means | Required behavior |
| --- | --- | --- |
| Recorded replay | Actual saved response for the exact request | Preserve fields and model provenance; show historical timing separately from replay elapsed time. |
| Synthetic sample | Deliberately constructed output for a demonstration or boundary case | Label it synthetic; never describe it as the official measured result. |
| Live | A new call using the user's server-side key | No silent fallback, bounded calls, cancellation, and current returned model metadata. |

Match fixtures using a stable canonical representation of all semantic request fields, including state, questions, criteria, model, and relevant options/assets. Include an explicit repeat/case index when several observations share a request. Do not store keys or authentication headers. A missing match must show an explanation, not fall back to a stale fixture or a paid request.

The inspected [memory cache](https://github.com/typesafe-ai/typesafe-public-examples/blob/25e9d373f4853b3e7e300e55a194f50e54838f68/cookbooks/basic_memory/json_cache.json) contains full serialized response records, making it promising for faithful replay. Its hash keys still need mapping back to the exact original calls; the cache alone is not a ready-to-import request/response trace. Prove that correspondence before treating a record as an official replay.

The [chat cache](https://github.com/typesafe-ai/typesafe-public-examples/blob/25e9d373f4853b3e7e300e55a194f50e54838f68/cookbooks/twitch_chat_filter/json_cache.json) contains reduced results: category/probabilities, Nouls, model, and some metrics, but not the complete SDK response. Do not invent missing Choice confidence or transport details to make it look complete. Use a clearly documented sample adapter, display missing data as unavailable where supported, or record a fresh complete response. A table of published rounded numbers is likewise insufficient to reconstruct all raw fields.

The [upstream repository license](https://github.com/typesafe-ai/typesafe-public-examples/blob/25e9d373f4853b3e7e300e55a194f50e54838f68/LICENSE) is MIT. Preserve its notice for copied material and identify the original source/license for any third-party corpus. The repository license does not establish the license of every linked docs page or external dataset. Start with small attributable fixtures; do not vendor entire corpora or evaluation caches just to make a teaching example work offline.

Keep keys and live execution on the server. The current playground's flow scenarios are sample-only; adding live cookbooks requires explicit registry/transport support, not merely another option in the dropdown. No key should be required to understand the initial collection.

## Staged implementation

### 1. One vertical slice

Build the gallery/registry and the parallel-questions example. Reuse the existing devtools root, server adapter, and request capture. Provide a small labeled synthetic fixture if a complete attributable replay is unavailable. Confirm one request with many questions and a separate individual-call flow; document any reduction from the official example.

Completion: a fresh clone can run one case without a key, see a useful result, inspect every answer, and follow the source link. There is no invented timing/cost comparison.

### 2. Visible decisions

Add chat, entity alignment, and citation checking. Preserve the exact conditions above, including missing-quote bypass and Score cut points. Use deterministic case selection to exercise contrasting paths. Keep demonstrations of malformed/error responses separate from valid official examples.

Completion: UI outcomes and captured branch results agree; untaken paths are visible; synthetic boundary fixtures are labeled; replay mismatches cannot return unrelated data.

### 3. Connected requests

Add the bounded RAG example and memory. For memory, decide whether finite description-lookup branches are readable enough before committing to that design; document any adapted request shape. Persist/reset memory in the demo application, and display that boundary honestly.

Completion: later requests receive actual earlier answer values; parallel joins wait correctly; request links point to the corresponding traces; customer memory is isolated; cancellation does not leave a falsely completed flow.

### 4. Optional live execution and broader catalog

Add explicit live support, then confidence fallback, re-ranking, line search, and guardrails. Show call counts before a run, bound concurrency, and avoid replaying a whole research evaluation by default. Record usable fixtures deliberately rather than committing arbitrary request histories. Update per-example docs and the AI inventory together.

### 5. Decide whether to extend the API

Prototype **skill suggestion** as the acceptance case. Two approaches deserve comparison:

- Extend the static builder with explicit transform results and runtime request construction. This requires new captured step types, dependency/serialization rules, redaction, errors/cancellation, and viewer behavior. A transform alone does not solve changing question sets.
- Add a supported way to capture named application operations in an ordinary async program. This may fit the Python-style cookbooks better than growing a full workflow engine, but requires a clear association between app spans, Jev requests, dependencies, and outputs.

These are design options, not available APIs. Do not add arbitrary `flow.compute`, `flow.map`, or callback predicates to cookbook code before such an API is designed and implemented. Defer loops/dynamic fan-out until a concrete recipe justifies their complexity.

## Verification plan for implementation

Use small behavior checks that establish fidelity: branch boundaries and precedence; zero requests on bypass; exact state/question payloads at later steps; selected-versus-argmax semantics; memory isolation; correct fixture identity; complete answer access. Compare a few deterministic policy cases with the source implementation when porting, without rerunning its full model evaluation.

Visually inspect readable outcomes, full request connections, question navigation, long inputs, large Choice access, pan/zoom, and cancellation/error states. Run the repository's normal required checks when opening a later implementation PR. Performance work stays local; do not add hosted benchmark workflows or commit generated benchmark reports.

The immediate recommendation is to build the first slice with the existing API, then validate the six-recipe collection before broadening execution support.
