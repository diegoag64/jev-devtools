# Entity alignment

Explore [this cookbook in the playground](https://playground.jevtools.dev/?cookbook=entity-alignment) with source, diagrams, and a step-by-step guide. Choose a **Sample** and click **Run sample**. Inspect the inline **Flow diagram** and open **Application result** for the complete JSON output. No installation or API key is needed.

A runnable TypeScript adaptation of the [official TypeSafe entity-alignment recipe](https://docs.typesafe.ai/cookbooks/entity_alignment), using public `jev-devtools/flow` methods. Open [Entity alignment](https://playground.jevtools.dev/?cookbook=entity-alignment).

Choose an example or boundary case, run the sample, and inspect **Flow diagram**. Inspect the loaded pair, the single four-question request, the evidence task and the selected route. Expand the Score and each companion answer in the request inspector.

## Source behavior

The request contains both original entity records, one Score with the original three semantic levels and three Nouls about name, brewery and style. It excludes `known_same_as`, which is the benchmark reference label. There is one request per selected pair, preserving source model `jev-1.12` in the request; the response identifies itself as synthetic.

The source computes `min(int(score + 0.5), 2)`. On the Score's 0–2 domain, this gives:

| Score           | Result          |
| --------------- | --------------- |
| < 0.5           | Leave unlinked  |
| ≥ 0.5 and < 1.5 | Curator review  |
| ≥ 1.5           | Proposed sameAs |

The diagram exposes the equivalent numeric comparisons. The evidence task computes the rounded semantic level for display and an absolute alcohol-content difference in percentage points. ABV comparison is an optional deterministic extension suggested by the recipe, and never changes the route. Nouls explain agreement; neither Nouls, level probabilities nor API Score confidence independently gates the match. Score confidence is supplied separately, not recomputed from a probability.

## Samples and adaptation boundaries

- **c446, c427, c100 and c428:** the four attributed pairs highlighted by the official recipe, selected verbatim from the pinned `candidate_pairs.json`. Text, punctuation, styles and ABV strings are preserved.
- **Six boundary cases:** reuse c428 with synthetic Scores 0.499, 0.5, 0.501, 1.499, 1.5 and 1.501. Opposing zero/one Nouls make the independent Score decision visible.
- All responses, including confidence and distributions, are authored fixtures. They are not the official cached outputs or measured model quality. No usage, performance or savings are fabricated.
- Inputs are restricted to known cases and their exact selector messages on the server; the transport also validates the complete model/state/question set. Editing an input cannot enable live inference. No API key is needed.
- The official `assert sameAs` result is returned as a **proposal**. No graph/database mutation, paid inference, full 450-pair evaluation, histogram or benchmark metric is implemented.

## Provenance and licenses

[provenance.json](provenance.json) records the reviewed recipe hash, pinned upstream asset hash, retained pair IDs and transformations. [LICENSE.typesafe](LICENSE.typesafe) retains the official examples repository's MIT notice. The recipe attributes the underlying facts to the **Magellan Beer** entity-matching benchmark, drawn from two beer catalogues. Only its four illustrated factual records are included here; TypeSafe's MIT notice is not a claim that all third-party catalogue data has the same license. The source asset did not include a separate corpus license; no full corpus or cached model responses are redistributed.

## Verification contract

`apps/playground/tests/entity-alignment.test.ts` runs the actual flow through a real SDK client with a custom local fetch. It protects exact source prompts/levels, raw request state, reference-label exclusion, one-request execution order, task transformations, all three routes, both sides/equality of both thresholds, independence from companion probabilities/confidence, rejection before dispatch, fixture matching and cancellation. These are new cookbook contracts, not a repair to the Flow API.

For browser coverage, run `npm run verify:cookbooks`. The shared suite checks cookbook switching, complete application results, sample guards, capture consistency, and workbench controls. Recipe runtime tests verify source fidelity and boundary cases. See [contributor verification](../../CONTRIBUTING.md#verification-details).
