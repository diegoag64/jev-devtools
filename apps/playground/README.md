# Playground

Run these commands from a terminal to start the local development playground.

Requires Node **22.12+** (24 recommended).

```sh
git clone https://github.com/diegoag64/jev-devtools.git
cd jev-devtools
npm ci
npm run dev
```

Open http://127.0.0.1:4182/ for the **Flow Workbench**. Choose one of 19 cookbooks and inspect its actual `flow.ts` beside the package's diagram. **Complete flow** shows the authored graph before execution; **Step-by-step guide** narrates the TypeSafe recipe and reveals one Flow operation at a time. Timeline colors connect source ranges and diagram nodes. Select code or a line number to highlight the corresponding nodes, or select a node to find its source. Maps and loops also expose their authored item programs.

The workspace fills the viewport. Drag the divider to resize the code and diagram, or focus it and use the arrow keys. Press Enter or double-click to restore the default split. Wide and narrow layouts remember their proportions separately. The cookbook library can be hidden, and the compact guide keeps its controls above the panels. Input, results, and adaptation notes open from the bottom bar without moving the diagram.

**Run sample** executes the complete cookbook with synthetic answers and displays captured request diagrams, step details, and the application result without a drawer. It needs no API key. The guide never executes partial code. Each recipe links to the original TypeSafe cookbook and describes local adaptations; sample runs do not measure model accuracy, latency, or cost.

The [Request lab](http://127.0.0.1:4182/?legacy=1) retains individual calls, edge cases, optional live mode, the original cookbook result views, and the drawer. Add `legacy=1` to a cookbook URL to use its former interface. Existing recipe browser checks cover that route; the workbench has its own collection-wide interaction check. Sources and tutorial mappings are served only by the local development server, behind the existing same-origin and session checks.

## Cookbook examples

The [cookbook guide](../../cookbooks/README.md) lists runnable examples, their local URLs, and the flow patterns they demonstrate. They use the public flow API. The playground, cookbook code, and fixtures live in this repository and are not bundled in the npm package.

The [LLM guardrails cookbook](../../cookbooks/guardrails/README.md) screens one selected input or output message per run. It reuses one synthetic assessment under strict and permissive policies; no LLM generation or live inference is enabled.

## Manual edge-case sandbox

With `npm run dev` running, open [the Choice sandbox](http://127.0.0.1:4182/?sandbox=1). It starts with **150 choices**. Click **Run sample**, open **Jev DevTools**, then select the latest **Sandbox** request. Expand the drawer for a larger canvas. In Flow, click **Show More** to add three categories at a time, or **Show fewer** to reset the overview. New branches animate in without moving your camera; click **Fit** when you want to reframe the expanded diagram. Use **All probabilities** to open the full distribution; search or page through the exact captured values.

Controls cover 3/6/7/150 choices, tied probabilities, zero-probability alternatives, long labels, roughly 80 KB of context, and a synthetic returned choice outside the top categories. Sandbox requests always use deterministic local responses—even if a server key is configured. No inference calls are made. Other scenarios remain available in the Scenario selector.

## Optional live mode

For optional live mode in the Request lab, copy `apps/playground/.env.example` to `apps/playground/.env.local`, set `TYPESAFE_API_KEY`, and restart. Keys stay on the server. Verification uses sample responses; live inference has not been verified.

## Development

The playground consumes built public package exports. Restart `npm run dev` after library edits, or run `npm run build:package` separately. The full verification commands and package checks are in [Contributing](../../CONTRIBUTING.md).

The [Twitch chat filter](../../cookbooks/twitch-chat-filter/README.md) at `/?cookbook=twitch-chat-filter` preserves the original finite 29-message feed with concurrency eight. Synthetic responses expose inclusive 0.70 thresholds, hide/blur precedence and normal/quiet policies; changing views makes no new requests. Live Twitch ingestion is outside this sample.

The [Entity alignment cookbook](../../cookbooks/entity-alignment/README.md) runs at `/?cookbook=entity-alignment`: one Score plus three companion Nouls, attributed beer pairs, and synthetic cases on both sides of each route boundary. It returns proposed matches without changing a database.

The [Citation checking cookbook](../../cookbooks/citation-checking/README.md) runs at `/?cookbook=citation-checking`: exact normalized quote matching, conditional Choice requests and the official confidence >= 0.80 acceptance gate. Its five cases use synthetic answers and reject live execution or edited sample inputs on the server.

The [confidence fallback cookbook](../../cookbooks/confidence-fallback/README.md) preserves the original 75 SIC groups and routes on API confidence ≥0.90. Its four cases use authored descriptions and synthetic answers; the parent division is computed in a task. Open `/?cookbook=confidence-fallback`.

The [line-search cookbook](../../cookbooks/line-search/README.md) uses a complete pinned document, synthetic answers and exact existence thresholds; all line options remain accessible in its result.

The [Date extraction cookbook](../../cookbooks/date-extraction/README.md) runs at `/?cookbook=date-extraction`: fixed 2026-07-30 reference date, seven Choice questions per role, deterministic calendar assembly and strict below-0.60 confidence review. Responses are synthetic, and live mode is disabled.

The [pre-parsed extraction sample](http://127.0.0.1:4182/?cookbook=pre-parsed-extraction) preserves the official separate email, phone and money helper calls. It runs real regex and normalization tasks with synthetic selections; fixed inputs and sample-only mode are enforced on the server. See its [fidelity and locale limits](../../cookbooks/pre-parsed-extraction/README.md).

The [Function calling cookbook](../../cookbooks/function-calling/README.md) opens at `/?cookbook=function-calling`. Its fixed synthetic samples propose calls and expose defaults, set membership and selected-argument confidence without executing tools.

### Choice self-consistency

Open `http://127.0.0.1:4182/?cookbook=consistency-choices` for the [Choice self-consistency adaptation](../../cookbooks/consistency-choices/README.md). It keeps the original post, eight Choice questions and 15 sequential requests, with authored varying distributions. Inspect each repeat and its question gates in Flows, or open the Request lab with `legacy=1` and select heatmap cells for raw probabilities and separate confidence. Below 0.60 abstains; exactly 0.60 accepts. Samples do not measure consistency, accuracy, latency or cost; live mode and other-provider comparisons are excluded.

The [Noul self-consistency cookbook](../../cookbooks/consistency-nouls/README.md) runs at `/?cookbook=consistency-nouls`. It preserves fifteen sequential fourteen-question requests and the inclusive 0.30–0.70 uncertainty band. Its authored variation and statistics are fixture demonstrations, not measured model consistency or a provider comparison; live mode is rejected.
