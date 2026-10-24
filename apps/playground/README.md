# Playground

Run these commands from a terminal to start the local development playground.

Requires Node **22.12+** (24 recommended).

```sh
git clone https://github.com/diegoag64/jev-devtools.git
cd jev-devtools
npm ci
npm run dev
```

Open http://127.0.0.1:4182/. Sample mode needs no API key. Run a scenario to see its application result, then open **Jev DevTools** in the bottom-right corner to inspect the call. Samples cover Choice, Score, Noul, Box, retries, errors, and cancellation. Flow samples add approval/review outcomes, parallel checks with a join, and failed/cancelled runs. Fixture responses do not change when you edit context.

## Cookbook examples

The [cookbook guide](../../cookbooks/README.md) lists six runnable examples, their local URLs, and the flow patterns they demonstrate. They use the 0.4.0 flow API. The playground, cookbook code, and fixtures live in this repository and are not bundled in the npm package.

## Manual edge-case sandbox

With `npm run dev` running, open [the Choice sandbox](http://127.0.0.1:4182/?sandbox=1). It starts with **150 choices**. Click **Run sample**, open **Jev DevTools**, then select the latest **Sandbox** request. Expand the drawer for a larger canvas. In Flow, click **Show More** to add three categories at a time, or **Show fewer** to reset the overview. New branches animate in without moving your camera; click **Fit** when you want to reframe the expanded diagram. Use **All probabilities** to open the full distribution; search or page through the exact captured values.

Controls cover 3/6/7/150 choices, tied probabilities, zero-probability alternatives, long labels, roughly 80 KB of context, and a synthetic returned choice outside the top categories. Sandbox requests always use deterministic local responses—even if a server key is configured. No inference calls are made. Other scenarios remain available in the Scenario selector.

## Optional live mode

For optional live mode, copy `apps/playground/.env.example` to `apps/playground/.env.local`, set `TYPESAFE_API_KEY`, and restart. Keys stay on the server. Verification uses sample responses; live inference has not been verified.

## Development

The playground consumes built public package exports. Restart `npm run dev` after library edits, or run `npm run build:package` separately. The full verification commands and package checks are in [Contributing](../../CONTRIBUTING.md).
