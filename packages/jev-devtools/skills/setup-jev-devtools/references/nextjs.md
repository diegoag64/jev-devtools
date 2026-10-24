# Next.js App Router

Use Node runtime, React 18/19, and an existing App Router app. Respect `src/` layout and existing aliases. The independent example is verified with Next.js 16.4.2 / React 19; adapt older versions only after checking their supported configuration. This recipe does not cover Pages Router or Edge.

## Dependency and configuration

Install `jev-devtools` and `server-only` with the app's package manager. Merge into the existing Next config; preserve its wrappers, options, and external packages:

```js
serverExternalPackages: ['@typesafe-ai/sdk'],
```

Externalize the SDK only, not `jev-devtools`: the React entry must use Next's React instance. See [Next's serverExternalPackages reference](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages).

## Shared server adapter

```ts
// server/jev.ts, or src/server/jev.ts
import 'server-only';
import { getJevDevtools } from 'jev-devtools/server';

export const inspector = getJevDevtools('your-app-name', () => ({
  enabled: process.env.NODE_ENV === 'development',
  origin: process.env.JEV_DEVTOOLS_ORIGIN || 'http://localhost:3000',
}));

export const jev = inspector.createClient({
  apiKey: process.env.TYPESAFE_API_KEY,
  // Preserve existing SDK options, e.g. timeout, retries, and custom fetch.
});
```

Use one stable, app-specific key. The first options factory wins; restart after changing origin, authorization, redaction, or other settings. Do not dispose on each request or hot reload. The helper shares memory within one Node realm, not separate workers/serverless instances.

Set the exact browser origin and API key in the existing server environment (normally an ignored `.env.local`). Never use `NEXT_PUBLIC_` for credentials. SDK client construction requires a key even when capture is disabled. When no key is available, use the sample client in [verify.md](verify.md) for verification instead of constructing a live client with an undefined key.

`next dev` listens on `0.0.0.0` by default, and Route Handlers can't see the connection's address. Recommend `--hostname 127.0.0.1` in the dev script, or a real `authorize` check, and report which one the app uses.

Import this `jev` in existing Route Handlers, Server Actions, and Server Components that call `systemOne(...)`. Keep their inputs and behavior; calls using other clients are not captured.

## Inspector route

```ts
// app/api/jev-devtools/[[...path]]/route.ts
// This relative import also works with src/app and src/server.
import { inspector } from '../../../../server/jev';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = (request: Request) => inspector.handleNodeRoute(request);
export const DELETE = (request: Request) => inspector.handleNodeRoute(request);
```

Use the **optional** catch-all `[[...path]]`, which covers config at the base path as well as `/events`, `/flows/events`, and `/clear`. Keep streams out of caches/proxy buffering. Match Host to the configured origin; `localhost` and `127.0.0.1` differ. For Next `basePath` or a custom endpoint, align server `endpoint`, client `endpoint`, and the externally visible route path.

## Root client boundary and CSS

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

In the **existing** root layout, import `Devtools` and add `<Devtools />` inside `<body>` alongside the existing children/providers. Keep the layout a Server Component; do not mark the entire layout `use client`. Ensure segments doing Jev work run on Node, not Edge. The drawer renders no SSR markup and connects after mounting in development. It injects its own stylesheet into its Shadow DOM; no CSS import is needed.

## Verify

Follow [verify.md](verify.md): a real captured sample, SSE and clear, build/typecheck, and disabled production endpoints. Check that a call from the app's actual server entry point reaches the shared drawer. Cached results/static rendering do not generate a new SDK call on every visit; repeated development renders may generate more than one. Record only what was observed.

For a runnable, sample-only implementation with Route Handlers, Server Actions, and Server Components, see [examples/nextjs-app](https://github.com/diegoag64/jev-devtools/tree/main/examples/nextjs-app). Shared authentication/session scoping and further limitations are in the [Next.js guide](https://github.com/diegoag64/jev-devtools/blob/main/docs/nextjs.md).
