# Noul self-consistency

Explore [this cookbook in the playground](https://playground.jevtools.dev/?cookbook=consistency-nouls) with source, diagrams, and a step-by-step guide. No installation is needed. For the result dashboards and drawer controls described below, use [Request lab](https://playground.jevtools.dev/?cookbook=consistency-nouls&legacy=1).

A runnable TypeScript adaptation of [TypeSafe's Noul self-consistency recipe](https://docs.typesafe.ai/cookbooks/consistency_noul_cookbook), using existing public `jev-devtools/flow` methods. Open [the sample](https://playground.jevtools.dev/?cookbook=consistency-nouls&legacy=1). No API key is needed; live requests are rejected on the server.

## What is preserved

The official auto-insurance claim, all fourteen question texts and their order, requested model `jev-latest`, and fifteen **sequential** requests are preserved. Each request asks the full rubric once. A Noul is P(true) for its question, not Choice confidence or a Score. Application tasks retain all 210 probabilities and compute each decision:

- Below `0.30`: `no`.
- Above `0.70`: `yes`.
- Inclusive `[0.30, 0.70]`: `uncertain`.

An inspectable `flow.if()` routes each repeat to its uncertain-question review list or the no-review path. No additional model request is made for routing. Yes/no are question-level decisions; they do not approve or deny the claim. No human is contacted and no payout is executed.

`flow.task()` prepares repeat inputs, reads answers, applies thresholds, and computes per-question mean, min/max, population standard deviation (divide by 15), decision counts, and the mean of those deviations. The statistics are descriptive additions for the teaching UI, not a reproduction of the source's published measurements. Open Jev DevTools → Flows → the repeat collection → select an item → View Flow to inspect its complete execution. Large aggregate inspector captures can be bounded; the application result retains every answer, and each request remains independently inspectable.

## Samples and adaptation boundaries

| Sample             | Purpose                                                                                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authored variation | Different fixture probabilities, including values near 0.5 and the review-band edges. Synthetic returned model labels change after repeat 10 to demonstrate alias metadata.       |
| Boundary fixtures  | `0`, `0.299`, `0.30`, `0.301`, `0.5`, `0.699`, `0.70`, `0.701`, `1`, plus repeated boundaries. All fourteen answers take each repeat's boundary value, testing both review paths. |
| Identical fixtures | Alternating zero/one answers repeated verbatim. Computed deviation is zero by construction, not evidence of model determinism.                                                    |

The source adds a random `index:token_hex(4)` UID to each request while keeping the claim/rubric unchanged. It cannot separate sensitivity to that irrelevant field from variation on identical inputs. Here UIDs are deterministic `index:synthetic-case` identifiers. The fixture transport validates the model, full claim, question definitions, UID and request order; unmatched samples fail. A new transport and metadata map are created for every run.

These deterministic fixtures are **not independent model draws**, historical replay, measured consistency, quality, calibration or provider-comparison evidence. All other-provider experiments, probability/yes-no comparisons, caches, pricing, token usage and provider timing are excluded. DevTools elapsed times describe local fixture execution, including a short artificial delay for visible progress, not inference latency. The source's uncertainty band is illustrative and does not establish correctness.

Requested and returned models remain distinct. The public flow Jev reference exposes answers, so a per-run transport sidecar records the actual synthetic response's `model` by UID; the answer-reading task retains it in each repeat. Without that sidecar (for example, direct fixture replay), returned-model metadata is explicitly unavailable (`null`), never inferred from the requested alias. The SDK request/response traces separately retain their model metadata.

## Source and verification

[provenance.json](provenance.json) records the reviewed Markdown hash and upstream repository revision. The public upstream repository has no Noul-consistency directory/cache at that revision; this adaptation follows executable code on the docs page. [claim.json](claim.json) and [questions.json](questions.json) preserve its inputs. [LICENSE.typesafe](LICENSE.typesafe) retains the upstream MIT notice; the repository license alone does not establish a separate docs-site license. Probabilities and returned model labels in [samples.ts](samples.ts) are authored locally; no published cache or chart is copied.

The focused tests run real SDK calls through public Flow APIs and protect fifteen-request order, single-call concurrency, all question/state values, thresholds and neighboring values, selected/untaken review paths, actual descriptive statistics, returned-model distinction, invalid inputs and cancellation. Cancellation waits for transport settlement before asserting that later requests, routing and statistics did not execute. Use `node --import tsx --test apps/playground/tests/consistency-nouls.test.ts` after building the package; `npm run verify:all` supplies the complete repository checks.
