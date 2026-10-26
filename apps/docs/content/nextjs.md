Add Jev DevTools to an existing Next.js App Router app so requests from Route Handlers, Server Actions, and Server Components appear in one drawer.

Use the **Node.js runtime** for code that imports the server adapter or SDK. This setup keeps the API key on the server and enables inspection only in development. For a runnable example without a key, use the [sample Next.js app](https://github.com/diegoag64/jev-devtools/tree/main/examples/nextjs-app).

## Install and configure

Install these packages in your Next.js app:

```sh install
pnpm add jev-devtools @typesafe-ai/sdk server-only
```

Merge the SDK externalization into your existing `next.config.mjs`:

```js
export default {
  serverExternalPackages: ["@typesafe-ai/sdk"],
};
```

This lets Node load the SDK. Keep the `jev-devtools` React entry bundled so it uses Next's React instance during server rendering.

Set `TYPESAFE_API_KEY` in your server environment. Do not use a `NEXT_PUBLIC_` variable for the key. Disabling inspection does not remove the SDK's need for credentials when making live calls.

## Share your server adapter

Create `server/jev.ts`. If your app uses `src/app`, put this file in `src/server/jev.ts` instead.

```ts api=server
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

Use an app-specific key and set `origin` to the exact browser URL, including scheme and port. `localhost` and `127.0.0.1` are different origins.

Import this `jev` client wherever your server calls `systemOne`. Requests made through other clients will not appear in this adapter's history.

[`getJevDevtools()`](@/api/reference/#getjevdevtools) reuses the adapter across module reloads in the same Node realm. Its options factory runs once per key. Restart the server after changing options such as `origin` or redaction.

## Expose the optional catch-all route

Create this Route Handler under your `app` directory:

```ts api=server
// app/api/jev-devtools/[[...path]]/route.ts
import { inspector } from "../../../../server/jev";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => inspector.handleNodeRoute(request);
export const DELETE = (request: Request) => inspector.handleNodeRoute(request);
```

The double brackets matter. `[[...path]]` serves both the base endpoint, which returns configuration, and child endpoints for the event stream and clearing history.

[`handleNodeRoute()`](@/api/reference/#adapter-handlenoderoute) checks the incoming Host and normalizes framework-internal request URLs. If you use a proxy, preserve Host and keep the event stream out of caches and buffering. Forwarded host headers are not trusted.

## Mount a Client Component

Create the wrapper:

```tsx api=core
// app/devtools.tsx
"use client";
import { JevDevtools } from "jev-devtools";

export function Devtools() {
  return <JevDevtools enabled={process.env.NODE_ENV === "development"} />;
}
```

Import it into your existing root layout and render it once inside `<body>`. A minimal layout looks like this:

```tsx
// app/layout.tsx
import type { ReactNode } from "react";
import { Devtools } from "./devtools";

export const runtime = "nodejs";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Devtools />
      </body>
    </html>
  );
}
```

The drawer renders nothing during SSR and connects after mounting. Its styles are included, so no stylesheet import is needed.

## Run locally

Bind the development server to loopback:

```sh
npx next dev --hostname 127.0.0.1
```

Open `http://localhost:3000`, matching the configured `origin`. If Next uses another port, update `origin` and restart.

Check the connection before debugging capture:

1. Open `/api/jev-devtools` on that origin. Expect JSON with `enabled: true` and `flows: true`.
2. Open the drawer in your app. It will be empty until your application makes a request through the shared `jev` client.
3. Trigger an existing action that calls `jev.systemOne(...)`. Open the resulting record and inspect its input and answers.

The drawer shows actual SDK calls. Cached output or static rendering may not make a new call on each visit, and development rendering may repeat calls. For a failed connection or missing record, use [Troubleshooting](@/guides/troubleshooting/).

## Adapt the setup

For custom endpoints or a Next.js `basePath`, align the route location, server `endpoint`, and React `endpoint` with the browser-visible path.

For session-specific history, configure [`getSession()`](@/api/reference/#createjevdevtools) and wrap inference handlers in [`inspector.run(request, callback)`](@/api/reference/#adapter-run). Server Actions and Server Components need a trusted Request derived from server-side headers. The [full Next.js reference](https://github.com/diegoag64/jev-devtools/blob/main/docs/nextjs.md) covers these cases.

Route Handlers cannot inspect the connection's socket address. Keep the server bound to loopback for local use. Shared or tunneled access requires application authorization as described in [Privacy & access](@/guides/privacy/).

This adapter stores history in one Node process. It does not combine captures from separate workers or serverless instances, and it does not support the Edge runtime.
