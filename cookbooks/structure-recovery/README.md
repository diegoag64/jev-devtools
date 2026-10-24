# Structure recovery · sample showcase

A local TypeScript adaptation of the [official Structure Recovery cookbook](https://docs.typesafe.ai/cookbooks/autoformat). It uses the existing `task()`, dynamic `jev()` and `if()` APIs. No additional execution primitive is introduced.

Run `npm ci` and `npm run dev` from the repository root, then open [the local cookbook](http://127.0.0.1:4182/?cookbook=structure-recovery). Choose **Structure sample** and click **Run sample**. No key or paid inference is needed. Samples are fixed, read-only documents with authored synthetic answers; live mode is disabled.

## Follow the full flow

1. **Normalize and tag lines** collapses spaces/tabs, retains blank-line boundaries, and creates `L000` identifiers.
2. **Pass 1 · stitch split sentences** sends a single batch of Noul questions for adjacent nonblank lines. When no pairs exist, `if()` takes the explicit bypass path.
3. **Restore text blocks** joins at `p >= 0.2` after unfinished text and `p >= 0.5` after terminal punctuation. Blank lines always prevent joins. The task records each probability, threshold, decision, and source-line mapping.
4. **Pass 2 · classify recovered blocks** constructs questions from the actual merged blocks, tagged `B000`, etc. Every block gets content type, step-order and callout questions; heading-level questions are included only for blocks up to 90 Unicode characters. All questions share one request. Empty input bypasses it.
5. **Render Markdown in code** uses returned Choice labels. Adjacent list items form one group, numbered when their mean step probability is at least 0.5; adjacent code blocks share a fence. Only relevant companions affect each type's formatting. Confidence is displayed, not used as a gate.
6. **Recovered document** exposes the original/preview comparison, Markdown source, join decisions, source lines, and every type probability. Open **Jev DevTools → Flows**, select the newest run, and inspect the complete connected requests and function steps. The request's **Questions** tab retains all companion answers, including unused ones.

| Sample | What to inspect |
| --- | --- |
| Team memo | Twelve lines become nine blocks. Five stitch questions, then 36 classification questions. List steps of 40% and 60% produce a numbered list because the group mean is exactly 50%. The low-confidence paragraph remains a paragraph. |
| Threshold boundaries | Joins at exactly 20% and 50%; splits at 19.9% and 49.9%, using the previous line's punctuation. |
| Blank-line separation | No stitch questions; one classification request. The blank boundary is preserved. |
| Empty document | No Jev requests; explicit bypasses and empty Markdown. |

## Fidelity and limits

Question wording, three criteria dictionaries, `jev-1.12`, line/block tagging, whitespace normalization, join thresholds, punctuation detection, the 90-character heading-question cutoff, and group-level rendering follow the official executable recipe. Consecutive list/code blocks group regardless of intervening blank lines, as in that renderer. The source prose mentions explicit-marker handling, but its executable functions do not implement that handling. We follow the code and use unmarked documents; this is not a general Markdown round-trip parser.

The sample documents and all responses are authored fixtures, not the upstream memo or published cached measurements. The sample transport matches the complete model/state/question set and independently authored expected merged blocks; mismatches fail instead of receiving unrelated answers. No timing, price or accuracy result from the original is reproduced. `provenance.json` records the reviewed source hash and differences; `LICENSE.typesafe` retains attribution for the adapted algorithm, prompts and criteria.

Formatting preserves the normalized input wording, adding Markdown markers; it does not preserve original whitespace byte-for-byte. The preview renders React text nodes and known elements, never injected HTML or arbitrary Markdown HTML. The Markdown source remains visible for inspection. Code fences and existing source markers have the same limitations as the simple upstream renderer.

Requests with no questions are explicitly bypassed, an adaptation that makes separated and empty inputs runnable. The normal memo uses two sequential requests, not one request per line or block. Cancellation prevents downstream work and clears the previous page result. Fixture delays only make progress visible.

Implementation: `flow.ts`; sample choices: `cases.ts`; fixed transport: `samples.ts`; behavior checks: `../../apps/playground/tests/structure.test.ts`. This requires the current experimental checkout and is not included in npm 0.3.0. Adding an API key alone does not enable live mode.
