# React with a Node server

## Mount the drawer

Add to the existing root without replacing providers or routing:

```tsx
import { JevDevtools } from 'jev-devtools';

// Inside the existing root JSX, alongside the app:
<JevDevtools enabled={import.meta.env.DEV} defaultOpen={false} />
```

`import.meta.env.DEV` is Vite-specific. For another bundler use its existing development flag. The component is SSR-safe; no provider or client prop is required. `endpoint` defaults to `/api/jev-devtools`. The drawer injects its own stylesheet into its Shadow DOM; no CSS import is needed.

## Existing Express/Connect backend

Create a server-only module and import the same exports in the server bootstrap and all inference handlers:

```ts
// server/jev.ts (adapt the location to the app)
import { createJevDevtools } from 'jev-devtools/server';

export const inspector = createJevDevtools({
  enabled: process.env.NODE_ENV === 'development',
  origin: process.env.JEV_DEVTOOLS_ORIGIN || 'http://localhost:5173',
});
export const jev = inspector.createClient({
  apiKey: process.env.TYPESAFE_API_KEY,
  // Preserve the existing SDK client's other options here.
});
```

Ensure the backend's dev command actually sets `NODE_ENV=development`; plain Node does not do so automatically. Load server env files using the app's existing loader before this module runs. The SDK still requires a key when capture is disabled. Do not import this module from React/browser code.

```ts
// In the existing Node server bootstrap:
import { inspector } from './jev';
app.use(inspector.middleware);
// Existing inference handlers import jev from './jev' and call systemOne as before.
```

Mount at the application root, before fallback routes. Do not mount with `app.use('/api/jev-devtools', ...)`: Express strips the prefix the adapter needs. Dispose the adapter during server shutdown, not after each request. If the framework reloads server modules, use `getJevDevtools('your-app', () => options)` instead and restart after options change. Without `authorize`, the middleware returns 403 to non-loopback connections, including a host browser reaching a container through a published port; those setups need a real `authorize` check. So does a proxy or tunnel reachable from the network, because it connects to the backend over loopback.

### Separate Vite frontend and backend ports

For a browser at `http://localhost:5173` and backend at `http://127.0.0.1:3001`, merge this into the existing Vite config:

```ts
server: {
  port: 5173,
  strictPort: true,
  proxy: {
    '/api/jev-devtools': {
      target: 'http://127.0.0.1:3001',
      changeOrigin: false,
    },
    // Preserve the app's existing proxy for its own inference endpoint.
  },
}
```

Set the adapter origin to the **frontend** origin. Preserve Host and the complete path; no prefix rewrite. The backend sees the proxy's loopback connection, so keep Vite on its default `localhost` host or set `authorize`. Do not buffer or cache `/events`. A broader existing `/api` proxy may suffice if it obeys these rules. The React component must still use the relative same-origin endpoint. See [Vite proxy options](https://vite.dev/config/server-options.html#server-proxy).

## Vite app without a backend: local sample setup

A static React app cannot hold a Jev API key. To demonstrate local capture without creating a production backend, add a development-only Vite plugin. Keep existing plugins and configure `server: { host: '127.0.0.1', port: 5173, strictPort: true }`; open that exact origin. This plugin is not a production API.

```ts
// Add this object to the plugins array in vite.config.ts.
// Import createJevDevtools from 'jev-devtools/server' in that config only.
{
  name: 'local-jev-inspector',
  apply: 'serve',
  configureServer(server) {
    const inspector = createJevDevtools({
      enabled: true,
      origin: 'http://127.0.0.1:5173',
    });
    server.middlewares.use(inspector.middleware);
    server.httpServer?.once('close', () => inspector.dispose());
    // Register the sample client and handler described in verify.md here.
    // Any live application handler must share this same inspector instance.
  },
}
```

Use the sample recipe in [verify.md](verify.md) for a temporary request endpoint. If the user needs persistent application APIs, use their intended Node backend instead; do not silently turn a dev plugin into production infrastructure. Vite does not automatically load `.env.local` into `process.env` while evaluating its config: for live development use the existing server environment strategy or Vite's server-side `loadEnv`, without exposing the key via `define` or client-prefixed variables.

## Other Node frameworks

`inspector.handle(request: Request)` returns a Web Response including SSE. Route GET for the base path and `/events`, plus DELETE for `/clear`, to that same adapter. Preserve streaming/cancellation rather than converting the response to JSON. `handleNodeRoute(request)` is for Node framework requests with internal URLs; it validates the actual Host against the configured origin before normalizing the URL. It does not trust forwarded host headers.

Custom endpoints/base paths must match in browser props, server options, framework routes, and the external URL. For multiple users, `getSession(request)` defines a trusted server-side scope; wrap application requests with `inspector.run(request, callback)` using the same session resolver as the inspector endpoints. This wrapper scopes recording; it does not authenticate the application's inference route. Read the [access-control guide](https://github.com/diegoag64/jev-devtools/blob/main/docs/integration.md#history-and-access) before adapting to shared access.
