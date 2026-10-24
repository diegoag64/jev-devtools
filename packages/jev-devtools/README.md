# Jev DevTools

[![npm version 0.4.1](https://img.shields.io/badge/npm-v0.4.1-E551BA?labelColor=0D0A0F&logo=npm)](https://www.npmjs.com/package/jev-devtools/v/0.4.1)

A React drawer and Node adapter for inspecting TypeSafe Jev requests with animated diagrams. Includes request history, context, questions, typed answers, transport attempts, and raw snapshots.

**[0.4.1 is available on npm](https://www.npmjs.com/package/jev-devtools/v/0.4.1).** **Experimental (pre-1.0).** React 18/19 and Node 22.12+ are supported. APIs may change before 1.0. Verification uses sample responses through the real TypeSafe SDK, not live inference.

[Changelog and release history](https://github.com/diegoag64/jev-devtools/blob/main/CHANGELOG.md) — published versions and unreleased work.

## Demo

![Full 28-second Jev DevTools demo showing sample results, the request drawer, and animated diagrams.](https://raw.githubusercontent.com/diegoag64/jev-devtools/main/docs/assets/jev-devtools-preview.gif)

The full sample recording loops above.

## Set up with your coding agent

In your application's coding-agent chat, paste:

```text
Set up jev-devtools in this React app. Read and follow:
https://raw.githubusercontent.com/diegoag64/jev-devtools/main/packages/jev-devtools/skills/setup-jev-devtools/SKILL.md
Choose the recipe for this app's framework, wire the server capture and root
drawer, and verify with a labeled sample request. Preserve existing app behavior.
```

After installing, the version-matched instructions are available locally at `node_modules/jev-devtools/skills/setup-jev-devtools/SKILL.md` with all references included. In a workspace, read the package installed for the consuming app. Agents can follow these files without web access. Tools with skill support can install/copy the entire `setup-jev-devtools` folder into their supported skills location; npm does not register it automatically.

The [setup skill](https://github.com/diegoag64/jev-devtools/blob/main/packages/jev-devtools/skills/setup-jev-devtools/SKILL.md) covers React/Node/Vite and Next.js App Router, with no-key sample verification and troubleshooting. A Node backend is required for live calls; browser-only apps can use a local Vite sample server. [Agent documentation index](https://raw.githubusercontent.com/diegoag64/jev-devtools/main/llms.txt).

## Install

Install from npm:

```sh
npm install jev-devtools @typesafe-ai/sdk
```

To try local changes before a future release:

```sh
# From the jev-devtools repository root:
npm ci
npm run pack:devtools
# From the consuming app:
npm install /absolute/path/to/jev-devtools-0.4.1.tgz
```

Mount once. The drawer loads its own styles; no CSS import is needed:

```tsx
import { JevDevtools } from 'jev-devtools';

<JevDevtools enabled={import.meta.env.DEV} defaultOpen={false} />
```

Create one shared Node adapter and instrumented client:

```ts
import { createJevDevtools } from 'jev-devtools/server';

const inspector = createJevDevtools({
  enabled: process.env.NODE_ENV === 'development',
  origin: 'http://localhost:3000',
});
const jev = inspector.createClient({ apiKey: process.env.TYPESAFE_API_KEY });
app.use(inspector.middleware); // Mount at root, before fallback handlers.
// Call jev.systemOne(...) in your application's handlers.
// Call inspector.dispose() on shutdown.
```

Only calls through that client are captured. The React component subscribes via same-origin SSE, receiving an initial snapshot followed by changed traces. Older client/server combinations remain compatible through full snapshots. Both sides default to disabled. API keys remain server-side. Browser code is SSR-safe. The drawer uses a Shadow DOM boundary and its own stylesheet so host page selectors cannot alter its internal layout. Existing stylesheet imports remain supported; no Tailwind or shadcn installation is required. Drag the Flow canvas to pan, scroll/pinch to zoom, or use Fit.

History is bounded to 50 calls in memory by default. API routes and inspector endpoints must share an adapter instance; distributed processes and edge runtimes are not supported. Without `authorize`, the middleware accepts only loopback connections; Web Request handlers can't see the connection's address, so run those servers on `127.0.0.1`. Captures include bounded/redacted context and answers, not hidden model reasoning.

Known credential fields are always redacted from DevTools captures; SDK and runtime data remain unchanged. The optional `<JevDevtools redactAdditionalSensitiveData={false} />` prop controls **display-only** masking of supported email, phone, postal address, SSN and card-number fields. It defaults to `true` and updates existing views immediately. These additional values still exist in capture/stream/browser memory while masked. Custom server redaction remains active, and neither credentials nor custom-redacted values can be revealed. Headers/options are not captured. See the [exact policy and limitations](https://github.com/diegoag64/jev-devtools/blob/main/docs/integration.md#redaction-policy); arbitrary secrets in prose and unusual field names still need application-specific redaction.

For Next.js App Router, use `getJevDevtools(appKey, optionsFactory)` from `/server` to share an adapter across server reloads, expose `handleNodeRoute` through an optional catch-all Route Handler, and mount the root component in a client boundary. See the [Next.js guide](https://github.com/diegoag64/jev-devtools/blob/main/docs/nextjs.md) and runnable example. No Next dependency is required by this package.

[Full integration guide](https://github.com/diegoag64/jev-devtools/blob/main/docs/integration.md) · [Repository and playground](https://github.com/diegoag64/jev-devtools)

MIT for project code. See bundled LICENSE and THIRD_PARTY_NOTICES.txt for original design attribution and TypeSafe branding.

## Connected Jev flows with `jev-devtools/flow`

Define calls, conditions, parallel checks, and named outcomes with `jev-devtools/flow`. **0.4.0 adds** server function steps (`task`), runtime request factories, bounded collections (`map`), returning conditionals (`if`), stateful iteration (`loop`), and strict numeric `.gt()` comparisons. The drawer connects request diagrams, function results, selected paths, collection items, and loop iterations on one canvas. Existing single-request integrations remain supported.

On the server, reuse the instrumented `jev` client and `inspector` from the setup above:

```ts
import { defineJevFlow } from 'jev-devtools/flow';

const review = defineJevFlow<{ message: string }>('review', (flow) => {
  const decision = flow.jev('readiness', {
    state: flow.input,
    questions: { ready: { type: 'noul', instructions: 'Is this ready for review?' } },
  }, { title: 'Assess readiness' });

  return flow.branch('route', {
    when: decision.answer('ready').noul.gte(0.9), // Your application's policy.
    then: (path) => path.output('ready', { probability: decision.answer('ready').noul }, {
      title: 'Ready for review', description: 'Return readiness to the application.',
    }),
    else: (path) => path.output('manual-review', undefined, { title: 'Needs manual review' }),
  }, { title: 'Require at least 90% readiness' });
});

const result = await review.run({ message: 'Please review my ticket.' }, {
  client: jev,
  devtools: inspector,
});
// Handle result.outcome in your app. The flow does not execute business actions.
```

Define once in a Node module and run per request. Use `flow.parallel` for concurrent named lanes; downstream calls wait for every lane to succeed. `flow.branch` is terminal in its block; use `flow.if` when selected values feed shared downstream work. Tasks execute application code on Node with JSON-compatible inputs/results; maps and loops have explicit bounds. Runs have SDK retries and cooperative cancellation, with bounded in-memory inspector history. They do not provide durable or distributed execution. Keep the 0.4.0 server and drawer together to inspect its new step kinds.

[Full flow guide](https://github.com/diegoag64/jev-devtools/blob/main/docs/flows.md) · [AI flow recipe](https://github.com/diegoag64/jev-devtools/blob/main/packages/jev-devtools/skills/setup-jev-devtools/references/flows.md)

To have your coding agent add a flow after installation:

```text
Read node_modules/jev-devtools/skills/setup-jev-devtools/SKILL.md and references/flows.md.
Build a flow for the scenario I describe using the shared server client/inspector.
Preserve my routing policies, add clear step titles/descriptions, and verify with
labeled samples before using live inference. Ask for any missing decision rules.
```
