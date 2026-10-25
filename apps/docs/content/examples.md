## Run without an API key

The independent consumer apps use the real SDK with fixed responses. They are useful for verifying an installation before connecting live inference. The checkout commands below use the repository’s npm lockfile and packing scripts.

```sh
# From a repository checkout, with Node 22.12+:
npm ci
npm run pack:devtools
cd examples/react-vite
npm install
npm run dev
```

Open the URL printed by Vite. Trigger a sample request and open the inspector. Sample answers are fixed; editing a message does not invoke a model.

| Example                                                                                       | What to explore                                                       |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [React + Vite](https://github.com/diegoag64/jev-devtools/tree/main/examples/react-vite)       | Minimal public-export integration, server plugin, and sample request  |
| [Next.js App Router](https://github.com/diegoag64/jev-devtools/tree/main/examples/nextjs-app) | Route Handler, Server Action, and Server Component sharing an adapter |
| [Playground](https://github.com/diegoag64/jev-devtools/tree/main/apps/playground)             | Choice, Score, Noul, Box, retries, failures, and cancellation         |

The playground is a local tool. Its production build is not a hosted interactive demo.

## Explore complete flows

Cookbooks are repository examples, not files shipped in npm. Each includes setup and sample limitations.

| Cookbook                                                                                                                 | Techniques                                            |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| [SDE cascade](https://github.com/diegoag64/jev-devtools/tree/main/cookbooks/sde-cascade)                                 | Returning conditionals and explicit escalation policy |
| [Hierarchical classification](https://github.com/diegoag64/jev-devtools/tree/main/cookbooks/hierarchical-classification) | Bounded loops, collections, beam versus greedy search |
| [Structure recovery](https://github.com/diegoag64/jev-devtools/tree/main/cookbooks/structure-recovery)                   | Tasks, runtime requests, and conditional continuation |
| [Simple memory](https://github.com/diegoag64/jev-devtools/tree/main/cookbooks/simple-memory)                             | Customer-scoped, run-local sample memory              |
| [RAG passages](https://github.com/diegoag64/jev-devtools/tree/main/cookbooks/rag-passages)                               | Inspectable passage workflow                          |
| [Skill suggestion](https://github.com/diegoag64/jev-devtools/tree/main/cookbooks/skill-suggestion)                       | Dynamic questions and application-owned ranking       |

## Add your own interaction

For docs contributors: examples can have small, page-specific TypeScript modules. The introduction's fixture switcher is one example. Richer demos can load React or the public package lazily when needed. Keep sample policies labeled and API credentials on a server; the static docs app has no inference backend.

## Learn one method at a time

[Flows from scratch](@/guides/flow-basics/) has small checked examples for tasks, Jev requests, conditionals, parallel lanes, maps, and loops. Use the [API glossary](@/api/reference/) to look up their interfaces.
