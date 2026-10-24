# SDE cascade · sample showcase

A local TypeScript adaptation of the [official TypeSafe SDE cascade](https://docs.typesafe.ai/cookbooks/sde_cascade), built with the unreleased `flow.if()` API. This is a community-maintained walkthrough, not an official integration or evaluation result.

From the repository root:

```sh
npm ci
npm run dev
```

Open [the SDE cookbook](http://127.0.0.1:4182/?cookbook=sde-cascade), choose an **SDE sample**, and click **Run sample**. Open **Jev DevTools → Flows**, select the latest run, and expand the drawer. No API key is required. Live mode is disabled even when a server key is present. If an older dev server is running, restart it after building the updated package.

## What to inspect

1. **Cheap extraction · sample** returns the candidate from an authored fixture.
2. **Verify every extracted field** builds one Jev request from that candidate. Nonempty fields get seven independent Nouls; empty fields get only `absence_wrong`. The overall judge is separate. Use the request's question selector or Questions tab to access every answer.
3. **Read per-field flags** excludes the overall judge and finds the highest field probability.
4. **Does any field need escalation?** uses strict `.gt(0.7)`. One path calls the stronger-extractor fixture; the other keeps the candidate. The other path is visibly untaken.
5. **Selected result** rejoins the paths. **Compare the final record** runs once on either route, then returns the record, all field scores, and a field diff.

Click a step and **Show Details** to inspect captured inputs/outputs. The page also shows a compact before/after comparison and every per-field score.

| Sample | Expected route | Demonstrates |
| --- | --- | --- |
| Fabricated description | Stronger extractor | A 95% hallucination flag replaces a fabricated description with an empty value. |
| Overall judge alone is high | Keep cheap | A 96% overall judgment does not trigger escalation when field flags stay low. |
| Exactly 70% | Keep cheap | The threshold is strictly greater-than, not greater-than-or-equal. |
| Wrongly empty date | Stronger extractor | A 91% `absence_wrong` flag fills in the missing date. |

These probabilities are **synthetic**, including the deliberately conflicting overall/per-field case. They illustrate the rule, not Jev accuracy. Context is read-only in sample mode. The server rejects mismatched documents, extractions and question batteries rather than pretending an arbitrary input matches a fixture.

## Fidelity and boundaries

The verifier's question/criteria strings and extraction system message are preserved from the official recipe in `verifier-prompts.json`. The policy preserves its strict per-field >0.70 gate, exclusion of `__overall__`, and a single verification pass. The stronger result is not verified again.

The local schema is deliberately limited to two string fields, with explicit descriptions and required fields. All sample records include both fields; the empty representation is `""`. This is not a general schema interpreter for nested, optional, missing, null, array or object fields. The official notebook's broader schema handling and malformed-JSON behavior are not reproduced here. Documents, candidates, stronger results and scores are authored fixtures; no original dataset or cache is bundled. The original story about a fabricated registration description inspired the first case.

The real TypeSafe SDK request/response path runs through a local exact-match transport and the real inspector. Both extraction tasks are local stand-ins, with short cooperative delays to make progress visible. No OpenAI, embedding, extraction or paid Jev calls occur. Those delays are not provider performance measurements. The notebook's bulk quality/cost evaluation is outside this showcase.

To adapt this to real extraction, replace the two task callbacks with your server-owned provider calls, pass their `signal`, validate/normalize the returned record, and replace the sample transport explicitly. Do not expose arbitrary callback code or provider credentials to the browser.

## Files and attribution

- `flow.ts`: dynamic request, flag policy, returning conditional and shared comparison.
- `cases.ts`, `samples.ts`: fixed inputs and exact-match synthetic transport.
- `verifier-prompts.json`: copied official prompt/criteria text under TypeSafe's MIT license.
- `provenance.json`: reviewed source URL, timestamp, content hash and adaptation notes.
- `LICENSE.typesafe`: upstream notice retained with the adapted code.
- `../../apps/playground/tests/sde-cascade.test.ts`: complete executions, boundary/fidelity checks, fixture mismatch and cancellation.

The API and cookbook require this checkout; they are not available in npm 0.3.0. See [the flow guide](../../docs/flows.md#returning-conditionals-flowif-unreleased-experiment) for syntax and execution limits.
