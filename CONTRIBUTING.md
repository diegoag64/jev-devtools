# Contributing

Use a feature branch and pull request against `main`, including small fixes and documentation edits. Do not push directly to `main`. Leave PRs open for review; merging, npm publishing, and deployment require explicit authorization.

1. Install Node 22.12+ and run `npm ci`.
2. Create a branch from current `main`.
3. Start the sample playground with `npm run dev`.
4. Keep reusable code in `packages/jev-devtools`; sample scenarios and app-specific policy belong in `apps/playground`. Use public package imports across this boundary.
5. Run `npm run check`, `npm test`, `npm run build`, `npm run check:playground`, `npm run verify:package`, `npm run verify:nextjs`, and `git diff --check`. Check changed UI interactions in the browser when available and describe any verification gaps.
6. Push the feature branch and open a PR describing the behavior, checks, and limits. Use samples unless live verification is explicitly requested.

Tests use the real TypeSafe SDK with custom fetch fixtures. No secrets or inference service are required. See [AGENTS.md](AGENTS.md) for agent instructions and [release process](docs/releases.md) for packaging.

For drawer changes, run `npx playwright install chromium --only-shell` once, then `npm run verify:drawer`. This exercises the public component with sample requests in an isolated browser, including hidden updates, reopening, preserved controls, clear, and eviction. It also visits all 150 captured answers through the virtualized Questions view and checks keyboard navigation, focus, expanded legends, mixed answer types, resizing, and scroll restoration. CI runs this check with React 18 and 19. `JEV_VERIFY_PORT` changes its loopback server port (default 4220).

For opt-in performance measurements, run `npm run bench:server`, `npm run bench:browser`, or `npm run bench:compare -- BASE_COMMIT` locally. Follow the [local benchmark guide](docs/performance.md). Run server and browser benchmarks separately to avoid CPU contention. Never run performance benchmarks in GitHub Actions; hosted CI is for correctness and integration checks. Keep scripts and fixtures tracked, but save all generated results, profiles, screenshots, logs, and per-run reports under ignored `benchmarks/results/`. Put before/after results, commit SHAs, commands, environment, variability, and tradeoffs in the PR description or discussion. Do not force-add artifacts or copy them into `docs/`.

## PR titles

Use `type: description`, with a lowercase type and one space after the colon. Describe the actual change; update the title if the scope changes.

- `feat: add flow loops`
- `fix: preserve diagram zoom when switching items`
- `docs: explain the memory cookbook`

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, and `revert`. An optional scope and breaking-change marker are supported: `fix(viewer): restore focus` or `feat!: change the flow API`. The description must be nonempty, on one line, with no leading or trailing whitespace.

The **PR title** workflow checks drafts and ready PRs on creation, title edits, new commits and reopening. It only validates metadata; it does not install dependencies or run benchmarks. The **Conventional PR titles** repository ruleset requires this check before merging to `main`.

## Keep the changelog current

For user-visible changes, add a concise entry under **Unreleased** in [CHANGELOG.md](CHANGELOG.md) in the same PR. Describe the behavior and any compatibility change, and link the PR once its number is known. Include meaningful documentation and tooling improvements; skip internal refactors with no observable effect. Entries on feature branches describe proposed changes; the changelog on `main` describes merged work.

Keep the overview table useful at a glance. Do not list an open PR as delivered work in another PR's changelog entry. At release time, follow the [release process](docs/releases.md): group the accumulated entries under the new version and verify its publication date before marking it published. npm versions and merged work must remain distinguishable.

## Repository layout

| Path | Purpose |
| --- | --- |
| `packages/jev-devtools` | React drawer, diagrams, recorder, Node adapter, scoped CSS |
| `apps/playground` | Sample/live scenarios, minimal shadcn form, application previews |
| `examples/react-vite` | Independent consumer using only public package exports |
| `examples/nextjs-app` | Next.js App Router consumer using the packed package |
| `docs` | Integration, architecture, provenance, and release process |

See the [playground guide](apps/playground/README.md) for sample scenarios and the manual sandbox. The static diagram lab and its `/docs/` replica remain in the original repo.

## Verification details

```sh
npm run check
npm test
npm run build
npm run check:playground
npm run verify:package
npm run verify:nextjs
```

`verify:package` packs the library and installs it in a temporary independent React app, checks SSR/disabled behavior, and builds the consumer with a browser/server boundary check. Set `JEV_VERIFY_REACT=18.3.1` to verify React 18 instead of the default React 19. Registry access is allowed by default; `JEV_VERIFY_OFFLINE=1` is available when all dependencies are cached.

`check:playground` compiles the full interactive development UI into a temporary directory. The regular production build intentionally contains only a local-tool notice; it is not a hosted demo.

After `npm run pack:devtools`, you can also run `npm install && npm run dev` inside `examples/react-vite` (port 4183, sample-only).
