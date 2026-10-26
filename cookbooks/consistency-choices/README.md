# Choice self-consistency

A runnable TypeScript adaptation of the [official TypeSafe Choice self-consistency recipe](https://docs.typesafe.ai/cookbooks/consistency_choice_cookbook), using public `jev-devtools/flow` methods. Run `npm ci` and `npm run dev` at the repository root, then open [the cookbook](http://127.0.0.1:4182/?cookbook=consistency-choices).

Choose a synthetic case, run it, and select heatmap cells for every label probability, raw Choice label and separate confidence. In **Jev DevTools → Flows**, choose a repeat in the collection and **View Flow** to inspect the request, deterministic argmax task and each question’s gate. All raw answers are retained in the application report. Captured task previews have the normal bounded/redacted inspector limits; inspect individual requests for their answers.

## What is preserved

- The original borderline post and all eight Choice questions, instructions, label order and descriptions, in `post.json` and `questions.json`.
- Fifteen sequential `jev-latest` requests, each asking all eight questions. A task constructs each `uid` from the SHA-256 rubric fingerprint, zero-based sample index and fresh four-byte random hex token, matching the source construction. The fingerprint matches Python’s sorted JSON serialization. The post and rubric remain unchanged; the state is **not identical** between repeats. Neither the original setup nor this port separates irrelevant-field sensitivity from identical-input sampling variation.
- Argmax over the full ordered probability vector, with ties selecting the first rubric label. Missing/non-numeric/nonfinite entries do not produce a raw pick. Numeric strings follow Python `float` syntax, including decimal/exponent notation, inter-digit underscores and Unicode decimal digits; hexadecimal/binary/octal literals and malformed strings remain parse failures. Policy decisions additionally reject values outside [0,1]. Vectors are never normalized or repaired.
- Maximum probability **below 0.60 → uncertain**, **exactly 0.60 or above → argmax label**. API Choice confidence and the returned Choice label remain raw evidence, but neither drives this gate. This is an illustrative application policy, not a calibrated correctness guarantee. No Score question is involved.
- Each question’s raw/policy agreement is its plurality count divided by **all 15** repeats, then averaged over the eight questions. Policy agreement counts uncertain as a decision; parse failures count against both agreement measures. Abstention, automatic-label and failure rates use **all 120** answers. Conflicts count questions with multiple concrete policy labels, excluding uncertain/failures. The source calls any concrete label “automatic,” even a label such as Escalate or Human; no actual enforcement or queue submission occurs.
- Population standard deviation (`ddof=0`) across repeats for each label’s probability; mean and maximum over all label columns, not a mean of per-question means. Missing entries are omitted per label, as in `nanstd`. Parse-failure rate counts question/repeat vectors containing missing values. Range-invalid vectors are separately policy failures. No accuracy metric is inferred from agreement.

## Authored samples and boundaries

| Case       | Demonstration                                                                                                                           |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Varying    | Two questions alternate raw winners but always abstain; category crosses the threshold; action has conflicting concrete labels.         |
| Boundaries | Repeated 0.599, 0.600 and 0.601 vectors with confidence 0.99, 0.10 and 0.10 respectively. All eight questions exercise both gate paths. |
| Stable     | Labels stay fixed while probabilities vary. Perfect label agreement does not imply zero probability variation or correctness.           |

Every response, including confidence, is authored locally. These are **not** the notebook’s cached outputs or measured model behavior. The transport returns an explicitly synthetic model name and omits usage; any recorder duration describes local fixture execution, not provider latency. The immutable sample selector is checked on the server. The fixture transport validates the post, full question set, model, uid and sequential index before answering. Live mode is rejected, even with a configured API key. Cancellation aborts the active transport and prevents queued repeats and downstream analysis.

External-provider sampling, single-pick comparisons, cost estimates, timing/usage tables and notebook performance claims are excluded. The source’s cache identity includes rubric/model/index; this port does not implement a persistent cache because all inference is local fixtures. Fresh nonces do not randomize fixture responses. No public library changes, provider calls, publication or deployment are part of this example.

## Provenance and checks

`provenance.json` records the reviewed page hash, date and upstream asset audit. The official examples tree at the recorded revision contains no Choice consistency directory/cache; the recipe’s executable source was read from the official documentation. TypeSafe’s MIT notice is retained in `LICENSE.typesafe`; no third-party corpus is introduced.

Focused tests in `apps/playground/tests/consistency-choices.test.ts` run the actual public flow and TypeSafe SDK, protect the source fingerprint and request order, check exact threshold and confidence contrasts, exercise argmax ties and invalid vectors, verify denominators and population deviation, reject malformed numeric strings while preserving Python-compatible forms, retain raw answers, and await transport settlement on cancellation. The result tests protect exact boundary display. Full repository verification and browser evidence are recorded in the PR; generated evidence stays under ignored `benchmarks/results/`.
