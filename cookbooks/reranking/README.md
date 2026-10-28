# Re-ranking

Explore [this cookbook in the playground](https://playground.jevtools.dev/?cookbook=reranking) with source, diagrams, and a step-by-step guide. No installation is needed. For the result dashboards and drawer controls described below, use [Request lab](https://playground.jevtools.dev/?cookbook=reranking&legacy=1).

A runnable TypeScript adaptation of [TypeSafe's re-ranking recipe](https://docs.typesafe.ai/cookbooks/rerank_typesafe), using public `jev-devtools/flow` methods. Open [Re-ranking](https://playground.jevtools.dev/?cookbook=reranking&legacy=1). Choose a sample and **Run sample**. No API key is needed.

## Explore

- **Reorder a shortlist:** one query and 30 authored legal-style candidates. Independent synthetic probabilities produce a new order, including tied values and the probability endpoints 0 and 1.
- **All probabilities tied:** the same query and candidates receive 0.5 each. Every candidate retains its original position.
- **Cancel:** during a run, cancellation aborts active requests and stops queued items. No partial ranking is presented.

The result switches between **Before · retrieval fixture** and **After · stable Noul sort**. Every expandable candidate shows its passage, probability, original rank and final rank. Open **Jev DevTools → Flows → Score the shortlist**, choose a collection item, and **View Flow** to inspect that pair's request and captured result. Collection item numbers follow retrieval order. Inspect **Sort by Noul, highest first** for the executed sorting function.

## Fidelity and adaptations

The flow is retrieval task → one bounded map → sorting task → output. The executable recipe's full `is_cited_source` prompt and true/false criteria, `query_excerpt`/`candidate_passage` state, and `jev-1.12` model are preserved. Each pair receives one request containing one Noul. The source's 12-worker bound becomes `concurrency: 12`; `maxItems: 30` bounds this single-query adaptation. No nested maps are needed.

The Noul is an independent probability of the candidate satisfying the cited-precedent question. It is not Choice confidence, a normalized distribution over candidates, or a Score rating. There is no threshold, removal or normalization. Sorting uses descending Noul and preserves original order for equal values, matching Python's stable `sorted(..., key=lambda c: -noul)`. Map completion order cannot change tie order.

**Retrieval is an authored fixture**, not an execution or cached result of BM25. The passages and query are invented legal-style text, not CLERC records or legal advice. The task assigns original ranks to that fixed shortlist; map requests and the subsequent sort actually execute. Synthetic responses are strictly matched to the query, candidate, model and question. Artificial delays illustrate concurrency; no latency, token usage, cost or accuracy metrics are fabricated. Even with a server key configured, this cookbook rejects live mode and edited sample input.

The source pools 170 CLERC rows, selects 40 queries with seed 0, uses BM25 to shortlist 30 passages per query, and evaluates the resulting ranks. That corpus, retrieval computation, 40-query benchmark, charts and paid inference are excluded. This sample makes no accuracy-improvement claim and does not reproduce the source measurements.

## Provenance and files

[provenance.json](provenance.json) records the reviewed official Markdown hash, immutable reference revisions for BM25 and CLERC, licensing evidence, transformations and exclusions. The official page does not pin a BM25 version; our reference revision is not a claim about its execution environment. The inspected CLERC dataset card has no license declaration, so its content is not redistributed. The public TypeSafe examples tree has no re-ranking directory or cache at the pinned revision.

- [flow.ts](flow.ts): official question and real task/map/sort execution.
- [cases.ts](cases.ts), [samples.ts](samples.ts), [retrieval-fixture.json](retrieval-fixture.json): authored inputs and synthetic transport, under the [repository MIT license](../../LICENSE).
- [LICENSE.typesafe](LICENSE.typesafe): TypeSafe MIT attribution for adapted example logic. BM25 and CLERC are references only; their code/data are not bundled.

Run the focused tests with `node --import tsx --test apps/playground/tests/reranking.test.ts` after `npm run build:package`. For browser regression checks, run `npm run verify:cookbooks -- --only reranking` from the repository root. The script starts and closes its own local Vite server and Chromium, and saves screenshots/video under ignored `benchmarks/results/cookbook-browser/`. It checks both cases, candidate inspection, sorting, mobile layout, cancellation and server-side sample restrictions.

The cookbook and fixtures live only in this repository, not in the npm package. This is a community adaptation, not an official TypeSafe product.
