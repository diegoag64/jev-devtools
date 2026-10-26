Use `JevDevtools` to display the requests and flows captured by your server adapter. This page covers its props, rendering, and lifecycle. For the complete server connection, use [Quick start](@/getting-started/) or [Next.js](@/guides/nextjs/).

## Import and mount

<!-- example: client.tsx -->

`Root` renders the inspector beside the application content. In Vite, `import.meta.env.DEV` enables it during development. `defaultOpen={false}` starts with the launcher so the user can open the drawer when needed.

### Rendered output

| Value            | Type                    | Description                                                                                |
| ---------------- | ----------------------- | ------------------------------------------------------------------------------------------ |
| Component return | React element or `null` | Nothing during SSR or while disabled; the connected inspector after mounting when enabled. |

Mount once near the application root. The component is safe to import during SSR and renders nothing until it is both mounted and enabled. Its launcher and drawer render in a Shadow DOM under `document.body`.

## Props

| Prop                                                            | Type      | Default             | Behavior                                                                                 |
| --------------------------------------------------------------- | --------- | ------------------- | ---------------------------------------------------------------------------------------- |
| `enabled`                                                       | `boolean` | `false`             | Opt in to loading and connecting the inspector.                                          |
| `endpoint`                                                      | `string`  | `/api/jev-devtools` | Same-origin adapter path. Must match the server.                                         |
| `defaultOpen`                                                   | `boolean` | `true`              | Initial expanded state; set false to start at the launcher.                              |
| [`redactAdditionalSensitiveData`](@/api/reference/#jevdevtools) | `boolean` | `true`              | **0.5.0.** Mask supported personal fields in the display. Does not remove captured data. |

Import [`JevDevtoolsProps`](@/api/reference/#type-jevdevtoolsprops) from `jev-devtools` when typing a wrapper component.

`enabled` controls loading and connecting at runtime. Setting it to false in production does not guarantee that your bundler removes every inspector asset. Display masking also does not remove data from captures: use [server redaction](@/guides/privacy/#choose-what-leaves-the-server) for fields that must never reach the browser.

## Styles

The drawer injects its own stylesheet. No CSS import is needed. Page selectors cannot reach the shadow tree; do not depend on host CSS to customize drawer internals.

Document-level transforms, clipping, and page JavaScript can still affect the host. Shadow DOM is style encapsulation, not a security boundary.

## Lifecycle

When `defaultOpen` is false, the panel first mounts when opened. After that, closing it preserves selection, filters, and view state while incoming traces continue to update history.

Disabling or unmounting the component closes its subscription. Server capture continues independently until the server adapter is disabled or disposed.

## Browser-safe types

[`Trace`](@/api/reference/#type-trace), [`Snapshot`](@/api/reference/#type-snapshot), [`StreamSnapshot`](@/api/reference/#type-streamsnapshot), [`TraceDelta`](@/api/reference/#type-tracedelta), [`Json`](@/api/reference/#type-json), [`AnswerView`](@/api/reference/#type-answerview), and [`QuestionView`](@/api/reference/#type-questionview) are exported from the root entry point. They describe captured protocol data, which may be redacted or truncated. See [recorder and types](@/api/recorder/) for advanced integrations.

<a id="fixture-export-unreleased"></a>

## Fixture export

Since **0.5.0**, the root entry exports browser-safe [`flowFixture()`](@/api/reference/#flowfixture) and the types [`FlowFixture`](@/api/reference/#type-flowfixture) and [`BuiltFlowFixture`](@/api/reference/#type-builtflowfixture). Use these to export captured Jev responses from browser code. See [Build a fixture](@/api/flow/#build-a-fixture) for parameters, missing responses, and masking behavior.
