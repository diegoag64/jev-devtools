---
name: setup-jev-devtools
description: Install and verify Jev DevTools in an existing React application with a Node backend or Next.js App Router. Use when asked to add the Jev request inspector, wire capture, build connected Jev flows with tasks, branches, collections and loops, or troubleshoot its setup.
---

# Set up Jev DevTools

Complete the integration in the user's application: one React drawer, one shared Node adapter, and application calls through that adapter's TypeSafe client. Installing or mounting the drawer alone does not capture requests.

## Choose the integration

Inspect the app's package manager/lockfile, React and Node versions, root component, server entry point, existing TypeSafe client construction, and development URL. Preserve existing configuration, authentication, routes, providers, and client options. Follow the host project's instructions; this package's contributor workflow does not apply to consumer apps.

- **Next.js App Router:** read [references/nextjs.md](references/nextjs.md).
- **React with a Node backend, including Vite:** read [references/react-node.md](references/react-node.md). A browser-only app needs a Node server for Jev; the Vite development-server option is local only.
- **Other Node frameworks:** use the Web Request/Response or middleware API described in the React/Node reference and verify that framework's routing. Do not assume the Next.js recipe applies to Pages Router. Edge runtimes and cross-process/serverless history aggregation are unsupported.

Install `jev-devtools` using the app's existing package manager (npm: `npm install jev-devtools @typesafe-ai/sdk`; pnpm: `pnpm add jev-devtools @typesafe-ai/sdk`; Yarn: `yarn add jev-devtools @typesafe-ai/sdk`). `@typesafe-ai/sdk` is a peer dependency: keep the app's existing SDK version when it satisfies the peer range. Install in the workspace(s) that actually import it. It is a regular dependency when application modules import it, even though capture/display are development-only. React 18/19 and Node 22.12+ are required. Do not replace the app's framework or upgrade unrelated dependencies to force compatibility.

## Optional connected flow API (0.4.0)

When asked to build or inspect connected calls, read [references/flows.md](references/flows.md) after the framework recipe. It covers the 0.4.0 API: requests, server function tasks, runtime request factories, parallel checks, terminal branches, returning conditionals, bounded collections, and stateful loops. It includes sample verification, scope/execution rules, and privacy limits. For an older installation, use its bundled recipe and declarations rather than assuming these operations exist. Preserve existing application policies; do not convert unrelated calls just to install the drawer. Flow execution is server-only and continues even with the inspector disabled.

## Integration invariants

- Use only public imports: `jev-devtools` and server-only `jev-devtools/server` and `jev-devtools/flow`. No provider, TanStack DevTools shell, Tailwind, or shadcn setup is needed; TanStack Virtual is an internal dependency.
- Mount `<JevDevtools />` once with an explicit development flag. The drawer injects its own stylesheet into a Shadow DOM host under `document.body`; do not add a `jev-devtools/styles.css` import during setup. The CSS export remains supported for existing integrations. Do not add global `section`/`main` padding overrides to repair the drawer. Keep document-level transforms/filters on an app wrapper rather than `html`/`body`, which can affect fixed overlays. Server capture must also be explicitly enabled for development; both default to off.
- Create a shared adapter; the inspector routes and application client must use it in the same Node realm/process. Replace existing `new TypeSafeClient(options)` construction with `inspector.createClient(options)` while preserving keys, transport options, retries, and call semantics. Keep existing `systemOne(...)` inputs and application behavior.
- Browser and server `endpoint` paths must agree (default `/api/jev-devtools`). Route the base path and its subpaths. The server `origin` must exactly match the browser scheme, hostname, and port. A browser endpoint is a same-origin path, not an absolute backend URL.
- Keep keys in server environment variables, never `VITE_*` or `NEXT_PUBLIC_*`. Use the host's environment loader and an ignored local env file. If a key is unavailable, complete setup and use the clearly labeled sample verification in [references/verify.md](references/verify.md); report that live inference remains unverified.
- Preserve authentication and project redaction. Shared/non-loopback access requires a real `authorize(request)` check; do not bypass it with `() => true`. Keep local defaults unless shared access is requested. Without `authorize`, Node middleware accepts only loopback connections; Web Request routes can't check the connection, so their dev server must listen on `127.0.0.1` or set a real `authorize`. Separate processes require a different architecture, not extra adapter instances.

## Finish and verify

Read [references/verify.md](references/verify.md). Build/typecheck the consumer, check configuration and SSE, and demonstrate a captured sample or authorized existing request. Verify the disabled production behavior. Explain any unverified step instead of calling a build alone a working integration.

Summarize changed files, the development URL, how to open the drawer, which client calls are captured, and whether verification used samples or live inference. Installing this tool does not authorize deployment, publishing, or paid inference.

These references are bundled with the installed package. Prefer them and its `.d.ts` files over newer online docs when integrating an older version. No agent automatically discovers this file just because npm installed it; explicitly read it or install this whole skill folder in the coding tool's supported skills location.
