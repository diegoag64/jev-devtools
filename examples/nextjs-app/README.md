# Next.js App Router example

From the repository root:

```sh
npm ci
npm run pack:devtools
cd examples/nextjs-app
npm install
npm run dev
```

Open http://127.0.0.1:4184/. This sample-only app makes no inference calls and needs no API key. Run the Route Handler, Server Action, or Server Component example and open the Jev DevTools launcher to inspect them in one shared history.

The drawer loads its own styles; no CSS import is needed. The example imports only the packed library's public exports. It externalizes the SDK, shares the adapter with `getJevDevtools`, mounts the client component once in the root layout, and disables capture/display outside development. `npm run build && npm start` demonstrates production with disabled inspector endpoints.

The default origin is `http://127.0.0.1:4184`. Set `JEV_DEVTOOLS_ORIGIN` if launching Next on another host/port. Restart after editing recorder options. In-memory history cannot cross server processes or serverless instances; Node runtime is required.

[Full integration guide](../../docs/nextjs.md). Run `npm run verify:nextjs` from the repository root for independent packed-install verification with real Next.js servers.
