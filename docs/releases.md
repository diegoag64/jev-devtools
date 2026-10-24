# Packaging and releases

## Release checklist

Use this checklist for every version. npm publication, the Git tag, and the GitHub release are separate operations. The historical records below are evidence, not a substitute for this checklist. Carry forward authorization already given for this release; if an action is outside that authorization, identify it before proceeding.

1. **Prepare and approve.** Use a release PR to set the version, synchronize README versions, and move the intended Unreleased entries into a pending release section. After authorized merging and green CI, record the exact release commit. Run the [archive checks](#prepare-and-inspect-an-archive) from a clean checkout of that commit, inspect the archive, and record its checksum. Prepare notes covering only that release and any upgrade requirements.
2. **Publish the inspected archive.** With npm publication authorization, publish that exact archive with the intended dist-tag. Do not rebuild between inspection and publication. Check the registry first if a prior attempt has an uncertain outcome; an upload or processing message alone does not prove publication.
3. **Verify npm.** Confirm the version is available, registry integrity matches the inspected archive, the intended dist-tag points to it, and the registry publication timestamp is recorded in UTC. Check fresh registry-installed React and Next.js consumers using samples. Record the exact-version npm link and observed results.
4. **Create and verify the tag.** With release/tag authorization, create `vX.Y.Z` at the exact published commit. If the remote tag already exists, verify its resolved commit before reusing it; never move an existing release tag to make a check pass. Do not default to the current `main`, which may contain later work.
5. **Publish and verify the GitHub release.** Publish the prepared notes for that tag, including the npm link, release commit, and compatibility notes. A tag or draft release alone is insufficient. For a normal latest release, explicitly mark it Latest and verify GitHub's latest-release endpoint returns it. For a prerelease or historical backfill, record the intended designation and preserve any newer latest release unless explicitly authorized otherwise. Verify the tag's resolved commit separately from the release's target metadata.
6. **Record and report.** Update the changelog, its overview, and this release record through a PR using verified publication facts. Include both npm and GitHub release links, the exact commit, integrity/checksum evidence, and verification results. Keep later Unreleased work separate and identify any open follow-up documentation PR.

### Completion and recovery

Call the release complete only after npm publication and its intended dist-tag, the remote tag's exact commit, and the published GitHub release and intended Latest/prerelease designation have all been verified, and the release record has been updated. An open documentation PR remains a stated follow-up until merged.

If npm succeeds but tagging, GitHub publication, verification, or record updates remain pending, report **partially completed release**. State what succeeded, what remains, and any missing authorization or failed check. Resume from the missing step; do not republish an existing npm version, move a published tag, or include newer commits. If a record-update PR is awaiting review, report publication as verified with that follow-up pending. Never silently omit a remaining step or describe npm success alone as completion of the whole release.

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

1. Merge the approved release PR and wait for its `Verify` workflow on `main` to pass. The package manifest and changelog must contain the intended new version; its changelog section needs `### Compatibility and upgrade` and `### Changes` subsections. Those subsections become the GitHub notes, excluding the pending-publication preamble and other versions.
2. Open **Actions → Release → Run workflow**, choose `main`, enter its full current commit SHA, and leave **dry_run** enabled for an initial rehearsal. The SHA must equal `main` at dispatch time so npm provenance describes the checked-out source. If `main` advances first, inspect the new commit before retrying. This workflow cannot release a commit that predates the workflow itself.
3. Review the run summary and download `release-candidate`: it includes the package archive, `release.json` with SHA-256 and npm integrity, and the generated notes. The workflow runs all repository checks, including drawer and independent consumer checks, against the selected source and archive. It does not run performance benchmarks.
4. To publish, dispatch again with **dry_run** disabled. This run builds and checks its own candidate, then pauses at **Approve npm VERSION**. Review this run's artifact and checksum; do not assume it is identical to the earlier rehearsal. Approve **npm-release** through GitHub's **Review deployments** UI. That approval is the release gate; npm does not ask for a separate 2FA code during the OIDC publish.
5. The publish job verifies the approved artifact hashes, refuses existing versions/tags or a downgrade of `latest`, and publishes those bytes without rebuilding or running lifecycle scripts. It verifies registry integrity and provenance. A separate job without OIDC permission checks fresh registry consumers, creates the GitHub release at the selected commit, and verifies the remote tag and Latest designation.
6. Download `release-evidence` and use `publication.json` to update this guide and the changelog through a PR. Publication success does not merge that documentation follow-up. Keep its status explicit under the completion rule above.

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

Read the run summary, npm metadata, and remote tag before taking action. After any uncertain publish outcome, do not dispatch a new publication or rerun the publish job: the preflight intentionally refuses an existing npm version. Download `npm-publication` or `release-evidence` from the original run, compare its checksums with the approved candidate, and resume only the missing verification or GitHub steps under existing release authorization. If a tag/release already exists, inspect and verify it manually; never move its tag or blindly recreate it. Expired artifacts or mismatched checksums require investigation, not rebuilding and pretending the bytes are the original candidate.

The independent consumer checks accept `JEV_VERIFY_TARBALL=/absolute/path/to/archive.tgz` to check an inspected archive, or `JEV_VERIFY_VERSION=X.Y.Z` to check a fresh registry installation. Do not set both. Use the verification scripts from the release commit so later regression tests do not incorrectly reject an older release. With neither variable, the existing local pack-and-check behavior is unchanged.

## Release 0.4.1 — pending publication

This patch release candidate includes all changes merged after 0.4.0: drawer CSS isolation and cleanup, corrected published `FlowExpression` types, and the contributor/release workflow updates. See the [0.4.1 changelog](../CHANGELOG.md#041--pending-publication-experimental) for the complete changes and compatibility notes.

Preparation sets the workspace, package, playground dependency, independent archive examples, README versions, and bundled flow recipe to 0.4.1. npm publication, `v0.4.1`, and the GitHub release remain pending. The exact release commit will be the reviewed merge commit after CI passes; local candidate archives are preparation evidence, not published artifacts.

After approval and merge, follow the remote release workflow above: rehearse the merged commit, inspect the publishing run's candidate, and approve the `npm-release` deployment manually. Record the verified npm timestamp, archive checksum/integrity, exact tag commit, registry consumer results, and GitHub Latest status in a follow-up documentation PR. Until publication is verified, installation commands resolve the existing published 0.4.0 release.

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
tar -tzf jev-devtools-0.4.1.tgz
shasum -a 256 jev-devtools-0.4.1.tgz
```

The archive must contain only `package.json`, the package README, MIT license, third-party notices, the setup skill and its four Markdown references under `skills/setup-jev-devtools`, and compiled JavaScript, declaration files, and scoped CSS under `lib/src`, `lib/server`, and `lib/flow`. It must not contain playground code, tests, fixtures, source TypeScript, demo media, environment files, or credentials. `verify:package` checks the actual pack file list before installing into an independent React app. `verify:nextjs` checks a separate packed installation with real development and production Next.js servers. Both use sample responses; neither makes live inference calls.

Inspect the packed manifest too:

```sh
tar -xOf jev-devtools-0.4.1.tgz package/package.json
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

Maintain [CHANGELOG.md](../CHANGELOG.md) as the canonical release history. In the release PR, move the accumulated Unreleased entries into a new version section marked **Pending publication**, retain their PR links, and update the overview table. Leave an Unreleased section for later work. Do not infer a publication date from a merge date: after npm confirms success, verify the version's timestamp with `npm view jev-devtools time --json` and record the UTC date through a PR. Only then mark the version published and link its exact-version npm page. Keep unpublished changes out of older version sections; do not change prior release dates when editing their descriptions.

Use a release PR for each version. Update the library version, the playground's exact workspace dependency, example archive paths, root lockfile, and changelog together. Run `npm run sync:readme-version` after setting the library version: it synchronizes both READMEs' static version badges, exact-version npm links, and archive examples from `packages/jev-devtools/package.json`. `npm run check` and the package's `prepack` hook reject mismatches. Exact-version links avoid relying on npm's default package-page version display; the badge deliberately describes the checked-out release rather than fetching a potentially newer `latest` tag. Run the full checks and inspect the packed artifact. After review and explicit approval, publish that artifact, verify the registry result, tag the exact release commit, and publish and verify its GitHub release. Never publish every push or every merge to `main`.

### Authentication for remote releases

For future automation, prefer [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) with GitHub Actions OIDC. Configure the exact repository, workflow, and optional environment on npm; use a GitHub-hosted runner and `id-token: write`. Direct publishing must be explicitly allowed; stage-only publishing still needs human 2FA approval. No long-lived npm token is needed. Keep maintainer approval in a protected release environment and verify provenance.

[Granular tokens](https://docs.npmjs.com/about-access-tokens/) with bypass 2FA are a temporary alternative where package policy permits them. npm documents removal of their direct-publishing ability in January 2027. They are not a permanent authentication solution.

The [remote release workflow](#release-remotely-with-github-actions) implements this approach with explicit dispatch and environment approval. Keep its setup, verification, and recovery instructions aligned with current npm requirements and the release completion checks.
