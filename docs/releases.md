# Packaging and releases

## Release 0.4.0 — published October 24, 2026

Version 0.4.0 includes server function tasks, runtime request factories, bounded collections, returning conditionals, strict numeric `.gt()` comparisons, and stateful loops, with inline inspection of function results, collection items, and loop iterations. Six cookbook applications demonstrate these APIs from the repository; cookbook code and fixtures are not included in npm. The bundled setup skill and flow recipe cover the complete 0.4.0 API. See the [0.4.0 changelog](../CHANGELOG.md#040--october-24-2026-experimental).

**[jev-devtools@0.4.0](https://www.npmjs.com/package/jev-devtools/v/0.4.0) was published on October 24, 2026 at 07:41:04 UTC**, from commit `bc7f1609a6e94bf8fd9be4351db6983e8d0442ea` after [PR #34](https://github.com/diegoag64/jev-devtools/pull/34) and all eight post-merge checks passed. npm's `latest` tag was verified as `0.4.0`.

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
tar -tzf jev-devtools-0.4.0.tgz
shasum -a 256 jev-devtools-0.4.0.tgz
```

The archive must contain only `package.json`, the package README, MIT license, third-party notices, the setup skill and its four Markdown references under `skills/setup-jev-devtools`, and compiled JavaScript, declaration files, and scoped CSS under `lib/src`, `lib/server`, and `lib/flow`. It must not contain playground code, tests, fixtures, source TypeScript, demo media, environment files, or credentials. `verify:package` checks the actual pack file list before installing into an independent React app. `verify:nextjs` checks a separate packed installation with real development and production Next.js servers. Both use sample responses; neither makes live inference calls.

Inspect the packed manifest too:

```sh
tar -xOf jev-devtools-0.4.0.tgz package/package.json
```

Confirm the name/version, public access, Node engine, React peers, public exports (including the `/flow` entry point), and absence of `private: true`. Save the release commit SHA and archive checksum with the release evidence. Keep the archive unchanged between final inspection and publication. Do not publish from a dirty checkout or use a wildcard that could select an old archive.

## First-publish checklist (historical)

The first publish below is complete. These commands record that process; **do not republish 0.1.0**. For future versions, use the release workflow below with the new version and archive. Each merge, publish, and release tag still requires explicit authorization.

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

## Confirm the published result

After npm reports success:

```sh
npm view jev-devtools@0.1.0 name version dist.integrity dist.tarball --json --registry=https://registry.npmjs.org/
npm view jev-devtools dist-tags --json --registry=https://registry.npmjs.org/
```

Confirm `latest` points to `0.1.0`. Install `jev-devtools@0.1.0` from the registry in a clean React consumer, verify the imports and CSS, and repeat the Next.js example using the registry version. Check the public README and license. Record the registry integrity alongside the local archive checksum.

Then, with release/tag authorization, tag the exact published commit and create a GitHub release using the 0.1.0 notes. Update the repository documentation and changelog date through a PR after publication is confirmed. Do not claim a release exists before npm confirms success.

## Future releases

Maintain [CHANGELOG.md](../CHANGELOG.md) as the canonical release history. In the release PR, move the accumulated Unreleased entries into a new version section marked **Pending publication**, retain their PR links, and update the overview table. Leave an Unreleased section for later work. Do not infer a publication date from a merge date: after npm confirms success, verify the version's timestamp with `npm view jev-devtools time --json` and record the UTC date through a PR. Only then mark the version published and link its exact-version npm page. Keep unpublished changes out of older version sections; do not change prior release dates when editing their descriptions.

Use a release PR for each version. Update the library version, the playground's exact workspace dependency, example archive paths, root lockfile, and changelog together. Run `npm run sync:readme-version` after setting the library version: it synchronizes both READMEs' static version badges, exact-version npm links, and archive examples from `packages/jev-devtools/package.json`. `npm run check` and the package's `prepack` hook reject mismatches. Exact-version links avoid relying on npm's default package-page version display; the badge deliberately describes the checked-out release rather than fetching a potentially newer `latest` tag. Run the full checks and inspect the packed artifact. After review and explicit approval, publish that artifact, verify the registry result, and tag the exact release commit. Never publish every push or every merge to `main`.

A later, separately reviewed automation PR can add [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) through GitHub Actions OIDC. Configure the exact repository and workflow on the npm package, use a protected release environment with maintainer approval and narrowly scoped `id-token: write`, and require an approved release commit/tag. Use a supported Node/npm version and GitHub-hosted runner, and verify provenance. This avoids storing a long-lived publish token in GitHub. No trusted publisher, npm token, publishing permission, automatic release, or release workflow is configured by this preparation PR.
