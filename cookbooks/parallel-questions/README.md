# Parallel questions · sample showcase

Explore [this cookbook in the playground](https://playground.jevtools.dev/?cookbook=parallel-questions) with source, diagrams, and a step-by-step guide. Choose a **Sample** and click **Run sample**. Inspect the inline **Flow diagram** and open **Application result** for the complete JSON output. No installation or API key is needed.

A runnable TypeScript adaptation of the [official Parallel Questions cookbook](https://docs.typesafe.ai/cookbooks/parallel_questions), using public `task()`, runtime `jev()`, `loop()`, `map()` and `output()` APIs. Open [the sample](https://playground.jevtools.dev/?cookbook=parallel-questions). Choose a **Sample** and click **Run sample**. No key or remote inference is needed.

## Execution and inspection

1. A task validates the fixed document and prepares all 13 original questions: eight Nouls, two Choices and three Scores.
2. The first loop runs five repeats of one batched request containing all 13 questions.
3. The second loop runs five repeats of a 13-item map. Each item sends one question, with **concurrency 1**, preserving the original sequential single-call execution semantics. All five batches precede all 65 single requests. Every request carries byte-identical document text and `jev-1.12`.
4. Tasks convert answers into the source metrics: Noul `p(yes)`, Choice **maximum probability** (not its separate confidence field), and Score divided by `criteria.length - 1`. The final task computes means, sample standard deviations using **n − 1**, mean differences and request counts.
5. **Application result** contains all 13 comparisons and both complete raw answers for all five repeats. Choice label, probabilities and confidence remain separate. In **Flow diagram**, select either loop, choose an iteration and **View Flow**. In a single-question iteration, open the collection and choose an item to see its linked request and metric task.

| Sample            | Purpose                                                                                                                                                                                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identical repeats | Authored fixed answers show equal metrics across strategies. Choice confidence deliberately differs from maximum probability. Score 3 means 1.0 on a 0–3 scale and 0.75 on a 0–4 scale.                                                         |
| Varying repeats   | Five Noul values include 0 and 1 in the batch and a smaller spread in singles; Score spans 0–4. Both strategies have equal means but can have different standard deviations. This demonstrates the calculation, not evidence about model noise. |

## Fidelity and adaptations

`questions.json` preserves every original instruction and criterion. `provenance.json` pins the reviewed source hash and upstream repository commit. The upstream repository has no parallel-questions directory or cached assets at that commit; the official page's executable Python is the source for this port. `LICENSE.typesafe` retains the upstream MIT notice for adapted questions and algorithm.

The original uses the 53,777-character Wikipedia GDPR article at revision 1363040264. This sample substitutes a short authored briefing; it redistributes no Wikipedia text. All responses are synthetic, not original cached results, legal advice, model evaluations or measured batching independence. Fixed documents are read-only in the browser, and the server rejects changed inputs and live mode. Adding an API key does not enable this cookbook's live execution. The sample transport checks model, document, complete questions, request count and order, and rejects mismatches.

The original prices recorded token usage and compares the sum of 13 sequential single-call latencies against one batched latency. This sample supplies **no usage, price or model timing data** and makes **no cost or speed claim**. The inspector's local request durations include fixture execution and are not inference benchmarks. Its short fixture delay only makes progress visible. Concurrent single calls are deliberately excluded, because their elapsed-time comparison would require different semantics. There is no batching decision threshold or confidence routing policy in this recipe; the two loops show execution order and repetition explicitly.

Cancellation stops queued requests and later repeats, without returning a partial success. Capture previews remain bounded by the public recorder's limits; the application result retains every answer independently of those previews. The cookbook and fixtures live in the repository, outside the published library. No public API or package CSS change is required.

Implementation: `flow.ts`; fixed document and choices: `cases.ts`; authored responses and strict transport: `samples.ts`; tests: `../../apps/playground/tests/parallel-questions.test.ts`.

For browser coverage, run `npm run verify:cookbooks`. The shared suite checks cookbook switching, complete application results, sample guards, capture consistency, and workbench controls. Recipe runtime tests verify source fidelity and boundary cases. See [contributor verification](../../CONTRIBUTING.md#verification-details).
