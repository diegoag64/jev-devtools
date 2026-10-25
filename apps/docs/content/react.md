## Import and mount

<!-- example: client.tsx -->

**Example walkthrough:** `import.meta.env.DEV` enables the inspector in Vite development builds. `defaultOpen={false}` starts at the launcher, so users open the drawer when they need it. The component is a sibling of the application's main content.

### Rendered output

| Value | Type | Description |
| --- | --- | --- |
| Component return | React element or `null` | Nothing during SSR or while disabled; the connected inspector after mounting when enabled. |


Mount once near the application root. The component is safe to import during SSR: it renders nothing until mounted and enabled. Its launcher and drawer render into a Shadow DOM boundary under `document.body`.

## Props

| Prop                            | Type      | Default             | Behavior                                                                                      |
| ------------------------------- | --------- | ------------------- | --------------------------------------------------------------------------------------------- |
| `enabled`                       | `boolean` | `false`             | Opt in to loading and connecting the inspector.                                               |
| `endpoint`                      | `string`  | `/api/jev-devtools` | Same-origin adapter path. Must match the server.                                              |
| `defaultOpen`                   | `boolean` | `true`              | Initial expanded state; set false to start at the launcher.                                   |
| [`redactAdditionalSensitiveData`](@/api/reference/#jevdevtools) | `boolean` | `true`              | **0.5.0.** Mask supported personal fields in the display. Does not remove captured data. |

[`JevDevtoolsProps`](@/api/reference/#type-jevdevtoolsprops) is exported from `jev-devtools` for component wrappers. Production disabling is a runtime opt-in policy, not a promise that every bundler removes inspector assets.

## Styles

The drawer injects its own stylesheet. No CSS import is needed. Page selectors cannot reach the shadow tree; do not depend on host CSS to customize drawer internals.

Document-level transforms, clipping, and page JavaScript can still affect the host. Shadow DOM is style encapsulation, not a security boundary.

## Lifecycle

Closing preserves selection, filters, and view state while incoming traces continue to update history. The panel first mounts on opening when `defaultOpen` is false. Disabling or unmounting disconnects the component; it does not stop independent server capture.

## Browser-safe types

[`Trace`](@/api/reference/#type-trace), [`Snapshot`](@/api/reference/#type-snapshot), [`StreamSnapshot`](@/api/reference/#type-streamsnapshot), [`TraceDelta`](@/api/reference/#type-tracedelta), [`Json`](@/api/reference/#type-json), [`AnswerView`](@/api/reference/#type-answerview), and [`QuestionView`](@/api/reference/#type-questionview) are exported from the root entry point. They describe captured protocol data, which may be redacted or truncated. See [recorder and types](@/api/recorder/) for advanced integrations.

<a id="fixture-export-unreleased"></a>

## Fixture export

The root entry also exports browser-safe [`flowFixture`](@/api/reference/#flowfixture), [`FlowFixture`](@/api/reference/#type-flowfixture), and [`BuiltFlowFixture`](@/api/reference/#type-builtflowfixture). See [building a fixture](@/api/flow/#build-a-fixture) for parameters, missing captures, and masking behavior. These exports are new in **0.5.0**.
