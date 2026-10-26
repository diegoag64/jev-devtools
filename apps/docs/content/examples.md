Choose a sample app to see the integration, a cookbook to explore a complete workflow, or a small API example to learn one operation. The apps and cookbooks run from a repository checkout. Their code and fixtures are not included in the npm package.

## Run without an API key

The sample apps use the real TypeSafe SDK with fixed responses. They let you check request capture and drawer behavior without calling an inference service.

| Example                                                                                       | Use it to explore                                                                                  |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [React + Vite](https://github.com/diegoag64/jev-devtools/tree/main/examples/react-vite)       | A minimal integration using public package exports, a local server plugin, and one sample request. |
| [Next.js App Router](https://github.com/diegoag64/jev-devtools/tree/main/examples/nextjs-app) | Route Handlers, Server Actions, and Server Components sharing one adapter.                         |
| [Playground](https://github.com/diegoag64/jev-devtools/tree/main/apps/playground)             | Choice, Score, Noul, Box, retries, failures, cancellation, and connected flows.                    |

To try the React + Vite app, start in a checkout of [this repository](https://github.com/diegoag64/jev-devtools). Use the Node version pinned in `.nvmrc` for repository work. The package supports Node 22.12+.

```sh
# From the repository root:
npm ci
npm run pack:devtools
cd examples/react-vite
npm install
npm run dev
```

`pack:devtools` creates the package archive that this independent app installs. These checkout commands use the repository's npm lockfile and scripts.

Open [http://127.0.0.1:4183](http://127.0.0.1:4183/), then:

1. Click **Classify a sample ticket**. Expect the status **Captured sample response**.
2. Open the Jev DevTools launcher and select **Consumer ticket**.
3. Inspect the `category` question. The fixed response chooses `billing`.

For Next.js, follow the [example's run instructions](https://github.com/diegoag64/jev-devtools/blob/main/examples/nextjs-app/README.md). For the playground, follow its [local setup](https://github.com/diegoag64/jev-devtools/blob/main/apps/playground/README.md). The playground requires its local server; its production build is not a hosted interactive demo.

## Explore complete flows

The cookbooks below run inside the playground. Each README explains the sample cases, application policies, source recipe, and limitations.

| Cookbook                                                                                                                 | What to inspect                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| [SDE cascade](https://github.com/diegoag64/jev-devtools/tree/main/cookbooks/sde-cascade)                                 | Field verification, conditional escalation, and a shared continuation that returns the final record.                      |
| [Hierarchical classification](https://github.com/diegoag64/jev-devtools/tree/main/cookbooks/hierarchical-classification) | Beam and greedy search through bounded loops, frontier collections, and retained or pruned paths.                         |
| [Structure recovery](https://github.com/diegoag64/jev-devtools/tree/main/cookbooks/structure-recovery)                   | Tasks that join text, requests built from those results, and formatting based on returned labels.                         |
| [Simple memory](https://github.com/diegoag64/jev-devtools/tree/main/cookbooks/simple-memory)                             | Ticket routing with customer-scoped memory that starts fresh for each run.                                                |
| [RAG passages](https://github.com/diegoag64/jev-devtools/tree/main/cookbooks/rag-passages)                               | Passage assessment with bounded concurrency and explicit rules for including, excluding, or flagging evidence.            |
| [Skill suggestion](https://github.com/diegoag64/jev-devtools/tree/main/cookbooks/skill-suggestion)                       | Dynamic questions, shortlist ranking, and a final suggestion or abstention. No skill is executed.                         |
| [Function calling](https://github.com/diegoag64/jev-devtools/tree/main/cookbooks/function-calling)                       | One batched request, selected-argument omit/fill branches, defaults and minimum decision confidence. Proposed calls only. |

From the **repository root**, start the playground:

```sh
npm ci
npm run dev
```

Open [http://127.0.0.1:4182](http://127.0.0.1:4182/), choose a cookbook and sample, then click **Run sample**. Open **Jev DevTools → Flows** and select the latest run. Compare the application's result with the executed steps, linked requests, and routing decisions. The [cookbook index](https://github.com/diegoag64/jev-devtools/blob/main/cookbooks/README.md#choose-an-example) has direct local links to each example.

All six have samples that need no API key. Their synthetic responses demonstrate execution and inspection, not model accuracy. Editing an input does not turn a fixed response into live inference. Some examples reject inputs that do not match their fixtures. Live support varies by example, so read its README before configuring a key.

## Learn one method at a time

[Flows from scratch](@/guides/flow-basics/) builds a greeting flow without an API key. [Build a flow](@/guides/flows/) adds a Jev request and routes its answer to a named outcome.

For a specific operation, use the complete define-and-run examples in the [API glossary](@/api/reference/#flow-definitions-and-steps). They cover tasks, Jev requests, conditionals, branches, parallel lanes, maps, and loops, with parameter tables and expected results. The [Flow builder reference](@/api/flow/) explains how these operations compose and includes replay examples.

<a id="add-your-own-interaction"></a>

## Contribute an example

To add an example to the docs, follow the [docs app's authoring guide](https://github.com/diegoag64/jev-devtools/blob/main/apps/docs/README.md#author). Complete code examples belong in its checked examples directory. Interactive demos can use small, page-specific TypeScript modules and load React or the public package lazily when needed.

Label fixed responses and application policies clearly. Keep API credentials on a server. The static docs app has no inference backend, and its introduction demo uses fixed values.
