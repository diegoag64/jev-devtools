# Playground

Explore the [Cookbook Playground](https://playground.jevtools.dev/) without downloading the repository or installing the package. Read source beside the diagrams, follow the step-by-step guides, and run synthetic samples without an API key.

## Local development

To edit the playground or its cookbooks, start the local development server.

Requires Node **22.12+** (24 recommended).

```sh
git clone https://github.com/diegoag64/jev-devtools.git
cd jev-devtools
npm ci
npm run dev
```

Open http://127.0.0.1:4182/ for the **Flow Workbench**. Choose one of 19 cookbooks and inspect its actual `flow.ts` beside the package's diagram. **Complete flow** opens with a synthetic sample capture, including the same request diagrams and collection item controls as the drawer. **Step-by-step guide** narrates the TypeSafe recipe and reveals one Flow operation at a time while retaining those request details. Timeline colors connect source ranges and diagram nodes. Select code or a line number to highlight the corresponding nodes, or select a node to find its source. Maps and loops also expose their authored item programs.

**Cookbook overview** introduces each recipe and explains how its Flow methods fit together. The walkthrough explains what each step does and why it uses that method, without requiring an external tutorial. **Original Cookbook** in the top-right corner links to the selected TypeSafe recipe. The panel icon at the left of the toolbar shows or hides the cookbook library.

Switching cookbooks keeps the toolbar, guide mode, library, and panel layout in place. The previous cookbook stays visible while the next one loads, with its actions paused and any running sample cancelled. After a short wait, “Opening…” names the destination. The source, diagram, and guide then update together at the first step and default sample. A failed load offers **Try again** without removing the workspace. Expanded panels keep loading feedback and retry controls inside the popup. Reduced-motion preferences disable transition animation.

Short step comments explain the purpose of each operation in the source view. Use the comment icon beside **Copy source** to show or hide them; the preference is remembered across cookbooks. Copy includes the notes when they are shown and returns the original source when they are hidden. Line numbers always refer to the original `flow.ts`.

The workspace fills the viewport. Drag the divider to resize the code and diagram, or focus it and use the arrow keys. Press Enter or double-click to restore the default split. Wide and narrow layouts remember their proportions separately. Each panel header has compact controls to expand that pane in a popup or show it alone. In walkthrough mode, the popup keeps Previous and Next controls beside the current step title. Advancing updates the code and diagram together, and closing the popup keeps the reached step. Close the popup with Escape, its close icon, or a click on the backdrop. Drag the divider to either edge to hide a pane, then use Show both panels to restore the split. The mounted code and diagram retain their reading position, comments, selected collection item, and request controls. If the walkthrough advances while code is hidden, restoring code reveals the current step. The cookbook library can be hidden, and the compact guide keeps its controls above the panels. Input, results, and adaptation notes open from the bottom bar without moving the diagram.

**Run sample** is available in both views. It executes the complete cookbook with synthetic answers and streams request diagrams, step details, and the application result without a drawer or API key. Running from the guide keeps the current step selected; it never executes partial code. Use the request controls to explore probabilities and animate the diagram, or open a map or loop item to inspect its captured requests. Opening an item frames its expanded flow, including the item navigation controls. Closing it returns focus to the selected step. Initial previews run the same fixtures through a separate recorder with no artificial delay, so browsing a recipe does not add runs to the drawer history. Switching samples prepares a matching preview. Each recipe links to the original TypeSafe cookbook and describes local adaptations; sample runs do not measure model accuracy, latency, or cost.

Sources and tutorial mappings are served by the local development server behind same-origin and session checks. The playground runs fixed synthetic samples only.

## Cookbook examples

The [cookbook guide](../../cookbooks/README.md) lists runnable examples, their hosted URLs, and the flow patterns they demonstrate. They use the public flow API. The playground, cookbook code, and fixtures live in this repository and are not bundled in the npm package.

The [LLM guardrails cookbook](../../cookbooks/guardrails/README.md) screens one selected input or output message per run. It reuses one synthetic assessment under strict and permissive policies; no LLM generation or live inference is enabled.

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

Open `http://127.0.0.1:4182/?cookbook=consistency-choices` for the [Choice self-consistency adaptation](../../cookbooks/consistency-choices/README.md). It keeps the original post, eight Choice questions and 15 sequential requests, with authored varying distributions. Inspect each repeat and its question gates in **Flow diagram**, then open **Application result** for raw probabilities and separate confidence. Below 0.60 abstains; exactly 0.60 accepts. Samples do not measure consistency, accuracy, latency or cost; live mode and other-provider comparisons are excluded.

The [Noul self-consistency cookbook](../../cookbooks/consistency-nouls/README.md) runs at `/?cookbook=consistency-nouls`. It preserves fifteen sequential fourteen-question requests and the inclusive 0.30–0.70 uncertainty band. Its authored variation and statistics are fixture demonstrations, not measured model consistency or a provider comparison; live mode is rejected.

### Select controls

Use `NativeSelect` and `NativeSelectOption` from `src/components/ui/native-select.tsx` for every playground select. The component owns the chevron, border, surface, focus, disabled, and forced-colors states in plain CSS, for all workbench selects. Use `size="sm"` for compact toolbars and keep width constraints in the consuming layout. The styles match the diagram selects in `packages/jev-devtools/src/inspector.css`; review both when changing the control design. The viewer keeps its styles inside its shadow root.
