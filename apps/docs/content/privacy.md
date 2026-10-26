Captured inputs and answers can contain application data. Use this guide to decide what the server records, who can read it, and whether users share a history.

The adapter keeps bounded history in memory. The drawer reads that history through your application's inspector endpoints. Configure these controls on the shared adapter used by both inference handlers and inspector routes.

## Enable intentionally

The server adapter and React component both default to disabled. Enable both for local development, as shown in [Quick start](@/getting-started/) and [Next.js](@/guides/nextjs/). Keep API keys in the server environment.

Disabling the server adapter stops recording and hides its endpoints. SDK calls continue normally. Closing the drawer only hides the view, so it does not stop capture.

To check your production configuration, request the inspector's base endpoint with recording disabled. It should return 404, while application SDK calls should still work.

## Choose what leaves the server

Use the server's `redact` callback for fields that must not reach the browser. For example, this adapter replaces values under an `email` key:

```ts api=server
import { createJevDevtools } from "jev-devtools/server";

const inspector = createJevDevtools({
  enabled: process.env.NODE_ENV === "development",
  origin: "http://localhost:3000",
  limit: 50,
  redact: (path, value) => (path.at(-1) === "email" ? "[redacted]" : value),
});
```

The callback changes the inspection copy before storage or streaming. It does not change SDK inputs, responses, or application runtime values. If you use `getJevDevtools()`, put the same options in its factory and restart after changing the policy.

Known credential fields are always redacted. Extend the policy for your own data: field-name matching cannot detect every secret embedded in prose, URLs, images, or unusual field names.

The React [`redactAdditionalSensitiveData`](@/api/reference/#jevdevtools) prop masks supported personal fields by default. That masking only affects the display. The values remain in server capture memory, the event stream, and browser memory.

Check your redaction policy with a synthetic value in the field you want to remove. Inspect the captured payload, including Raw data, and confirm the replacement appears. Do not use a real secret to test redaction.

## Control who can inspect

Choose the access setup that matches where the server is reachable:

| Environment                                   | Required access control                                                                                                                |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Local Node middleware                         | Without `authorize`, only loopback socket connections are accepted.                                                                    |
| Local Web Request handlers, including Next.js | Bind to `127.0.0.1` or supply `authorize`. These handlers cannot inspect the socket address.                                           |
| Shared server, network proxy, or tunnel       | Supply an `authorize(request)` check using your application's authentication, even if the proxy connects to the adapter over loopback. |

An enabled adapter with a non-loopback origin requires [`authorize()`](@/api/reference/#createjevdevtools). The callback should grant access only to users allowed to inspect the captured data.

Same-origin checks remain in place, but they do not authenticate a user. Other HTTP clients can set Host and Origin headers themselves. Verify that an unauthorized request cannot read configuration, subscribe to events, or clear history.

## Separate session history

Without a custom scope, all authorized clients share the local history. To separate users or workspaces:

1. Configure [`getSession(request)`](@/api/reference/#createjevdevtools) to return a scope derived from server-authenticated identity.
2. Wrap inference handlers in [`inspector.run(request, callback)`](@/api/reference/#adapter-run) so captures use the same scope as inspector requests.
3. Check with two test identities that each sees only its own captures and that Clear affects only the current scope.

Keep identity resolution consistent across inference, event-stream, and clear requests. Do not use an untrusted query parameter as the scope. `inspector.run()` selects a recording scope; it does not authenticate the inference request.

## Understand retention

Request history defaults to 50 entries. The recorder's `limit` is clamped to 1–200 and applies globally across scopes. Entries are held in memory and disappear when the process restarts. The drawer's Clear action clears the current scope.

Separate size, depth, text, collection, and image budgets may omit or truncate capture data. They do not change the values your application receives. Treat captures as bounded inspection copies when investigating incomplete data.

See the [integration reference](https://github.com/diegoag64/jev-devtools/blob/main/docs/integration.md#history-and-access) for the full access and redaction contract.
