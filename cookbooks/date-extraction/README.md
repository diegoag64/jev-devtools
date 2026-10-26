# Date extraction · sample showcase

A community-maintained TypeScript adaptation of the [official TypeSafe Date extraction cookbook](https://docs.typesafe.ai/cookbooks/date_extraction_cookbook). Run `npm ci` and `npm run dev` from the repository root, then open [Date extraction](http://127.0.0.1:4182/?cookbook=date-extraction). Choose a **Date sample** and **Run sample**. No API key is required; live mode is disabled on the server even when a key exists.

The reference date is visibly fixed to **Thursday, 2026-07-30**, matching the source. Each requested role sends one Jev request with the original seven Choice questions: `mode`, `month`, `day`, `year`, `day_anchor`, `weekday`, and `week_offset`. The model only reads text; calendar math happens in the **Assemble the calendar date** task. Outputs are JSON ISO date strings (`YYYY-MM-DD`) or `null`.

## Inspect the flow

Open **Jev DevTools → Flows**, select the run, and expand the drawer. Select a role in **Extract each requested date**, then **View Flow**. Inspect **Read seven date parts** for all question instructions, criteria and synthetic answers. Select **Assemble the calendar date** for components, used flags, minimum confidence and note. **Does this date need review?** shows the executed accept/review path and the untaken alternative. Review is returned data; nobody is contacted.

The result page shows the document, requested role, resolved date and decision. Expand **Date components · used and unused** to see why an unrelated weak or unavailable answer does not affect the gate. The year question lists 1900 through 2050 inclusive, plus `none` and `out_of_range`.

| Sample                           | What it protects                                                                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Official documents               | Contract effective/expiry dates, missing-year form deadline, absent kickoff, today, and next Thursday; five accepted and one unresolved with synthetic readings.                           |
| Calendar rules                   | Tomorrow, day after tomorrow, bare Thursday, current/next Monday, and missing-year dates exactly 31 versus 32 days in the past.                                                            |
| Absent, incomplete or impossible | February 30, a stated year outside the window, missing day, absent date and unread weekday return `null` for review.                                                                       |
| Confidence                       | 0.59999 reviews; 0.60 and 0.60001 accept. Missing used confidence reviews, all used confidence missing yields `null` confidence, and unused missing confidence does not affect acceptance. |

## Source semantics and explicit adaptations

- Missing year: first construct the date in the reference year. Only when it is **strictly earlier than today minus 31 days**, use the next year. An impossible current-year date fails before rollover. A stated out-of-range year is not guessed.
- Bare weekday: next occurrence **on or after** today. `current`: this Monday-based calendar week, including past days. `next`: the following calendar week, not a rolling seven-day offset. Calculations use UTC to avoid host timezone and daylight-saving differences.
- Confidence: take the minimum of available confidence values among **only the parts actually used**. Absolute dates use mode/month/day/year, direct relatives use mode/anchor, and weekday relatives also use weekday/offset. Even an inferred year uses the confidence of the `none` year answer. Probabilities are a separate distribution and never drive this gate; no Score or Noul is involved.
- Review unresolved dates or confidence strictly **below 0.60**. As requested for this port, any unavailable used confidence also requires review, even when other used values exist. The Python source filters out `None` and only flags missing confidence when all used values are absent. We retain the minimum available value for inspection and expose `missingConfidence` separately. Missing/out-of-range/nonfinite confidence is normalized to `null` at assembly, without inventing confidence from probabilities.
- Python date validation rejects impossible dates. JavaScript `Date` normally rolls them into a later month; this port round-trips UTC fields to reject that normalization. An inferred leap-day rollover that would raise in the source returns `null` and a review note here. Date objects stay inside calendar helpers and never cross task boundaries.
- Requests run sequentially in source example order, once per role, including when roles share a document. The source notebook repeatedly calls the cached extractor while displaying and partitioning results; this flow reuses assembled rows and makes no repeated requests for the final grouping.

## Fixtures, provenance and limits

`questions.json` preserves the official question-builder output with a `{role}` placeholder. `recipe.ts` adapts its calendar assembly; `flow.ts` connects server validation, `map`, runtime `jev`, `task`, `if`, and `output` through public package exports. `cases.ts` holds fixed documents/roles, and `fixtures.json` holds authored readings/confidences. `samples.ts` uses the real SDK with a local transport that validates model, document, question battery and request order before returning a fixture; edited inputs and excess requests fail.

The official document text and role phrases are retained in the first case. Its answers are **authored synthetic readings**, not a replay of published results or the upstream cache: the absent kickoff intentionally uses mode `none`, whereas the published output shows an incomplete absolute reading. Other cases are authored boundary examples. Probabilities (selected label 0.8, remaining mass spread over alternatives) and available confidences are synthetic and deliberately independent. The small transport delay makes progress inspectable and is not a measured provider latency. No usage, savings or accuracy measurements are supplied.

`provenance.json` pins the reviewed source and question hashes. `LICENSE.typesafe` retains the TypeSafe examples repository's MIT notice; that repository does not contain a date-extraction cache or separate source file at the reviewed commit. The published page's Python cells are the algorithm source. No upstream media, external corpus, or evaluation cache is bundled. This repository's cookbook is not shipped in npm.

Run the focused tests with `npm test -w @jev-devtools/playground`. Tests protect question fidelity, calendar boundaries, missing confidence, request count/order, real public-flow execution, captured branch decisions, fixture rejection and cancellation. To build a live integration later, explicitly replace the server transport and validate returned parts; keep credentials and sample restrictions on the server. This sample does not authorize live inference.
