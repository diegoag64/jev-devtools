# Jev DevTools

[![npm version 0.5.5](https://img.shields.io/badge/npm-v0.5.5-E551BA?labelColor=0D0A0F&logo=npm)](https://www.npmjs.com/package/jev-devtools/v/0.5.5)

A React inspector for TypeSafe Jev requests captured through a Node server adapter. Inspect request inputs, returned answers and probabilities, retries, and errors. Use the optional Flow API to connect requests and application steps in a diagram.

[Website](https://jevtools.dev/) · [Documentation](https://docs.jevtools.dev/) · [API reference](https://docs.jevtools.dev/api/reference/) · [For AI agents](#for-ai-agents)

## Demo

![Jev DevTools sample recording showing the request drawer and diagrams.](https://raw.githubusercontent.com/diegoag64/jev-devtools/main/docs/assets/jev-devtools-preview.gif)

The recording uses sample responses. Try the [sample apps and cookbooks](https://docs.jevtools.dev/examples/) without an API key. Cookbook application code and fixtures live in the repository and are not bundled in npm.

## Install

Use matching React and React DOM **18.x or 19.x**, Node **22.12+**, TypeSafe SDK **0.7.x**, and ESM imports. TypeScript consumers need **5.4+** and compatible React and Node types. React and React DOM are required peers even in a server-only workspace. See [compatibility and public imports](https://github.com/diegoag64/jev-devtools/blob/main/docs/integration.md#compatibility-and-public-imports) for exact ranges and compiler settings.

Install in each workspace that imports the package:

```sh
npm install jev-devtools @typesafe-ai/sdk
```

Connect one React drawer, one shared Node adapter, and an instrumented client created with `inspector.createClient()`. Only calls through that client are captured. The drawer and adapter default to disabled. Enable both for development and keep API keys on the server.

Choose the setup guide for your app:

- [React with Node](https://docs.jevtools.dev/getting-started/) connects an existing Express server and a Vite React app, with proxy configuration and capture checks.
- [Next.js App Router](https://docs.jevtools.dev/guides/nextjs/) uses `getJevDevtools` for a shared adapter, `handleNodeRoute` in an optional catch-all route, and a client component for the drawer. Externalize `@typesafe-ai/sdk` and keep `jev-devtools` bundled. The package does not require a Next.js dependency.

Mount the drawer once near your app's root. It supplies its own styles inside a Shadow DOM boundary and requires no CSS import, Tailwind, or shadcn. The browser entry is safe for server rendering. Pan the Flow canvas by dragging, zoom by scrolling or pinching, or select **Fit**.

### Runtime and access

The inspector routes and application client must share one adapter in the same Node process. Keep `jev-devtools/server` and `jev-devtools/flow` on Node. Edge runtimes and history aggregation across distributed or serverless instances are unsupported.

The drawer receives same-origin server-sent events, starting with a snapshot and then changed traces. Older client and server combinations can use full snapshots. Keep both on the same package version to inspect all supported flow steps. History is bounded to 50 calls in memory by default.

Bind local development servers to `127.0.0.1`. Without `authorize`, Node middleware accepts only loopback connections. Web Request handlers cannot inspect the connection's address. Shared access and tunnels require real [authorization and access controls](https://github.com/diegoag64/jev-devtools/blob/main/docs/integration.md#history-and-access). Match the adapter's `origin` to the browser URL, and proxy the inspector endpoints when the frontend and backend use different ports.

### Capture privacy

Captures contain bounded, redacted copies of request context and answers. Application and SDK data remain unchanged. Diagrams show captured data and application-defined routing, not hidden model reasoning.

Known credential fields and custom server redactions cannot be revealed in the drawer. Headers and client options are not captured. Arbitrary secrets in prose or unusual field names still need application-specific server redaction. See the [redaction policy and limits](https://github.com/diegoag64/jev-devtools/blob/main/docs/integration.md#redaction-policy).

`redactAdditionalSensitiveData` defaults to `true` and masks supported email, phone, postal address, SSN, and card-number fields in the drawer. Set it to `false` on `JevDevtools` to disable that display masking, including in existing views. **Display masking does not remove captured data.** The underlying values remain in capture, stream, and browser memory. Use server-side redaction for data that must not reach the browser.

### Versions and local builds

**Package version: 0.5.5.** [See release notes for verified publication status](https://github.com/diegoag64/jev-devtools/releases/tag/v0.5.5). APIs remain experimental before 1.0. Check the [changelog](https://github.com/diegoag64/jev-devtools/blob/main/CHANGELOG.md) for compatibility and release status. Verification uses sample responses through the real TypeSafe SDK, not live inference.

Hosted docs update separately. Prefer installed declarations and the bundled setup skill when the site's version differs from your package.

<details>
<summary>Try changes from a local checkout</summary>

Pack the Jev DevTools repository, then install the archive in your app:

```sh
# From the jev-devtools repository root:
npm ci
npm run pack:devtools

# From the consuming app:
npm install /absolute/path/to/jev-devtools/jev-devtools-0.5.5.tgz
```

Keep the drawer and server adapter on the same build.

</details>

<a id="connected-jev-flows-with-jev-devtoolsflow"></a>

## Connect requests with flows

Define a flow on Node, then run it for each input. Typed answer references can feed later requests, conditions, and outputs. The API also supports server tasks, parallel steps, bounded collections, conditional paths that rejoin, and stateful loops.

This example asks whether a message is ready for review. An application-defined threshold selects an outcome. Reuse the instrumented `jev` client and shared `inspector` from your server integration. Running this example with a live client makes an inference request:

```ts
import { noul } from "@typesafe-ai/sdk";
import { defineJevFlow } from "jev-devtools/flow";

const review = defineJevFlow<{ message: string }>("review", (flow) => {
  const readiness = flow.jev("readiness", {
    state: flow.input,
    questions: {
      ready: noul("Does this message include enough detail to review?"),
    },
  });

  return flow.branch("route", {
    // Example application policy, not a threshold supplied by Jev.
    when: readiness.answer("ready").noul.gte(0.9),
    then: (path) => path.output("ready"),
    else: (path) => path.output("needs-detail"),
  });
});

const result = await review.run(
  { message: "Please review the attached proposal." },
  { client: jev, devtools: inspector },
);
console.log(result.outcome); // "ready" or "needs-detail", depending on the answer.
```

Open **Jev DevTools**, select **Flows**, and open the run. Inspect the returned probability and the condition that selected the path. Untaken paths remain visible. The flow returns an outcome. Your application decides what to do with it.

Runs support SDK retries and cancellation, with bounded in-memory inspector history. They do not provide durable workflow execution. Learn the API in [Flows from scratch](https://docs.jevtools.dev/guides/flow-basics/) or look up contracts in the [flow reference](https://github.com/diegoag64/jev-devtools/blob/main/docs/flows.md).

## Replay and compare runs

Replay and comparison require **0.5.0 or later**. Choose **Copy fixture** on a captured run to save its answers as JSON. `replayClient(fixture)` from `jev-devtools/flow` supplies those answers without Jev inference or an API key. Tasks run again and may call outside services.

`compareWithFixture` compares answers, routing, and item steps with a saved fixture. It runs the flow with the supplied client and can make live calls. See the [Flow API reference](https://docs.jevtools.dev/api/flow/) for fixture requirements and complete examples.

<a id="set-up-with-your-coding-agent"></a>

## For AI agents

Start with the `jev-devtools` version installed in the consuming app. Follow that app's project instructions and use its existing package manager. Choose guidance for the task:

| Task                                                     | Instructions                                                                                                                                                                                                                                                     |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Install or troubleshoot the inspector                    | Read `node_modules/jev-devtools/skills/setup-jev-devtools/SKILL.md`. The [setup skill](https://github.com/diegoag64/jev-devtools/blob/main/packages/jev-devtools/skills/setup-jev-devtools/SKILL.md) selects the framework recipe and capture checks.            |
| Build a flow                                             | Read `references/flows.md` inside the installed setup skill. The [flow recipe](https://github.com/diegoag64/jev-devtools/blob/main/packages/jev-devtools/skills/setup-jev-devtools/references/flows.md) covers builders, execution, capture, replay, and limits. |
| Convert existing Jev logic or check whether it fits Flow | Read [port-jev-to-flow](https://github.com/diegoag64/jev-devtools/blob/main/.agents/skills/port-jev-to-flow/SKILL.md) and its referenced guidance. It maps source behavior to public Flow APIs and records adaptations or unsupported behavior.                  |
| Look up an API contract                                  | Read `lib/src/index.d.ts`, `lib/server/index.d.ts`, or `lib/flow/index.d.ts` inside the installed package. Use the [API reference](https://docs.jevtools.dev/api/reference/) for explanations and examples.                                                      |

The setup skill and its references ship in npm. **The porting skill is repository-only.** Read it at `.agents/skills/port-jev-to-flow/SKILL.md` in a Jev DevTools checkout, or use its [raw Markdown](https://raw.githubusercontent.com/diegoag64/jev-devtools/main/.agents/skills/port-jev-to-flow/SKILL.md). Resolve its `references/` links beside that file. For offline use, copy the whole `port-jev-to-flow` folder, including its references. Cookbook paths in the skill refer to the Jev DevTools repository.

Check online guidance against the installed declarations before using an API. Read declaration files from disk, but import application code only through `jev-devtools`, `jev-devtools/server`, and `jev-devtools/flow`. The latter two run on Node. Internal files and `jev-devtools/package.json` are not application import paths.

Use this prompt to set up an app after installing the package:

```text
Read node_modules/jev-devtools/skills/setup-jev-devtools/SKILL.md
from the package installed for this app, then follow its framework recipe.
Preserve authentication, redaction, SDK options, and application behavior.
Keep credentials on the server. Share one adapter between application calls
and inspector routes in the same Node process.
Verify a labeled sample in the drawer, run the app's typecheck and build,
and check that capture and display are disabled in production.
Report what passed, whether inference was sample or live, and any gaps.
```

For a port, provide the source code or recipe and ask the agent to use `port-jev-to-flow`. Preserve question wording, request order and concurrency, thresholds, and external effects. Report unsupported behavior before changing it. Verify with labeled samples first. Live inference, publication, and deployment require separate authorization.

npm does not register skills with coding tools automatically. Point the agent to the files explicitly, or install each complete skill folder using the tool's supported mechanism. Use [llms.txt](https://raw.githubusercontent.com/diegoag64/jev-devtools/main/llms.txt) to find repository guidance and [the hosted Markdown index](https://docs.jevtools.dev/llms.txt) for docs pages. The [contributor instructions](https://github.com/diegoag64/jev-devtools/blob/main/AGENTS.md) apply when editing Jev DevTools itself.

## Documentation and contributing

Use the [documentation](https://docs.jevtools.dev/) for guides and API examples, and the [repository](https://github.com/diegoag64/jev-devtools/) for sample apps and cookbooks. See [Contributing](https://github.com/diegoag64/jev-devtools/blob/main/CONTRIBUTING.md) for repository setup, verification, and the pull request workflow. Merging, npm publication, and deployment each require explicit authorization.

## Credits and license

Inspired by the TanStack Query DevTools workflow, with a custom drawer and TanStack Virtual for the Questions list. The TanStack DevTools shell is not included. Diagram styling is based on [Cathryn Lavery's diagram-design](https://github.com/cathrynlavery/diagram-design).

Jev DevTools is an independent, open-source community project. It is not affiliated with TypeSafe AI. TypeSafe branding belongs to its respective owner.

Project code is MIT licensed. See the bundled `LICENSE` and `THIRD_PARTY_NOTICES.txt`, or read the repository's [license](https://github.com/diegoag64/jev-devtools/blob/main/LICENSE) and [third-party notices](https://github.com/diegoag64/jev-devtools/blob/main/THIRD_PARTY_NOTICES.txt).
