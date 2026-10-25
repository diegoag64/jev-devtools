## Import and mount

<!-- example: client.tsx -->

Mount once near the application root. The component is safe to import during SSR: it renders nothing until mounted and enabled. Its launcher and drawer render into a Shadow DOM boundary under `document.body`.

## Props

| Prop                            | Type      | Default             | Behavior                                                                                      |
| ------------------------------- | --------- | ------------------- | --------------------------------------------------------------------------------------------- |
| `enabled`                       | `boolean` | `false`             | Opt in to loading and connecting the inspector.                                               |
| `endpoint`                      | `string`  | `/api/jev-devtools` | Same-origin adapter path. Must match the server.                                              |
| `defaultOpen`                   | `boolean` | `true`              | Initial expanded state; set false to start at the launcher.                                   |
| `redactAdditionalSensitiveData` | `boolean` | `true`              | **Unreleased.** Mask supported personal fields in the display. Does not remove captured data. |

`JevDevtoolsProps` is exported from `jev-devtools` for component wrappers. Production disabling is a runtime opt-in policy, not a promise that every bundler removes inspector assets.

## Styles

The drawer injects its own stylesheet. You do not need an import. The `jev-devtools/styles.css` public export remains available for compatibility with existing integrations. Page selectors cannot reach the shadow tree; do not depend on host CSS to customize drawer internals.

Document-level transforms, clipping, and page JavaScript can still affect the host. Shadow DOM is style encapsulation, not a security boundary.

## Lifecycle

Closing preserves selection, filters, and view state while incoming traces continue to update history. The panel first mounts on opening when `defaultOpen` is false. Disabling or unmounting disconnects the component; it does not stop independent server capture.

## Browser-safe types

`Trace`, `Snapshot`, `StreamSnapshot`, `TraceDelta`, `Json`, `AnswerView`, and `QuestionView` are exported from the root entry point. They describe captured protocol data, which may be redacted or truncated. See [recorder and types](@/api/recorder/) for advanced integrations.
