import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Public stylesheet must not restyle host content; page styles must not restyle
// the real drawer. This extends the browser boundary test, without test-only
// component exports or a second mocked inspector.
export async function checkStyleIsolation({ page, load, close, open, settle }) {
  await load("small");
  const css = await readFile(
    new URL(import.meta.resolve("jev-devtools/styles.css")),
    "utf8",
  );
  let stylesheet, hostile;
  const fixture = await page.evaluateHandle(() => {
    const main = document.createElement("main");
    main.id = "style-isolation-fixture";
    main.innerHTML = `
      <style>
        @keyframes flow-item-enter {
          from, to { opacity: 0.6; transform: translateX(3px); }
        }
        .host-animation {
          animation: flow-item-enter 1s linear both paused;
        }
      </style>
      <section class="whole-flow">
        <div class="flow-workspace">
          <div class="flow-details-panel">
            <div class="flow-details-bar"><span>Host details</span></div>
          </div>
          <button class="flow-step selected" data-status="completed">Host step</button>
          <div class="flow-condition-rule"><code>Host condition</code></div>
          <div class="flow-item-content host-animation">Host animation</div>
          <div class="flow-run-summary">Host summary</div>
          <button class="flow-fixture-button">Host copy</button>
          <div class="flow-fixture">
            <p>Host report</p>
            <details open><summary>Host details</summary><ul><li>Host item</li></ul></details>
            <textarea>Host text</textarea>
          </div>
        </div>
      </section>
      <div class="jev-devtools" id="scoped-style-control">
        <div class="flow-workspace">
          <div class="flow-task-preview"><small>Returned value hint</small></div>
          <div class="flow-overview-viewport" style="height: 40px">Grid</div>
          <div class="lab-noul-output"><h3>Probability</h3></div>
        </div>
      </div>`;
    document.body.prepend(main);
    return main;
  });
  const hostStyles = () =>
    fixture.evaluate((main) => {
      const properties = [
        "display", "position", "padding", "margin", "border", "borderRadius",
        "backgroundColor", "color", "font", "width", "height", "overflow",
        "flex", "gap", "opacity", "transform", "animationName", "textAlign",
        "maxWidth", "maxHeight", "listStyle", "overflowWrap",
      ];
      const section = main.querySelector("section");
      return [section, ...section.querySelectorAll("*")].map(
        (element) => Object.fromEntries(
          properties.map((p) => [p, getComputedStyle(element)[p]]),
        ),
      );
    });
  const drawerStyles = () =>
    page.evaluate(() => {
      const host = document.querySelector("jev-devtools-root");
      const root = host.shadowRoot;
      const properties = [
        "padding", "margin", "border", "color", "backgroundColor", "font",
        "lineHeight", "letterSpacing", "direction", "textTransform",
        "boxSizing", "position", "display", "pointerEvents",
      ];
      // Include actual section content: global section/main rules caused the
      // original integration problem, even when the drawer frame looked right.
      const elements = [
        host,
        ...root.querySelectorAll(
          ".jev-drawer, .jev-drawer-header, .jev-drawer-header button, section, .lab-flow-viewport",
        ),
      ];
      return elements.map((element) => ({
        styles: Object.fromEntries(
          properties.map((p) => [p, getComputedStyle(element)[p]]),
        ),
        rect: element.getBoundingClientRect().toJSON(),
      }));
    });
  try {
    // Test normal and reduced-motion rules; an unscoped media rule can leak too.
    for (const reducedMotion of ["no-preference", "reduce"]) {
      await page.emulateMedia({ reducedMotion });
      const before = await hostStyles();
      stylesheet = await page.addStyleTag({ content: css });
      assert.deepEqual(
        await hostStyles(), before,
        `Public CSS leaves host layout, colors and animation unchanged (${reducedMotion})`,
      );
      assert.equal(
        await page.locator("#scoped-style-control .flow-workspace").evaluate(
          (element) => getComputedStyle(element).display,
        ),
        "flex", "The public stylesheet still styles content inside its boundary",
      );
      const hintStyles = () =>
        page.locator("#scoped-style-control").evaluate((root) => ({
          color: getComputedStyle(root.querySelector("small")).color,
          grid: getComputedStyle(root.querySelector(".flow-overview-viewport"))
            .backgroundImage,
          opacity: getComputedStyle(root.querySelector("h3")).opacity,
        }));
      const hints = await hintStyles();
      await fixture.evaluate((main) => {
        main.style.setProperty("--muted", "lime");
        main.style.setProperty("--diagram-grid-opacity", "0");
        main.style.setProperty("--diagram-grid-weight", "40");
        main.style.setProperty("--lab-noul-probability", "0");
      });
      assert.deepEqual(
        await hintStyles(), hints,
        "App theme variables cannot recolor hints or change diagram visuals",
      );
      await fixture.evaluate((main) => main.removeAttribute("style"));
      await stylesheet.evaluate((element) => element.remove());
    }
    await page.emulateMedia({ reducedMotion: "no-preference" });
    assert.ok(
      await page.locator("jev-devtools-root section").count(),
      "The real inspector renders section content for the isolation check",
    );
    await settle();
    const before = await drawerStyles();
    hostile = await page.addStyleTag({ content: `
      body { font: 36px serif; color: lime; letter-spacing: 12px; direction: rtl; }
      main > *, section, section *, button, input, svg, .jev-drawer {
        padding: 75px !important;
        margin: 40px !important;
        border: 15px solid lime !important;
        font: 36px serif !important;
        color: lime !important;
        box-sizing: content-box !important;
      }
      body > jev-devtools-root {
        padding: 100px !important;
        transform: scale(0.5) !important;
        display: none !important;
        pointer-events: auto !important;
      }
      body > jev-devtools-root::before, body > jev-devtools-root::after {
        content: "Host decoration" !important;
        position: fixed !important;
        inset: 0 !important;
        background: lime !important;
        pointer-events: auto !important;
      }
    ` });
    await settle();
    const after = await drawerStyles();
    assert.deepEqual(
      after, before,
      "Host main/section rules, transforms and inherited typography leave the drawer unchanged",
    );
    const decorations = await page.locator("jev-devtools-root").evaluate((host) =>
      ["::before", "::after"].map((pseudo) => getComputedStyle(host, pseudo).content),
    );
    assert.deepEqual(
      decorations, ["none", "none"],
      "Host pseudo-elements cannot cover or intercept the drawer",
    );
    await close();
    await open();
    assert.ok(
      await page.getByRole("button", {
        name: "Close Jev DevTools", exact: true,
      }).isVisible(),
      "The drawer remains operable under hostile page CSS",
    );
    await page.screenshot({ path: "benchmarks/results/css-isolation.png" });
    console.log(
      "CSS isolation verified: public styles and keyframes leave the host unchanged; hostile page styles leave drawer sections, geometry and controls unchanged.",
    );
  } finally {
    await stylesheet?.evaluate((element) => element.remove());
    await hostile?.evaluate((element) => element.remove());
    await fixture.evaluate((element) => element.remove());
    await fixture.dispose();
    await page.emulateMedia({ reducedMotion: "no-preference" });
  }
}
