# TypeSafe cookbook showcases — research preview

Local experiment, researched **2026-10-23** against Jev DevTools **0.3.0**. This directory catalogs all 20 recipes. **[Skill suggestion](skill-suggestion/README.md), [RAG passage classification](rag-passages/README.md), [SDE cascade](sde-cascade/README.md), [hierarchical classification](hierarchical-classification/README.md), [structure recovery](structure-recovery/README.md), and [Simple Memory](simple-memory/README.md) are now runnable locally**; the other cookbook ports remain proposals. The follow-up local function-step experiment is documented in [the flow guide](../docs/flows.md#function-steps-and-runtime-requests-unreleased-experiment); the catalog below records the original baseline assessment.

The goal is to adapt the [official TypeSafe cookbooks](https://docs.typesafe.ai/cookbooks) into small applications where you can inspect the real requests, connected flow, branching conditions, and useful final result. These would be community-maintained TypeScript adaptations of official recipes, not official TypeSafe integrations.

Start with the [research and implementation plan](RESEARCH.md). It covers fidelity, API gaps, fixtures, UI, and verification. [Source snapshots](sources.json) record the reviewed pages and their content hashes; research downloads are not vendored here. The runnable skill-suggestion example includes its attributed, pinned roster.

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

## Recommended first collection

Build in this order, with a working slice before widening the collection:

1. **Parallel questions:** establish the shared runner, fixture contract, and inspection of every answer.
2. **Twitch chat filter:** make thresholds and routing tangible through a familiar UI.
3. **Entity alignment:** show Score semantics and uncertainty with two comparable records.
4. **Citation checking:** show a deterministic prerequisite and a route that makes no model call.
5. **RAG passage classification:** demonstrate multiple requests, parallel lanes, a join, and different outcomes.
6. **Simple memory:** demonstrate a later request using an earlier result, plus state across runs. Resolve the description-lookup fidelity choice before implementing it.

Then add confidence fallback, re-ranking, line search, and guardrails. Use **skill suggestion** as the first serious design case for any API extension; do not expand the flow API merely to make all 20 fit at once.

These cookbooks mainly exercise Choice, Noul, and Score. The reviewed examples do not provide a Box showcase. Keep a separately labeled original Box example rather than inventing an “official cookbook” for it.

## What exists today

The existing playground includes a synthetic **Functions + dynamic questions** scenario demonstrating the follow-up API experiment. It is not a cookbook port. The [flow API](../docs/flows.md) guide explains how to run it; the full skill-suggestion selection flow is available at `http://127.0.0.1:4182/?cookbook=skill-suggestion`. It supports synthetic cases and optional live Jev calls; no separate gallery route is required. The remaining collection can reuse that playground and the same root drawer, with server-only flow definitions and an explicit replay/live distinction. See [the staged plan](RESEARCH.md#staged-implementation) before implementing.
