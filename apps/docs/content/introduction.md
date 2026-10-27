Jev DevTools adds an inspector drawer to React applications that use TypeSafe's Jev. It records `systemOne()` calls through an instrumented SDK client on your Node server. Open the drawer while using your app to inspect each call's context, answers, timing, and errors.

[Capture your first request](@/getting-started/) or follow the [Next.js setup](@/guides/nextjs/).

This sample pairs a support message with the returned Choice answer. Switch between billing and delivery to compare fixed responses.

<div class="demo" data-demo>
<div class="demo-top"><span>One request, made visible</span><div class="sample-buttons"><button type="button" data-sample="billing" aria-pressed="true" hidden>Billing sample</button><button type="button" data-sample="delivery" aria-pressed="false" hidden>Delivery sample</button></div></div>
<div class="demo-flow"><div class="demo-node"><small>01 / CONTEXT</small><p data-message>I was charged twice for my order.</p></div><span class="demo-arrow" aria-hidden="true">→</span><div class="demo-node"><small>02 / RETURNED CHOICE</small><div class="demo-result" data-result aria-live="polite">Billing</div><div class="probability" data-probability><span>Billing</span><meter min="0" max="1" value="0.76" aria-label="Billing probability"></meter><output>76%</output></div><div class="probability" data-probability><span>Delivery</span><meter min="0" max="1" value="0.14" aria-label="Delivery probability"></meter><output>14%</output></div><div class="probability" data-probability><span>Other</span><meter min="0" max="1" value="0.10" aria-label="Other probability"></meter><output>10%</output></div></div></div>
<p class="demo-caption">Illustrative sample · Fixed answers, no inference calls. Connections show data structure, not model reasoning.</p>
</div>

## What you can inspect

Select a captured request in the drawer to explore these views:

| View      | What it shows                                                           |
| --------- | ----------------------------------------------------------------------- |
| Context   | The state and assets captured from the request.                         |
| Questions | Question definitions and returned Choice, Score, Noul, and Box answers. |
| Transport | Request timing, attempts, retries, and errors.                          |
| Raw       | The captured request and response data.                                 |
| Flow      | The request's structure, or the steps in an application-defined flow.   |

Captures have size and depth limits. Redacted or truncated data may be absent from the inspection copy even when your application received the full response.

## Requests and flows

A request is one `systemOne()` call, including any retries. You can inspect requests without adopting a flow API.

For work that spans several steps, an optional flow definition connects Jev requests, application tasks, and decisions. The inspector shows the steps that ran and their results. Your code defines the paths and conditions. The diagram describes that application logic.

[Flows from scratch](@/guides/flow-basics/) starts with ordinary code and no model calls. [Build a flow](@/guides/flows/) combines a model question with an application decision.

Captured answers can also become fixtures for [replay and comparison](@/api/flow/#replay-captured-answers). Replay supplies stored Jev answers, while application tasks still execute. Comparison runs the flow again with your supplied client.

<a id="easy-to-integrate"></a>

## How it connects to your app

The Node adapter creates an instrumented TypeSafe SDK client and serves inspector endpoints. Calls through that client populate the capture history. Your application's handlers and the inspector endpoints share one adapter in the same Node process.

The React component connects to those endpoints through your app's browser origin. It includes its own styles and needs no provider. API credentials stay on the server.

[Concepts](@/concepts/) explains the client, recorder, and drawer in more detail.

## Local capture and privacy

The adapter and drawer are disabled by default. Enable both for local development. Disabling the adapter stops recording. Your application's SDK calls continue.

History is bounded, stays in memory, and disappears when the server process restarts. Separate workers or serverless instances do not share capture history.

Known credential fields are redacted from captures. The drawer also masks supported personal fields, but display masking leaves the underlying captured data intact. Use [server-side redaction and access controls](@/guides/privacy/) for data that must not reach the browser and for shared or tunneled environments.

## Before you begin

The inspector uses React and React DOM **18 or 19**, Node **22.12+**, and TypeSafe SDK **0.7.x**. The server adapter and flow runner require Node. Edge runtimes are unsupported. See the [Quick start prerequisites](@/getting-started/#before-you-begin) for the complete setup requirements.

These pages describe **version 0.5.6**. Check your installed version and the [release notes for verified publication status](https://github.com/diegoag64/jev-devtools/releases/tag/v0.5.6). The package is experimental before 1.0. The [changelog](@/changelog/) records changes and compatibility notes.

## Next steps

<a id="find-a-method-or-learn-flows"></a>

Choose a starting point for your task:

- [Quick start](@/getting-started/) connects a Vite React app and an Express server, then captures a request.
- [Next.js](@/guides/nextjs/) sets up the App Router's server adapter and Client Component.
- [Examples and cookbooks](@/examples/) includes no-key sample apps and complete application flows.
- [API glossary](@/api/reference/) lists method inputs, return values, and examples.
- [Troubleshooting](@/guides/troubleshooting/) helps resolve an empty drawer, rejected connections, or missing captures.
