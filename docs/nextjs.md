# Next.js and server frameworks

Jev DevTools supports Next.js App Router on the **Node.js runtime**. Mount one client component in the root layout, share one server adapter, and expose its Request/Response handler through an optional catch-all route. Calls made with that adapter's client can originate in Route Handlers, Server Actions, or Server Components.

The package has no Next.js dependency. `handle(request)` also works with other Node frameworks using Web Request/Response, and `middleware` works with Express/Connect. Only the Next.js example below is framework-tested here; other frameworks need their own integration verification.

## Install

This guide covers **[0.4.0](https://www.npmjs.com/package/jev-devtools/v/0.4.0)**, available on npm. See the [release notes](../CHANGELOG.md#040--october-24-2026-experimental). Install in your Next.js app:

```sh
npm install jev-devtools @typesafe-ai/sdk server-only
```

To try local changes before a future release, run `npm ci && npm run pack:devtools` from this repository, then in your Next.js app:

```sh
npm install /absolute/path/to/jev-devtools-0.4.0.tgz server-only
```

Use Node 22.12+ and React 18/19. The App Router example pins Next.js 16.4.2 and React 19.3.1. The broader package's React 18 checks use the Vite consumer; they are not a claim that every Next.js version supports that combination.

## 1. Configure the server SDK

Merge this into your existing `next.config.mjs`:

```js
export default {
  serverExternalPackages: [
    '@typesafe-ai/sdk',
  ],
};
```

Next.js bundles server dependencies by default. [serverExternalPackages](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages) keeps the TypeSafe SDK using Node's module loader. **Do not externalize the whole Jev DevTools package**: its React entry must use Next's React instance during SSR. The shared server helper keeps adapters together even when Next bundles separate route modules. Do not put the Node `/server` import in a client component.

## 2. Share the recorder and create your Jev client

```ts
// server/jev.ts (use src/server/jev.ts if your app lives in src/)
import 'server-only';
import { getJevDevtools } from 'jev-devtools/server';

export const inspector = getJevDevtools('my-next-app', () => ({
  enabled: process.env.NODE_ENV === 'development',
  origin: 'http://localhost:3000', // exact URL you open, including port
  redact: (path, value) => path.at(-1) === 'email' ? '[redacted]' : value,
}));

export const jev = inspector.createClient({
  apiKey: process.env.TYPESAFE_API_KEY,
});
```

`getJevDevtools(key, createOptions)` reuses an adapter across server module reloads in the same Node realm. Use one stable, app-specific key. The options factory runs once per key; **restart the server when changing the origin, enabled flag, authentication, redaction, or other options**. Do not call `dispose()` after each request or on hot reload. `dispose()` closes streams and releases the key for shutdown/reinitialization. Different app keys have separate histories.

A regular `createJevDevtools(options)` still creates an independent adapter. Use that when your server owns its lifecycle directly. The shared helper does not merge different processes, VM realms, workers, or serverless instances.

Keep `TYPESAFE_API_KEY` in the server environment, never in a `NEXT_PUBLIC_` variable. The real SDK client requires a configured key even when the inspector is disabled. API handlers, actions, and components should import `jev` from this same module and call `jev.systemOne(...)` normally. Calls from other SDK clients are not discovered automatically.

## 3. Expose the inspector routes

```ts
// app/api/jev-devtools/[[...path]]/route.ts
import { inspector } from '../../../../server/jev';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = (request: Request) => inspector.handleNodeRoute(request);
export const DELETE = (request: Request) => inspector.handleNodeRoute(request);
```

Use the **optional** catch-all `[[...path]]`: the base path serves configuration, `/events` streams snapshots, and `DELETE /clear` clears history. [Route Handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route) accept Web Requests and streaming Responses directly. `handleNodeRoute` accounts for Next rebuilding `Request.url` with an internal hostname (for example `localhost` when the browser uses `127.0.0.1`). It validates the actual Host against your configured origin, then normalizes the URL and applies the usual Origin/auth checks. It does not trust forwarded host headers; proxies must preserve Host. Use plain `handle` for frameworks whose Request URL already represents the browser origin. Keep these paths out of application caches and proxy buffering. If using a custom endpoint or basePath, align the route location, server `endpoint`, client `endpoint`, and externally visible URL.

For custom `getSession(request)` scopes, wrap inference Route Handlers in `inspector.run(request, () => jev.systemOne(input))`. Server Actions and Server Components do not receive a Request argument: derive a trusted Request from Next's server-side headers with your configured origin, then pass it to `run`. Keep the same authentication/session resolution used by the inspector endpoints. With the default local history no wrapper is needed. Application authentication is still required for application routes; `run` only selects a recording scope.

## 4. Mount once in the layout

```tsx
// app/devtools.tsx
'use client';
import { JevDevtools } from 'jev-devtools';

export function Devtools() {
  return <JevDevtools
    enabled={process.env.NODE_ENV === 'development'}
    defaultOpen={false}
  />;
}
```

```tsx
// app/layout.tsx
import type { ReactNode } from 'react';
import 'jev-devtools/styles.css';
import { Devtools } from './devtools';

export const runtime = 'nodejs';
export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}<Devtools /></body></html>;
}
```

The drawer renders nothing during SSR, connects after mounting when enabled, and keeps its state across App Router navigation under the root layout. [Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) isolate its browser APIs from your server code. CSS is scoped to the inspector. In the example, production builds disable both recording and inspector endpoints; ordinary SDK calls still work.

## Try the complete sample

```sh
# Repository root
npm ci
npm run pack:devtools
cd examples/nextjs-app
npm install
npm run dev
```

Open http://127.0.0.1:4184/. Use the API button, submit the Server Action form, or visit the Server Component result page, then open Jev DevTools. All three use the real SDK with a fixed sample transport; no API key, live inference, or external mutation is used. The default origin must match how you access the page.

The example uses a dynamic Server Component so it runs at request time. In your app, cached results and build-time/static rendering do not produce a fresh request trace on every page visit; dev rendering may also repeat calls. The inspector shows actual SDK calls, not a one-to-one mapping of clicks or rendered components.

Run `npm run verify:nextjs` from the repo root to install a fresh packed archive outside the workspace, exercise a real Next dev server, compile a production build, and verify the production endpoints are disabled. It checks shared history across all three server entry points, server module reloads, SSE and clear, and sample calls continuing when recording is off. Browser interaction/visual QA is separate.

## Deployment and troubleshooting

- This is a local development inspector with bounded, in-memory history. Next.js on Vercel or another platform may run routes in separate instances; this setup does **not** provide distributed trace aggregation. Edge runtime is unsupported.
- **Empty drawer:** check that every call imports the instrumented client, the optional catch-all route uses the same key, and the SDK is externalized (not the whole DevTools package). Calls in a different process cannot appear here.
- **403:** the configured origin must match scheme, hostname, and port exactly (`localhost` and `127.0.0.1` differ). A non-loopback origin requires an `authorize` callback; a custom session scope must match between capture and inspector routes.
- **Network access:** `next dev` listens on all interfaces (`0.0.0.0`) by default, and a Route Handler can't see the connection's address. Start it with `--hostname 127.0.0.1`, as the sample app does, or set `authorize`. Otherwise another machine on the network can read captures by sending a matching `Host` header.
- **404 in production:** expected with the development-only flags above. The browser should also be disabled, so it makes no inspector requests.
- **Configuration edits ignored during hot reload:** restart the process; the shared adapter deliberately retains its initial options and captured history.
- **Server-side credentials:** add authentication and project-specific redaction before using any enabled inspector in a shared environment. Arbitrary secrets inside prose are not automatically detected.

See [integration and access controls](integration.md#history-and-access) for authorization, redaction budgets, and session details.
