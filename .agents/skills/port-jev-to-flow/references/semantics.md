# Semantic hazards

Read the sections matching the source. These are distinctions demonstrated by the cookbook ports, not a new universal routing policy.

## Answer fields and routing

- A Noul is its question's true probability. Several Nouls are independent questions; their values need not sum to one.
- Choice's returned label, full probability vector, selected-label probability, maximum probability and SDK confidence are distinct. Follow the source's actual read operation. Preserve rubric order for ties and question identity for dynamic keys.
- A Score belongs to its written level scale. A source may round it, normalize by `criteria.length - 1`, or compare it directly. Score confidence is separate. Preserve the source's domain before claiming two rounding expressions are equivalent.
- An application's calculated confidence may be a minimum individual decision mass while an argument's probability is a product. Preserve both names and calculations. Do not substitute SDK confidence because a variable is named confidence.
- Preserve `<`, `>`, `>=`, equality and precedence exactly. A severity upgrade may apply only after a hazard triggers review; high severity alone need not trigger anything. Human-review, support or tool-call labels can be returned proposals without any executed side effect.

Useful contrasts: `citation-checking` gates on SDK confidence; `consistency-choices` gates on maximum probability; `function-calling` uses selected-label/member decision masses; `guardrails` combines Noul hazards with a separate severity Score.

## Python and JavaScript boundaries

Translate operations, not spellings. `Number()` accepts hexadecimal strings rejected by Python `float()`; valid Python numeric strings can include forms a casual decimal regex rejects. Reproduce the accepted input domain and nonfinite handling where serialized SDK data can reach the parser. Types alone do not validate runtime JSON. A stricter parser is an adaptation if the source accepted the excluded form.

Trace missing, null, empty string, zero and false separately. Exact substring matching can treat an empty quote as a match while a null quote chooses a different lookup. Preserve case sensitivity, normalization sequence, first-match ordering and the distinction between display text and the request's source text.

Calendar arithmetic needs the source's reference date, timezone convention, ordinal/week rules and leap-day behavior. Convert resulting dates into strings/null before returning task data. Exact decimal arithmetic may require decimal strings rather than binary floating-point numbers at that boundary. Set values need stable source order and JSON arrays; optional arguments need deliberate omission/default behavior. Keep reference labels out of model inputs when the source excludes them.

An independent cross-language comparison is valuable for these transformations. Scope the comparison to source operations; avoid teaching a new universal parser or calendar policy from one recipe.

## Repetition and statistics

Preserve which fields change between repeats, including UIDs and model aliases. A varying UID means inputs are not identical. A deterministic fixture does not become an independent model draw because a nonce changes. Requested alias and actual returned model are different metadata.

Keep counts and denominators explicit: all repeats versus valid repeats; uncertain labels versus parse failures; mean over label columns versus mean over question summaries; sample deviation (`n - 1`) versus population deviation (`n`). Agreement does not establish accuracy, and stable labels can coexist with nonzero probability variation. Preserve raw answers so derived decisions remain auditable; do not normalize or repair vectors unless the source does.

Source batching and source concurrency are separate. A recipe titled parallel questions can compare one multi-question request with sequential single-question calls. Replacing the latter with concurrent calls changes the experiment. Fixture delay, recorder duration and fabricated usage cannot support provider speed/cost/quality claims.

## Metadata, lifetime and capture

If the public answer reference lacks needed response metadata, inspect the supported transport/client boundary. A narrowly scoped per-run sidecar can retain actual returned metadata keyed by stable request identity. Test overlapping runs and unavailable metadata; report null/unknown for replay without the sidecar instead of guessing from the requested model. Do not leak one run's cache or sidecar into another.

Application results and inspector captures have different contracts. Capture truncation/redaction does not change executed values; UI-only privacy masking does not prevent browser delivery. Read the current server-redaction and capture-boundary documentation when handling sensitive inputs. A shortened aggregate preview or an evicted old trace is not proof that application answers were lost; verify each layer separately.
