Explore complete workflows in the [Cookbook Playground](https://playground.jevtools.dev/). No download, installation, or API key is needed. The source, step-by-step guides, and connected diagrams show how the Flow API combines Jev requests with application code.

<a id="run-without-an-api-key"></a>

## Explore complete flows

Choose a cookbook and a **Sample**. Use **Step-by-step guide** to follow its Flow operations, or **Complete flow** to inspect the whole diagram. Click **Run sample** to watch execution, then compare the application result with the captured steps and requests. Select code to highlight its diagram nodes, or select a node to find its source.

| Cookbook                                                                                             | What to inspect                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [SDE cascade](https://playground.jevtools.dev/?cookbook=sde-cascade)                                 | Field verification, conditional escalation, and a shared continuation that returns the final record.                                                                    |
| [Hierarchical classification](https://playground.jevtools.dev/?cookbook=hierarchical-classification) | Beam and greedy search through bounded loops, frontier collections, and retained or pruned paths.                                                                       |
| [Structure recovery](https://playground.jevtools.dev/?cookbook=structure-recovery)                   | Tasks that join text, requests built from those results, and formatting based on returned labels.                                                                       |
| [Simple memory](https://playground.jevtools.dev/?cookbook=simple-memory)                             | Ticket routing with customer-scoped memory that starts fresh for each run.                                                                                              |
| [RAG passages](https://playground.jevtools.dev/?cookbook=rag-passages)                               | Passage assessment with bounded concurrency and explicit rules for including, excluding, or flagging evidence.                                                          |
| [Skill suggestion](https://playground.jevtools.dev/?cookbook=skill-suggestion)                       | Dynamic questions, shortlist ranking, and a final suggestion or abstention. No skill is executed.                                                                       |
| [Parallel questions](https://playground.jevtools.dev/?cookbook=parallel-questions)                   | Five batched repeats versus 65 sequential single requests, with all 13 synthetic answer metrics and computed statistics.                                                |
| [Twitch chat filter](https://playground.jevtools.dev/?cookbook=twitch-chat-filter)                   | Original finite 29-message feed, eight concurrent requests, ordered hide/blur policy and quiet reapplication without new calls.                                         |
| [Citation checking](https://playground.jevtools.dev/?cookbook=citation-checking)                     | Exact normalized quote matching, inference bypass and API-confidence review routing over RFC 7519.                                                                      |
| [Confidence fallback](https://playground.jevtools.dev/?cookbook=confidence-fallback)                 | A 75-group Choice, an inclusive API-confidence cutoff, and a parent-division lookup with no second request.                                                             |
| [Line-by-line search](https://playground.jevtools.dev/?cookbook=line-search)                         | A complete pinned document, one Choice + Noul request, ranking and lookup tasks, and exact existence branches that separate answers from near matches.                  |
| [Re-ranking](https://playground.jevtools.dev/?cookbook=reranking)                                    | Independent candidate Nouls, bounded requests and stable sorting over an authored retrieval fixture.                                                                    |
| [Date extraction](https://playground.jevtools.dev/?cookbook=date-extraction)                         | Seven Choice questions per role, calendar assembly against a fixed date, and acceptance or review from used-component confidence.                                       |
| [Pre-parsed value extraction](https://playground.jevtools.dev/?cookbook=pre-parsed-extraction)       | Document-order regex candidates, sequential Choice helpers, missing-value routes and exact normalization.                                                               |
| [Function calling](https://playground.jevtools.dev/?cookbook=function-calling)                       | One batched request, selected-argument omit/fill branches, defaults and minimum decision confidence. Proposed calls only.                                               |
| [LLM guardrails](https://playground.jevtools.dev/?cookbook=guardrails)                               | Input/output hazard batteries, policy reuse, severity upgrades and precedence. Sample-only; no LLM generation.                                                          |
| [Choice self-consistency](https://playground.jevtools.dev/?cookbook=consistency-choices)             | Sequential repeats, per-question probability gates and a synthetic agreement heatmap.                                                                                   |
| [Noul self-consistency](https://playground.jevtools.dev/?cookbook=consistency-nouls)                 | Fifteen sequential requests with fourteen Nouls each, inclusive uncertainty routing and descriptive fixture statistics. No measured consistency or provider comparison. |
| [Entity alignment](https://playground.jevtools.dev/?cookbook=entity-alignment)                       | Score-driven unlink, curator review or proposed match, with companion agreement Nouls.                                                                                  |

Every cookbook uses labeled synthetic responses. Samples demonstrate execution and inspection, not model accuracy, latency, or cost. The [cookbook source and adaptation notes](https://github.com/diegoag64/jev-devtools/blob/main/cookbooks/README.md) document the original recipes, application policies, and limitations. Application code and fixtures are not bundled in npm.

## Integrate the inspector into your app

The independent [React + Vite](https://github.com/diegoag64/jev-devtools/tree/main/examples/react-vite) and [Next.js App Router](https://github.com/diegoag64/jev-devtools/tree/main/examples/nextjs-app) examples show how to connect public package exports to a server. Their READMEs contain local setup instructions for developers adapting an integration. To modify the playground itself, use its [contributor setup](https://github.com/diegoag64/jev-devtools/blob/main/apps/playground/README.md#local-development).

## Learn one method at a time

[Flows from scratch](@/guides/flow-basics/) builds a greeting flow without an API key. [Build a flow](@/guides/flows/) adds a Jev request and routes its answer to a named outcome.

For a specific operation, use the complete define-and-run examples in the [API glossary](@/api/reference/#flow-definitions-and-steps). They cover tasks, Jev requests, conditionals, branches, parallel lanes, maps, and loops, with parameter tables and expected results. The [Flow builder reference](@/api/flow/) explains how these operations compose and includes replay examples.

<a id="add-your-own-interaction"></a>

## Contribute an example

To add an example to the docs, follow the [docs app's authoring guide](https://github.com/diegoag64/jev-devtools/blob/main/apps/docs/README.md#author). Complete code examples belong in its checked examples directory. Interactive demos can use small, page-specific TypeScript modules and load React or the public package lazily when needed.

Label fixed responses and application policies clearly. Keep API credentials on a server. The static docs app has no inference backend, and its introduction demo uses fixed values.
