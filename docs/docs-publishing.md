# Documentation publishing

GitHub is the editable source. GPT Sites serves a reviewed static snapshot. Merging a PR, running CI, completing an agent task, or publishing npm does **not** deploy the docs. A maintainer explicitly requests each GPT Sites publication; do not add unattended deployment or hosting credentials to CI.

## When to publish

| Change | Publication decision |
| --- | --- |
| Corrections, examples, navigation, accessibility, or styling | Publish the reviewed changes after merge and green CI; related small edits can be batched. |
| New or changed public APIs | Update docs in the API PR, then publish release guidance after npm, tag, and GitHub release verification. Explicitly marked Unreleased reference material may appear earlier, but default installation examples must work with the published package. |
| Installation blockers or security guidance | Prioritize review, merge, and an explicit manual publication. |
| Internal refactors or tests | No publication unless reader-visible output changes. |
| Star count or other optional build-time statistics | Refresh during the next normal publication. Do not deploy solely for these. |

Publish from a clean, reviewed commit reachable from `origin/main`, with successful Verify CI **for that commit**. A release tag alone is not proof of a successful docs check. Feature branches and CI preview artifacts are for review. Existing deployments made during initial development are recorded below; they are not the policy for future publications.

## Keep content aligned

- API changes update the glossary, inputs/returns, explanations, checked examples, curated API/type help, relevant guides, and changelog in the same PR. Review the package setup skill, `llms.txt`, and companion repository guides when the change affects them.
- Generated declarations and checked examples catch type drift. Review prose and simplified tooltips for semantic drift; generated types do not validate their meaning.
- Preserve anchors and links. Avoid duplicating the changelog or maintaining separate content in the GPT Sites source checkout.
- The source package version is not proof that every documented API is on npm. Keep Unreleased labels explicit; verify default install examples against the current published package before announcing a release.
- A later docs-only commit may describe the same npm version. Choose the reviewed source commit deliberately; do not build from a moving branch name mid-publication.

## CI and preview artifacts

The `docs` job in `.github/workflows/ci.yml` runs for every PR and push to `main`, including package-only changes that can affect generated declarations. On Node 24 it builds the package, builds the docs, and runs the existing Chromium suite: routes, links, code copying, search, API hovers, navigation, mobile/no-JavaScript reading, and first-paint/theme checks. Repository checks already type-check and exercise the examples and provenance tests.

Successful runs retain `docs-preview-<commit>` for seven days. These are **working-tree preview builds**, not production artifacts. Failures retain available screenshots for seven days. Both use read-only repository permissions, no inference credentials, and no Sites credentials or deployment calls. Once the check is available on GitHub, maintainers should include `docs` among required checks for `main`; workflow YAML alone does not configure branch protection.

## Version manifest

Every build emits `apps/docs/dist/version.json`, served at `/version.json` (or beneath `DOCS_BASE`). The sidebar's version link opens it without JavaScript.

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Manifest format version, currently 1. |
| `package.name`, `package.version` | Package manifest in the selected checkout; not an assertion of npm publication. |
| `source.repository`, `source.commit`, `source.url` | Canonical repository, full source SHA, and commit link. |
| `source.dirty` | Whether tracked or untracked source changes existed when generation started. |
| `build.mode`, `build.createdAt` | `working-tree` or `publication`, and UTC generation time. |
| `changelog.sourceUrl`, `changelog.sha256` | Source link and checksum of the embedded changelog. Publication links use the exact commit. |
| `site.url`, `site.projectId` | Intended docs domain and existing GPT Sites identity. |

Content, declarations, package version, and changelog come from the same checkout. Publication rebuilds the package first and rejects a dirty checkout, including staged and untracked files. It no longer downloads a potentially newer changelog from GitHub `main`. Work locally without publishing by using `npm run build:docs`; local manifests explicitly identify working-tree state. The optional star count can still vary between builds of one commit, and the timestamp changes, so keep the inspected artifact rather than assuming rebuilds are byte-identical.

