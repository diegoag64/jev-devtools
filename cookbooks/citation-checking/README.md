# Citation checking

Explore [this cookbook in the playground](https://playground.jevtools.dev/?cookbook=citation-checking) with source, diagrams, and a step-by-step guide. Choose a **Sample** and click **Run sample**. Inspect the inline **Flow diagram** and open **Application result** for the complete JSON output. No installation or API key is needed.

A runnable TypeScript adaptation of [TypeSafe’s Double-checking citations](https://docs.typesafe.ai/cookbooks/citation_check), using public `jev-devtools/flow` methods. Open [Citation checking](https://playground.jevtools.dev/?cookbook=citation-checking).

Choose a sample and **Run sample**. Open **Application result** to inspect each citation's claim, original quote, normalized match, cited and actual sections, probabilities, confidence, and action. In **Flow diagram**, select **Check citations in order**, choose an item, then **View Flow** to inspect its matching task, conditional request and confidence route.

## Source behavior and adaptation

The full RFC 7519 text and all eight original citations are unchanged pinned upstream assets. `prepare-source` removes RFC page headers/footers and splits numbered sections; appendix headers terminate the preceding numbered section. `locate-quote` collapses whitespace and folds curly quotes, then searches exact case-sensitive substrings in numeric section order. It uses the first matching section, even when the citation names another section. The UI highlights the normalized text; the request receives the full cleaned section, not the normalized display.

A quote absent from all numbered sections returns `fabricated`, `confidence: null`, `answer: null`, and `auto: true`, with zero Jev calls. A `null` quote means no quoted text and uses the citation’s named section directly. A missing named section throws, following the original lookup’s failure behavior. An empty string is distinct from `null`: upstream substring semantics match the first numbered section. This is deliberately exact matching, so rewording and case changes can be labeled fabricated; this sample does not add fuzzy matching or verify claims against external sources.

Each surviving citation makes one Choice request, preserving the official question and criteria: `supports → verified`, `contradicts → contradicted`, `says_nothing → unsupported`. Returned API confidence **>= 0.80** accepts any verdict; below 0.80 retains the proposed verdict and requests human review. This is confidence, not an option probability or a Score. A sequential bounded map preserves the notebook’s citation/request order; returning conditionals make both the bypass and review paths inspectable.

All Jev responses are authored synthetic fixtures, not the official cached measurements. Their selected option probability is 0.60 and differs from confidence so the distinction is visible. The local request delay only makes progress observable. The UI reports no measured model quality, usage, speed or savings. No human is notified or review performed. No key is required and live mode is rejected server-side, even with a configured key. Sample selection and exact message validation also run on the server; arbitrary edited input cannot receive a stale fixture response.

## Samples

| Sample                   | Behavior                                                                                                  | Jev sample requests |
| ------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------- |
| Eight official citations | Four verified, one fabricated, one contradicted, two unsupported requiring review                         | 7                   |
| Fabricated quote         | Deterministic missing-quote result with null confidence                                                   | 0                   |
| No quoted text           | Named section 4.1.6 assessed; proposed unsupported verdict requires review                                | 1                   |
| Confidence boundary      | Same citation, synthetic confidences 0.7999 / 0.80 / 0.8001, review / auto / auto                         | 3                   |
| Matching                 | Curly quotes and whitespace normalize; wrong cited section resolves to 4.1.3; rewording fails exact match | 2                   |

## Provenance and verification

[provenance.json](provenance.json) pins the official asset commit and SHA-256 hashes. [LICENSE.typesafe](LICENSE.typesafe) covers the upstream example material and adapted recipe code. RFC 7519 retains its own IETF Trust copyright and legal notice in [rfc7519.txt](rfc7519.txt); see [LICENSE.rfc](LICENSE.rfc). The extra cases and all response values are local additions.

`apps/playground/tests/citation-checking.test.ts` checks source hashes, RFC section parsing, normalization, numeric first-match selection, claim-only and empty-string behavior, request counts/order/state/questions through public Flow execution, confidence boundaries, fixture mismatches and inference failure. Run it with `node --import tsx --test apps/playground/tests/citation-checking.test.ts` after building the package. Repository-wide verification and drawer/docs checks remain required for contributions.

For browser coverage, run `npm run verify:cookbooks`. The shared suite checks cookbook switching, complete application results, sample guards, capture consistency, and workbench controls. Recipe runtime tests verify source fidelity and boundary cases. See [contributor verification](../../CONTRIBUTING.md#verification-details).
