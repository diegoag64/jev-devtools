# LLM guardrails

Explore [this cookbook in the playground](https://playground.jevtools.dev/?cookbook=guardrails) with source, diagrams, and a step-by-step guide. No installation is needed. For the result dashboards and drawer controls described below, use [Request lab](https://playground.jevtools.dev/?cookbook=guardrails&legacy=1).

A TypeScript adaptation of the official [Guardrails for LLMs recipe](https://docs.typesafe.ai/cookbooks/llm_guardrails), using public `jev-devtools/flow` methods available since 0.4.0. The application and fixtures run from this repository; they are not shipped in npm.

## Explore the cookbook

Open [the guardrails sample](https://playground.jevtools.dev/?cookbook=guardrails&legacy=1). Select a case and click **Run sample**. No key is required. Context is read-only and the server rejects an edited message or unknown case. Live mode is disabled for this cookbook even if a server key exists.

Each run screens **one selected side**, input or output, in a single SDK request. Output messages are authored fixtures, not LLM-generated replies. This is the source's individual `screen()`/`guard()` pattern, not an end-to-end generation pipeline. Cases cover ordinary input, output refusal, differing policies, exact review/action boundaries, a severity upgrade, high severity without a triggered hazard, and overlapping hazards.

Open **Jev DevTools → Flows** to inspect the battery, assessment-reading task, strict policy, permissive reapplication, and terminal strict route. Select the request to inspect each Noul and the severity Score. Select a function and open **Show details** to inspect its actual inputs and output. The result's policy buttons switch between already-computed decisions without another request; the diagram continues to show the default strict route.

## Fidelity and boundaries

- [batteries.json](batteries.json) preserves the exact source input/output instructions, explicit Noul true/false criteria, and shared four-level severity rubric. Input uses `jailbreak`; output uses `broke_policy`. All five questions share one request with the message as its string state and the source model pin `jev-1.12`.
- [flow.ts](flow.ts) reads the assessment, applies the source routing arithmetic in real `task()` steps, reapplies policy to the same values, and branches to a returned action. Strict uses action **≥ 0.70**; permissive uses **≥ 0.85**. Both use review **≥ 0.35** and severity **≥ 2**.
- High-probability jailbreak, policy-breaking and harmful-request hazards block; medical advice reviews; self-harm routes to support. Severity upgrades **only triggered review actions** to block. High severity alone passes. The highest-precedence action wins: **support > block > review > pass**, regardless of hazard iteration order.
- Noul is an independent hazard probability; the values need not sum to one. Severity is a Score on the written 0–3 scale, not a probability or Choice confidence. No Choice question is used.
- [samples.ts](samples.ts) supplies authored synthetic answers through the real SDK and flow executor. These are not official cached assessments, measured quality, or a prediction for these messages. Delays only make progress visible. Responses contain no invented usage, confidence, savings or model timings.
- No LLM, review system or support service is called. Outcomes are application data. The source's persistent JSON response cache and full published message collection are not reproduced; policy reuse happens within the current run. A new run makes a new synthetic assessment request.

## Provenance and verification

[provenance.json](provenance.json) records the retrieved recipe hash, pinned upstream asset revision, inspected message asset hashes and normalized question hash. The recipe's executable Python was inspected along with upstream `prompts.txt` and `replies.txt`. Local messages replace those assets; neither the upstream jailbreak dataset nor official output measurements are redistributed. TypeSafe-derived questions and routing retain the [MIT notice](LICENSE.typesafe).

The focused tests in [guardrails.test.ts](../../apps/playground/tests/guardrails.test.ts) execute the public flow, pin the question wording, assert one request and its battery/state/model, cover threshold equality and neighboring values, overlapping precedence and severity-only behavior, and reject mismatched fixture inputs. `npm run verify:cookbooks -- --only guardrails` checks policy switching without network dispatch, all sample cases, server rejection, request inspection, the connected diagram and mobile layout. It starts/stops its own server on port 4182 and saves screenshots/video under ignored `benchmarks/results/cookbook-browser/`. The runner owns the shared browser lock and a unique evidence directory. Run the repository's full verification before contributing changes.
