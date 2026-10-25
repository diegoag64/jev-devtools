## Enable intentionally

The server adapter and React component default to disabled. Enable them for local development. Keep API keys on the server. A disabled adapter returns an ordinary SDK client; it does not disable your application's inference calls.

## Choose what leaves the server

```ts
const inspector = createJevDevtools({
  enabled: process.env.NODE_ENV === "development",
  origin: "http://localhost:3000",
  limit: 50,
  redact: (path, value) => (path.at(-1) === "email" ? "[redacted]" : value),
});
```

Import `createJevDevtools` from `jev-devtools/server`. The callback changes the captured copy, not SDK inputs or application values. Known credential fields are always redacted; extend the policy for your own sensitive data. Field-name redaction does not detect every secret in prose, URLs, images, or unusual field names.

> **Unreleased:** expanded credential aliases and the default-on `redactAdditionalSensitiveData` prop are present in the working tree. Display masking leaves values in server capture memory, the event stream, and browser memory. Use server-side redaction when data must never reach the browser.

## Control who can inspect

Same-origin checks protect browser access. Other HTTP clients can set Host and Origin headers. Node middleware therefore also requires a loopback socket when `authorize` is absent. Web Request handlers do not have socket information: bind the server to `127.0.0.1` or supply authorization.

An enabled non-loopback origin requires `authorize(request)`. Use your existing application authentication. A network-reachable proxy or tunnel also needs authorization, even if it connects to the adapter over loopback.

## Separate session history

`getSession(request)` derives a trusted scope from server-authenticated identity. Wrap the inference handler with `inspector.run(request, callback)` so capture uses that same scope. `run` chooses the recording scope; it is not an authentication check.

Without a custom scope, authorized clients share the local history. Do not use an untrusted query parameter as a session identity. See the [integration guide](https://github.com/diegoag64/jev-devtools/blob/main/docs/integration.md#history-and-access) for the full access and redaction contract.

## Understand retention

Request history defaults to 50 entries, bounded globally by the recorder's limit (clamped to 1–200). Data is in memory and disappears on process restart. The drawer's Clear action clears the current scope. Capture size, depth, text, collection, and image budgets can truncate inspection data; they do not alter application results.
