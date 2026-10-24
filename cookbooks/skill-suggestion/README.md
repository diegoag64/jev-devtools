# Skill suggestion

A local TypeScript port of the official [TypeSafe skill-suggestion cookbook](https://docs.typesafe.ai/cookbooks/skill_suggestion), using Jev DevTools function steps and runtime requests. **Uses the 0.4.0 flow API.** Run this cookbook from the repository; its application code and fixtures are not bundled in npm.

## Run locally

From the repository root:

```sh
npm install
npm run dev
```

Open [the skill cookbook](http://127.0.0.1:4182/?cookbook=skill-suggestion), choose a synthetic case, and run it. Open **Jev DevTools → Flows** for the connected diagram. Select a function and open **Show details** in the bottom bar to inspect inputs/output, or use each Jev request's question picker to inspect its gate/fit answers. The initial Choice has 182 accessible probabilities, with compact expansion and search.

The three synthetic cases exercise:

- **Suggest:** two calls, with a Choice winner different from the highest-fit candidate.
- **No skill needed:** the request gate fails; the second call and later steps are untaken.
- **Nothing fits:** both calls finish, but the fit gate rejects the shortlist.

These responses are authored demonstrations, **not official cached results or measured model accuracy**. The flow still executes its real sorting, arithmetic, lookup, branching, and request construction through the SDK. Sample context is read-only and unmatched inputs are rejected. The response model explicitly says `synthetic-cookbook-sample`; no tokens, live latency claims, or accuracy comparisons are fabricated.

## What the flow does

1. Ask one Choice over the complete 182-skill roster and three request-gating Nouls.
2. Compute `(acts_on_user_system + would_follow_documented_procedure + (1 - prose_suffices)) / 3` in a function step.
3. Below `0.30`, return no suggestion without a second request.
4. Otherwise take the three highest-ranked skills and load their full descriptions plus the first 700 Unicode characters of their bodies.
5. Construct a second request: a Choice over those three and a `fits::<name>` Noul for each.
6. Compute the maximum fit. Below `0.30`, abstain; otherwise return the **Choice winner**, even when another candidate has a larger fit Noul.
7. Return the official `skill_relevance` hint format. No skill or agent is executed.

The first request's state is `{ request, recent_context: "" }`; the second uses the same shape. Question instructions, thresholds, names, and excerpt rules follow the official `suggest()` algorithm. The source's agent evaluation over 488 requests and its external LLM calls are deliberately outside this local selection demo. This implements the full selection flow, not that benchmark or a Hermes agent integration.

## Live mode

Put your key in the ignored **`apps/playground/.env.local`**, then restart the development server:

```dotenv
TYPESAFE_API_KEY=your-local-key
# Optional: choose a model explicitly if you want to depart from the source pin.
TYPESAFE_COOKBOOK_MODEL=jev-1.12
```

Select **Live**, edit the request, and run it. Live runs make one or two logical Jev requests, with automatic SDK retries disabled in this demo. Cancellation propagates to the SDK; it does not undo already completed calls. Keys remain on the server. The source model `jev-1.12` is the default; if unavailable, configure an available model explicitly. There is no silent model or sample fallback. Live model quality/availability was not verified during implementation.

## Code and reuse

- [flow.ts](flow.ts): Node-only flow factory, exact gates, request builders, and formatting.
- [roster.json](roster.json): official roster reduced to the fields/excerpts actually consumed; 182 records, no omitted candidates.
- [cases.ts](cases.ts): browser-safe case labels and inputs.
- [samples.ts](samples.ts): synthetic SDK transport with input/candidate validation.
- [Playground integration](../../apps/playground/server/plugin.ts): shared inspector, sample/live transport, same-origin routes, cancellation.

For reuse in a Node application with this experimental build:

```ts
import { createSkillSuggestionFlow } from "./cookbooks/skill-suggestion/flow.js";

const suggest = createSkillSuggestionFlow("jev-1.12");
// client must be created by the same inspector to link full request captures.
const result = await suggest.run(
  { message: "Your request" },
  { client, devtools: inspector, signal },
);
```

The cookbook uses public `jev-devtools/flow` and SDK exports. `reranked.answers` is a typed reference to the complete answer map, allowing a task to read fit questions whose names were generated at runtime. `answer("known-name")` remains available for individually typed references.

## Provenance and attribution

The roster is pinned to [TypeSafe's public examples](https://github.com/typesafe-ai/typesafe-public-examples/blob/25e9d373f4853b3e7e300e55a194f50e54838f68/cookbooks/skill_suggestion/hermes_roster.json). [provenance.json](provenance.json) records its source hash, local hash, and transformation. Only the five consumed fields are kept, and bodies are truncated at the same 700-code-point boundary as the recipe. Original roster order is preserved. The upstream docs describe this as a pinned Hermes snapshot; we pin the supplied snapshot rather than claiming an independently verified Hermes revision.

See [TypeSafe's MIT notice](LICENSE.typesafe) and [Nous Research's MIT notice](LICENSE.hermes). Embedded skill text is data for assessment, not instructions executed by this app. The gallery is a community adaptation, not an official TypeSafe product or an endorsement of its synthetic outcomes.
