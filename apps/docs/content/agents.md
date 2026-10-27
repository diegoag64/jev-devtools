Give your coding agent the setup skill shipped with the version of Jev DevTools installed in your app. It explains how to connect the React drawer, Node adapter, and SDK client, then verify that requests are captured.

## Start with the installed skill

After installing `jev-devtools`, the skill is available at:

```text
node_modules/jev-devtools/skills/setup-jev-devtools/SKILL.md
```

Point the agent to that file explicitly. Installing the npm package does not make every coding tool discover the skill automatically. If your tool supports installing skill folders, include the whole `setup-jev-devtools` folder so its adjacent references remain available.

You can start with this prompt:

```text
Read node_modules/jev-devtools/skills/setup-jev-devtools/SKILL.md
and follow the recipe for this app's framework.

Connect Jev DevTools using the app's existing package manager and
project instructions. Preserve authentication, SDK options, and
application behavior. Verify capture with the bundled no-key sample,
then report what passed and anything you could not verify.
```

The skill selects the framework recipe and links to these files inside its `references/` directory:

| Reference       | When to read it                                                            |
| --------------- | -------------------------------------------------------------------------- |
| `react-node.md` | React with a Node backend, including a local Vite development server.      |
| `nextjs.md`     | Next.js App Router on the Node runtime.                                    |
| `flows.md`      | Connected requests, tasks, decisions, collections, loops, and replay.      |
| `verify.md`     | Sample capture, endpoint checks, production behavior, and troubleshooting. |

Flow adoption is optional. Adding the drawer to an app does not require converting existing calls into flows.

## Port existing Jev logic

To convert an existing application or cookbook, or to check whether it fits the Flow API, use [port-jev-to-flow](https://github.com/diegoag64/jev-devtools/blob/main/.agents/skills/port-jev-to-flow/SKILL.md). The skill maps source requests, decisions, and deterministic work to public Flow operations. It requires explicit records of adaptations and unsupported behavior.

This skill lives in the repository at `.agents/skills/port-jev-to-flow/` and is not shipped in npm. Read its [raw Markdown](https://raw.githubusercontent.com/diegoag64/jev-devtools/main/.agents/skills/port-jev-to-flow/SKILL.md) and resolve `references/` links beside that file. For offline use, copy the whole folder, including its references. Cookbook paths refer to a Jev DevTools checkout.

Give the agent the source code or recipe. Preserve question wording, request order and concurrency, threshold boundaries, and external effects. Use the installed setup skill's `references/flows.md` and declarations to check supported APIs. Repository guidance may describe a newer version. Verify with labeled samples and report adaptations before treating the port as equivalent to its source.

## Read plain Markdown

Use **Read as Markdown** at the bottom of any page to get its text with embedded code examples expanded. The site's [llms.txt](@/llms.txt) links to those downloads. The [repository agent index](https://github.com/diegoag64/jev-devtools/blob/main/llms.txt) also links to the setup skill and detailed integration references.

Online docs and the installed package can have different versions. Check the sidebar's build details and the [changelog](@/changelog/) before using an API from the site. When versions differ, prefer the installed skill and declarations for your integration.

## Keep contracts grounded

Have the agent check the installed version through the app's package manager, then read its public declarations from disk. These paths are relative to the installed `jev-devtools` directory:

| Declaration file        | Contract                                                           |
| ----------------------- | ------------------------------------------------------------------ |
| `lib/src/index.d.ts`    | React component, browser-safe capture helpers, and protocol types. |
| `lib/server/index.d.ts` | Adapter factories, HTTP handlers, and recorder.                    |
| `lib/flow/index.d.ts`   | Flow builders, expressions, execution, and replay.                 |

Application code must use public imports: `jev-devtools`, `jev-devtools/server`, and `jev-devtools/flow`. The latter two runtime entries belong on Node. Reading declaration files from disk does not make internal paths or `jev-devtools/package.json` valid package imports.

Keep the integration consistent with the bundled recipe:

- Share one adapter between inference and inspector routes in the same Node process.
- Keep credentials on the server and preserve application authentication and redaction.
- Distinguish fixed sample answers from live inference, and application routing policies from model outputs.
- Follow the consumer app's own instructions and build commands. The repository's [AGENTS.md](https://github.com/diegoag64/jev-devtools/blob/main/AGENTS.md) governs contributions to Jev DevTools itself.

## Resolve API references

The [API glossary](@/api/reference/) has permanent links to methods, parameter and return tables, and exact declarations extracted from the package used to build that docs snapshot. Use the rendered glossary for deep links and the Markdown download for text lookup.

Start with [Flows from scratch](@/guides/flow-basics/) for a complete greeting definition and awaited run. The glossary has complete examples for the other flow operations. Check their APIs against the installed declarations before adapting them to an older version.

## Ask for verification evidence

A mounted drawer and a successful build do not prove that capture is connected. The bundled `references/verify.md` walks through the observable checks. Ask the agent to report:

1. The development URL, adapter endpoint, and client used for capture.
2. A sample request visible in the running app's drawer, including its question and returned answer.
3. The app's typecheck/build results and disabled production behavior.
4. Whether verification used fixed samples or live inference, and any checks left incomplete.

Run the sample through the same server that serves the inspector. A separate CLI process cannot add a capture to that server's in-memory history. Live calls, publication, and deployment need separate authorization from setup work.
