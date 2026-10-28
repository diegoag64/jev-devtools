# Pre-parsed value extraction

Explore [this cookbook in the playground](https://playground.jevtools.dev/?cookbook=pre-parsed-extraction) with source, diagrams, and a step-by-step guide. No installation is needed. For the result dashboards and drawer controls described below, use [Request lab](https://playground.jevtools.dev/?cookbook=pre-parsed-extraction&legacy=1).

A runnable TypeScript adaptation of the [official TypeSafe recipe](https://docs.typesafe.ai/cookbooks/pre_parsed_value_extraction_cookbook). Open [the sample](https://playground.jevtools.dev/?cookbook=pre-parsed-extraction&legacy=1). No API key is required. The server accepts only the selected fixed document and uses synthetic responses; adding a key does not enable live inference.

## Follow the execution

1. Choose an email, phone, money, threshold, missing-value or empty-candidate sample and click **Run sample**.
2. Compare document-order regex candidates, the verbatim selected span and the normalized result. Expand Choice answers to see API confidence and option probabilities separately.
3. Open **Jev DevTools → Flows**. Select **Select values sequentially**, choose a collection item and **View Flow** to inspect its helper request and copied answer. For money, expand **Check and normalize each amount** to inspect the later Noul, strict credit decision and decimal parsing task.

The recipe documents produce `dana.personal@gmail.com` for the receipt, `dana.whit@acme-corp.com` for the sender, `+14155550177` for the mobile, and `1315.50 USD` (charge) / `50.00 USD` (credit). These are outputs of authored synthetic selections and real transformations, not fresh model results or recorded official measurements.

## Fidelity and adaptations

- The source regexes over-find, trim and deduplicate exact strings in first-appearance order. Matching is case-sensitive. Runtime Choice options are those spans plus `none`, with the source escape description. Country and currency classify calls retain their source labels without adding `none`.
- Helper calls remain separate and ordered: receipt → sender; mobile → country; currency → total → credit → total's credit Noul and parsing → credit's Noul and parsing. Each collection has concurrency 1. Exact question wording, question IDs (`pick` / `q`), criteria order, document state and `jev-1.12` request model are preserved.
- The strict `P(credit) > 0.5` rule is an inspectable `if`. Exactly 0.5 is a charge. Choice confidence is neither an option probability nor a routing threshold. No Score questions are used.
- Python `phonenumbers` becomes `libphonenumber-js`, with the selected country as the default and whole-string parsing. This formats a number; it does not prove reachability or that the number is mobile. Invalid parses return no normalized value.
- Python `Decimal` becomes an exact canonical decimal **string**, never a JavaScript Number. Magnitudes and credit/charge flags stay separate, as in the executable recipe; this port does not negate credits. Only comma-grouped thousands and dot decimals are supported. The source regex can partially match other locale formats: these helpers are not a general locale detector. The fixed server inputs exclude them; the parser rejects malformed complete spans instead of guessing.
- Empty candidate lists bypass all helpers. A selected `none` bypasses contact parsing, or the amount Noul and decimal parsing. These are explicit local safety extensions; the notebook directly parses selected values. More than 254 candidates is rejected to reserve the 255th Choice option for `none`; staged narrowing is not implemented.
- The recipe's document text and helper logic are adapted under the retained TypeSafe MIT notice. Edge-case documents and response transcripts are authored here. `fixtures.json` contains independently specified requests and synthetic answers; it is not the upstream `json_cache.json`. Each run executes actual tasks and SDK requests against that local transport. There is no inference-result cache, paid call, benchmark, savings claim, or API extension.

## Source and checks

[provenance.json](provenance.json) records the reviewed Markdown SHA-256, the pinned official examples repository and license check. That repository has no pre-parsed extraction assets at the reviewed commit, so the recipe's published executable code is the source of truth. The illustration is not copied.

The focused tests execute the public Flow API and real SDK. They protect complete request transcripts, counts/order, deduplication, the 254-candidate boundary, none/empty bypasses, exact decimal preservation, phone normalization, threshold boundaries, cancellation and rejection of edited inputs/prompts. Full repository verification also checks the package, playground, docs, drawer and flows.

To repeat the focused checks, run `node --import tsx --test apps/playground/tests/pre-parsed-extraction.test.ts`. After building the package, run `npm run verify:cookbooks -- --only pre-parsed-extraction` for local browser evidence. The runner acquires the shared browser lock and owns process cleanup; retry after the reported owner finishes if the lock is occupied. Each run has a unique evidence directory and a source-bound verification report. Evidence stays in ignored `benchmarks/results/cookbook-browser/`.
