# Simple memory · sample showcase

A local TypeScript adaptation of the [official Simple Memory cookbook](https://docs.typesafe.ai/cookbooks/basic_memory), using the existing `task()`, dynamic `jev()`, `if()` and `loop()` APIs. No new execution primitive or persistence service is introduced.

From the repository root, run `npm ci` and `npm run dev`, then open [Simple Memory locally](http://127.0.0.1:4182/?cookbook=simple-memory). Choose **Memory sample** and click **Run sample**. No key or paid inference is needed. The fixed timelines use synthetic responses; live mode is disabled.

## Follow the flow

1. Start with an empty memory dictionary, keyed by customer ID.
2. `loop()` processes tickets in order, carrying the dictionary forward as explicit JSON state. Its eleven-iteration bound covers the full timeline.
3. Load only the current customer's list. Add `earlier_tickets_from_this_customer` to the routing state only when that list is nonempty.
4. Route the ticket with one Choice question. Later comparison tickets first make a separate baseline request with the same ticket and no injected memories; that baseline does not write memory.
5. Build a candidate `{ request, jev_answered }`: `request` is the **original** ticket state, before injection; `jev_answered` maps the question's instruction text to the chosen option's **criteria description**, not its identifier or probabilities.
6. Make a second, sequential Noul request asking whether `request.ticket` explicitly contains a lasting fact. The prompt excludes facts implied only by the routing answer.
7. `if()` appends the candidate when `remember >= 0.5`. Below that threshold it returns the unchanged dictionary. Either path returns the original routing answer and advances to the next ticket.
8. Compare later routes with/without memory, inspect saved tickets per customer, and expand each timeline row for its memory before/after, gate decision, confidence and every team probability.

Open **Jev DevTools → Flows**, select the run, choose an iteration in **Process tickets in order**, and click **View Flow**. This exposes the connected routing and remembering requests, input preparation, conditional save path and continuation. Use the iteration selector/arrows to follow later tickets; request details retain all questions and answers.

| Sample | Tickets / Jev requests | What to inspect |
| --- | --- | --- |
| Full timeline | 11 / 28 | Five earlier tickets, then six comparisons. Windows and Enterprise facts stay with Harbor Logistics; the cloud/self-serve fact stays with Fernwood Studio. Three memories are saved. |
| Save at exactly 50% | 2 / 5 | Inclusive threshold saves the Windows fact; the later ticket receives it. |
| Do not save at 49.9% | 2 / 5 | The same fact is not saved; the later ticket has no memory injected. |
| Transient details | 4 / 10 | Airport and holiday details are not saved. Both customer stores remain empty. |

## Fidelity and limits

The official ticket dataset, routing/gate instructions, seven routing criteria, model identifier `jev-1.13.0`, description conversion, per-customer storage and inclusive save policy are retained. The full sample runs the five earlier tickets followed by the six final plain-versus-memory comparisons. It omits the notebook's intermediate repeated probes, caching and evaluation metrics.

All answers and probabilities are **authored synthetic fixtures**, not official measured responses or an accuracy claim. The source's expected-team labels are retained as source data but do not drive execution. Samples validate the expected request state and question set, including which customer's memories are supplied; mismatches fail visibly. The small boundary/transient timelines are additional demonstrations.

Memory is **run-local application state**: every click starts fresh. It is not persisted across runs, browsers or restarts, and does not alter model weights. The recipe appends whole original tickets and readable answers; there is no fact summarization, deduplication, expiration or relevance search. A real application must own its storage, customer scoping and lifecycle. Cancellation stops the active request and subsequent turns; no durable store is involved here.

## Files

- `flow.ts`: inspectable application logic, using public flow exports.
- `recipe.ts`: attributed official prompts, criteria and ticket data.
- `cases.ts`: four bounded, repeatable timelines shared with the picker.
- `samples.ts`: server-only synthetic transport with request validation and cancellation.
- `provenance.json` and `LICENSE.typesafe`: source snapshot hash, adaptations and upstream notice.

This cookbook uses the 0.4.0 flow API. Its application code and sample fixtures run from this repository and are not bundled in npm. See [the flow guide](../../docs/flows.md) for API contracts and limits.
