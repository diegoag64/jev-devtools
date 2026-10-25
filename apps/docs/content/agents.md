## Start with the installed skill

The npm package includes setup instructions at:

```text
node_modules/jev-devtools/skills/setup-jev-devtools/SKILL.md
```

Use that skill and its adjacent references for version-matched React/Node, Next.js, flow, and verification recipes. This is an explicit entry point, not a promise that every agent discovers it automatically.

## Read plain Markdown

Every page has a **Read as Markdown** link with expanded examples. The site's [llms.txt](@/llms.txt) lists these pages. The repository's [agent index](https://github.com/diegoag64/jev-devtools/blob/main/llms.txt) also points to the bundled setup skill and original detailed guides.

## Keep contracts grounded

Check the installed public declaration files and package version before proposing code. Use public imports; keep `/server` and `/flow` in Node code. Distinguish fixed sample responses from live inference and application policies from model outputs.

The repository [AGENTS.md](https://github.com/diegoag64/jev-devtools/blob/main/AGENTS.md) describes contributing to this package. It is not the installation workflow for a consumer application; follow that application's own instructions.

## Resolve API references

The [API glossary](@/api/reference/) documents every public method and includes exact declarations from the working-tree package. Its method anchors also work in the raw Markdown download. Prefer the [beginner flow examples](@/guides/flow-basics/) for small complete definitions.
