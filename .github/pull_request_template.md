<!-- Follow CONTRIBUTING.md#pr-descriptions. Keep these headings in order and scale the detail to the change. -->

## Problem

<!-- Explain the problem or need and its impact. For a bug, describe actual versus expected behavior and include reproduction steps or environment where relevant. Link related issues; use closing keywords only when fully resolved. -->

## Change

<!-- Explain how the change addresses the problem and what happens afterward. Include a concrete before/after example when useful. Explain important tradeoffs or rejected alternatives only when they help review the chosen approach. -->

## Scope and compatibility

<!-- Identify affected components and explain their relationship when needed. Describe public API, package exports, CSS integration, supported-version, or packaging changes and any migration needed. State when there is no compatibility impact; note meaningful limits or follow-up work. -->

## Verification

<!-- Describe the checks run and observed results for the changed behavior, plus the required commands in CONTRIBUTING.md. Include relevant environment details and explicitly state anything not checked. "Tests pass" alone is insufficient.

For visible UI changes, include before/after captures when browser access is available; use a short recording when motion or interaction matters. Link or embed evidence in the PR. Keep generated artifacts out of Git under ignored benchmarks/results/.

For performance claims, follow docs/performance.md and report before/after measurements, revisions, commands, environment, variability, and tradeoffs. Benchmarks run locally only. Distinguish sample verification from live inference. -->

## CSS review

<!-- If package CSS or its consumers changed, complete these items and include brief evidence. Otherwise replace this section with "Not applicable." See CONTRIBUTING.md#package-css-review. -->

- [ ] Traced affected selectors, declarations, variables, animations, and inline styles to current components/states or documented requirements.
- [ ] Removed obsolete styles with their consumers; explained non-obvious resets, fallbacks, or compatibility retention near the rules.
- [ ] Checked relevant browser states and ran `npm run verify:drawer`; recorded evidence and any gaps above.
