# Contributing

Use a feature branch and pull request against `main`, including small fixes and documentation edits. Do not push directly to `main`. Leave PRs open for review unless merging is authorized. A versioned release request authorizes the complete [release checklist](docs/releases.md#release-authorization), including its release PR merge and matching docs deployment, without further approval prompts. Other merges, publications, and deployments require explicit authorization.

1. Run `nvm install && nvm use` from the repository root, then `npm ci`. `.nvmrc` pins the development runtime; Node 22.12+ remains supported and CI also checks that minimum.
2. Create a branch from current `main`.
3. Start the sample playground with `npm run dev`.
4. Keep reusable code in `packages/jev-devtools`; sample scenarios and app-specific policy belong in `apps/playground`. Use public package imports across this boundary.
5. Run `npm run format`, then `npm run verify:all` for the complete verification sequence described below. Check changed UI interactions in the browser when available and describe any verification gaps.
6. Push the feature branch and open a PR describing the behavior, checks, and limits. Use samples unless live verification is explicitly requested.

Preserve third-party notices and PR-based workflow documentation when moving code. Keep recorder fixtures independent of playground scenarios.

Tests use the real TypeSafe SDK with custom fetch fixtures. No secrets or inference service are required. See [AGENTS.md](AGENTS.md) for agent instructions and [release process](docs/releases.md) for packaging.

For drawer changes, run `npx playwright install chromium --only-shell` once, then `npm run verify:drawer`. This exercises the public component with sample requests in an isolated browser, including hidden updates, reopening, preserved controls, clear, and eviction. It also visits all 150 captured answers through the virtualized Questions view and checks keyboard navigation, focus, expanded legends, mixed answer types, resizing, and scroll restoration. CI runs this check with React 18 and 19. `JEV_VERIFY_PORT` changes its loopback server port (default 4220).

`npm run verify:flows` builds the package and starts/stops the existing sample flow harness on an automatically assigned loopback port. Its production browser bundle is fixed for the run, so rebuilding the package cannot trigger an HMR reload. It checks connected requests, selection/camera retention, cancellation, parallel outcomes, structured content, and readable capture warnings for long rules. Independent map and loop samples also check nested step pickers, request inspection, item/iteration switching, maps inside iterations, and the shared camera across updates and reopening. CI runs these correctness checks with React 18 and 19 and uploads screenshots/server logs for review. Local evidence goes under `benchmarks/results/flows/`; this command runs no performance benchmark or live inference.

## Formatting changed files

`npm run verify:cookbooks` builds the package and runs all discovered cookbook browser checks sequentially. It covers the real playground's registration, sample guards, request inspection, switching, cancellation and desktop/mobile behavior. The complete suite runs locally in `verify:all`. Use `npm run verify:cookbooks -- --only <check>` for focused work.

CI runs only `npm run verify:cookbooks -- --only captures`, on React 19, and uploads its report and logs. This probe compares final retained captures with application results for five representative cookbooks. Collection-wide sample execution, switching, complete results, and workbench interactions are covered by local full verification. Recipe runtime tests retain source-fidelity and boundary checks. Direct Flow runtime, capture, transport and packed declaration tests remain in CI, along with shared drawer and Flow viewer browser checks on React 18 and 19. CI selects and asserts the same React/React DOM versions at both the workspace root and playground to avoid mixed runtimes. These are correctness checks, not performance benchmarks.

The cookbook runner owns a cross-worktree lock in the OS temporary directory and requires loopback port 4182 to be free. A busy lock fails with owner details; retry after the owner finishes. Do not wrap this command in another cookbook lock. The runner terminates its owned process groups on failure, timeout or interruption. Provider fetches are blocked and no real API key reaches the check. The capture-comparison probe uses a dedicated `capture-verification` Vite mode with the supported 200-request history limit, so all seventy Parallel Questions requests are available in its final snapshot without relying on SSE delivery timing. The collection probe separately verifies normal fifty-trace eviction; normal playground configuration is unchanged.

Each cookbook run writes to a unique ignored `benchmarks/results/cookbook-browser/` directory. Its authoritative `summary.json` records the source revision/hash, complete versus selected scope, per-check logs/evidence, and terminal status. Individual check `summary.json` files contain observations; use the suite report for pass/freshness claims. A failure preserves its own evidence and never overwrites an earlier success. New `cookbooks/*/verify-browser.mjs` and `apps/playground/tests/*.browser.mjs` entry points are discovered automatically and use `scripts/cookbook-browser-context.mjs` for the runner-owned evidence directory.

Prettier is pinned in the development dependencies and configured by `.prettierrc.json`. Run `npm run format` to format files changed since the merge base with `origin/main`, including staged, unstaged, and untracked files. Run `npm run format:check` for a read-only check; both accept `-- --base <revision>`. Fetch the base first. Deleted files, lockfiles, generated output, and files without a supported parser are excluded. CI uses the PR base SHA (or the previous push SHA on main). This adopts formatting as files change without a repository-wide reformat.

For opt-in performance measurements, run `npm run bench:server`, `npm run bench:browser`, or `npm run bench:compare -- BASE_COMMIT` locally. Follow the [local benchmark guide](docs/performance.md). Run server and browser benchmarks separately to avoid CPU contention. Never run performance benchmarks in GitHub Actions; hosted CI is for correctness and integration checks. Keep scripts and fixtures tracked, but save all generated results, profiles, screenshots, logs, and per-run reports under ignored `benchmarks/results/`. Put before/after results, commit SHAs, commands, environment, variability, and tradeoffs in the PR description or discussion. Do not force-add artifacts or copy them into `docs/`.

## Package CSS review

Every package style must have a current consumer or a concrete requirement. This includes selectors and their individual declarations, inline styles, custom properties, keyframes, media-query rules, and pseudo-elements. A selector matching an element is not enough if its declarations no longer affect any supported state. Do not retain speculative styles for hypothetical future features.

Apply this review whenever a PR changes package styles **or their consumers**, including removing markup, renaming a class, or changing a component state:

1. Trace affected styles to the rendering component and the state or behavior they support. Search with `rg` across package source, including class builders, conditional attributes, inline style objects, `var(...)`, animation names, and JavaScript `setProperty` calls. Check each selector in a grouped rule and both the definitions and readers of custom properties.
2. Remove styles whose consumers disappeared in the same PR. Inspect the cascade for obsolete overrides, duplicate declarations, ineffective properties, and unused keyframes or variables. Preserve deliberate fallbacks and ordering where supported browsers or states need them. Do not move unused rules elsewhere or add dummy markup to keep them "used."
3. For non-obvious rules, add a nearby comment explaining the requirement: for example, host-page isolation, focus visibility, reduced motion, a supported-browser fallback, or an existing public compatibility contract. Name the protected behavior rather than saying "just in case." Temporary retention needs a linked issue and a clear removal condition. The existence of the public CSS export alone does not justify retaining every historical internal selector.
4. Verify the affected UI in relevant states: opened/closed and conditional panels, focus/hover/disabled controls, virtualized content, resizing, and applicable media preferences. Use computed styles and browser coverage to investigate candidates, but do not delete rules solely because one session did not exercise them or a literal search found no match. Dynamic classes, pseudo-elements, and defensive host resets require checking their actual conditions. For the shared stylesheet, consider both the Shadow DOM drawer and the exported stylesheet in a host page.
5. Run the required repository checks and `npm run verify:drawer`. Add or adjust a browser regression only when it protects a credible observable failure. Avoid tests that merely count selectors, snapshot CSS text, or require every selector to appear as a source string. Record the affected consumers, removed rules or justified retention, browser states checked, and any verification gaps in the PR description.

Keep `packages/jev-devtools/src/inspector.css` as the source for both the embedded stylesheet and the public export generated by `copy-styles.mjs`. Do not edit build outputs. Scope internal selectors to the DevTools boundary, namespace animations, and keep playground/example styling in those apps. Do not introduce automatic purging or broad safelists based on a single render or string search.

This is a contribution and review requirement, not a claim that the current stylesheet has been exhaustively audited. Automated correctness checks supplement the usage review; they do not prove every declaration is necessary.

## PR titles

Use `type: description`, with a lowercase type and one space after the colon. Describe the actual change; update the title if the scope changes.

- `feat: add flow loops`
- `fix: preserve diagram zoom when switching items`
- `docs: explain the memory cookbook`

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, and `revert`. An optional scope and breaking-change marker are supported: `fix(viewer): restore focus` or `feat!: change the flow API`. The description must be nonempty, on one line, with no leading or trailing whitespace.

The **PR title** workflow checks drafts and ready PRs on creation, title edits, new commits and reopening. It only validates metadata; it does not install dependencies or run benchmarks. The **Conventional PR titles** repository ruleset requires this check before merging to `main`.

## PR descriptions

Use the [PR template](.github/pull_request_template.md) whenever creating or updating a PR, including through CLI or API tools. Keep its five headings in order. Write in plain language for a reviewer who has not seen the conversation, and keep the detail proportional to the change: a small fix can use a sentence or two per section. Update the description to reflect the final implementation whenever scope changes.

1. **Problem:** Explain the problem or need and who it affects. For a bug, describe actual versus expected behavior, with reproduction steps and environment details where relevant. Link related issues; use closing keywords only for issues fully resolved by the PR.
2. **Change:** Explain how the implementation addresses the problem and the resulting behavior. Use a concrete before/after example when useful. Include tradeoffs or rejected alternatives only when they help the reviewer understand the chosen approach.
3. **Scope and compatibility:** Identify affected components and explain why changes across them belong together when that is not obvious. Describe effects on public APIs, package exports, CSS integration, supported versions, or packaging, including any migration needed. State when there is no compatibility impact, and identify meaningful limits or follow-up work.
4. **Verification:** Describe checks and observed results for the affected behavior, along with the required repository checks. Include relevant commands, environment details, and evidence; explicitly state what was not checked and why. A checkbox or "tests pass" alone is insufficient. Distinguish sample verification from live inference. Focused evidence supplements the required checks; it does not replace them.
5. **CSS review:** Preserve the template's checklist and provide the evidence required by [Package CSS review](#package-css-review) when package CSS or its consumers change. Otherwise replace the checklist with "Not applicable." Keep the heading.

For visible UI changes, include before/after captures when browser access is available, and a short recording when motion or interaction is needed to show the result. Disclose unavailable browser verification. Link or embed evidence in the PR; keep generated screenshots, recordings, logs, and reports out of Git under ignored `benchmarks/results/`. Performance claims need the comparisons, provenance, variability, and limitations described in the [local benchmark guide](docs/performance.md); benchmarks remain local only.

These are authoring and review requirements. There is no automated PR-description format check.

For authorized PR image uploads, GitHub CLI 2.99.0 or later supports repeatable `--attach` flags on PR create/edit/comment. Check `gh pr comment --help` for support before attempting an upload. Use a body file with a before/after Markdown table and attach both local files; the CLI rewrites image references to uploaded URLs. For example: `gh pr comment <PR> --body-file <comparison.md> --attach <before.png> --attach <after.png>`. Label the actual base/head revisions, scenario, viewport and sample mode; a screenshot before clicking Run is not evidence of the old implementation. Capture the baseline from the named base revision. GitHub documents OAuth login or classic PAT authentication with repository write access for media attachments; do not assume an Actions `GITHUB_TOKEN` supports this upload path. [CLI documentation](https://cli.github.com/manual/gh_pr_comment) and [authentication requirements](https://github.blog/changelog/2026-09-01-github-cli-media-in-issues-pull-requests-and-comments/) describe the supported mechanism. Existing Actions artifacts remain a separate downloadable evidence channel, not inline PR images. Keep media out of Git. Carry any task-specific media waiver separately from source-push authorization; unavailable uploads must not be mistaken for failed browser checks.

## Keep the docs current

Use [jevtools.dev](https://jevtools.dev/) as the product entry point and [docs.jevtools.dev](https://docs.jevtools.dev/) as the primary human documentation. `README.md` and the npm README introduce the package and link to those sites. `apps/docs/content/` owns guided explanations and the API glossary; `docs/integration.md`, `docs/nextjs.md`, and `docs/flows.md` retain detailed repository references and stable paths. The bundled setup skill owns offline, installed-version agent guidance; `llms.txt` indexes it. Package declarations remain the exact API contract, and `CHANGELOG.md` owns reviewed change and compatibility history. GitHub release notes record verified publication and deployment results. Update affected companion guidance in the API PR instead of adding another standalone tutorial.

Update the glossary, checked examples, curated hover descriptions, relevant guides, and changelog in the same PR as public API changes. Run `npm run verify:docs` for docs or API changes. The CI `docs` job validates browser behavior and uploads a review preview; it never deploys. Follow [the manual docs publishing policy](docs/docs-publishing.md) for when to publish, selecting one reviewed commit, checking `version.json`, and recording GPT Sites deployment results. A versioned release request includes the matching docs deployment unless the maintainer excludes it; other docs publications require an explicit request. CI, a merge, npm publication, or task completion alone does not authorize deployment. For method sections, follow the [method documentation style](apps/docs/README.md#method-documentation-style).

## Keep the changelog current

For user-visible changes, add a concise entry under **Unreleased** in [CHANGELOG.md](CHANGELOG.md) in the same PR. Describe the behavior and any compatibility change, and link the PR once its number is known. Include meaningful documentation and tooling improvements; skip internal refactors with no observable effect. Entries on feature branches describe proposed changes; the changelog on `main` describes merged work.

### Changelog categories

Keep `CHANGELOG.md` as the single source; do not maintain a separate docs-site summary. Every release and Unreleased groups its entries under `### Changes`, using these `####` categories in this order. Include only categories with entries:

| Category      | Use for                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------- |
| Added         | New APIs, features, or capabilities.                                                            |
| Changed       | Intentional changes to existing behavior or presentation.                                       |
| Fixed         | Corrections to broken or incorrect behavior.                                                    |
| Security      | Access controls, credential protection, and privacy safeguards.                                 |
| Performance   | Work that reduces latency, CPU, memory, or transfer cost; retain measured limits and tradeoffs. |
| Documentation | Guides, examples, onboarding, and documentation-site changes.                                   |
| Maintenance   | Build, test, CI, packaging, release, or contributor-workflow changes.                           |

- Choose the category by the entry's primary effect. Put an entry in one category; split genuinely separate outcomes instead of copying the same entry across categories. Use Security for a privacy/access fix rather than repeating it under Fixed.
- Start each bullet with a short, concrete **bold summary**, followed by the user-visible change and relevant compatibility or scope limits. Aim for one or two sentences; use the linked PR for implementation detail. Retain necessary caveats when reorganizing historical entries.
- Keep `### Compatibility and upgrade` separate, before `### Changes`, for version requirements, migration steps, breaking behavior, and important limitations. New release sections require both headings for the release-note tooling. Do not bury an upgrade action in Maintenance.
- Preserve release order, dates, version headings, publication status, citations, and factual limits when editing history. Never move a later feature into an older release. Formatting a history entry does not change what shipped.
- Keep the overview to two or three short themes per version; the categorized entries hold the detail. Do not list an open PR as delivered work in another PR's entry.
- At release time, move the intended Unreleased entries with their categories into the new version, combining matching categories and removing empty headings. Verify the npm publication date before marking it published. Follow [the release process](docs/releases.md).

For example:

```md
## Unreleased

### Changes

#### Added

- **Request filtering.** Filter captured requests by status. ([#123](https://github.com/diegoag64/jev-devtools/pull/123))

#### Fixed

- **Drawer focus.** Keep keyboard focus on the selected request after an update. ([#124](https://github.com/diegoag64/jev-devtools/pull/124))
```

The example links above are placeholders; use the actual PR for each contribution. Category grouping and entry summaries are reviewed in the PR; there is no automated semantic classifier.

Use the [release checklist and completion rule](docs/releases.md#release-checklist) for every version, including the Git tag and GitHub release verification. Report any unfinished step explicitly, even after npm publication succeeds.

## Repository layout

| Path                    | Purpose                                                            |
| ----------------------- | ------------------------------------------------------------------ |
| `packages/jev-devtools` | React drawer, diagrams, recorder, Node adapter, scoped CSS         |
| `landing`               | Independently locked Vite website for jevtools.dev; see its README |
| `apps/docs`             | Static Vite documentation app; start with `npm run dev:docs`       |
| `apps/playground`       | Cookbook source, guided diagrams, and synthetic sample execution   |
| `examples/react-vite`   | Independent consumer using only public package exports             |
| `examples/nextjs-app`   | Next.js App Router consumer using the packed package               |
| `docs`                  | Integration, architecture, provenance, and release process         |

See the [playground guide](apps/playground/README.md) for cookbook guides and synthetic samples. The static diagram lab and its `/docs/` replica remain in the original repo.

## Boundary and contract verification

- Before implementation, identify the observable guarantees affected by the change, the code that owns each guarantee, and the boundaries where data changes representation. Record this briefly in the working plan or PR; include relevant public types, execution, observer/capture, transport, viewer, and fixture consumers. Select the boundaries the change actually affects rather than testing every layer indiscriminately.
- For reported bugs, reproduce or revalidate the behavior on current `main` and inspect relevant open PRs before editing. Record the baseline commit, public input, expected behavior, and observed failure. If the issue is already fixed or its contract is unclear, resolve that finding before implementing a duplicate or incompatible repair.
- Exercise supported combinations that can invalidate the guarantee: literal values, whole-value references, and nested object/array templates containing references; ordinary composition and reused subexpressions; and values just below, at, and above relevant limits. Choose small deterministic examples for the affected contract. Do not infer that testing each feature separately establishes that their composition works.
- For public TypeScript changes, check valid and invalid consumer examples against the packed package declarations, and execute the relevant valid examples through public exports. Verify both that correct resolved-value operations compile and run, and that operations unsupported by the runtime are rejected by the compiler. Compiling the implementation or a happy-path demo alone does not establish agreement between types and execution.
- Verify limits over the complete composed structure and every visitor that can expand or traverse it, including shared children. Immutability, cached validation of a child, or a bounded display projection does not establish a parent's depth, expanded size, or execution cost. Use bounded rejection checks; keep timing and resource measurements local and out of correctness assertions.
- For capture changes, trace each affected path independently, including request/results, task data, final outcomes, and condition rules. Verify that redaction, truncation, and unavailable data retain explicit metadata through transport to the relevant viewer or fixture consumer, while application execution keeps its full values. Preserve old-capture compatibility and do not interpret arbitrary user strings as control metadata.
- Add tests for observable behavior and credible regressions.
- Before adding a regression, name its observable contract, credible failure, why existing coverage misses it, and its real owning boundary. Demonstrate that it fails on the pre-fix code for the intended reason and passes after the repair; use an isolated checkout for any mutation or negative control. Extend existing cases where appropriate, avoid duplicating proof across layers, and do not add production exports or flags solely for tests. Apply the available test-audit skill when writing or reviewing tests.
- In PR verification, connect each changed guarantee to the check and observed result that establishes it, and state remaining gaps. Distinguish baseline reproduction, regression proof, integration checks, browser checks, and performance evidence. Passing the required repository commands supplements this evidence; it does not establish unexercised contracts or replace focused verification.

## Verification details

Use full verification for code, workflow, dependency, API/reference changes, version preparation, and every publication candidate. Existing receipt corrections can use the constrained path below.

CI runs shared checks, tests, and playground builds once per Node version, then verifies independent React 18 and React 19 consumers in that job. Docs example type checks and execution tests remain covered on both Node versions. The dedicated Node 24 docs job owns the site build and the complete docs browser suite, including production and development rendering checks. The docs site build is not tested on Node 22; package and example compatibility checks still are. Local `npm run build` and `npm run verify:all` continue to include the docs build.

Install Playwright's Chromium once with `npx playwright install chromium --only-shell`, then run `npm run verify:all`. The runner executes formatting, every command below, drawer/flow browser checks, docs verification, and `git diff --check`, stopping on the first failure. It packs once and passes that exact archive to the independent package and Next.js consumers using the existing `JEV_VERIFY_TARBALL` support. It deliberately ignores release-specific tarball/version overrides; use the standalone consumer commands for release verification.

Each run writes separate step logs and `summary.json` under a unique ignored `benchmarks/results/verification/` directory. The summary records the source commit, a SHA-256 of tracked and untracked non-ignored source contents, selected Node/npm/TypeScript versions, the archive hash, and each step's result. The runner rejects success when the source revision or content hash differs between the start and end of verification. It does not monitor intermediate edits: a file changed and restored during the run can escape detection. Keep the checkout unchanged while verification runs. Keep the recorded source hash with any claims made before committing; a report from an older source state is not evidence for new edits.

Before a push or review handoff, run `npm run verify:evidence -- <summary.json> --reviewed-head <full-HEAD-SHA>`. This read-only check requires a completed full pass with all steps passed, matching start/end fingerprints, current source contents and the current reviewed commit. For the browser suite use `--mode cookbook-browser`; a focused run is explicitly `--mode cookbook-browser-selected` and cannot establish full-suite coverage. Receipt reports require `--mode receipts`. Any commit change, even with identical contents, makes the earlier report stale under this strict check; commit the final source before the final verification run. Legacy reports without an end revision must be regenerated. This checks local report freshness, not the truth of arbitrary edited JSON or remote CI/review status.

`npm run check:runtime` fails early on unsupported Node and reports the selected executable/npm version. Installation and `check` run this preflight too. Isolated consumer scripts invoke npm's CLI with that same Node executable and put its directory first on child-process PATH, including after changing to a temporary app directory. This does not switch Node for you; use `nvm use` (or your version manager) before starting verification. Network access for consumer dependency installs and local loopback servers for browser/Next.js checks are required.

```sh
npm run check
npm test
npm run build
npm run check:playground
npm run verify:package
npm run verify:nextjs
```

`verify:package` packs the library and installs it in a temporary independent React app, checks SSR/disabled behavior, type-checks a fixture against the installed declarations, and builds the consumer with a browser/server boundary check. Set `JEV_VERIFY_REACT=18.3.1` to verify React 18 instead of the default React 19. Registry access is allowed by default; `JEV_VERIFY_OFFLINE=1` is available when all dependencies are cached.

`check:playground` compiles the full interactive development UI into a temporary directory. The regular production build intentionally contains only a local-tool notice; it is not a hosted demo.

`verify:package`, `verify:nextjs`, and `check:playground` remove their temporary projects after success, setup or test failure, and handled SIGINT/SIGTERM cancellation. A supervisor owns each directory from creation through cleanup. It runs synchronous installs and builds in a worker, stops the worker and its descendants, then removes the directory. On POSIX systems, workers use an owned process group. Windows uses `taskkill /T /F`; if the worker exits abruptly before that command can identify its tree, cleanup fails and retains the path for inspection. The full runner requests supervisor shutdown over IPC, including on Windows, where a process kill is not a catchable POSIX signal. It allows 30 seconds for shutdown before force-killing its step. The independent installs, packed declaration checks, and Next.js development and production checks still run.

Fixtures are not retained for debugging. Save standalone output under ignored `benchmarks/results/`, for example `npm run verify:nextjs > benchmarks/results/nextjs.log 2>&1` after creating that directory. Full-suite logs and summaries already go there. Keep the compact evidence you need and remove obsolete local evidence after review.

SIGKILL, forced Windows termination, a host crash, or an exhausted shutdown deadline can prevent cleanup. A cleanup failure fails the command and prints the exact directory alongside the original verification failure. Each run also prints its supervisor and worker PIDs. Before manually removing a leftover directory, confirm it is the exact path printed by that run and that its supervisor, worker, and descendants have stopped. Check process start times as well as PIDs because PIDs can be reused. Remove only that directory. Do not sweep shared temporary directories by prefix or remove another active run's files.

After `npm run pack:devtools`, you can also run `npm install && npm run dev` inside `examples/react-vite` (port 4183, sample-only).

### Receipt-only verification

This path is for optional corrections to historical source records. Routine releases record results in GitHub release notes and do not require receipt-only PRs.

Use `npm run verify:receipts` for corrections to observed publication facts or PR links inside existing receipt sections. The command checks the entire branch/worktree against its merge base with `origin/main`, including committed, staged, unstaged, and non-ignored untracked changes. It rejects other paths, file/mode changes, release headings, compatibility/change lists, and instructions outside receipt sections. New release/deployment headings require the full path. The accepted regions are published-release preambles and existing publication-record bullets in `CHANGELOG.md`, published receipt bodies in `docs/releases.md`, and the history table/existing `Version N provenance` blocks in `docs/docs-publishing.md`.

The structural gate cannot decide whether prose is truthful or whether a change inside a receipt alters upgrade guidance. Authors and reviewers must keep this mode limited to observed receipt facts; use `npm run verify:all` for other changes even when they fit inside an accepted region. The classifier is not an authorization or release-completion check.

The lighter path validates local receipt links, formatting, release-tool regressions, the package build needed by docs declarations, docs type checks/tests, the complete docs build/browser suite, and `git diff --check`. Its report identifies `mode: "receipts"`, the comparison base/files, and source hashes; it makes no claim about skipped package/Next.js/drawer/flow tests. Keep source unchanged during verification. Full GitHub CI remains enabled for every PR and main push.

If eligibility fails, run full verification; never narrow the comparison base or hide unrelated edits to force eligibility. Metadata-only PR title/body updates need no new source verification. Adding a PR link to source requires checking the resulting source, with this mode when eligible. Receipt-only edits do not trigger another docs deployment.
