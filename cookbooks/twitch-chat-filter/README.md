# Twitch chat filter · finite sample feed

Explore [this cookbook in the playground](https://playground.jevtools.dev/?cookbook=twitch-chat-filter) with source, diagrams, and a step-by-step guide. No installation is needed. For the result dashboards and drawer controls described below, use [Request lab](https://playground.jevtools.dev/?cookbook=twitch-chat-filter&legacy=1).

A TypeScript adaptation of the [official Twitch chat filter](https://docs.typesafe.ai/cookbooks/twitch_chat_filter), using public `jev-devtools/flow` methods. Open [the cookbook](https://playground.jevtools.dev/?cookbook=twitch-chat-filter&legacy=1). Select a **Sample** and **Run sample**. No key is needed; live inference is disabled server-side.

## Explore the policy

The original case retains all **29 source messages in their original order**, plus the original stream title and game. Its answers are authored synthetic fixtures, not the published cache. The boundary case has nine separately labeled authored messages covering probabilities just below, at and above 0.70 and overlapping rules.

Each message makes **one request with three questions**: a five-category Choice, a toxic Noul and a spoiler Noul. `flow.map()` allows **eight concurrent requests** and returns results in input order even when completion order differs. `task()` loads the finite feed, reads answers, looks up rules, reapplies the quiet policy and assembles the result. Nested `if()` steps expose the normal policy in order:

1. Toxic Noul **≥ 0.70** → hide (toxic).
2. Category action is hide → hide (category).
3. Spoiler Noul **≥ 0.70** → blur (spoiler).
4. Otherwise apply the category action.

Normal rules highlight questions, show hype and conversation, and hide backseat advice and spam. **Quiet policy** hides hype and dims conversation, preserving the same precedence. Both policies reuse the classified answers; toggling the result view adds **zero requests**. The normal synthetic feed yields 14 show, 6 highlight, 7 hide and 2 blur; quiet changes 14 of those messages. These counts describe this authored fixture, not measured moderation quality.

The chat preview replaces hidden text with its reason and spoiler text with a placeholder. Explicit **Inspect message … and synthetic answers** disclosures reveal source text for debugging, all category probabilities, API confidence and both Nouls. Category Choice confidence is a distinct synthetic field (0.31), separate from the selected category probability (0.80). Neither drives routing. This recipe has no Score questions or confidence fallback.

Open **Jev DevTools → Flows**, select the run, choose a message in **Filter messages · eight at a time**, and click **View Flow**. Inspect its complete three-question Jev request, ordered conditions, chosen action, and quiet-policy function. Request/capture durations in DevTools are local sample execution times, not model benchmarks. Cancel stops queued work through the public flow runner.

## Fidelity and adaptations

`chat.json` preserves the source feed and stream verbatim. `recipe.ts` preserves all question instructions and criteria, rule mappings, threshold operators and precedence. The Python `ThreadPoolExecutor.map(max_workers=8)` becomes a finite `flow.map()` with concurrency eight and maxItems 29. SDK responses pass through the real TypeSafe client and the public flow execution API.

The source's three exploratory `show()` calls and disk cache are omitted; a run always classifies each feed message once, then derives both views from those answers. The upstream cache was reviewed for semantics but is not replayed or shipped. Model request metadata retains `jev-1.13.0`; response metadata explicitly says `synthetic-twitch-sample`. Synthetic answers carry no usage or provider timing. Delays only expose local concurrent progress.

Fixed cases and exact request matching are enforced on the server. Edited messages, stream context, model or question sets receive no unrelated fixture. Adding an API key does not enable live mode. Ongoing Twitch ingestion, browser extensions, moderation side effects, rate-limit/cache integration, progress-aware spoilers and language/quality evaluation are outside this finite port. Source text is untrusted data, not an instruction to the application.

`provenance.json` records source hashes and the reviewed cache blob; `LICENSE.typesafe` retains the upstream MIT notice. Focused tests in `apps/playground/tests/twitch-chat-filter.test.ts` protect the original feed, request count/shape/order, eight-call bound, out-of-order completion, inclusive threshold routing, quiet reuse, invalid-input rejection and cancellation. The cookbook and fixtures run from this repository; they are not shipped as npm APIs.