GPT Sites assigns a saved version and deployment timestamp **after** the build. Record those in the publication receipt below; do not rewrite the validated manifest or archive to insert a hosting version retrospectively.

## Manual publication checklist

1. Obtain the explicit docs-publication request. Reuse project `appgprj_6add5705dbec8191b56b1c9555078a2d`, public audience, and `https://docs.jevtools.dev`; do not create another Site or change DNS/access.
2. Select the reviewed full SHA after merge. Fetch `origin/main`, use a clean checkout of that SHA, verify `git merge-base --is-ancestor HEAD origin/main`, and confirm successful Verify CI for it, including the `docs` job. This reachability/CI check is a maintainer gate; the build's automatic guard checks cleanliness, not approval or branch membership.
3. For a release, verify npm availability/dist-tag, the exact release tag, and the GitHub release before advertising released APIs. Update publication facts through the release-record PR and select a reviewed docs commit that includes them. Keep later Unreleased work labeled.
4. Install the locked dependencies with `npm ci`, install Playwright Chromium if needed, and run the repository's required checks. Then build and verify the **publication artifact**:

   ```sh
   npm run build:docs:publish
   npm run verify -w @jev-devtools/docs
   cat apps/docs/dist/version.json
   ```

   Confirm `build.mode` is `publication`, `source.dirty` is false, the SHA and package version are intended, and the changelog reflects that revision. Review setup and a representative API page in both themes/mobile. Do not run `npm run verify:docs` after the final publication build: that command intentionally rebuilds a working-tree preview.
5. Follow the supported GPT Sites source/open/package/save/deploy workflow manually. Copy the verified `apps/docs/dist/` into the existing deployment checkout; preserve `version.json` and the hosting identity. Record the manifest's canonical source SHA separately from the generated Sites source-repository commit. Save and deploy the same packaged archive without rebuilding it between verification and deployment.
6. Confirm successful deployment, read the live `/version.json`, and compare its source SHA, package version, mode, and changelog hash with the inspected artifact. Smoke-check `/`, `/getting-started/`, an API deep link, and `/changelog/`. Record the receipt through the current or a follow-up PR. Keep raw screenshots/logs/archives under ignored `benchmarks/results/docs/`.

The landing website is a separate Site/build under `landing/`; use [its publishing instructions](../landing/README.md#publishing) for an explicitly requested update. A docs deployment never deploys the landing page, and neither deploys npm.

No scheduled refresh or automatic deployment is configured. To decide whether docs are behind, compare the live manifest SHA with the last reviewed main commit and inspect docs, public API, example, and changelog changes since that SHA. An unrelated commit or a newer timestamp alone does not require deployment.

## Publication receipt and recovery

Record the canonical commit, source package version, GPT Sites saved version/deployment ID, URL, verified UTC publication date, and a verification summary. Link the CI run and PR when available. Record a failed deployment as failed, not published. If saving succeeded but deployment did not, resume the saved version instead of rebuilding and creating duplicates. A rollback is an explicit manual deployment of a previously successful saved version; verify its live manifest and record the rollback. Never change npm versions or move release tags to repair a docs deployment.

The latest deployment before this policy is the baseline below. It predates `version.json` and used a feature-branch build plus GitHub-main changelog; the next authorized publication should replace it with a verified main-commit snapshot.

| Published (UTC) | Source commit / package version | GPT Sites version / deployment | Verification |
| --- | --- | --- | --- |
| 2026-10-25 04:48:34 | `8262004dcb047eac9f2bb16086f7c358ba837eae` / `0.4.1` source, with Unreleased docs | 17 / `appgdep_6add8a1d14e08191adb6fab3f90a2649` | Successful public deployment at [docs.jevtools.dev](https://docs.jevtools.dev/); repository/browser checks and dark-palette review passed. Published from [PR #70](https://github.com/diegoag64/jev-devtools/pull/70) before merge. |
