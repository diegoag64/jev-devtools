Use the App Router on the **Node.js runtime**. The drawer belongs in a Client Component; the adapter and SDK belong in a server module.

## Install and configure

```sh
npm install jev-devtools @typesafe-ai/sdk server-only
```

Merge the SDK externalization into your existing `next.config.mjs`:

```js
export default {
  serverExternalPackages: ["@typesafe-ai/sdk"],
};
```

Externalize the SDK only. The React package entry should use Next's React instance during server rendering.

## Share your server adapter

```ts
// server/jev.ts
import "server-only";
import { getJevDevtools } from "jev-devtools/server";

export const inspector = getJevDevtools("my-next-app", () => ({
  enabled: process.env.NODE_ENV === "development",
  origin: "http://localhost:3000",
}));
export const jev = inspector.createClient({
  apiKey: process.env.TYPESAFE_API_KEY,
});
```

Import this `jev` from Route Handlers, Server Actions, or Server Components. The stable key reuses the adapter across module reloads in the same Node realm. Restart after changing its options: the first options factory wins until disposal or restart.

## Expose the optional catch-all route

```ts
// app/api/jev-devtools/[[...path]]/route.ts
import { inspector } from "../../../../server/jev";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => inspector.handleNodeRoute(request);
export const DELETE = (request: Request) => inspector.handleNodeRoute(request);
```

The optional catch-all includes both the base endpoint and its children. `handleNodeRoute` checks the incoming Host and normalizes framework-internal request URLs. Proxies must preserve Host; forwarded host headers are not trusted.

## Mount a Client Component

```tsx
// app/devtools.tsx
"use client";
import { JevDevtools } from "jev-devtools";

export function Devtools() {
  return <JevDevtools enabled={process.env.NODE_ENV === "development"} />;
}
```

Render `<Devtools />` once inside the root layout's `<body>`. It renders nothing during SSR and connects after mounting. No stylesheet import is needed.

## Run locally

```sh
npx next dev --hostname 127.0.0.1
```

Open the URL matching your configured origin. Web Request handlers cannot inspect the connection's socket address, so bind to loopback or configure `authorize`. With custom session scopes, wrap inference handlers in `inspector.run(request, callback)`; Server Actions need a trusted Request derived from server headers.

See the [complete framework guide](https://github.com/diegoag64/jev-devtools/blob/main/docs/nextjs.md) for layout code, Server Actions, custom scopes, base paths, caching, and deployment limits. The [independent Next.js example](https://github.com/diegoag64/jev-devtools/tree/main/examples/nextjs-app) is sample-only and needs no key.
