# Packaging and releases

## Release checklist

Use this checklist for every version. npm publication, the Git tag, and the GitHub release are separate operations. The historical records below are evidence, not a substitute for this checklist. Carry forward authorization already given for this release; if an action is outside that authorization, identify it before proceeding.

1. **Prepare and approve.** Use a release PR to set the version, synchronize README versions, and move the intended Unreleased entries into a pending release section. After authorized merging and green CI, record the exact release commit. Run the [archive checks](#prepare-and-inspect-an-archive) from a clean checkout of that commit, inspect the archive, and record its checksum. Prepare notes covering only that release and any upgrade requirements.
2. **Publish the inspected archive.** With npm publication authorization, publish that exact archive with the intended dist-tag. Do not rebuild between inspection and publication. Check the registry first if a prior attempt has an uncertain outcome; an upload or processing message alone does not prove publication.
3. **Verify npm.** Confirm the version is available, registry integrity matches the inspected archive, the intended dist-tag points to it, and the registry publication timestamp is recorded in UTC. Check fresh registry-installed React and Next.js consumers using samples. Record the exact-version npm link and observed results.
4. **Create and verify the tag.** With release/tag authorization, create `vX.Y.Z` at the exact published commit. If the remote tag already exists, verify its resolved commit before reusing it; never move an existing release tag to make a check pass. Do not default to the current `main`, which may contain later work.
5. **Publish and verify the GitHub release.** Publish the prepared notes for that tag, including the npm link, release commit, and compatibility notes. A tag or draft release alone is insufficient. For a normal latest release, explicitly mark it Latest and verify GitHub's latest-release endpoint returns it. For a prerelease or historical backfill, record the intended designation and preserve any newer latest release unless explicitly authorized otherwise. Verify the tag's resolved commit separately from the release's target metadata.
6. **Record and report.** Update the changelog, its overview, and this release record through a PR using verified publication facts. Include both npm and GitHub release links, the exact commit, integrity/checksum evidence, and verification results. Keep later Unreleased work separate and identify any open follow-up documentation PR.
7. **Publish and verify the docs manually.** After package/tag/GitHub verification and the release-record PR is merged, follow [the docs publishing checklist](docs-publishing.md#manual-publication-checklist) with an explicit GPT Sites publication request. Select a clean, reviewed main commit with green docs CI, verify the publication artifact, deploy it manually, and compare the live `/version.json` with its source SHA/package version/changelog hash. Record the GPT Sites version and deployment receipt. Package publication does not trigger this step.

### Completion and recovery

Call the release complete only after npm publication and its intended dist-tag, the remote tag's exact commit, and the published GitHub release and intended Latest/prerelease designation have all been verified, the release record has been updated, and the corresponding docs publication and live version manifest have been verified and recorded. An open documentation PR or pending manual GPT Sites publication remains an explicit follow-up; package publication alone does not complete the release.

If npm succeeds but tagging, GitHub publication, verification, record updates, or manual docs publication remain pending, report **partially completed release**. State what succeeded, what remains, and any missing authorization or failed check. Resume from the missing step; do not republish an existing npm version, move a published tag, or include newer commits. If a record-update PR is awaiting review, report publication as verified with that follow-up pending. Never silently omit a remaining step or describe npm success alone as completion of the whole release.

### Read back the published state

Replace `X.Y.Z` with the release version. These commands read public metadata; they do not publish:

```sh
release_version='X.Y.Z'
npm view "jev-devtools@$release_version" version dist.integrity dist.tarball --json --registry=https://registry.npmjs.org/
npm view jev-devtools dist-tags time --json --registry=https://registry.npmjs.org/
git ls-remote --tags origin "refs/tags/v$release_version" "refs/tags/v$release_version^{}"
gh release view "v$release_version" --repo diegoag64/jev-devtools --json tagName,targetCommitish,isDraft,isPrerelease,url,publishedAt
gh api repos/diegoag64/jev-devtools/releases/latest --jq '{tag: .tag_name, url: .html_url}'
```

Compare npm integrity to the inspected archive and the selected version's timestamp to the release record. For an annotated tag, compare the peeled `^{}` commit; for a lightweight tag, compare the ref's commit directly. Confirm `isDraft` is false and the prerelease flag matches the intended channel. Check npm's `latest` and GitHub's Latest independently; neither establishes the other. Historical releases need not be latest on either service.

## Release remotely with GitHub Actions

The manually dispatched [Release workflow](../.github/workflows/release.yml) uses npm OIDC trusted publishing. It publishes stable `X.Y.Z` versions to npm `latest` and GitHub Latest. Prereleases, backfills, and recovery of already-published versions use the manual checklist instead. Merging or pushing to `main` never publishes a package.

1. Merge the approved release PR and wait for its `Verify` workflow on `main` to pass. The package manifest and changelog must contain the intended new version; its changelog section needs `### Compatibility and upgrade` and `### Changes` subsections. Keep nonempty `####` change categories inside `### Changes` in the [contributor-defined order](../CONTRIBUTING.md#changelog-categories), with a short bold summary on each entry. These subsections and their nested categories become the GitHub notes, excluding the pending-publication preamble and other versions.
2. Open **Actions → Release → Run workflow**, choose `main`, enter its full current commit SHA, and leave **dry_run** enabled for an initial rehearsal. The SHA must equal `main` at dispatch time so npm provenance describes the checked-out source. If `main` advances first, inspect the new commit before retrying. This workflow cannot release a commit that predates the workflow itself.
3. Review the run summary and download `release-candidate`: it includes the package archive, `release.json` with SHA-256 and npm integrity, and the generated notes. The workflow runs all repository checks, including drawer and independent consumer checks, against the selected source and archive. It does not run performance benchmarks.
4. To publish, dispatch again with **dry_run** disabled. This run builds and checks its own candidate, then pauses at **Approve npm VERSION**. Review this run's artifact and checksum; do not assume it is identical to the earlier rehearsal. Approve **npm-release** through GitHub's **Review deployments** UI. That approval is the release gate; npm does not ask for a separate 2FA code during the OIDC publish.
5. The publish job verifies the approved artifact hashes, refuses existing versions/tags or a downgrade of `latest`, and publishes those bytes without rebuilding or running lifecycle scripts. It verifies registry integrity and provenance. A separate job without OIDC permission checks fresh registry consumers, creates the GitHub release at the selected commit, and verifies the remote tag and Latest designation.
6. Download `release-evidence` and use `publication.json` to update this guide and the changelog through a PR. Publication success does not merge that documentation follow-up or publish GPT Sites. After the record PR merges, complete the manual docs step above and keep its status explicit under the completion rule.

From a remote terminal, the equivalent dispatch is:

```sh
gh workflow run release.yml --repo diegoag64/jev-devtools --ref main \
  -f release_commit=FULL_REVIEWED_MAIN_SHA -F dry_run=true
```

Change `dry_run` to `false` only for an authorized release. A dry run has no OIDC permission and never requests the publication approval or creates an npm version, tag, or GitHub release. Artifacts expire after 30 days; store durable publication facts in the documentation PR. Workflow run summaries and evidence remain distinct from the immutable npm archive.

### Approval and trust configuration

GitHub environment `npm-release` requires approval from `diegoag64`, permits the `main` branch only, and disables administrator bypass. Self-review is allowed so Diego can approve a remotely initiated run. Do not approve the deployment automatically or remove the reviewer requirement. Environment protection is a GitHub setting, not something the workflow YAML can enforce by itself; recheck it if settings or repository visibility change.

The npm trusted publisher is configured for repository `diegoag64/jev-devtools`, workflow filename `release.yml`, environment `npm-release`, with direct publishing enabled. No npm token is stored in GitHub. Initial trust setup requires npm sign-in and 2FA; subsequent workflow publishes use short-lived OIDC credentials. Configuration can be inspected with `npm trust list jev-devtools` (npm may request 2FA for this administrative operation). To recreate it after inspecting any existing configuration:

```sh
npm trust github jev-devtools --file release.yml \
  --repo diegoag64/jev-devtools --env npm-release --allow-publish
```

Do not replace or revoke another publisher without reviewing it. Keep the environment name and filename synchronized across npm, GitHub settings, and the workflow. The workflow uses Node 24 and npm 11.19.0. It grants OIDC permission only to the approved publish job; GitHub release write permission belongs to the later completion job. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) and [GitHub deployment approvals](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments).

### Recover a partial automated release

Read the run summary, npm metadata, and remote tag before taking action. The verification loop now polls every five seconds for up to 120 attempts (nearly ten minutes), within the publish job's twenty-minute timeout. If npm processing still outlasts that window, treat the release as partial and resume verification once the registry is ready; the loop never repeats the upload.

After any uncertain publish outcome, do not dispatch a new publication or rerun the publish job: the preflight intentionally refuses an existing npm version. Download `npm-publication` or `release-evidence` from the original run, compare its checksums with the approved candidate, and resume only the missing verification or GitHub steps under existing release authorization. If a tag/release already exists, inspect and verify it manually; never move its tag or blindly recreate it. Expired artifacts or mismatched checksums require investigation, not rebuilding and pretending the bytes are the original candidate.

The independent consumer checks accept `JEV_VERIFY_TARBALL=/absolute/path/to/archive.tgz` to check an inspected archive, or `JEV_VERIFY_VERSION=X.Y.Z` to check a fresh registry installation. Do not set both. Use the verification scripts from the release commit so later regression tests do not incorrectly reject an older release. With neither variable, the existing local pack-and-check behavior is unchanged.

## Release 0.5.2 — published October 25, 2026

**[jev-devtools@0.5.2](https://www.npmjs.com/package/jev-devtools/v/0.5.2) was published at 21:35:38.942 UTC on October 25, 2026**, from `20e7dc0d9d81285e2c6e17b75dae5c8e37f2d0e4` after [PR #94](https://github.com/diegoag64/jev-devtools/pull/94) and [main CI](https://github.com/diegoag64/jev-devtools/actions/runs/40235401761) passed. npm's `latest` was verified as 0.5.2. See the [release notes](../CHANGELOG.md#052--october-25-2026-experimental) for responsive drawer navigation, resolved flow template types, composed-expression limits, capture warnings, and upgrade requirements.

The [rehearsal](https://github.com/diegoag64/jev-devtools/actions/runs/40235627455) passed. The [approved publication run](https://github.com/diegoag64/jev-devtools/actions/runs/40235875410) prepared and checked its own candidate, paused for the maintainer's protected `npm-release` approval, and published the inspected bytes through npm OIDC. Both archives and generated notes matched exactly. All three publication jobs succeeded, including npm readback and fresh registry consumers, without a retry or recovery publication.

Independent registry readback confirmed the UTC publication time, `latest`, integrity, and byte-for-byte equality of the downloaded npm archive with the approved candidate and final `release-evidence` artifact. Registry provenance identifies `.github/workflows/release.yml`, `refs/heads/main`, the exact source commit above, and the approved publication run. The completion job used Node 24.21.0 and fresh registry installations to verify public exports, flow declarations, React build/SSR, Next.js development route/action/component capture, reload retention, SSE/clear, and production-disabled inspector endpoints. All checks used sample responses; no live inference was performed.

The inspected and published archive is `jev-devtools-0.5.2.tgz` (78 files):

- SHA-256: `db305aba140769eaf196c07bde093380afc7b503fc12dd43a05f3c8a4d9cb527`
- npm integrity: `sha512-s7LPQV3Ooq3J6b3lj7bIfaOwF6zLha/cSZFXorpmuZxSkW0h1BAIRybsrUvNck+aD94QWK1dvAuCRGicj/h3wA==`
- Release-notes SHA-256: `969e1a9e37fb48963be1c170fdbd3049b4ccd2191467c48c56a5c8bde3f94108`
- [npm provenance](https://registry.npmjs.org/-/npm/v1/attestations/jev-devtools@0.5.2)

The [GitHub release v0.5.2](https://github.com/diegoag64/jev-devtools/releases/tag/v0.5.2) was published at 21:36:35 UTC on October 25, 2026. Its lightweight remote tag resolves exactly to `20e7dc0d9d81285e2c6e17b75dae5c8e37f2d0e4`; it is neither draft nor prerelease, and GitHub's latest-release endpoint returned v0.5.2. The published notes match the approved candidate notes.

[Release-record PR #96](https://github.com/diegoag64/jev-devtools/pull/96) merged as `7c005e140863580c74b5f15c81b1005a2e5e178a`, with successful [main CI](https://github.com/diegoag64/jev-devtools/actions/runs/40237265560). The explicitly requested docs deployment succeeded at 21:54:01 UTC on October 25, 2026 as GPT Sites version 22. Its live manifest matches that clean source commit, package 0.5.2, publication mode, and embedded changelog hash. Required local checks, publication-artifact verification, setup/API theme and mobile review, and live page checks passed. See the [publication receipt](docs-publishing.md#publication-receipt-and-recovery) for deployment IDs and hashes.

npm publication, the exact tag, GitHub Latest, and hosted docs are verified. **Follow-up pending:** [deployment-receipt PR #99](https://github.com/diegoag64/jev-devtools/pull/99) needs review/merge; it does not require another docs deployment. The immutable npm archive retains its preparation-time README, and the deployed docs retain their pre-deployment publication status text; these receipt edits do not rewrite either artifact. Do not republish 0.5.2. No landing Site deployment was performed. Evidence remains ignored under `benchmarks/results/release-0.5.2/` and `benchmarks/results/docs/publication-96/`.

## Release 0.5.1 — published October 25, 2026

**[jev-devtools@0.5.1](https://www.npmjs.com/package/jev-devtools/v/0.5.1) was published at 18:19:01.066 UTC on October 25, 2026**, from `c88aea5d615a65bcda1d820b5abc63bb6fbe05e6` after [PR #83](https://github.com/diegoag64/jev-devtools/pull/83) and [main CI](https://github.com/diegoag64/jev-devtools/actions/runs/40219281499) passed. npm's `latest` was verified as 0.5.1 at publication. See the [release notes](../CHANGELOG.md#051--october-25-2026-experimental) for the task-input symbol-key rejection, primitive expression property type correction, setup guidance, and compatibility requirements.

The [rehearsal](https://github.com/diegoag64/jev-devtools/actions/runs/40219824561) passed. The [approved publication run](https://github.com/diegoag64/jev-devtools/actions/runs/40220097820) built and checked its own candidate, paused for the maintainer's protected `npm-release` approval, and published the inspected bytes through npm OIDC. Both archives and generated release notes matched exactly. npm processing completed successfully within the workflow's verification window; all three jobs succeeded without a retry or recovery publication.

Independent registry readback confirmed the UTC publication time, `latest`, integrity, and byte-for-byte equality of the downloaded npm archive with the approved candidate. The provenance identifies `.github/workflows/release.yml`, `main`, and the exact source commit above. The completion job used Node 24.21.0 and fresh registry installations to verify public exports, flow declarations, React build/SSR, Next.js development route/action/component capture, reload retention, SSE/clear, and production-disabled inspector endpoints. All checks used sample responses; no live inference was performed.

The inspected and published archive is `jev-devtools-0.5.1.tgz` (78 files):

- SHA-256: `d09b44d69e1c1f01f6074cc9ca380d772b1910a8379c03d983c08c59db4ef459`
- npm integrity: `sha512-IUITSQSXNIRfwxxj5m9dM+czuEyBuNCI5JmSwHhwMEEBp0+qTsnN9NXE79aJYhnv91khSoZcsX9QGHuKPsGrig==`
- Release-notes SHA-256: `fd1f219b8eb082a35d59c6d1a19f578bc6feb49858f23293985d29b10fe7af12`
- [npm provenance](https://registry.npmjs.org/-/npm/v1/attestations/jev-devtools@0.5.1)

The [GitHub release v0.5.1](https://github.com/diegoag64/jev-devtools/releases/tag/v0.5.1) was published at 18:20:25 UTC. Its lightweight remote tag resolves exactly to `c88aea5d615a65bcda1d820b5abc63bb6fbe05e6`; it is neither draft nor prerelease. GitHub's latest-release endpoint returns v0.5.1, and its release body matches the approved notes.

[Publication-record PR #87](https://github.com/diegoag64/jev-devtools/pull/87) merged as `a3294d6a2e9aff7f6758cb3f9ae5034bd0c2767c`, with successful [main CI](https://github.com/diegoag64/jev-devtools/actions/runs/40221849336). The explicitly requested docs deployment succeeded at 18:37:34 UTC on October 25, 2026 as GPT Sites version 21. Its live manifest matches that clean source commit, package 0.5.1, publication mode, and embedded changelog hash. Setup/API theme and mobile review, publication-artifact checks, and live page checks passed. See the [publication receipt](docs-publishing.md#publication-receipt-and-recovery) for deployment IDs and hashes.

npm publication, the exact tag, GitHub Latest, and hosted docs are verified. **Follow-up pending:** [receipt PR #89](https://github.com/diegoag64/jev-devtools/pull/89) still needs review/merge; it does not require another docs deployment. The immutable npm archive retains its preparation-time README, and the deployed docs retain their pre-deployment publication status text; these source receipt edits do not rewrite either artifact. Do not republish 0.5.1. No landing Site deployment was performed. Evidence remains ignored under `benchmarks/results/release-0.5.1/` and `benchmarks/results/docs/publication-87/`.

## Release 0.5.0 — published October 25, 2026

**[jev-devtools@0.5.0](https://www.npmjs.com/package/jev-devtools/v/0.5.0) was published at 06:30:45.073 UTC on October 25, 2026**, from `64efa4c494a83207e94c67b42f6744802db18c11` after [PR #73](https://github.com/diegoag64/jev-devtools/pull/73) and [main CI](https://github.com/diegoag64/jev-devtools/actions/runs/40168724073) passed. See the [release notes](../CHANGELOG.md#050--october-25-2026-experimental) for compatibility and changes. npm's `latest` was verified as 0.5.0 at publication.

The [rehearsal](https://github.com/diegoag64/jev-devtools/actions/runs/40168858183) and the [approved publication run](https://github.com/diegoag64/jev-devtools/actions/runs/40169000258) prepared and checked the selected source and candidate. The publish job uploaded the inspected bytes through npm OIDC and successfully verified registry integrity and provenance after processing. The original `finish` job then failed at the consumer type check: the fresh runner had no root TypeScript installation because the job omitted `npm ci`. Export/SSR checks passed before that failure; the subsequent Next.js and GitHub completion steps did not run. The original failed run remains the audit record.

Recovery downloaded that run's original `release-evidence` artifact, checked its archive/notes hashes, and verified npm availability, integrity, provenance, and latest again. With the verification dependencies installed, fresh registry-installed React and Next.js consumers passed using the release commit's scripts on Node 24.21.0: public exports, flow declarations, React build/SSR, Next development capture/SSE, and production-disabled inspector checks. All used sample responses. No npm upload was repeated and no package bytes were rebuilt for publication. The workflow follow-up adds `npm ci` to `finish` for future releases.

The inspected and published archive is `jev-devtools-0.5.0.tgz` (78 files):

- SHA-256: `92856be70864fc61752ad0666a21f0ac1afe225a60253f0034baa649ee8e2613`
- npm integrity: `sha512-ZFQvh8ImqleRBcmbslVelrLwFouqz7GlUzXsrzMuNpUqfZEz61sK9Z0y6myFeGwPswGCCBR+KKFlvLMBXQ4wZw==`
- Release-notes SHA-256: `75b5b971a2761ea8a8507e2b8d5c43654bad17322187ded64924ba574a8aa76e`
- [npm provenance](https://registry.npmjs.org/-/npm/v1/attestations/jev-devtools@0.5.0)

The [GitHub release v0.5.0](https://github.com/diegoag64/jev-devtools/releases/tag/v0.5.0) was created during recovery at 06:33:23 UTC using the original candidate notes. Its lightweight remote tag resolves exactly to `64efa4c494a83207e94c67b42f6744802db18c11`; it is neither draft nor prerelease, and GitHub's latest-release endpoint returns v0.5.0.

[Publication-record/workflow-fix PR #75](https://github.com/diegoag64/jev-devtools/pull/75) merged as `c22f7695ac83333fed7b34ea3487ed6b86e4c714`, with successful main CI. The explicitly requested docs deployment succeeded on October 25, 2026 at 06:45:14 UTC as GPT Sites version 18. The live manifest matches that clean source commit, package 0.5.0, publication mode, and embedded changelog hash; setup, API, and changelog smoke checks passed. See the [publication receipt](docs-publishing.md#publication-receipt-and-recovery) for deployment IDs and hashes. npm, tag, GitHub Latest, and live docs are verified. [Receipt PR #76](https://github.com/diegoag64/jev-devtools/pull/76) still needs review/merge; it does not require redeploying the same docs or changing immutable package bytes. The landing Site was not redeployed. Do not rerun the original publishing job or republish 0.5.0.

## Release 0.4.1 — published October 24, 2026

This patch release includes drawer CSS isolation and cleanup, corrected published `FlowExpression` types, and the contributor/release workflow updates. See the [0.4.1 changelog](../CHANGELOG.md#041--october-24-2026-experimental) for all included changes and compatibility notes.

**[jev-devtools@0.4.1](https://www.npmjs.com/package/jev-devtools/v/0.4.1) was published on October 24, 2026 at 17:33:19.570 UTC**, from commit `4ce235dd950b8b2f94e97d268ecbd5ae2b5b96ea` after [PR #61](https://github.com/diegoag64/jev-devtools/pull/61) and its main CI passed. npm's `latest` tag was verified as `0.4.1`.

The [approved release run](https://github.com/diegoag64/jev-devtools/actions/runs/40116262449) successfully uploaded the inspected archive through npm OIDC trusted publishing and generated provenance. npm reported that the package was being processed. The original verification loop exhausted its approximately 55-second polling window before version/latest visibility was confirmed, so the run failed and skipped its GitHub completion job. Authentication succeeded; the failed run is retained as the record of that attempt.

Recovery downloaded the original `npm-publication` artifact, verified its checksums, and resumed verification without rebuilding or republishing. Registry integrity matches the approved archive. The [npm provenance](https://registry.npmjs.org/-/npm/v1/attestations/jev-devtools@0.4.1) identifies the exact commit above and `.github/workflows/release.yml` in the original run. Fresh registry-installed React and Next.js consumers passed public-export, packed flow type, build, SSR, development capture/SSE, and disabled-production checks using sample responses. These recovery checks used the scripts from the release commit on Node 24.21.0.

The inspected and published archive was `jev-devtools-0.4.1.tgz` (66 files):

- SHA-256: `15a9c53c66bc7458e9054d4f29d30378d73afe5614386a64481ab32a072c66ee`
- Registry integrity: `sha512-gplLhwhzKCg4I4PNspYCwwq14jFdpvNmeH7oIo8N9Fsre4ttMa2/NpwFUQTfuALg+ym9xJokL2FJmIwE8naHtA==`

The missing [GitHub release v0.4.1](https://github.com/diegoag64/jev-devtools/releases/tag/v0.4.1) was published during recovery at 17:35:21 UTC on October 24, 2026 using the original candidate's notes. Its lightweight remote tag resolves to `4ce235dd950b8b2f94e97d268ecbd5ae2b5b96ea`; it is neither a draft nor a prerelease, and GitHub's latest-release endpoint returned `v0.4.1`.

npm and GitHub publication and the documentation follow-up are recorded on main. The immutable npm archive contains the preparation-time README; these documentation updates do not alter it. Do not republish 0.4.1 or rerun the failed publishing job.

## Release 0.4.0 — published October 24, 2026

Version 0.4.0 includes server function tasks, runtime request factories, bounded collections, returning conditionals, strict numeric `.gt()` comparisons, and stateful loops, with inline inspection of function results, collection items, and loop iterations. Six cookbook applications demonstrate these APIs from the repository; cookbook code and fixtures are not included in npm. The bundled setup skill and flow recipe cover the complete 0.4.0 API. See the [0.4.0 changelog](../CHANGELOG.md#040--october-24-2026-experimental).

**[jev-devtools@0.4.0](https://www.npmjs.com/package/jev-devtools/v/0.4.0) was published on October 24, 2026 at 07:41:04 UTC**, from commit `bc7f1609a6e94bf8fd9be4351db6983e8d0442ea` after [PR #34](https://github.com/diegoag64/jev-devtools/pull/34) and all eight post-merge checks passed. npm's `latest` tag was verified as `0.4.0`.

The missing [GitHub release v0.4.0](https://github.com/diegoag64/jev-devtools/releases/tag/v0.4.0) was created on October 24, 2026 at 16:50:08 UTC. Its remote tag was verified at the same published commit, and GitHub's latest-release endpoint returned `v0.4.0`. This completed the GitHub publication step without republishing npm or including later changes on `main`.

The inspected and published archive was `jev-devtools-0.4.0.tgz` (66 files):

- SHA-256: `3b711833250a90a657c3d305ef5dea29a2ab4c28fc36ef4d71e8095abde02bbb`
- Registry integrity: `sha512-4dxCrrX2Jxj13UTngGU1Fm7vEXGObCTV2hCTl81Jke+OFI6afSvhsrdPr2oDEEIHAGXi9A6rXUxeLXvmmMnv3g==`

The registry integrity matches the inspected archive. Fresh registry-installed React and Next.js consumers passed build, public-export, SSR, development capture/SSE, and disabled-production checks using sample responses. npm initially reported processing after accepting the upload; publication and `latest` were confirmed from registry metadata after processing completed. Do not republish 0.4.0; use a new version for later changes.

The immutable archive contains the preparation-time README. The current repository installation docs and changelog record the verified publication status; updating them does not modify the published archive.

### Upgrade from 0.3.0

Install `@typesafe-ai/sdk` explicitly with the package; it is now a peer dependency (`>=0.7.0 <0.8.0`, verified with 0.7.0). Existing React setup and static flow calls remain supported. Upgrade the server and drawer together for the new flow record kinds. Node middleware without `authorize` now requires loopback connections; network-accessible or Docker/VM/proxy setups need application authorization. Web Request servers must bind to `127.0.0.1` or set `authorize`.

## Release 0.3.0 — published October 24, 2026

This experimental minor release adds the Node flow API, connected request diagrams, readable condition inputs/requirements, parallel joins and outcomes, and structured content previews. It includes version-matched AI flow instructions in the npm archive. Existing single-request integration is unchanged. See the [0.3.0 changelog](../CHANGELOG.md#030--october-24-2026-experimental).

**[jev-devtools@0.3.0](https://www.npmjs.com/package/jev-devtools/v/0.3.0) was published on October 24, 2026 at 01:36:28 UTC**, from commit `559cfd3074176e39965365c00267f4c794b0e454` after [PR #24](https://github.com/diegoag64/jev-devtools/pull/24) and all eight post-merge checks passed. npm's `latest` tag was verified as `0.3.0`.

The inspected and published archive was `jev-devtools-0.3.0.tgz`:

- SHA-256: `35123cdf25cdb4b1b03d375a8f87a93e66b4bd503cbec11754d9452f7c53e86d`
- Registry integrity: `sha512-6uzhJpwtORlijD0h869Q3+UsApRpg0q7v3yhKjP3spMxmJ1Pn7sIm4WCJyNfwbAhQLa/gzUtWub9xQn+aszHpw==`

The registry integrity matches the inspected archive. Fresh registry-installed React and Next.js consumers passed build, public-export, SSR, development capture/SSE, and disabled-production checks using sample responses. npm reported processing after accepting the upload; publication and `latest` were confirmed from registry metadata after processing completed. Do not republish 0.3.0; use a new version for later changes.

## Release 0.2.0 — published October 23, 2026

This minor release adds compact Choice diagrams with progressive branch reveal and a complete probability table, virtualizes Questions, and reduces repeated work in transport and rendering. It includes batching, changed-trace streaming, frame-coalesced browser updates, suspended rendering while closed, and memoized unchanged views. Public component props and server setup APIs are unchanged; no integration migration is required. See the [0.2.0 changelog](../CHANGELOG.md#020--october-23-2026-experimental) for behavior and tradeoffs.

**[jev-devtools@0.2.0](https://www.npmjs.com/package/jev-devtools/v/0.2.0) was published on October 23, 2026 at 22:15:46 UTC**, from commit `b3bcb1097246a5065b6608397ff535ad71bb7648` after [PR #21](https://github.com/diegoag64/jev-devtools/pull/21) and all eight post-merge checks passed. npm's `latest` tag was verified as `0.2.0`.

The inspected and published archive was `jev-devtools-0.2.0.tgz`:

- SHA-256: `d64f0d8234b52108fa3079cbd61786054843d9396a0284f8ca02ac6519a3a8f0`
- Registry integrity: `sha512-U63uyugokRyL0Yth+8yaWFOqwnQV3XpPcgVJ+3eyXpnK7eYR4StEo7LzAEYyFn57Wb2m+xjO5+xkOWbrDVujQg==`

Do not republish 0.2.0. Use the current archive workflow below and explicit approval for the next release. The first-publish commands remain historical.

## First published release

**[`jev-devtools@0.1.0`](https://www.npmjs.com/package/jev-devtools/v/0.1.0) was published on October 23, 2026 and is experimental.** At its publication, the `latest` tag pointed to `0.1.0`. Only `packages/jev-devtools` is publishable, with explicit public access and the npm registry configured. The workspace root, playground, and examples remain private. There is no automatic publishing workflow.

The registry also contains npm’s `0.0.0-stage` placeholder. It does not control default installs: `npm install jev-devtools` resolves the `latest` tag. See [release notes](../CHANGELOG.md) and [npm staged publishing](https://docs.npmjs.com/staged-publishing/).

## Prepare and inspect an archive

Use Node 22.12+ (24 recommended). From a clean checkout of the reviewed release commit:

```sh
npm ci
npm run check
npm test
npm run build
npm run check:playground
npm run verify:package
npm run verify:nextjs
npm run verify:drawer
git diff --check
npm pack --dry-run --json -w jev-devtools
npm run pack:devtools
tar -tzf jev-devtools-0.5.2.tgz
shasum -a 256 jev-devtools-0.5.2.tgz
```

The archive must contain only `package.json`, the package README, MIT license, third-party notices, the setup skill and its four Markdown references under `skills/setup-jev-devtools`, and compiled JavaScript, declaration files, and scoped CSS under `lib/src`, `lib/server`, and `lib/flow`. It must not contain playground code, tests, fixtures, source TypeScript, demo media, environment files, or credentials. `verify:package` checks the actual pack file list before installing into an independent React app. `verify:nextjs` checks a separate packed installation with real development and production Next.js servers. Both use sample responses; neither makes live inference calls.

Inspect the packed manifest too:

```sh
tar -xOf jev-devtools-0.5.2.tgz package/package.json
```

Confirm the name/version, public access, Node engine, React peers, public exports (including the `/flow` entry point), and absence of `private: true`. Save the release commit SHA and archive checksum with the release evidence. Keep the archive unchanged between final inspection and publication. Do not publish from a dirty checkout or use a wildcard that could select an old archive.

## First-publish checklist (historical)

The first publish below is complete. These commands record that process; **do not republish 0.1.0**. For future versions, use the [release checklist](#release-checklist) with the new version and archive. Each merge, publish, and release tag still requires explicit authorization.

Before running a publish command:

1. Review and merge the release PR with Diego's explicit approval. Use its exact merged commit on `main`, with green CI, and run the archive checks above again if the contents changed.
2. Confirm which npm account will own the package. GitHub authentication does not authenticate npm. Sign in to that account locally and enable two-factor authentication; complete browser/security-key challenges yourself. Never paste tokens or recovery codes into chat or commit them.
3. Verify the registry identity and current name availability using the read-only commands below. A 404 means no public package was found; a different error is not proof of availability. If a package now exists, check ownership and stop rather than attempting an unauthorized publish.
4. Obtain explicit authorization to publish `jev-devtools@0.1.0` publicly with the `latest` tag. `latest` makes the documented `npm install jev-devtools` command resolve this release; the version remains experimental despite that tag.

Authentication and read-only checks (these do not publish):

```sh
npm login --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/
npm view jev-devtools name version maintainers --json --registry=https://registry.npmjs.org/
```

After all approvals, from the repository root, publish the **inspected archive**:

```sh
npm publish ./jev-devtools-0.1.0.tgz --access public --tag latest --registry=https://registry.npmjs.org/
```

Complete npm's authentication challenge if prompted. This command is documented for the maintainer; it is not run by preparation scripts or CI. npm name/version pairs cannot be overwritten after publication. See [npm's unscoped publishing guide](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages/) and [publish command](https://docs.npmjs.com/cli/v11/commands/npm-publish/).

## First-publish confirmation (historical)

The following commands record the 0.1.0 confirmation procedure. Use [Read back the published state](#read-back-the-published-state) for the current release; the historical latest-tag expectation below is not a claim about today's registry.

After npm reports success:

```sh
npm view jev-devtools@0.1.0 name version dist.integrity dist.tarball --json --registry=https://registry.npmjs.org/
npm view jev-devtools dist-tags --json --registry=https://registry.npmjs.org/
```

Confirm `latest` points to `0.1.0`. Install `jev-devtools@0.1.0` from the registry in a clean React consumer, verify the imports and CSS, and repeat the Next.js example using the registry version. Check the public README and license. Record the registry integrity alongside the local archive checksum.

Then, with release/tag authorization, tag the exact published commit and create a GitHub release using the 0.1.0 notes. Update the repository documentation and changelog date through a PR after publication is confirmed. Do not claim a release exists before npm confirms success.

## Future releases

Follow the [release checklist and completion rule](#release-checklist) for the entire release, including GitHub publication and verification. The version-preparation requirements below supplement that checklist.

Maintain [CHANGELOG.md](../CHANGELOG.md) as the canonical release history. In the release PR, move the accumulated Unreleased entries into a new version section marked **Pending publication**, retain their PR links and category grouping, and update the overview table with two or three short themes. Combine matching categories and remove empty headings; keep compatibility and upgrade requirements separate. Leave an Unreleased section for later work. Do not infer a publication date from a merge date: after npm confirms success, verify the version's timestamp with `npm view jev-devtools time --json` and record the UTC date through a PR. Only then mark the version published and link its exact-version npm page. Keep unpublished changes out of older version sections; do not change prior release dates when editing their descriptions.

Use a release PR for each version. Update the library version, the playground's exact workspace dependency, example archive paths, root lockfile, and changelog together. Run `npm run sync:readme-version` after setting the library version: it synchronizes both READMEs' static version badges, exact-version npm links, and archive examples from `packages/jev-devtools/package.json`. `npm run check` and the package's `prepack` hook reject mismatches. Exact-version links avoid relying on npm's default package-page version display; the badge deliberately describes the checked-out release rather than fetching a potentially newer `latest` tag. Run the full checks and inspect the packed artifact. After review and explicit approval, publish that artifact, verify the registry result, tag the exact release commit, and publish and verify its GitHub release. Never publish every push or every merge to `main`.

### Authentication for remote releases

For future automation, prefer [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) with GitHub Actions OIDC. Configure the exact repository, workflow, and optional environment on npm; use a GitHub-hosted runner and `id-token: write`. Direct publishing must be explicitly allowed; stage-only publishing still needs human 2FA approval. No long-lived npm token is needed. Keep maintainer approval in a protected release environment and verify provenance.

[Granular tokens](https://docs.npmjs.com/about-access-tokens/) with bypass 2FA are a temporary alternative where package policy permits them. npm documents removal of their direct-publishing ability in January 2027. They are not a permanent authentication solution.

The [remote release workflow](#release-remotely-with-github-actions) implements this approach with explicit dispatch and environment approval. Keep its setup, verification, and recovery instructions aligned with current npm requirements and the release completion checks.
