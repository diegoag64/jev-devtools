# Project workflow

For repository contributions, use the rules and task pointers below. For installation into another app, read [the bundled setup skill](packages/jev-devtools/skills/setup-jev-devtools/SKILL.md) and follow that app's workflow. [llms.txt](llms.txt) indexes consumer documentation.

## Always apply

- Work on a feature branch and open a PR targeting `main` unless the user explicitly requests otherwise. Never commit or push directly to `main`. Push completed, verified work and leave the PR open for review.
- A request to release a version authorizes the complete [release checklist](docs/releases.md#release-authorization), including its release PR merge and matching docs deployment, without further approval prompts. Otherwise merging, publishing, and deploying require explicit authorization. Preparation, CI, and merging alone do not authorize publication.
- Keep the package independent of the playground; consumers use public exports. Keep API credentials on the server, distinguish samples from live inference, and follow official TypeSafe semantics. Diagrams must not invent model reasoning or routing policies.
- Run performance benchmarks locally, never in GitHub Actions. Keep generated results, profiles, screenshots, logs, and reports under ignored `benchmarks/results/`; keep scripts and fixtures tracked.

## Read for the task

- **Porting Jev logic or auditing Flow API fit:** use [port-jev-to-flow](.agents/skills/port-jev-to-flow/SKILL.md) for source fidelity, supported composition, and verification.

- **Implementation or review:** follow [boundary and contract verification](CONTRIBUTING.md#boundary-and-contract-verification) for affected guarantees, bug reproduction, supported combinations, public types, composed limits, capture metadata, and regression proof. For capture work, also trace the [flow capture boundaries](docs/architecture.md#flow-capture-boundaries).
- **Opening or updating a PR:** follow [PR titles](CONTRIBUTING.md#pr-titles), [PR descriptions](CONTRIBUTING.md#pr-descriptions), and the [template](.github/pull_request_template.md). For source changes, complete [verification](CONTRIBUTING.md#verification-details): `npm run verify:all`, or `npm run verify:receipts` only for eligible existing receipt edits. Visually verify UI changes when browser access is available and disclose gaps.
- **User-visible changes, including docs and tooling:** update Unreleased using [changelog guidance](CONTRIBUTING.md#keep-the-changelog-current). Preserve compatibility notes, publication facts, and PR links.
- **Package CSS or its consumers, including markup/state changes:** follow the full [CSS review procedure](CONTRIBUTING.md#package-css-review), audit affected rules in the same PR, and run `npm run verify:drawer`.
- **Docs or public APIs:** keep companion guidance and the shipped setup skill aligned in the same PR; follow [docs maintenance](CONTRIBUTING.md#keep-the-docs-current), including method style and `npm run verify:docs`.
- **Versions or releases:** follow [version preparation](docs/releases.md#future-releases), including `npm run sync:readme-version`, and the [release checklist and completion rule](docs/releases.md#release-checklist). Publication candidates require full verification; report partial completion explicitly.
- **Hosted docs:** follow the [docs publishing policy](docs/docs-publishing.md) for the reviewed artifact, authorization, deployment, and receipt.
- **Moving code:** preserve third-party notices and PR-based workflow documentation, as required by [CONTRIBUTING.md](CONTRIBUTING.md).
