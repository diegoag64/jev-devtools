Jev DevTools brings your TypeSafe requests into view: the context you sent, the questions you asked, the answers you received, and the application flows that connect them.

[Get started →](@/getting-started/)

<div class="demo" data-demo>
<div class="demo-top"><span>One request, made visible</span><div class="sample-buttons"><button type="button" data-sample="billing" aria-pressed="true" hidden>Billing sample</button><button type="button" data-sample="delivery" aria-pressed="false" hidden>Delivery sample</button></div></div>
<div class="demo-flow"><div class="demo-node"><small>01 / CONTEXT</small><p data-message>I was charged twice for my order.</p></div><span class="demo-arrow" aria-hidden="true">→</span><div class="demo-node"><small>02 / RETURNED CHOICE</small><div class="demo-result" data-result aria-live="polite">Billing</div><div class="probability" data-probability><span>Billing</span><meter min="0" max="1" value="0.76" aria-label="Billing probability"></meter><output>76%</output></div><div class="probability" data-probability><span>Delivery</span><meter min="0" max="1" value="0.14" aria-label="Delivery probability"></meter><output>14%</output></div><div class="probability" data-probability><span>Other</span><meter min="0" max="1" value="0.10" aria-label="Other probability"></meter><output>10%</output></div></div></div>
<p class="demo-caption">Illustrative sample · Fixed answers, no inference calls. Connections show data structure, not model reasoning.</p>
</div>

## Easy to integrate

Keep using the TypeSafe SDK. Create your client through the Node adapter, then mount one React component. The drawer connects to your server and handles request history, reconnection, and inspection.

```sh
npm install jev-devtools @typesafe-ai/sdk
```

<!-- example: client.tsx -->

The component includes its own styles. No provider or CSS import is required. Follow the [quick start](@/getting-started/) to wire up the server before opening it.

## Next steps

- **New to the package?** [Quick start](@/getting-started/) takes you from installation to a captured request.
- **Using Next.js?** [The App Router guide](@/guides/nextjs/) covers the server and client boundaries.
- **Connecting several calls?** [Build a flow](@/guides/flows/) explains definitions, execution, and outcomes.
- **Looking up an option?** Start with [React props](@/api/react/), the [server adapter](@/api/server/), or the [flow builder](@/api/flow/).

## What you can inspect

| View      | What it helps you understand                                         |
| --------- | -------------------------------------------------------------------- |
| Flow      | Request structure and application-defined connected steps            |
| Questions | Choice, Score, Noul, and Box answers with their question definitions |
| Context   | The captured state and assets passed to the request                  |
| Transport | Attempts, retries, errors, and request timing                        |
| Raw       | Captured request and response data                                   |

The inspector records calls through your instrumented client. It does not discover unrelated SDK instances, reveal hidden model reasoning, or decide your application's routing policy.

## Before you begin

Use **React 18 or 19**, **Node 22.12+**, and **TypeSafe SDK 0.7.x**. The server adapter and flow runner need Node; they do not run in a browser or edge runtime. History is bounded and in memory.

> These pages follow the repository working tree. The published package is currently **0.4.1**; unreleased behavior is labeled where it appears. Check the [changelog](https://github.com/diegoag64/jev-devtools/blob/main/CHANGELOG.md) against your installed version. The package is experimental before 1.0.
