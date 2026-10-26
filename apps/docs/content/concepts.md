Jev DevTools records TypeSafe requests on your Node server and shows them in a React drawer. Understanding where capture happens helps you connect the right client, interpret what you see, and control access to the data.

<a id="three-pieces-one-process"></a>

## Client, adapter, and drawer

The integration has three parts:

- **The SDK client** sends your application's `systemOne` requests. Create it through [`inspector.createClient()`](@/api/reference/#adapter-createclient) so the adapter can observe those calls.
- **The server adapter** records inspection copies in bounded, in-memory history and serves them through same-origin HTTP endpoints.
- **The React drawer** subscribes to the adapter's event stream and displays the history in your app.

When your application makes a request, the SDK returns its result to your code while the adapter records the request's progress. The drawer receives updates as they happen. It does not send the inference request itself.

Your inference handlers and inspector endpoints must use the same adapter in the same Node process. [`getJevDevtools()`](@/api/reference/#getjevdevtools) can share an adapter across module reloads within one Node realm. It cannot combine history from separate workers, serverless instances, or machines. Calls through unrelated SDK clients do not appear automatically.

<a id="capture-versus-display"></a>

## Inspection copies

The recorder observes copies of inputs, answers, and metadata. The SDK promise, helpers, cancellation, and application results keep their normal behavior. Capture limits can omit or truncate the inspection copy without shortening the value your application receives.

There are two places to hide sensitive data:

- **Server redaction** removes known credential fields from captures before storage or streaming. Your [`redact`](@/api/reference/#createjevdevtools) callback can remove additional application data.
- **Display masking** hides supported personal fields in the drawer. The [`redactAdditionalSensitiveData`](@/api/reference/#jevdevtools) prop is on by default, but those values remain in server capture memory, the event stream, and browser memory.

Use server redaction for data that must never reach the browser. [Privacy & access](@/guides/privacy/) covers redaction, authorization, session scopes, and retention.

<a id="a-request-versus-a-flow"></a>

## Requests and flows

A **request** is one logical `systemOne` call, which may include retries. You can inspect individual requests without adopting flows.

A **flow** connects requests and application code into named steps, decisions, and outcomes. For example, a support flow might ask Jev to classify a message, use the returned Choice to select a team, and return that team's name. The diagram shows the steps and routing rules your application defines. It does not describe hidden model reasoning.

A flow has two stages:

1. [`defineJevFlow()`](@/api/reference/#definejevflow) builds the definition synchronously. Builder calls describe steps and create references to future values. They do not send requests or run tasks.
2. [`run()`](@/api/reference/#flow-run) starts a fresh execution with an input. It resolves those references as steps run and follows the selected paths. Passing `devtools: inspector` records the execution.

[Flows from scratch](@/guides/flow-basics/) walks through these stages with a greeting task that needs no API key.

<a id="closing-versus-disabling"></a>

## Closing and disabling

The drawer and server adapter have separate controls. Both default to disabled.

| Action                                 | Effect                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------- |
| Close the drawer                       | Preserves its controls and retained UI state. The subscription and server capture continue. |
| Disable or unmount the React component | Closes its subscription. The server can still record requests.                              |
| Disable the server adapter             | Stops recording and hides inspector endpoints. Ordinary SDK calls continue.                 |

Closing the drawer does not stop capture. Use the server adapter's `enabled` option to control whether requests are recorded.

<a id="sample-versus-live"></a>

## Samples and live requests

The repository's sample apps use the real SDK with fixed response transports. They make no inference-service calls, so editing sample context does not change the returned answers. The interactive preview in these docs also uses fixed values.

Live requests use a server-side API key and return answers from the inference service. Whether a request is sample or live depends on its transport, not whether the drawer is open or recording is enabled.
