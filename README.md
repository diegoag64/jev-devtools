<div align="center">

# Jev DevTools

**Build Jev flows in code. See how they run.**

A React inspector for TypeSafe Jev.<br />
Explore requests, returned probabilities, and the paths your application takes.<br />
Works with React and Next.js App Router.

[![npm version 0.4.1](https://img.shields.io/badge/npm-v0.4.1-E551BA?labelColor=0D0A0F&logo=npm)](https://www.npmjs.com/package/jev-devtools/v/0.4.1)
[![CI](https://github.com/diegoag64/jev-devtools/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/diegoag64/jev-devtools/actions/workflows/ci.yml)
[![React 18 / 19](https://img.shields.io/badge/React-18%20%2F%2019-61DAFB?logo=react&logoColor=61DAFB&labelColor=0D0A0F)](#add-to-your-app)
[![Next.js App Router](https://img.shields.io/badge/Next.js-App%20Router-white?logo=nextdotjs&labelColor=0D0A0F)](docs/nextjs.md)
[![MIT license](https://img.shields.io/badge/License-MIT-E551BA?labelColor=0D0A0F)](LICENSE)
[![Status: experimental](https://img.shields.io/badge/Status-experimental-E551BA?labelColor=0D0A0F)](#add-to-your-app)

[Demo](#see-it-in-motion) · [React](#react--node) · [Next.js](#nextjs-app-router) · [Flow API](#define-and-visualize-connected-flows-with-jev-devtoolsflow) · [Cookbooks](cookbooks/README.md) · [Docs](#documentation) · [Changelog](CHANGELOG.md)

</div>

## See it in motion

![Full 28-second Jev DevTools demo showing sample results, the request drawer, inspection tabs, and animated diagrams.](docs/assets/jev-devtools-preview.gif)

<p align="center">
  <sub>The complete 28-second sample demo plays above and loops automatically.</sub>
</p>

<a id="install-in-another-react-app"></a>

## Add to your app

Mount the React drawer, connect a server adapter, and make Jev calls through its client. Open **Jev DevTools** in your app to inspect the captured requests. You can add connected flows whenever you need to follow work across multiple calls.

```sh
npm install jev-devtools @typesafe-ai/sdk
```

Requires React **18/19** and Node **22.12+**. **[Jev DevTools 0.4.1 is available on npm](https://www.npmjs.com/package/jev-devtools/v/0.4.1).** APIs remain experimental before 1.0. See the [release status](CHANGELOG.md#041--october-24-2026-experimental). Your API key stays on the server. Capture and display are opt-in and disabled by default.

### React + Node

Mount once near your app's root. The drawer loads its own styles; no CSS import is needed. This example uses Vite's development flag:

```tsx
import { JevDevtools } from 'jev-devtools';
import { App } from './App';

export function Root() {
  return (
    <>
      <App />
      <JevDevtools enabled={import.meta.env.DEV} />
    </>
  );
}
```

In your existing Express/Connect server, create a shared adapter and client:

```ts
import { createJevDevtools } from 'jev-devtools/server';

export const inspector = createJevDevtools({
  enabled: process.env.NODE_ENV === 'development',
  origin: 'http://localhost:5173', // The URL you open in the browser.
});
export const jev = inspector.createClient({
  apiKey: process.env.TYPESAFE_API_KEY,
});

app.use(inspector.middleware); // Before fallback routes.
// Use this jev client in your handlers: await jev.systemOne(...).
// Call inspector.dispose() when the server shuts down.
```

Serve the inspector at the browser's origin. If Vite and your backend use different ports, proxy `/api/jev-devtools` to the backend. Your handlers and inspector routes must use the same adapter instance. Bind a local development server to `127.0.0.1`; see the integration guide for authorization in shared environments.

[React / Node integration and proxy setup](docs/integration.md) · [Independent Vite example](examples/react-vite)

### Next.js App Router

Use one shared server adapter for calls from Route Handlers, Server Actions, and Server Components. Mount the drawer in your root layout so it stays available as you navigate.

<details>
<summary><strong>Show the Next.js setup</strong></summary>

Install the server boundary helper:

```sh
npm install server-only
```

Merge the SDK setting into your existing configuration:

```js
// next.config.mjs
export default {
  serverExternalPackages: ['@typesafe-ai/sdk'],
};
```

Create a shared server module. Keep the API key in your server environment as `TYPESAFE_API_KEY`:

```ts
// server/jev.ts
import 'server-only';
import { getJevDevtools } from 'jev-devtools/server';

export const inspector = getJevDevtools('my-next-app', () => ({
  enabled: process.env.NODE_ENV === 'development',
  origin: 'http://127.0.0.1:3000',
}));
export const jev = inspector.createClient({
  apiKey: process.env.TYPESAFE_API_KEY,
});
```

Expose the inspector with an optional catch-all route:

```ts
// app/api/jev-devtools/[[...path]]/route.ts
import { inspector } from '../../../../server/jev';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = (request: Request) => inspector.handleNodeRoute(request);
export const DELETE = (request: Request) => inspector.handleNodeRoute(request);
```

Add a client component:

```tsx
// app/devtools.tsx
'use client';
import { JevDevtools } from 'jev-devtools';

export function Devtools() {
  return <JevDevtools enabled={process.env.NODE_ENV === 'development'} />;
}
```

Mount it in your existing root layout. The drawer supplies its own styles; keep your application's styles as usual:

```tsx
// app/layout.tsx
import type { ReactNode } from 'react';
import { Devtools } from './devtools';

export const runtime = 'nodejs';
export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}<Devtools /></body></html>;
}
```

Import `jev` from the shared server module wherever you call `jev.systemOne(...)`. If you use a `src/` directory, put both `app/` and `server/` beneath it. Run `next dev --hostname 127.0.0.1` and open `http://127.0.0.1:3000` to match the configured origin. Restart after changing adapter options.

The adapter targets Node and stores history in one process. Edge runtimes and distributed/serverless aggregation are unsupported. Externalize only the SDK; keep `jev-devtools` bundled so the drawer uses your app's React instance.

</details>

[Complete Next.js guide](docs/nextjs.md) · [Runnable Next.js example](examples/nextjs-app)

<a id="connected-jev-flows"></a>

## Define and visualize connected flows with `jev-devtools/flow`

A single request shows what Jev returned. A connected flow shows how those values feed later steps and select an outcome. Define your requests and routing rules with `jev-devtools/flow`; the drawer connects their full diagrams on one canvas.

This server-side example runs two checks in parallel, waits for both, and applies an explicit review policy. Reuse `jev` and `inspector` from your server setup:

```ts
import { noul } from '@typesafe-ai/sdk';
import { all, defineJevFlow } from 'jev-devtools/flow';

const review = defineJevFlow<{ message: string }>('review', (flow) => {
  const checks = flow.parallel('checks', {
    complete: (lane) => lane.jev('completeness', {
      state: flow.input,
      questions: {
        complete: noul('Does this request include enough detail to review?'),
      },
    }, { title: 'Check completeness' }).answer('complete').noul,

    urgent: (lane) => lane.jev('urgency', {
      state: flow.input,
      questions: {
        urgent: noul('Does this request require urgent attention?'),
      },
    }, { title: 'Check urgency' }).answer('urgent').noul,
  }, { title: 'Wait for both checks' });

  return flow.branch('route', {
    // Example policy: complete and non-urgent requests use standard review.
    when: all(checks.complete.gte(0.9), checks.urgent.lt(0.2)),
    then: (path) => path.output('standard-review'),
    else: (path) => path.output('manual-review'),
  }, { title: 'Choose a review path' });
});

const result = await review.run(
  { message: 'Please review the attached proposal.' },
  { client: jev, devtools: inspector },
);
// result.outcome is 'standard-review' or 'manual-review'.
// Your application handles the outcome; this example only returns it.
```

Open **Jev DevTools → Flows** to follow the run:

- **See parallel work together.** Inspect each check and the join that waits for both.
- **Understand the selected path.** Condition cards show the captured values and the thresholds you defined; untaken paths remain visible.
- **Inspect each request in context.** Explore questions, probabilities, and returned values within the surrounding flow.

Define once in a Node module and run per request. Typed answer references can feed later requests, conditions, and outputs. Step titles and descriptions explain your application's policy. Runs support SDK retries and cancellation, with bounded in-memory history; they do not provide durable workflow execution. Existing request capture works without adopting the flow API.

**New in 0.4.0:** server function steps (`task`), runtime request factories, bounded collections (`map`), conditional paths that rejoin (`if`), and stateful iteration (`loop`). Combine them with sequential requests, parallel lanes, terminal branches, and named outcomes to inspect complex flows such as passage assessment and hierarchical classification. Numeric conditions also support strict greater-than with `.gt()`.

[Full flow API guide](docs/flows.md) · [Flow recipe for coding agents](packages/jev-devtools/skills/setup-jev-devtools/references/flows.md) · [Release availability](CHANGELOG.md)

## What you can inspect

| View | What it shows |
| --- | --- |
| **Connected flows** | Requests, dependencies, parallel checks, evaluated conditions, and named outcomes. |
| **Questions and answers** | Choice probability bars, Score values, Noul probabilities, and Box regions. |
| **Context** | The captured inputs sent with each request, with expandable structured values. |
| **Request history** | Searchable calls with Flow, Questions, Context, Transport, and Raw views. |
| **Transport** | Attempts, retries, errors, and cancellation alongside the logical request. |

Diagrams show captured inputs, responses, and routing rules you explicitly define. They do not expose hidden model reasoning or infer policies from unrelated application code. Only calls through the instrumented client are captured; the drawer receives updates over same-origin SSE. Styles are scoped, and the library does not require Tailwind or shadcn.

## Explore cookbook examples

Cookbooks are small, runnable adaptations of official TypeSafe recipes that show how requests and application logic fit into inspectable flows. Explore passage classification, skill selection, structured extraction, memory, and more using labeled sample responses. The six examples use the 0.4.0 flow API and run from this repository without an API key; cookbook application code and fixtures are not bundled in npm.

[Browse the cookbooks and run an example →](cookbooks/README.md)

## Set up with your coding agent

After installing, paste this into your coding agent while it has your app open:

```text
Set up jev-devtools in this app. Read
node_modules/jev-devtools/skills/setup-jev-devtools/SKILL.md
and follow the React/Node or Next.js recipe. Wire server capture and the root
drawer, then verify with a labeled sample request. Preserve existing behavior.
For connected flows, also read references/flows.md and preserve my routing rules.
```

The [setup skill](packages/jev-devtools/skills/setup-jev-devtools/SKILL.md) ships with the package, including framework recipes and sample verification. Use the package directory visible to your app for version-matched guidance. Tools that support installed skills can copy the whole `setup-jev-devtools` folder, including `references/`; npm does not register it automatically. [llms.txt](llms.txt) indexes the documentation.

<a id="run-the-playground"></a>

## Try the local playground

Explore labeled samples before integrating into your own app:

```sh
git clone https://github.com/diegoag64/jev-devtools.git
cd jev-devtools
npm ci
npm run dev
```

Open [the playground](http://127.0.0.1:4182/), run a scenario, and open **Jev DevTools**. Sample mode needs no API key and makes no inference calls. The [playground guide](apps/playground/README.md) covers scenarios, the edge-case sandbox, and optional live mode.

<details>
<summary>Install a packed checkout in your own app</summary>

Pack the local checkout, then install the archive in your app:

```sh
# In this repository:
npm run pack:devtools

# In your React application:
npm install /absolute/path/to/jev-devtools/jev-devtools-0.4.1.tgz
```

The archive contains the code and bundled setup skill from your checkout. Use it to try local changes before a future release. Keep the drawer and server adapter on the same build.

</details>

## Documentation

[Integration and configuration](docs/integration.md) · [Next.js](docs/nextjs.md) · [Flow API](docs/flows.md) · [Cookbooks](cookbooks/README.md) · [Changelog](CHANGELOG.md)

For repository setup, layout, and verification, see [Contributing](CONTRIBUTING.md). Changes use feature branches and PRs; merging, publishing, and deployment require explicit authorization. [Architecture](docs/architecture.md) · [Release process](docs/releases.md)

## Credits & license

Inspired by the TanStack Query DevTools workflow, with a custom drawer and TanStack Virtual for the Questions list. The TanStack DevTools shell is not included.

Diagram styling is rooted in [Cathryn Lavery's diagram-design](https://github.com/cathrynlavery/diagram-design). TypeSafe branding belongs to its respective owner.

MIT for project code; see [LICENSE](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.txt) for design provenance and branding.

<div align="center">

**Have a Jev flow you'd love to inspect?**<br />
[Open an issue](https://github.com/diegoag64/jev-devtools/issues) · [Contribute a PR](CONTRIBUTING.md)

</div>
