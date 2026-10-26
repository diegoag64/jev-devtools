# Confidence fallback

A runnable TypeScript adaptation of TypeSafe’s [Classification using confidence](https://docs.typesafe.ai/cookbooks/classification_using_confidence). Run `npm ci` and `npm run dev` from the repository root, then open [the sample](http://127.0.0.1:4182/?cookbook=confidence-fallback). No API key is required. Choose a case, run it, and inspect **Jev DevTools → Flows**.

The flow validates the selected document, asks one `Choice` over the original **75 SIC major groups**, and checks the returned **API confidence ≥0.90**. At or above the cutoff it reports the two-digit group; below it a task computes the selected group’s actual parent division. Both paths join before the result attaches the group description and complete probability distribution. Every valid case makes exactly one request. The diagram describes application execution, not model reasoning.

| Case     | API confidence | Largest class probability | Result                            |
| -------- | -------------- | ------------------------- | --------------------------------- |
| Below    | 0.899          | 0.95                      | Group 38 → manufacturing division |
| Equal    | 0.900          | 0.65                      | Group 60 retained                 |
| Above    | 0.901          | 0.75                      | Group 20 retained                 |
| Services | 0.220          | 0.45                      | Group 87 → services division      |

Confidence and probabilities are **independently authored test values**, intentionally chosen to expose a mistaken probability gate. They are not cached or measured model outputs and do not claim a real calibration relationship. Confidence is neither the largest class probability nor a `Score`. The component displays both fields separately and exposes all 75 probabilities.

## Source fidelity and boundaries

- `sic_codes.tsv` is the upstream 444-code SEC taxonomy snapshot with CRLF line endings normalized to LF. `taxonomy.ts` lowercases its titles, groups sorted codes by their first two digits, and builds descriptions from the umbrella title plus at most eight non-umbrella industries. It retains all ten original inclusive division ranges, including the source’s 91–99 → public administration convention. This reproduces the recipe rather than correcting its taxonomy.
- The original question and `jev-1.12` request model identifier are preserved. The returned model is labeled `synthetic-confidence-sample`.
- `cases.ts` contains short authored descriptions, not real filings. `samples.ts` contains synthetic answers and verifies the entire request’s state, questions and model before serving them. The flow and server reject edited sample text. Live mode is unavailable for this recipe even if a server key exists.
- The original 60-filing dataset, cached responses, quality charts, and evaluation are out of scope. No accuracy, timing, usage, or savings results are asserted.
- The implementation uses public `jev-devtools/flow` methods (`task`, runtime `jev`, `if`, `output`); no package API changes. Taxonomy reads and the sample transport stay on the server. The browser imports only case labels/text and result types.

See [provenance.json](provenance.json) for the pinned upstream commit, URLs, hashes and transformations, and [LICENSE.typesafe](LICENSE.typesafe) for the retained upstream MIT notice. Generated verification evidence belongs in ignored `benchmarks/results/confidence-fallback/`.

The focused tests in `apps/playground/tests/confidence-fallback.test.ts` run the real SDK through the public flow, pin source data, protect the cutoff and separate confidence/probability semantics, and reject mismatched samples. Full verification follows [CONTRIBUTING.md](../../CONTRIBUTING.md).

For browser verification, build the package and run `node scripts/verify-confidence-cookbook.mjs` while holding the shared `/private/tmp/jev-cookbook-verification.lock` (atomic `mkdir`, owner metadata, cleanup in `finally`/shell trap). It owns and stops its temporary Vite server, checks all cases and server restrictions, and writes screenshots under `benchmarks/results/confidence-fallback/`.
