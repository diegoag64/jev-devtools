# Jev DevTools integration

A reusable React inspector with one root component and a Node server adapter. It uses Diagram Motion Lab's rounded outline cards, curved connections, pink flowing dots, and probability bars. The drawer contains searchable request history and Flow, Questions, Context, Transport, and Raw views.

This guide covers **[Jev DevTools 0.4.1](https://www.npmjs.com/package/jev-devtools/v/0.4.1)**, an experimental pre-1.0 package available on npm. See the [release notes](../CHANGELOG.md#041--october-24-2026-experimental). Verified with sample responses through the real TypeSafe SDK; no live inference was used for verification.

## Install in another React project

Requires React 18 or 19. Use Node 22.12+ for the repository tooling (verified on 24.19). The server adapter requires a Node runtime, not an edge runtime.

Install from npm:

```sh
npm install jev-devtools @typesafe-ai/sdk
```

To try local changes before a future release, build an archive from this repository:

```sh
npm ci
npm run pack:devtools
```

From your React project, install the generated archive:

```sh
npm install /absolute/path/to/jev-devtools/jev-devtools-0.4.1.tgz
```

Mount once near the root. The drawer loads its own styles; no CSS import, provider, client object, trace props, or application hook is needed:

```tsx
import { JevDevtools } from 'jev-devtools';

export function Root() {
  return <>
    <App />
    <JevDevtools enabled={import.meta.env.DEV} />
  </>;
}
```

For the complete Next.js App Router setup, see [the Next.js guide](nextjs.md), including `getJevDevtools` for shared history across module reloads and the SDK externalization setting. Mount it in a client component and use `enabled={process.env.NODE_ENV === 'development'}`. The drawer and launcher render inside a `jev-devtools-root` Shadow DOM boundary with their own stylesheet and typography reset. Host rules such as `section`, `button`, or `.eyebrow` cannot style the inspector's internals. The package injects its built CSS into that boundary; existing `jev-devtools/styles.css` imports remain supported, but are not required to style the drawer. Page CSS overrides cannot reach inside the shadow tree. Server rendering produces no inspector markup, and browser code is loaded after mounting when enabled. `enabled` defaults to **false**. Disabled components open no connections. This is a runtime opt-in, not a guarantee that every bundler removes inspector assets from production output.

| Prop | Default | Purpose |
| --- | --- | --- |
| `enabled` | `false` | Explicitly enable the inspector |
| `endpoint` | `/api/jev-devtools` | Same-origin path to the server adapter |
| `defaultOpen` | `true` | Start expanded or as the small Jev launcher |

### CSS isolation

The component portals its host directly under `document.body`, even when mounted
inside a React `<main>` or `<section>`. Global page selectors such as `section`,
`main > *`, and `button` cannot reach the shadow tree, so no page-specific padding
override is needed. The drawer supplies its own styles and resets inherited
typography. No CSS import is needed to use the component.

**Unreleased:** the public stylesheet also scopes connected-flow selectors to
`.jev-devtools` and namespaces their animation, preventing collisions with host
classes such as `.flow-step`. The drawer suppresses host pseudo-element
decorations, explicitly resets text direction, and establishes defaults for its
internal CSS variables. The host reset lives in the shadow stylesheet, leaving
`<jev-devtools-root>` free of inline reset declarations. Generic app theme
variables do not control its hint colors.
These changes preserve the component API and existing CSS imports.

This is CSS encapsulation, not a separate browser document or a security boundary.
Page JavaScript can still alter the open shadow tree or remove its host, and
transforms, filters, or clipping on `html`/`body` can affect a fixed overlay. Avoid
those styles on the document ancestors; apply app effects to an app wrapper instead.

## Server setup

Create one adapter and one instrumented client per server process. Replace your existing TypeSafe client construction with `inspector.createClient(...)`; continue calling `jev.systemOne(...)` normally. API keys stay on the server.

```ts
import { createJevDevtools } from 'jev-devtools/server';

export const inspector = createJevDevtools({
  enabled: process.env.NODE_ENV === 'development',
  origin: 'http://localhost:3000', // exact browser origin, including port
  redact: (path, value) => path.at(-1) === 'email' ? '[redacted]' : value,
});

export const jev = inspector.createClient({
  apiKey: process.env.TYPESAFE_API_KEY,
});
```

For Express, Connect, or Vite's development server, mount the middleware at the application root, before any fallback route. It delegates unrelated paths:

```ts
app.use(inspector.middleware);
// Your existing application handlers call jev.systemOne(...).
// On server shutdown: inspector.dispose();
```

For Node frameworks with Web Request/Response handlers, route the endpoint **and its subpaths** to the same adapter instance:

```ts
// Next.js: app/api/jev-devtools/[[...path]]/route.ts
import { inspector } from '@/server/jev';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = (request: Request) => inspector.handleNodeRoute(request);
export const DELETE = (request: Request) => inspector.handleNodeRoute(request);
```

The adapter serves configuration at the base path, snapshots at `/events` via SSE, and `DELETE /clear`. The React component manages subscriptions, reconnection, and cleanup. If your frontend and backend use different ports, proxy this path and the application's inference endpoint through the frontend origin. The browser does not support a cross-origin inspector endpoint. Middleware must receive the original path and matching Host; configure proxies accordingly.

Both API routes and inspector endpoints must share the **same in-memory adapter instance/process**. This prototype doesn't aggregate traces across workers, serverless instances, or edge runtimes. Independently tested integrations are React + Vite and the Next.js App Router example (Route Handlers, Server Actions, and Server Components). See [Next.js setup and limitations](nextjs.md).

A disabled server adapter exposes no inspector endpoints and `createClient` returns an ordinary SDK client without recording. Capture is limited to `systemOne` calls through that client; it does not intercept unrelated traffic or discover other SDK instances.

## History and access

Default history is shared across local development tabs, bounded to 50 requests. It resets when the process restarts. Clear affects this local history. Only drawer height is stored in localStorage; captured data stays in process/browser memory.

Host and Origin checks reject cross-origin browser requests. Other HTTP clients can set those headers freely, so without `authorize` the middleware also requires a loopback connection and returns 403 to network peers. `handle` and `handleNodeRoute` receive a Web Request without the connection's address: run those servers on `127.0.0.1` (for example `next dev --hostname 127.0.0.1`) or set `authorize`. A proxy or tunnel that is reachable from the network connects over loopback and passes this check, so it also needs `authorize`. An enabled non-loopback origin requires an `authorize(request)` callback. For a private authenticated environment, apply your existing authentication, and optionally provide `getSession(request)` returning a server-derived user/workspace scope. Then wrap the application's inference handler in `inspector.run(request, () => jev.systemOne(input))` so recording uses the same scope as the inspector's SSE and clear requests. Authentication still belongs to your application; the inspector does not create accounts or infer authorization. Do not derive scopes from an untrusted query parameter. With no `getSession`, all authorized users share the local history.

Credential-named fields are redacted recursively. Custom `redact(path, value)` applies to inputs and responses. Arbitrary secrets in prose are not detected. Captures have depth, collection, image, and text budgets; omitted/truncated data is marked. Request headers/options are not captured. Small PNG/JPEG byte arrays have inline previews; unsupported or large images retain references and sizes.

## Diagrams and request capture

The Flow tab follows the lab's `jev-choice` layout: shared context and question cards feed a result card, then branch into output cards. Select any question from the batch and explore a dot-grid canvas: drag to pan, scroll or pinch to zoom around the pointer, and use Fit to center the complete diagram in the available width and height. Arrow keys pan, +/− zoom, and 0/Home fit when the canvas is focused. The camera follows drawer resizing; pause the synchronized flow dots with the toolbar.

- **Choice:** exact returned choice, candidate distribution, and confidence. Alternatives stay visible; the inspector doesn't replace the returned choice with its own argmax decision.
- **Score:** returned score, distribution, legend, and confidence.
- **Noul:** probability of true and its complement; no invented confidence or routing threshold.
- **Box:** normalized region overlay on the captured image, coordinates, and confidence. A Box is not a presence detector.

Connections illustrate data structure, not hidden model reasoning or per-question timing. Application routes/thresholds are not captured. Full instructions and criteria remain in Questions, and full state remains in Context. Cards follow the lab's visual language, but do not apply its illustrative routing policies to real requests.

The Questions tab renders a measured window of cards as you scroll. **Jump to question** lists every captured question; Previous/Next and the focused list's Up/Down and Home/End keys reach every answer. Choice probabilities, Score legends, Noul values, Box previews, and captured instructions are unchanged. A focused control stays mounted when scrolled offscreen, and expanded Score legends survive row recycling. Closing and reopening the drawer preserves the Questions scroll position and navigation state. Switching tabs or requests creates a fresh Questions view, as before.

Only visible and nearby cards (plus any focused card) are in the DOM. Browser Find and a screen reader's document browse mode therefore do not search the entire collection at once; use the question picker or the Raw tab for the complete captured payload. Virtualization does not change capture limits or truncate answers. The view uses the headless TanStack Virtual library, loaded on first opening Questions; it does not add the TanStack DevTools shell.

The recorder preserves the original SDK APIPromise, including response helpers and cancellation. It observes a cloned response without consuming the caller's body. AsyncLocalStorage correlates transport attempts/retries with their logical request. Total latency covers the logical call; attempt latency ends at response headers.

## Local playground and independent example

```sh
npm run dev
```

Open **http://127.0.0.1:4182/**. The original Diagram Motion Lab and `/docs/` stay in their separate repository. The playground uses the same public component and adapter described above. Its minimal form uses shadcn Button, Native Select, Textarea, and Label components; the top bar and hero are omitted, and application results appear after a run. Its drawer starts closed so the application result remains visible; open **Jev DevTools** in the bottom-right corner to inspect the request.

Samples cover triage (Choice, Score, Noul), image regions (Box + Noul), retry after 429, failure, and cancellation. Choose a sample outcome (blocked payment, delayed delivery, or quick question) to compare different fixture responses. Sample answers and usage are fixed by that selection, even if the context changes. They use the real SDK's serialization/retry paths with a custom fetch and make no inference calls.

Successful runs also update an application preview: Choice selects a support queue, Score sets a priority, and Noul suggests a human handoff. **Why this outcome?** explains the signals. Image runs show the returned Box with a toggleable overlay, gated by the separate Noul presence answer. Retry, failure, and cancellation have explicit states; a failed run never applies an earlier result. Priority and presence thresholds are labeled demo policies, and no actual ticket is sent.

For optional live mode, copy `apps/playground/.env.example` to `apps/playground/.env.local`, set `TYPESAFE_API_KEY` there, and restart. No key is accepted in the browser. The image example uses the SDK's experimental image contract. Live behavior has not been verified.

To try the minimal independent consumer after `npm run pack:devtools`:

```sh
cd examples/react-vite
npm install
npm run dev
```

Open **http://127.0.0.1:4183/**. This example imports only the installed package's public exports, includes a sample-only server, and uses its own light theme to demonstrate CSS isolation.

Resize the drawer by dragging the top edge or using the focused handle's arrow keys, Shift+arrows, Home, and End. Expand/Restore adjusts its size. Close or Escape returns focus to the TypeSafe-branded Jev DevTools launcher.

Closing retains the inspector's selection, filters, active tab, question, flow preference, and diagram camera. Incoming traces continue to be received and merged, but do not schedule inspector renders while closed; SVG flow animations pause too. Reopening applies the latest retained history. A selected request remains selected if it is still present and matches the filters; clear and eviction still apply. If no request was explicitly selected, the inspector continues following the newest request.

Question, flow, and camera state belong to the current diagram. Following a newer request, or falling back after eviction, replaces that diagram just as it does while the drawer is open.

With `defaultOpen={false}`, the inspector panel first mounts when the launcher is opened. After its first open, the hidden panel and its last displayed snapshot stay in memory to preserve UI state. Closing reduces rendering work, not capture, network traffic, or JSON parsing. Unmounting/disabling the component closes the subscription and releases its UI state; server capture continues independently.


## Verification

```sh
npm run check
npm test
npm run build
npm run check:playground
npm run verify:package
```

Package verification packs the library, installs it into a temporary independent React app, verifies public exports and SSR/disabled behavior, and builds the consumer while asserting that no server recorder or SDK modules enter the browser bundle. Recorder and adapter tests cover response ownership, retries, error/abort, concurrent scopes, redaction, bounded retention, image capture, HTTP/SSE delivery, origin/auth guards, and scoped clearing.

Package exports: `jev-devtools` (React + browser-safe types), `/styles.css` (scoped styles), and `/server` (Node adapter + recorder). Library output is `packages/jev-devtools/lib/`; the playground's production build is separate and intentionally shows only a local-tool notice. No production deployment is included.

The playground controls live in `apps/playground/src/components/ui/` and are generated from [shadcn/ui](https://ui.shadcn.com/docs/installation/vite), with direct Radix imports and the local `cn` helper. `apps/playground/components.json` configures future additions. Tailwind utilities and theme tokens are in `apps/playground/src/controls.css`; global preflight is omitted to preserve inspector styling. These dependencies are playground-only and are not needed by consumers of the packaged inspector.
