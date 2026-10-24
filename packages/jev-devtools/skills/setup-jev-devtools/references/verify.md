# Verify the consumer integration

Use the host app's typecheck/build commands. Do not run the Jev DevTools monorepo scripts inside a consumer app. A passing build does not establish that capture is connected.

## Sample request without a key

Use this server-only fixture when live inference is not authorized or no key is configured. It exercises the real SDK and recorder with fixed sample data and no external inference call. Create it from the **same inspector** that serves the endpoints. Keep it visibly sample-only; never substitute it for the user's production inference path.

```ts
const sampleJev = inspector.createClient({
  apiKey: 'sample-only',
  logLevel: 'off',
  fetch: async () => Response.json({
    model: 'jev-sample',
    answers: {
      category: {
        type: 'choice',
        choice: 'billing',
        probabilities: { billing: 0.8, other: 0.2 },
        confidence: 0.7,
      },
    },
  }),
}, { label: 'Setup verification', source: 'sample' });

async function runSample() {
  return sampleJev.systemOne({
    state: { message: 'I was charged twice.' },
    questions: {
      category: {
        type: 'choice',
        instructions: 'Which team should handle this message?',
        criteria: { billing: 'Payment issues', other: 'Everything else' },
      },
    },
  });
}
```

For a Vite/Connect dev plugin, register a temporary local handler after mounting the inspector:

```ts
server.middlewares.use(async (req, res, next) => {
  if (req.url !== '/__jev-setup-sample' || req.method !== 'POST') return next();
  try {
    await runSample();
    res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
  } catch {
    res.writeHead(500).end('Sample failed');
  }
});
```

For Next, expose `runSample` from the server module and call it from a temporary development-only Node Route Handler (return 404 outside development). For an existing backend, use a temporary development-only handler or its existing test harness. Do not execute the sample in a separate CLI process and expect it to appear in the running server's memory. Remove temporary sample routes/UI after verification unless the user wants a demo; existing live flows must remain live.

## Observable checks

1. Start the app in development at the configured origin. GET `/api/jev-devtools` must return 200 JSON `{ "version": 1, "enabled": true }`, not the app's HTML fallback. Use the custom endpoint if configured.
2. GET `/api/jev-devtools/events` should return `text/event-stream` with `event: snapshot`. The connection intentionally stays open. Use a bounded stream read and close it afterwards.
3. Trigger the sample **in that running server**. Its next snapshot should contain the label `Setup verification`, source `sample`, context, question, returned choice `billing`, and probabilities. In the browser, open the bottom-right Jev DevTools launcher and inspect Flow, Questions, and Context. A configured endpoint with an empty history is not proof of capture.
4. Use Clear and confirm the sample disappears. A scripted DELETE to `/api/jev-devtools/clear` must include the exact `Origin` header (and app authorization/session cookies when configured). Don't clear unrelated user history without consent; use a fresh local verification session when needed.
5. Run the app's production build/typecheck. With development flags off, inspector endpoints return 404 and the drawer makes no requests. Existing application SDK calls should continue normally. Vite dev plugins are absent from static production output; the host backend must independently disable its adapter. This is runtime opt-in, not a guarantee that every bundler eliminates all inspector files.
6. Confirm server SDK imports and credentials never enter browser bundles. Use the app's build analysis or module inspection if available. Don't infer this solely from a successful build.

Report HTTP/capture checks separately from visual browser checks, and sample verification separately from live inference. If browser tools or a server runtime are unavailable, say which checks remain undone.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| No launcher | Mount once and explicitly enable in development. Styles load automatically; no CSS import is needed. It intentionally renders nothing on the server. |
| Disconnected or HTML instead of config | Ensure base path **and** subpaths reach the adapter before the SPA fallback; check proxy and Next optional catch-all. |
| 403 | Match scheme/hostname/port and Host exactly; preserve proxy Host, verify Origin and authorization. Don't disable guards. |
| Connected but empty | Use the adapter's instrumented client, same adapter/key/process and session. Direct SDK clients are not intercepted. |
| Clear fails | Browser/server endpoint agreement, same-origin DELETE, exact Origin, authorization and session. |
| Missing key | SDK needs a server key even with recording off; use the labeled sample transport for offline verification. |
| Next reload loses or ignores settings | Use a stable `getJevDevtools` key; restart after option changes. Don't dispose during hot reload. |
| Server import/build errors | Keep `/server` outside client modules. In Next externalize the SDK only. Use a supported Node runtime. |
| Production 404 | Expected when disabled; app inference remains independent. |

Capture is bounded to 50 calls in memory by default. Built-in redaction has limits; arbitrary secrets in prose are not detected. Diagrams show captured inputs/outputs, not hidden model reasoning. Routing decisions are recorded only for explicitly defined flows; see [flows.md](flows.md) for flow verification.

The current browser requests `/events?protocol=2`: the first event is a full version 2 `snapshot`, followed by `delta` events containing changed traces and the retained ID order. The unqualified `/events` check above intentionally remains compatible with legacy clients. Reconnecting always supplies a fresh snapshot.
