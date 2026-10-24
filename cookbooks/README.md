# Cookbook examples

Explore small applications that turn TypeSafe recipes into connected, inspectable Jev flows. Each example pairs an application result with the requests, function steps, and routing decisions that produced it.

These are community-maintained TypeScript adaptations of the [official TypeSafe cookbooks](https://docs.typesafe.ai/cookbooks). All six examples below run locally with labeled synthetic samples and no API key. They use the **0.4.0 flow API**. Run the cookbook apps from this repository; the npm package contains the library and setup skill, not cookbook code or fixtures. Sample results demonstrate execution and inspection; they are not live model evaluations.

## Choose an example

| Example | What you can explore | Run locally |
| --- | --- | --- |
| [Skill suggestion](skill-suggestion/README.md) | Narrow 182 skills to a shortlist, then inspect a suggestion or abstention. | [Open](http://127.0.0.1:4182/?cookbook=skill-suggestion) |
| [RAG passage classification](rag-passages/README.md) | Assess twelve passages with bounded concurrency and inspect each item's evidence routing. | [Open](http://127.0.0.1:4182/?cookbook=rag-passages) |
| [SDE cascade](sde-cascade/README.md) | Follow field verification, conditional escalation, and a merge into the final record. | [Open](http://127.0.0.1:4182/?cookbook=sde-cascade) |
| [Hierarchical classification](hierarchical-classification/README.md) | Compare beam and greedy search through iterations, frontier requests, and retained/pruned paths. | [Open](http://127.0.0.1:4182/?cookbook=hierarchical-classification) |
| [Simple Memory](simple-memory/README.md) | Replay customer tickets and compare routing with and without saved context within a run. | [Open](http://127.0.0.1:4182/?cookbook=simple-memory) |
| [Structure Recovery](structure-recovery/README.md) | Turn broken lines into a classified, formatted document through two batched requests and function steps. | [Open](http://127.0.0.1:4182/?cookbook=structure-recovery) |

## Run a sample

From the repository root, with Node 22.12+:

```sh
npm ci
npm run dev
```

Open an example using the table above, choose a sample, and run it. Open **Jev DevTools → Flows** to inspect the connected requests and decisions alongside the application's result. Each example's README explains its samples, policy thresholds, source recipe, and limitations. Fixed sample responses do not become live inference when you edit the input.

For the general playground and optional live-mode setup, see the [playground guide](../apps/playground/README.md). Live availability varies by example; check its README before configuring a key.

## Recipe catalog and research

The research below was recorded on **2026-10-23** against Jev DevTools **0.3.0**. It catalogs 20 official recipes and their fit at that baseline. The six examples above are runnable; the remaining ports are proposals.

The [research and implementation plan](RESEARCH.md) covers fidelity, API gaps, fixtures, UI, and verification. [Source snapshots](sources.json) record reviewed pages and content hashes; research downloads are not vendored here. The skill-suggestion example includes its attributed, pinned roster. The [flow guide](../docs/flows.md) documents the APIs now available in the checkout.

## All 20 published cookbooks

“Core now” means the recipe's Jev assessment and routing could use the published 0.3.0 flow API at the research baseline. It does **not** mean the entire original notebook, evaluation, or downstream action is captured. “App boundary” means some work should remain explicitly outside the diagram. “Extension” means a faithful, fully connected version needs additional execution/capture support.

| Official cookbook | Proposed local experience | Fit with published 0.3.0 |
| --- | --- | --- |
| [Function calling](https://docs.typesafe.ai/cookbooks/function_calling) | Inspect a proposed function and its selected arguments. | **App boundary:** one multi-question request; argument assembly, minimum confidence, defaults, and function execution belong to application code. |
| [Skill suggestion](https://docs.typesafe.ai/cookbooks/skill_suggestion) | See a large skill list narrow to a shortlist, then a suggestion or abstention. | **Extension, now implemented locally:** arithmetic gate, runtime top-k, and later questions built from selected skills. [Run it](skill-suggestion/README.md). |
| [Guardrails for LLMs](https://docs.typesafe.ai/cookbooks/llm_guardrails) | Compare strict/permissive routing on the same assessment. | **Core now:** Noul hazards + Score; preserve action precedence. An external LLM between input/output checks is outside capture. |
| [Double-checking citations](https://docs.typesafe.ai/cookbooks/citation_check) | Highlight a quote and show verification or review. | **Core now + app boundary:** deterministic quote matching first; missing quotes bypass Jev. |
| [Classifying RAG passages](https://docs.typesafe.ai/cookbooks/classifying_rag_passages) | Follow candidate passages into include, conflict, or exclude buckets. | **Core now + app boundary:** fixed parallel lanes and per-passage policies; retrieval and final generation stay outside. |
| [Simple memory system](https://docs.typesafe.ai/cookbooks/basic_memory) | Watch a ticket route, pass a memory gate, and affect the next ticket. | **Now implemented locally with existing APIs:** sequential route/gate requests, readable-answer conversion, per-customer run-local memory and four sample timelines. [Run it](simple-memory/README.md). |
| [Hierarchical classification](https://docs.typesafe.ai/cookbooks/hierarchical_classification) | Explore competing taxonomy paths across levels. | **Extension, now implemented locally:** bounded loop, frontier collections, beam versus greedy traversal and four sample cases on a small authored taxonomy. [Run it](hierarchical-classification/README.md). |
| [Classification using confidence](https://docs.typesafe.ai/cookbooks/classification_using_confidence) | Show a precise industry classification or broader fallback. | **Core now + app boundary:** branch on API confidence; map the selected industry to its parent in application code. |
| [Twitch chat filter](https://docs.typesafe.ai/cookbooks/twitch_chat_filter) | Replay a chat feed and see show/highlight/dim/blur/hide decisions. | **Core now:** Choice + Nouls and ordered routing. Stream ordering and concurrency remain app concerns. |
| [SDE cascade](https://docs.typesafe.ai/cookbooks/sde_cascade) | Inspect extracted fields and the reason for escalation. | **Extension, now implemented locally:** conditional escalation and shared continuation, candidate-dependent verification and four sample cases. Extractors are labeled fixtures. [Run it](sde-cascade/README.md). |
| [Date extraction](https://docs.typesafe.ai/cookbooks/date_extraction_cookbook) | Compare source text, selected date components, and a validated date. | **App boundary:** seven Choice questions together; calendar arithmetic, validity, and confidence aggregation happen afterward. |
| [Pre-parsed value extraction](https://docs.typesafe.ai/cookbooks/pre_parsed_value_extraction_cookbook) | Highlight the selected email, phone, or amount in its source. | **App boundary:** regex candidates known before definition work now; formatting stays outside. The money recipe's later dynamic instructions need an adaptation or extension. |
| [Structure recovery](https://docs.typesafe.ai/cookbooks/autoformat) | Compare rough text, joined blocks, and formatted Markdown. | **Extension, now implemented locally with existing APIs:** stitch line pairs, merge blocks, build dynamic classification questions, then render Markdown in code. [Run four samples](structure-recovery/README.md). |
| [Re-ranking](https://docs.typesafe.ai/cookbooks/rerank_typesafe) | Watch retrieved passages reorder by relevance. | **Core now + app boundary:** fixed per-passage request lanes; retrieval and sorting outside the flow. |
| [Line-by-line search](https://docs.typesafe.ai/cookbooks/semantic_find) | Highlight likely lines and distinguish an answer from a near match. | **Core now + app boundary:** Choice ranking + Noul existence check; line lookup and ranking display in the app. |
| [Knowledge graph entity alignment](https://docs.typesafe.ai/cookbooks/entity_alignment) | Compare two records and see unlink, curator review, or proposed match. | **Core now:** Score with three semantic levels plus companion Nouls; no actual database merge. |
| [Self-consistency: choices](https://docs.typesafe.ai/cookbooks/consistency_choice_cookbook) | Inspect repeat runs beside a label/probability heatmap. | **App boundary:** bounded repeated requests; argmax, statistics, and other-provider comparisons outside the flow. |
| [Self-consistency: nouls](https://docs.typesafe.ai/cookbooks/consistency_noul_cookbook) | Inspect repeat runs and yes/uncertain/no outcomes. | **Core now + app boundary:** fixed repeats and thresholds; aggregate evaluation outside. |
| [Parallel questions](https://docs.typesafe.ai/cookbooks/parallel_questions) | Compare one batched request with individual calls over the same document. | **Core now:** teaches the difference between questions within a request and parallel requests. |
| [Autoresearch feature discovery](https://docs.typesafe.ai/cookbooks/autoresearch_feature_discovery) | Follow text into numeric features and a training/refinement timeline. | **Extension for full pipeline:** proposal model, changing questions, model training, and iterative feedback. A fixed feature-extraction batch is usable now. |

## Original implementation roadmap (research baseline)

The original research proposed the following order. It is retained as planning context; the runnable collection above reflects what exists now:

1. **Parallel questions:** establish the shared runner, fixture contract, and inspection of every answer.
2. **Twitch chat filter:** make thresholds and routing tangible through a familiar UI.
3. **Entity alignment:** show Score semantics and uncertainty with two comparable records.
4. **Citation checking:** show a deterministic prerequisite and a route that makes no model call.
5. **RAG passage classification:** demonstrate multiple requests, parallel lanes, a join, and different outcomes.
6. **Simple memory:** demonstrate a later request using an earlier result, plus state across runs. Resolve the description-lookup fidelity choice before implementing it.

Then add confidence fallback, re-ranking, line search, and guardrails. Use **skill suggestion** as the first serious design case for any API extension; do not expand the flow API merely to make all 20 fit at once.

These cookbooks mainly exercise Choice, Noul, and Score. The reviewed examples do not provide a Box showcase. Keep a separately labeled original Box example rather than inventing an “official cookbook” for it.

## Related flow sample

The playground also includes **Flow · Functions + dynamic questions (synthetic)**, an original sample demonstrating function steps and runtime request factories. See the [flow guide](../docs/flows.md#function-steps-and-runtime-requests). It is separate from the cookbook adaptations above.
