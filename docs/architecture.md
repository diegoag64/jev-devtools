# Architecture

The package has four public entry points: the SSR-safe React component (`jev-devtools`), scoped CSS (`jev-devtools/styles.css`), a Node server adapter (`jev-devtools/server`), and the server-only flow API (`jev-devtools/flow`). Browser-safe trace types are exported from the React entry. Server modules and the TypeSafe SDK must never enter the browser bundle.

`createJevDevtools()` owns a bounded in-memory recorder. Its `createClient()` instruments the SDK's `systemOne` calls while preserving APIPromise behavior. AsyncLocalStorage links retries to the logical call. The adapter exposes configuration, SSE snapshots, and scoped clearing; the React drawer handles subscriptions and displays diagrams. There is no network interception or hidden-model reasoning capture.

`apps/playground` uses only package exports. Its custom fetch fixtures pass through the real SDK. It owns ticket-routing thresholds, scenario inputs, shadcn controls, and application result previews. These are not inspector policies or package dependencies.

`getJevDevtools(key, createOptions)` shares an adapter in a versioned global registry within one Node realm. Its first configuration remains active across module reloads; disposal removes the key. It does not aggregate across processes.

`examples/nextjs-app` uses the packed library through App Router routes, Server Actions, and Server Components. `verify:nextjs` checks real framework routing, shared traces, reload retention, SSE, and disabled production endpoints.

`examples/react-vite` installs a packed tarball. The verification script copies it outside the workspace so it cannot accidentally resolve internal source or hoisted dependencies. CI checks React 18 and 19 and Node 22.12 and 24. The regular build intentionally creates a local-only notice; a separate check compiles the full development UI.

## Connected flows

`defineJevFlow()` builds a bounded graph once; each `run()` executes an independent instance in the Node process. Version 0.4.0 supports Jev requests, server function tasks, runtime request factories, parallel lanes, terminal branches, value-returning conditionals, collections, and stateful loops. A shared inspector links each Jev step to its full request capture. Task data, collection items, and iteration state use bounded/redacted snapshots; runtime values remain independent of capture limits.

Definitions and runs are separate version-1 records streamed over `/flows/events`. The 0.4.0 drawer understands task, collection, merge, and loop records; keep the server and drawer on the same build. Definitions are limited to 256 nodes including templates and 16 nested blocks, while a run shares a 1,024-expanded-step budget. Execution is in-process with cooperative cancellation, without durable state, resume, or automatic task retries. See the [flow guide](flows.md) for scope and nesting constraints.

## Provenance

The animated diagrams use the visual style developed in [Diagram Motion Lab](https://github.com/diegoag64/diagram-motion-lab). This repository owns the reusable DevTools library and its sample playground. See [third-party notices](../THIRD_PARTY_NOTICES.txt) for design attribution and branding.

## Limits

One Node process/adapter instance, same-origin browser endpoint, memory-only traces, and explicit opt-in. Non-loopback access requires application authorization. Distributed workers, serverless aggregation, edge runtimes, persistent traces, and automatic discovery of arbitrary SDK clients are outside this prototype. Live inference and browser visual QA must be reported separately from sample and SSR checks.

## Isolated UI and diagram camera

The client drawer portals into an open ShadowRoot on a `jev-devtools-root` host. Its root resets inherited typography and layout, while shadow encapsulation keeps host selectors out of internal cards, headers, and controls. `copy-styles.mjs` emits the embedded stylesheet from the same CSS source as the public stylesheet export. Existing stylesheet imports remain compatible. The host and listeners are removed on unmount, including React Strict Mode cleanup.

The diagram camera uses pointer capture and animation-frame transform updates rather than a scrollable scaled container. Wheel zoom preserves the diagram coordinate beneath the pointer, two-finger pinch also follows its moving midpoint, and Fit considers both viewport dimensions. ResizeObserver refits a fitted view or keeps a manually positioned view centered when the drawer changes size. Camera geometry tests cover full-content fitting, anchored/clamped zoom, and moving pinch.
