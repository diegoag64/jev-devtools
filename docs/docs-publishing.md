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

Version 18 is the first publication under this policy. Its live manifest matches the reviewed main commit and embedded changelog. Version 17 remains the historical pre-policy baseline and predates `version.json`.

| Published (UTC) | Source commit / package version | GPT Sites version / deployment | Verification |
| --- | --- | --- | --- |
| 2026-10-25 04:48:34 | `8262004dcb047eac9f2bb16086f7c358ba837eae` / `0.4.1` source, with Unreleased docs | 17 / `appgdep_6add8a1d14e08191adb6fab3f90a2649` | Successful public deployment at [docs.jevtools.dev](https://docs.jevtools.dev/); repository/browser checks and dark-palette review passed. Published from [PR #70](https://github.com/diegoag64/jev-devtools/pull/70) before merge. |
| 2026-10-25 06:45:14 | `c22f7695ac83333fed7b34ea3487ed6b86e4c714` / `0.5.0` | 18 / `appgdep_6adda5748390819195513a58d844721f` | Successful public deployment at [docs.jevtools.dev](https://docs.jevtools.dev/) after [PR #75](https://github.com/diegoag64/jev-devtools/pull/75) and [main CI](https://github.com/diegoag64/jev-devtools/actions/runs/40169944721). Live manifest, changelog hash, setup/API/release pages, both themes, and mobile checks passed. |
| 2026-10-25 17:06:05 | `a18927f1b464ee637ba27fabdeba4cc79a6f1ef3` / `0.5.0` | 20 / `appgdep_6ade36f707308191afd630d2daa277f6` | Successful public deployment at [docs.jevtools.dev](https://docs.jevtools.dev/) after [PR #79](https://github.com/diegoag64/jev-devtools/pull/79), preserving the sharing metadata from [PR #78](https://github.com/diegoag64/jev-devtools/pull/78). [Main CI](https://github.com/diegoag64/jev-devtools/actions/runs/40214133830), local checks, publication-artifact verification, live manifest/changelog comparison, search and page smoke checks passed. |
| 2026-10-25 18:37:34 | `a3294d6a2e9aff7f6758cb3f9ae5034bd0c2767c` / `0.5.1` | 21 / `appgdep_6ade4c66a498819196e64a5c9ff25238` | Successful public deployment at [docs.jevtools.dev](https://docs.jevtools.dev/) after [PR #87](https://github.com/diegoag64/jev-devtools/pull/87) and [main CI](https://github.com/diegoag64/jev-devtools/actions/runs/40221849336). Required local checks, publication-artifact verification, setup/API theme and mobile review, live manifest/changelog comparison, and page smoke checks passed. |

Version 18 provenance:

- Canonical source: `c22f7695ac83333fed7b34ea3487ed6b86e4c714`, clean checkout; publication mode, package `0.5.0`.
- Sites source repository commit: `880c71da6e9a01852e8290759304decc2744c025` (generated deployment output, distinct from canonical source).
- Saved version ID: `appgprj_6add5705dbec8191b56b1c9555078a2d~appgver_cfd5b02c5f4081919e83c293fc21bf44`.
- Embedded/live changelog SHA-256: `2a088fc139dde3f18d66e1762bcb1d23d4ef8ef0f188f76ee79953bb33e0bcf9`.
- Saved archive content hash: `sha256:3d76715ad91c72166ad29415e1a4335bae7231aaf41f6e6aeacb9b8473695c17`.
- Live [version manifest](https://docs.jevtools.dev/version.json) matched the inspected file exactly. Homepage, quick start, `api/reference/#flow-jev`, and changelog returned HTTP 200; browser smoke checks reported no page errors.

This receipt records the completed deployment after the artifact was saved. It does not rewrite version 18 or its manifest; later receipt-only commits do not require another deployment. The landing Site was not redeployed.


Version 20 provenance:

- Canonical source: `a18927f1b464ee637ba27fabdeba4cc79a6f1ef3`, clean reviewed `main` checkout; publication mode, package `0.5.0`. This includes the compatibility/import guidance and search correction from PR #79, plus the existing sharing metadata from PR #78.
- Previous live version 19 identified `6889778311dbe4b58a1fce2040762e0bd38f7dbf` as its canonical source. That commit is an ancestor of the selected main commit; its social image and metadata were preserved.
- Sites source repository commit: `4df96e40589a4a3bd504966db3b123460c4bb7b5` (generated deployment output, distinct from canonical source).
- Saved version ID: `appgprj_6add5705dbec8191b56b1c9555078a2d~appgver_085be35dd7e88191ad4cba40629e20b2`.
- Deployment ID: `appgdep_6ade36f707308191afd630d2daa277f6`; succeeded at `2026-10-25T17:06:05.648345Z`.
- Embedded/live changelog SHA-256: `7adcbacae6de66c7f957cf07af8d5a152bd3b715bc3e84537e743b3d77d00ddc`.
- Saved archive content hash: `sha256:5343ffbb7b73858be6e68382222f9af99bd0e67afb358add11e1168adb977b4a`.
- Installed locked dependencies and passed all repository-required checks, then built with `npm run build:docs:publish` and verified that exact publication artifact. Setup and API pages were reviewed in both themes and at a 390px mobile width. The copied deployment artifact matched all 46 built file hashes and was packaged without rebuilding.
- Live `/version.json` matched the inspected manifest, and `/raw/changelog.md` matched its recorded hash. Homepage, quick start, API reference, changelog, search index, and social image requests succeeded. The `#flow-jev` and `#styles-css` anchors remain present; the quick-start search entry includes `5.4`, `ESM`, public imports, and routing guidance. The deployed imports table was visually checked.

This receipt was recorded after deployment and is not part of the version 20 artifact. No npm package or landing Site was published by this deployment; receipt-only changes do not require another docs deployment. Raw evidence is kept outside Git under `benchmarks/results/docs/publication-79/`.


Version 21 provenance:

- Canonical source: `a3294d6a2e9aff7f6758cb3f9ae5034bd0c2767c`, clean reviewed commit reachable from `origin/main`; publication mode, package `0.5.1`. This includes the verified release records and compatibility guidance from PR #87.
- Sites source repository commit: `def246346bd8aa2b720a650299d4ac5c26e3e206` (generated deployment output, distinct from canonical source).
- Saved version ID: `appgprj_6add5705dbec8191b56b1c9555078a2d~appgver_ad9529d043fc819198541587be9b6f87`.
- Deployment ID: `appgdep_6ade4c66a498819196e64a5c9ff25238`; succeeded at `2026-10-25T18:37:34.040436Z`.
- Embedded/live changelog SHA-256: `1f71f9dd9b4aea12cb5a7d3d9185da75cd103378f75022ccfa8f72ba8a2e13a2`.
- Saved archive content hash: `sha256:36dd36ce2061c7e890aba9af35adb36d3511e33dbba2bfcb8a95242c3c8ec02b`.
- Rechecked npm 0.5.1 availability, integrity and `latest`, GitHub Latest, and the exact `v0.5.1` tag at `c88aea5d615a65bcda1d820b5abc63bb6fbe05e6` before publication.
- Installed locked dependencies on Node 26.7.0 and passed all required repository checks, then built with `npm run build:docs:publish` and verified that exact artifact across 17 pages and rendering checks. Reviewed setup and expression pages in both themes and inspected mobile setup/API captures. All 46 copied build files matched their inspected hashes; packaging did not rebuild them.
- Live `/version.json` matched the inspected manifest exactly, and `/raw/changelog.md` matched its recorded hash. Homepage, quick start, API reference, and changelog returned HTTP 200; `#flow-jev` remained present. The deployed quick start was visually checked with the 0.5.1 snapshot label.

This receipt records a completed deployment and is not part of the version 21 artifact. Publication status in that immutable snapshot describes its pre-deployment state; this receipt supplies the subsequent outcome. Receipt-only changes do not require another deployment. No npm package or landing Site was published by this deployment. Raw evidence is kept outside Git under `benchmarks/results/docs/publication-87/`.
