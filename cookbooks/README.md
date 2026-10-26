# Cookbook examples

This collection contains 19 runnable TypeScript adaptations of the [official TypeSafe cookbooks](https://docs.typesafe.ai/cookbooks). Thirteen ports join the six existing examples in this round. Autoresearch is the only recipe from the reviewed 20-recipe catalog that remains unimplemented.

Each app pairs its result with the requests, function steps, and decisions that produced it. The examples use the public Flow API in this checkout. The [package manifest](../packages/jev-devtools/package.json) records the current version, and the [Flow guide](../docs/flows.md) describes the supported methods.

Run these community-maintained apps from the repository. The npm package contains the library and setup skill, but does not include cookbook code or fixtures. Every cookbook has labeled synthetic samples that run without an API key. Sample outputs demonstrate execution and inspection, not live model accuracy or performance.

## Choose an example

### Added in this round

These 13 ports preserve the source recipes' assessment and routing logic using the existing Flow API. Each README describes the source, fixtures, thresholds, and adaptation limits.

| Example                                                        | What you can explore                                                                                                        | Run locally                                                   |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [Parallel questions](parallel-questions/README.md)             | Compare five batched requests with 65 sequential single-question requests and inspect all 13 answer metrics.                | [Open](http://127.0.0.1:4182/?cookbook=parallel-questions)    |
| [Twitch chat filter](twitch-chat-filter/README.md)             | Filter the original 29-message feed with eight concurrent requests and compare normal and quiet policies without new calls. | [Open](http://127.0.0.1:4182/?cookbook=twitch-chat-filter)    |
| [Entity alignment](entity-alignment/README.md)                 | Compare two beer records and inspect Score-only unlink, curator-review and proposed-sameAs routing.                         | [Open](http://127.0.0.1:4182/?cookbook=entity-alignment)      |
| [Citation checking](citation-checking/README.md)               | Normalize quotes, inspect actual source sections and route Choice confidence to automatic verdict or human review.          | [Open](http://127.0.0.1:4182/?cookbook=citation-checking)     |
| [Confidence fallback](confidence-fallback/README.md)           | Route one 75-group Choice on API confidence ≥0.90, with a deterministic parent-division fallback.                           | [Open](http://127.0.0.1:4182/?cookbook=confidence-fallback)   |
| [Line-by-line search](line-search/README.md)                   | Rank the complete pinned document and distinguish an answer from a strong near match.                                       | [Open](http://127.0.0.1:4182/?cookbook=line-search)           |
| [Re-ranking](reranking/README.md)                              | Inspect independent candidate probabilities, bounded requests and stable ordering before and after ranking.                 | [Open](http://127.0.0.1:4182/?cookbook=reranking)             |
| [Date extraction](date-extraction/README.md)                   | Read seven date parts per role, resolve the calendar date in a task, and inspect confidence review.                         | [Open](http://127.0.0.1:4182/?cookbook=date-extraction)       |
| [Pre-parsed value extraction](pre-parsed-extraction/README.md) | Follow regex spans through separate Choice helpers, missing-value bypasses and deterministic normalization.                 | [Open](http://127.0.0.1:4182/?cookbook=pre-parsed-extraction) |
| [Function calling](function-calling/README.md)                 | Inspect a proposed tool call, omitted defaults, set membership and relevant decision confidence.                            | [Open](http://127.0.0.1:4182/?cookbook=function-calling)      |
| [LLM guardrails](guardrails/README.md)                         | Compare strict and permissive policies on one assessment, including severity upgrades and overlapping hazards.              | [Open](http://127.0.0.1:4182/?cookbook=guardrails)            |
| [Choice self-consistency](consistency-choices/README.md)       | Compare every repeated probability vector with argmax labels, abstention and aggregate agreement.                           | [Open](http://127.0.0.1:4182/?cookbook=consistency-choices)   |
| [Noul self-consistency](consistency-nouls/README.md)           | Inspect fifteen sequential rubric requests, all probabilities, computed statistics and inclusive uncertainty routing.       | [Open](http://127.0.0.1:4182/?cookbook=consistency-nouls)     |

### Existing cookbooks

These six examples remain available alongside the new ports.

| Example                                                              | What you can explore                                                                                     | Run locally                                                         |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [Skill suggestion](skill-suggestion/README.md)                       | Narrow 182 skills to a shortlist, then inspect a suggestion or abstention.                               | [Open](http://127.0.0.1:4182/?cookbook=skill-suggestion)            |
| [RAG passage classification](rag-passages/README.md)                 | Assess twelve passages with bounded concurrency and inspect each item's evidence routing.                | [Open](http://127.0.0.1:4182/?cookbook=rag-passages)                |
| [SDE cascade](sde-cascade/README.md)                                 | Follow field verification, conditional escalation, and a merge into the final record.                    | [Open](http://127.0.0.1:4182/?cookbook=sde-cascade)                 |
| [Hierarchical classification](hierarchical-classification/README.md) | Compare beam and greedy search through iterations, frontier requests, and retained/pruned paths.         | [Open](http://127.0.0.1:4182/?cookbook=hierarchical-classification) |
| [Simple memory](simple-memory/README.md)                             | Replay customer tickets and compare routing with and without saved context within a run.                 | [Open](http://127.0.0.1:4182/?cookbook=simple-memory)               |
| [Structure recovery](structure-recovery/README.md)                   | Turn broken lines into a classified, formatted document through two batched requests and function steps. | [Open](http://127.0.0.1:4182/?cookbook=structure-recovery)          |

## Run a sample

From the repository root, use Node 22.12 or later. The [.nvmrc](../.nvmrc) file pins the development version.

```sh
npm ci
npm run dev
```

Open an example from the table, choose a sample, and click **Run sample**. Open **Jev DevTools**, select **Flows**, and inspect the requests and decisions alongside the app's result. Each example's README explains its controls and known limitations.

Fixed responses remain synthetic when you edit an input. The 13 new ports validate fixed sample inputs on the server and do not enable live inference. For the general playground and any live options in the existing examples, see the [playground guide](../apps/playground/README.md) and the relevant cookbook README.

## Verification added after the retrospective

The ports include recipe checks. Separate retrospective work connects those checks to routine verification and validates saved evidence against the tested source.

`npm run verify:cookbooks` runs 15 browser checks: the 13 new recipe probes, a smoke check across all 19 cookbooks, and comparisons between captured requests and application results. The same suite runs in `verify:all` and CI with React 18 and 19.

After installing dependencies, stop the playground server to free port 4182. Install Chromium once, then run the suite:

```sh
npx playwright install chromium --only-shell
npm run verify:cookbooks
```

For one recipe, use a focused run:

```sh
npm run verify:cookbooks -- --only confidence-fallback
```

Each run writes a unique `summary.json` and supporting evidence under ignored `benchmarks/results/cookbook-browser/`. The report records the source revision, content hash, scope, and result. `npm run verify:evidence` rejects incomplete, failed, stale, or mismatched reports. A focused run does not establish full-suite coverage.

See [contributor verification guidance](../CONTRIBUTING.md#verification-details) for full verification and report validation. These checks use samples and block external provider fetches. They do not measure live accuracy, latency, or cost.

## Recipe catalog and research

The [original research](RESEARCH.md) reviewed 20 official recipes on 2026-10-23 against Jev DevTools 0.3.0. Its proposed roadmap and API limitations describe that historical baseline. The runnable collection above records the current implementation status.

[Source snapshots](sources.json) preserve the reviewed URLs and content hashes. Their research-only status also belongs to the original review. Each cookbook README links its source recipe and records any pinned assets, attribution, and differences from the original evaluation.

### Autoresearch remains out of scope

[Autoresearch feature discovery](https://docs.typesafe.ai/cookbooks/autoresearch_feature_discovery) was excluded from this round. Its full pipeline includes feature proposals, model training, and iterative feedback. No Autoresearch app or complete pipeline port is included here.

To list the implemented flow definitions from the repository root:

```sh
rg --files cookbooks -g flow.ts
```

## Related flow sample

The playground also includes **Flow · Functions + dynamic questions (synthetic)**, an original sample of function steps and runtime request factories. See the [Flow guide](../docs/flows.md#function-steps-and-runtime-requests). This sample is separate from the official cookbook adaptations. The reviewed recipes exercise Choice, Noul, and Score; they do not provide a Box showcase.
