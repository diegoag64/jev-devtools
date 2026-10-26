---
name: port-jev-to-flow
description: Port Jev or TypeSafe application logic and cookbooks to jev-devtools Flow, or audit whether a workflow fits the current public Flow API while preserving source behavior.
---

# Port Jev logic to Flow

Produce an executable application workflow whose requests, decisions and deterministic work remain faithful to the source and inspectable through public Flow APIs. For an audit request, stop at the supported mapping, adaptations, gaps and verification plan; implementation requires an implementation request.

## Establish the contract

Locate the source recipe or application and the target's installed `jev-devtools` version. Read the executable source, relevant fixtures and its question definitions; prose alone can omit operators, ordering or failure behavior. Record the source revision or content hash and distinguish source assets from locally authored replacements. Retain applicable attribution and notices for material actually reused.

For repository work, locate `docs/flows.md`, the public `/flow` exports, and `packages/jev-devtools/skills/setup-jev-devtools/references/flows.md`. For an installed consumer, use its bundled setup skill and documentation matching the installed version. Resolve example paths in this skill against the located repository, never the skill installation directory. Public types and current runtime contracts decide capability; a cookbook is an example, not an API specification.

Build a compact contract covering:

- Request inputs, model, exact question wording/criteria and ordering, request grouping, repeat identity and concurrency.
- Deterministic parsing, normalization, ranking, threshold operators/equality, tie-breaking, missing/invalid values, defaults, denominators and units.
- Which decisions trigger another request, which reuse existing answers, what is returned, and where external effects begin.

Classify each requested behavior as preserved, explicitly adapted or unsupported. A sample-only replacement, omitted cache, changed UID, reduced dataset or disabled external action belongs in the adaptation record. Completion: every source request and decision has a destination or a stated scope boundary. Use [semantic hazards](references/semantics.md) when translating Python, interpreting answer fields, deriving statistics or retaining metadata.

## Map behavior to the public API

Choose the smallest composition that exposes meaningful application steps:

| Source operation                                 | Flow representation                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Parse, retrieve, format, aggregate, apply policy | `task()` with resolved JSON-compatible inputs and outputs                             |
| Jev assessment with fixed questions              | `jev()` with an ordinary request template                                             |
| Questions/state depend on earlier work           | Runtime `jev()` request factory; asynchronous preparation belongs in a preceding task |
| Finite repeated item program                     | `map()` with explicit bounds and source-compatible concurrency                        |
| State changes until a condition holds            | Bounded `loop()` with a same-type state result                                        |
| Decision returns a value and continues           | `if()` returning expressions from both paths                                          |
| Decision finishes the block                      | `branch()` with terminal outcomes                                                     |
| Independent statically known work                | `parallel()` followed by the documented join                                          |

Definition callbacks build the graph once. Put application effects in runtime tasks or requests, and use the callback's current builder. Keep Jev requests in `jev()` so the supplied client owns execution and capture linkage. Pass outer values through collection/iteration `input`; use returned conditional references for shared continuation. Request factories are synchronous and receive resolved values, not expression objects.

Check supported nesting and the composed node budget before implementing. Read the current map/loop/conditional sections together: per-collection limits do not reset the run's expanded-step budget. Explicitly set concurrency when the source is sequential. For repeated fixed rubrics, one repeat map with explicit question gates can preserve inspection without a nested map. If a required combination is unsupported, describe the smallest faithful alternative and its semantic effect; never silently truncate work or introduce a private runtime API.

Completion: the mapping preserves execution order and yields a valid definition at the requested input bounds. For concrete patterns and their limits, read [implementation examples](references/patterns.md).

## Implement and expose the result

Keep the Flow runtime and credentials on the server. Construct SDK assets inside request factories where needed. Normalize dates, sets and absent values into deliberate JSON representations before task boundaries; keep the source's parsing semantics separate from serialization.

For deterministic demonstrations, execute the real SDK/public Flow path with a local transport that validates the complete request contract before returning authored responses. Label synthetic answers and excluded measurements. Enforce fixed-input/sample-only constraints on the server as well as the UI; an API key or edited case selector must not accidentally enable live execution. For live ports, preserve the caller's authorization and operational limits rather than importing sample restrictions by habit.

Keep full application results separate from redacted/bounded capture previews. Render complete requested results from application data and provide per-request inspection; disclose preview or history retention limits. Diagram titles describe application code and explicit policy, never invented model reasoning. A returned action proposal does not imply the external action occurred.

When adding playground scenarios, trace each new identifier through URL/default selection, case controls, request payload, server validation, transport selection, run dispatch and result rendering. Compare overlapping registrations when several ports land together. Keep companion guidance current and recipe-specific caveats adjacent to their examples.

Completion: a user can run the intended mode, see the full result and inspect the request and selected path, with adaptations visible where they affect interpretation.

## Prove fidelity

Test observable behavior through public Flow execution, using the real SDK boundary when request serialization or response decoding matters. Derive expected values independently from the source, not by calling the same helper twice. A Python oracle or pinned source-generated question digest can catch differences a TypeScript-only test misses.

Choose cases from the contract: threshold equality and neighbors, deliberately opposing confidence/probability values, ordered ties, missing versus empty values, selected and untaken paths, request count/order/concurrency, and actual result arithmetic. For a discovered bug, retain a reproducer that fails before the fix. Cancellation checks distinguish the run's cancellation from transport settlement; verify queued dispatch and downstream work remain stopped after settlement.

For collection UIs, verify the whole expected result and switching between cases/scenarios, not just a success banner. Inspect nested requests, keyboard/mobile behavior and server rejection paths relevant to the change. Follow the target repository's contribution checks and evidence policy; run required verification on unchanged final source and record its revision/hash. Combined integration needs combined-source checks: separate PR passes do not prove the union works.

Completion: report the source-to-port contract, explicit adaptations, exact tested revision, meaningful checks and remaining gaps. Keep external actions within the user's authorization; local verification does not authorize paid inference, publication or deployment.
