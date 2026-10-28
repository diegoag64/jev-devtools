# Line-by-line search

Explore [this cookbook in the playground](https://playground.jevtools.dev/?cookbook=line-search) with source, diagrams, and a step-by-step guide. Choose a **Sample** and click **Run sample**. Inspect the inline **Flow diagram** and open **Application result** for the complete JSON output. No installation or API key is needed.

Open [the cookbook](https://playground.jevtools.dev/?cookbook=line-search). Choose a sample, run it, then inspect **Flow diagram**.

This TypeScript adaptation of the [official TypeSafe recipe](https://docs.typesafe.ai/cookbooks/semantic_find) uses existing public `jev-devtools/flow` methods. It bundles the complete pinned 218-line GitHub Terms of Service document with zero-based IDs `L000`–`L217`. This is a historical recipe fixture, not current policy guidance.

The tagging task retains the source order. A runtime request factory constructs all line criteria and sends `where` (Choice) and `exists` (Noul) in **one request per search**, with model `jev-1.12`. The ranking task preserves the document-order relevance array, defaults missing probabilities to zero, and stably sorts a separate index list. The lookup task resolves every ranked ID to full source text. The terminal branches preserve the source's exact thresholds:

- `exists >= 0.70`: answered in this document.
- `exists < 0.35`: not in this document.
- Otherwise: partially addressed, including exactly `0.35`.

Choice probabilities rank lines and sum to one; a top line always exists even when the answer does not. API Choice confidence is distinct and unused by the route. There is no Score question. The arbitration sample deliberately combines a strong top line (`0.86`) with low existence (`0.14`). Other samples demonstrate ownership, termination, partial parental-permission evidence, and values immediately below, at and above both thresholds.

All model responses are authored synthetic fixtures. The distributions take inspiration from the recipe's displayed examples and fill remaining probability mass explicitly; they are not downloaded API-cache responses or claims of model quality. Tagging, sorting, lookup and branching execute real deterministic code. Sample queries are fixed and checked server-side before execution; edited queries and mismatched request fixtures are rejected. Live mode is unavailable even with a configured key. No paid calls, remote document downloads at runtime, benchmarks, or current legal-policy assertions are involved.

**Application result** provides top matches and all 218 line options with complete text and probabilities. The full result is separate from DevTools capture: bounded previews may truncate large strings, arrays or option maps and report capture warnings. Use the application result to inspect options omitted from a captured preview. The document is within the recipe's 255-option ceiling; multi-window search is outside this port.

[Provenance](provenance.json) pins the source recipe hash and byte-identical upstream/Gist document hashes. [TypeSafe's MIT notice](LICENSE.typesafe) covers the adapted recipe; [GitHub's CC0 notice](LICENSE.github) accompanies the policy fixture, as documented by [GitHub site-policy](https://github.com/github/site-policy#license). No document lines have been removed or rewritten.

Focused tests: `node --import tsx --test apps/playground/tests/line-search.test.ts` after `npm run build:package`. They execute the public flow, protect request count/order and exact prompts, exercise threshold routes and rejection, and verify complete ID/text/probability lookup against the pinned source.

For browser coverage, run `npm run verify:cookbooks`. The shared suite checks cookbook switching, complete application results, sample guards, capture consistency, and workbench controls. Recipe runtime tests verify source fidelity and boundary cases. See [contributor verification](../../CONTRIBUTING.md#verification-details).
