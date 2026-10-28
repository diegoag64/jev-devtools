import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { createRoot } from "react-dom/client";
import { JevFlowViewer, useJevInspection } from "jev-devtools/viewer";
import { cookbookCatalog } from "./catalog.js";
import type { CookbookDetail, CookbookPreview } from "./types.js";
import { colors, SourceCode } from "./SourceCode.js";
import { CookbookOverview, Explanation } from "./CookbookOverview.js";
import { SplitPanels } from "./SplitPanels.js";
import { postPlayground, RunError } from "../playground-request.js";
import {
  NativeSelect,
  NativeSelectOption,
} from "../components/ui/native-select.js";
import "./workbench.css";

const session =
  sessionStorage.getItem("jev-inspector-session") || crypto.randomUUID();
sessionStorage.setItem("jev-inspector-session", session);
const endpoint = (path: string) =>
  `/__jev/${path}?session=${encodeURIComponent(session)}`;
const currentSlug = () =>
  new URLSearchParams(location.search).get("cookbook") || "confidence-fallback";

function App() {
  const [slug, setSlug] = useState(currentSlug);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<CookbookDetail>();
  const [loading, setLoading] = useState({ slug: "", slow: false, error: "" });
  const [reload, setReload] = useState(0);
  const [libraryOpen, setLibraryOpen] = useState(
    () => !matchMedia("(max-width: 1000px)").matches,
  );
  useEffect(() => {
    const query = matchMedia("(max-width: 1000px)");
    const change = () => {
      if (query.matches) setLibraryOpen(false);
    };
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    const back = () => setSlug(currentSlug());
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    setLoading({ slug, slow: false, error: "" });
    // Returning to the displayed cookbook cancels the destination request.
    if (detail?.slug === slug) return;
    const timer = window.setTimeout(() => {
      setLoading({ slug, slow: true, error: "" });
    }, 180);
    void fetch(endpoint(`cookbooks/${encodeURIComponent(slug)}`), {
      signal: abort.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            response.status === 404
              ? "This cookbook does not exist. Choose one from the library."
              : "The cookbook could not be loaded. Check the local server and try again.",
          );
        const data: CookbookDetail = await response.json();
        if (!abort.signal.aborted) {
          clearTimeout(timer);
          setDetail(data);
          setLoading({ slug, slow: false, error: "" });
        }
      })
      .catch((error) => {
        if (!abort.signal.aborted) {
          clearTimeout(timer);
          setLoading({ slug, slow: false, error: error.message });
        }
      });
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [slug, reload]);
  const recipe = cookbookCatalog.find((item) => item.slug === slug);
  const navigationFeedback =
    loading.slug === slug &&
    (loading.error ? (
      <>
        <span>
          Could not open {recipe?.title ?? slug}. {loading.error}
        </span>
        <button onClick={() => setReload((value) => value + 1)}>
          Try again
        </button>
      </>
    ) : loading.slow ? (
      <>
        <span className="wb-opening-indicator" aria-hidden="true" />
        Opening {recipe?.title ?? slug}…
      </>
    ) : null);
  return (
    <div className="wb-app" data-library-open={libraryOpen || undefined}>
      <a className="wb-skip" href="#workbench">
        Skip to workbench
      </a>
      <aside id="cookbook-library" className="wb-library" hidden={!libraryOpen}>
        <a className="wb-brand" href="/">
          jevtools<span> playground</span>
        </a>
        <div className="wb-library-title">
          <h2>Cookbooks</h2>
        </div>
        <input
          aria-label="Find a cookbook"
          placeholder="Find a cookbook…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <nav aria-label="Cookbooks">
          {[...new Set(cookbookCatalog.map((item) => item.category))].map(
            (category) => {
              const items = cookbookCatalog.filter(
                (item) =>
                  item.category === category &&
                  `${item.title} ${item.intro}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
              );
              return (
                items.length > 0 && (
                  <div key={category} className="wb-category">
                    <h3>{category}</h3>
                    {items.map((item) => (
                      <a
                        key={item.slug}
                        href={`?cookbook=${item.slug}`}
                        aria-current={item.slug === slug ? "page" : undefined}
                        onClick={(event) => {
                          if (
                            event.metaKey ||
                            event.ctrlKey ||
                            event.shiftKey ||
                            event.altKey
                          )
                            return;
                          event.preventDefault();
                          history.pushState(null, "", `?cookbook=${item.slug}`);
                          setSlug(item.slug);
                          if (matchMedia("(max-width: 1000px)").matches)
                            setLibraryOpen(false);
                        }}
                      >
                        {item.title}
                        <span aria-hidden="true">↗</span>
                      </a>
                    ))}
                  </div>
                )
              );
            },
          )}
          {!cookbookCatalog.some((item) =>
            `${item.title} ${item.intro}`
              .toLowerCase()
              .includes(search.toLowerCase()),
          ) && <p>No matching cookbooks.</p>}
        </nav>
        <footer>
          <a href="https://docs.jevtools.dev/">JevTools docs ↗</a>
        </footer>
      </aside>
      <main id="workbench" className="wb-main">
        <h1 className="wb-sr-only">
          {cookbookCatalog.find((item) => item.slug === detail?.slug)?.title ??
            "Cookbook workspace"}
        </h1>
        <button
          className="wb-library-toggle"
          aria-label="Toggle cookbook library"
          title={
            libraryOpen ? "Hide cookbook library" : "Show cookbook library"
          }
          aria-expanded={libraryOpen}
          aria-controls="cookbook-library"
          onClick={() => setLibraryOpen((value) => !value)}
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M9 4v16" />
          </svg>
        </button>
        {detail ? (
          <Recipe
            detail={detail}
            navigationFeedback={navigationFeedback}
            blocked={detail.slug !== slug}
            dimmed={
              detail.slug !== slug &&
              loading.slug === slug &&
              (loading.slow || !!loading.error)
            }
          />
        ) : (
          <div
            className="wb-skeleton"
            aria-label="Loading cookbook workspace"
            aria-busy="true"
          >
            <div className="wb-skeleton-toolbar" />
            <div className="wb-skeleton-ribbon" />
            <div className="wb-skeleton-controls">
              <div className="wb-run-status" role="status" aria-live="polite">
                {navigationFeedback}
              </div>
            </div>
            <div className="wb-skeleton-panels">
              <div />
              <div />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// Return the new cookbook's defaults in the same render as its detail. State
// resets must not wait for an effect that could paint mixed source/sample data.
function useCookbookState<T>(
  detail: CookbookDetail,
  initial: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState({ detail, value: initial });
  const value = state.detail === detail ? state.value : initial;
  if (state.detail !== detail) setState({ detail, value });
  return [
    value,
    (next) =>
      setState((previous) => ({
        detail,
        value:
          typeof next === "function"
            ? (next as (value: T) => T)(
                previous.detail === detail ? previous.value : initial,
              )
            : next,
      })),
  ];
}

function Recipe({
  detail,
  blocked,
  dimmed,
  navigationFeedback,
}: {
  detail: CookbookDetail;
  blocked: boolean;
  dimmed: boolean;
  navigationFeedback: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [walkthrough, setWalkthrough] = useState(false);
  const [active, setActive] = useCookbookState(detail, 0);
  const [selection, setSelection] = useCookbookState<string[]>(detail, []);
  const timeline = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = timeline.current;
    const current = nav?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!nav || !current) return;
    const viewport = nav.getBoundingClientRect();
    const button = current.getBoundingClientRect();
    // Reveal the active ribbon segment without moving the page or code panels.
    const delta =
      button.left < viewport.left
        ? button.left - viewport.left
        : button.right > viewport.right
          ? button.right - viewport.right
          : 0;
    if (delta) nav.scrollLeft += delta;
  }, [active, detail]);
  // The guide owns its focus; free inspection belongs to the complete view.
  const [sample, setSample] = useCookbookState(
    detail,
    Object.keys(detail.samples)[0],
  );
  const [preview, setPreview] = useCookbookState<CookbookPreview | undefined>(
    detail,
    detail.preview,
  );
  const [previewError, setPreviewError] = useCookbookState(detail, "");
  useEffect(() => {
    if (blocked) return;
    if (sample === detail.preview.sampleId) {
      setPreview(detail.preview);
      setPreviewError("");
      return;
    }
    const abort = new AbortController();
    setPreview(undefined);
    setPreviewError("");
    void fetch(
      endpoint(`cookbooks/${detail.slug}`) +
        `&sample=${encodeURIComponent(sample)}`,
      { signal: abort.signal },
    )
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            "Could not prepare the sample preview. Run the sample to capture it.",
          );
        const next: CookbookDetail = await response.json();
        if (!abort.signal.aborted) setPreview(next.preview);
      })
      .catch((error) => {
        if (!abort.signal.aborted) setPreviewError(error.message);
      });
    return () => abort.abort();
  }, [detail, sample, blocked]);
  const [runId, setRunId] = useCookbookState<string | undefined>(
    detail,
    undefined,
  );
  const [startedAt, setStartedAt] = useCookbookState<number | undefined>(
    detail,
    undefined,
  );
  const [finishedAt, setFinishedAt] = useCookbookState<number | undefined>(
    detail,
    undefined,
  );
  const [result, setResult] = useCookbookState<unknown>(detail, undefined);
  const [status, setStatus] = useCookbookState(detail, "");
  const [busy, setBusy] = useCookbookState(detail, false);
  const request = useRef<
    { controller: AbortController; id: string } | undefined
  >(undefined);
  const inspection = useJevInspection({ enabled: true });
  const stop = () => {
    const pending = request.current;
    if (!pending) return;
    request.current = undefined;
    pending.controller.abort();
    void postPlayground(endpoint("cancel"), { runId: pending.id }).catch(
      () => {},
    );
  };
  useEffect(() => () => stop(), []);
  useLayoutEffect(() => {
    if (blocked) {
      stop();
      setBusy(false);
      setFinishedAt(Date.now());
      setStatus("");
    }
    // Move focus only when its cookbook content is becoming inert. Shell
    // controls and library navigation retain focus, including in the modal.
    const regions = root.current?.querySelectorAll<HTMLElement>(
      "[data-cookbook-content]",
    );
    if (
      blocked &&
      [...(regions ?? [])].some((node) => node.contains(document.activeElement))
    ) {
      const target =
        root.current?.querySelector<HTMLElement>("[data-close-expanded]") ??
        document.querySelector<HTMLElement>(".wb-library-toggle");
      target?.focus({ preventScroll: true });
    }
    regions?.forEach((node) => {
      node.inert = blocked;
    });
    if (blocked)
      root.current
        ?.querySelector<HTMLElement>("#cookbook-overview")
        ?.hidePopover();
  }, [blocked, detail, walkthrough]);
  useLayoutEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animations = [
      ...(root.current?.querySelectorAll("[data-cookbook-fade]") ?? []),
    ].map((node) =>
      node.animate([{ opacity: 0.6 }, { opacity: 1 }], {
        duration: 170,
        easing: "ease-out",
      }),
    );
    return () => animations.forEach((animation) => animation.cancel());
  }, [detail]);
  const selected = walkthrough ? detail.steps[active].nodeIds : selection;
  const authoredDefinition = detail.variants[sample] ?? detail.definition;
  const run =
    inspection.flows.runs.find((item) => item.id === runId) ??
    (startedAt
      ? [...inspection.flows.runs]
          .reverse()
          .find(
            (item) =>
              item.name === authoredDefinition.name &&
              item.startedAt >= startedAt &&
              item.startedAt <= (finishedAt ?? Infinity),
          )
      : undefined);
  const capturedDefinition = inspection.flows.definitions.find(
    (item) => item.id === run?.definitionId,
  );
  useEffect(() => {
    if (busy && run && !runId) setRunId(run.id);
  }, [busy, run, runId]);
  const currentPreview = preview?.sampleId === sample ? preview : undefined;
  const showingPreview = startedAt === undefined;
  const displayedRun = showingPreview ? currentPreview?.run : run;
  const displayedDefinition = showingPreview
    ? currentPreview?.definition
    : capturedDefinition;
  const displayedTraces = showingPreview
    ? (currentPreview?.traces ?? [])
    : inspection.traces;
  const nestedNode = detail.definition.nodes.find(
    (node) => selected.includes(node.id) && node.itemDefinition,
  );
  const step = detail.steps[active];
  const visible = useMemo(
    () =>
      walkthrough
        ? detail.steps.slice(0, active + 1).flatMap((item) => item.nodeIds)
        : undefined,
    [detail, walkthrough, active],
  );
  const accents = useMemo(
    () =>
      Object.fromEntries(
        detail.steps.flatMap((item, index) =>
          item.nodeIds.map((id) => [id, colors[index % colors.length]]),
        ),
      ),
    [detail],
  );
  function chooseStep(index: number) {
    if (blocked) return;
    setActive(index);
    setSelection(detail.steps[index].nodeIds);
  }
  function selectNodes(ids: string[]) {
    if (walkthrough || blocked) return;
    setSelection(ids);
    const index = detail.steps.findIndex((item) =>
      item.nodeIds.includes(ids[0]),
    );
    if (index >= 0) setActive(index);
  }
  async function start() {
    if (blocked) return;
    stop();
    const pending = {
      controller: new AbortController(),
      id: crypto.randomUUID(),
    };
    request.current = pending;
    setBusy(true);
    setStatus("Running the synthetic sample…");
    setResult(undefined);
    setRunId(undefined);
    setStartedAt(Date.now());
    setFinishedAt(undefined);
    try {
      const data = await postPlayground(
        endpoint("run"),
        {
          scenario: detail.scenario,
          mode: "sample",
          message: detail.samples[sample].message,
          [detail.caseField]: sample,
          runId: pending.id,
        },
        { signal: pending.controller.signal, timeoutMs: 120_000 },
      );
      if (request.current !== pending) return;
      setRunId(data.flow?.runId);
      setResult(data.flow?.value);
      setStatus(
        "Sample complete. Select a diagram node to inspect its request or result.",
      );
    } catch (error) {
      if (request.current !== pending) return;
      setStatus(
        error instanceof RunError && error.cancelled
          ? "Sample cancelled."
          : error instanceof Error
            ? error.message
            : "The sample failed.",
      );
    } finally {
      if (request.current === pending) {
        request.current = undefined;
        setFinishedAt(Date.now());
        setBusy(false);
      }
    }
  }
  const guideControls = (
    <div className="wb-guide-controls">
      <button disabled={active === 0} onClick={() => chooseStep(active - 1)}>
        ← Previous
      </button>
      <button
        className="wb-primary"
        disabled={active === detail.steps.length - 1}
        onClick={() => chooseStep(active + 1)}
      >
        Next step →
      </button>
    </div>
  );
  return (
    <div
      ref={root}
      className="wb-recipe"
      data-cookbook={detail.slug}
      data-dimmed={dimmed || undefined}
      data-pending={blocked}
    >
      <div className="wb-toolbar">
        <div className="wb-tabs" aria-label="Workbench view">
          <button
            aria-pressed={!walkthrough}
            onClick={() => setWalkthrough(false)}
          >
            Complete flow
          </button>
          <button
            aria-pressed={walkthrough}
            onClick={() => {
              setWalkthrough(true);
              chooseStep(active);
            }}
          >
            Step-by-step guide
          </button>
        </div>
        <div className="wb-toolbar-links">
          <span className="wb-transport">Synthetic samples · no API key</span>
          <CookbookOverview
            disabled={blocked}
            detail={detail}
            title={
              cookbookCatalog.find((recipe) => recipe.slug === detail.slug)!
                .title
            }
          />
          <a
            data-cookbook-content
            href={detail.originalSource}
            target="_blank"
            rel="noreferrer"
          >
            Original Cookbook <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>
      <nav
        ref={timeline}
        className="wb-timeline"
        aria-label="Cookbook steps"
        data-cookbook-content
        data-cookbook-fade
      >
        {detail.steps.map((item, index) => (
          <button
            key={item.id}
            title={`${item.title} · ${item.api}`}
            style={
              { "--step-color": colors[index % colors.length] } as CSSProperties
            }
            aria-current={active === index ? "step" : undefined}
            data-future={(walkthrough && index > active) || undefined}
            onClick={() => chooseStep(index)}
          >
            <strong>{item.title}</strong>
          </button>
        ))}
      </nav>
      {walkthrough && (
        <section
          className="wb-narrative"
          data-cookbook-content
          aria-label="Step explanation"
          style={
            { "--step-color": colors[active % colors.length] } as CSSProperties
          }
        >
          <div
            key={`${detail.slug}:${step.id}`}
            className="wb-narrative-content wb-prose"
            data-cookbook-fade
          >
            <div className="wb-narrative-title">
              <span className="wb-kicker">
                STEP {active + 1} OF {detail.steps.length} · {step.api}
              </span>
              <h2>{step.title}</h2>
            </div>
            <p>
              <Explanation text={step.explanation} />
            </p>
          </div>
          {guideControls}
        </section>
      )}
      <div className="wb-runbar">
        <label data-cookbook-content>
          Sample
          <NativeSelect
            size="sm"
            aria-label="Cookbook sample"
            disabled={busy || blocked}
            value={sample}
            onChange={(event) => {
              setSample(event.target.value);
              setRunId(undefined);
              setResult(undefined);
              setStartedAt(undefined);
              setFinishedAt(undefined);
              setStatus("");
            }}
          >
            {Object.entries(detail.samples).map(([id, item]) => (
              <NativeSelectOption key={id} value={id}>
                {item.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <button
          className="wb-primary"
          data-cookbook-content
          disabled={busy || blocked}
          onClick={() => void start()}
        >
          {busy ? "Running…" : "Run sample ↗"}
        </button>
        <button
          className="wb-cancel"
          data-cookbook-content
          data-running={busy || undefined}
          disabled={!busy || blocked}
          onClick={() => {
            stop();
            setFinishedAt(Date.now());
            setBusy(false);
            setRunId(run?.id);
            setStatus("Sample cancelled.");
          }}
        >
          Cancel
        </button>
        <div
          className="wb-run-status"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {navigationFeedback || (
            <p>
              {status ||
                previewError ||
                (showingPreview
                  ? currentPreview
                    ? "Synthetic sample preview. Run the full sample to watch it execute."
                    : "Preparing the sample preview…"
                  : "Run the full sample to inspect its requests and results.")}
            </p>
          )}
        </div>
      </div>
      <SplitPanels
        expandedGuide={
          walkthrough && (
            <div
              className="wb-expanded-guide"
              data-cookbook-content
              role="group"
              aria-label="Walkthrough controls"
            >
              <p aria-live="polite" aria-atomic="true">
                <span>
                  Step {active + 1} of {detail.steps.length}
                </span>
                <strong title={step.title}>{step.title}</strong>
              </p>
              {guideControls}
            </div>
          )
        }
        code={(panelActions) => (
          <section
            id="workbench-code"
            className="wb-code-panel"
            aria-label="Code panel"
          >
            <SourceCode
              panelActions={panelActions}
              disabled={blocked}
              detail={detail}
              active={active}
              walkthrough={walkthrough}
              selected={selected}
              onSelect={selectNodes}
              onCopyError={() =>
                setStatus(
                  "Could not copy. Select the source text to copy it manually.",
                )
              }
            />
            <p className="wb-panel-foot">
              {walkthrough
                ? "Use the steps above to navigate this walkthrough."
                : "Select code or a line number to highlight its diagram nodes."}
            </p>
          </section>
        )}
        diagram={(panelActions) => (
          <section className="wb-diagram-panel" aria-label="Flow diagram">
            <div className="wb-panel-heading">
              <h2>{walkthrough ? "Building the flow" : "Flow diagram"}</h2>
              <div className="wb-source-actions">
                <span className="wb-diagram-status">
                  {walkthrough &&
                    `${active + 1} / ${detail.steps.length} steps · `}
                  {showingPreview
                    ? "Sample preview"
                    : `Sample · ${run?.status ?? (busy ? "running" : "unavailable")}`}
                </span>
                {panelActions}
              </div>
            </div>
            <div
              className="wb-viewer"
              aria-busy={blocked}
              data-cookbook-content
              data-cookbook-fade
            >
              {showingPreview && !currentPreview && !previewError ? (
                <p className="wb-preview-loading" role="status">
                  Preparing the sample diagram…
                </p>
              ) : (
                <JevFlowViewer
                  key={detail.slug}
                  definition={displayedDefinition ?? authoredDefinition}
                  run={displayedRun}
                  traces={displayedTraces}
                  selectedNodeId={selected[0] ?? ""}
                  onNodeSelect={(id) => selectNodes([id])}
                  visibleNodeIds={visible}
                  highlightedNodeIds={selected}
                  nodeAccents={accents}
                />
              )}
            </div>
            <p className="wb-panel-foot">
              {inspection.connection === "connected"
                ? "Inspector connected"
                : inspection.connection}{" "}
              · Diagram generated from the Flow API
            </p>
          </section>
        )}
      />
      <div
        key={detail.slug}
        className="wb-bottom"
        data-cookbook-content
        data-cookbook-fade
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          const details = (event.target as Element).closest("details");
          if (details?.open) {
            details.open = false;
            details.querySelector("summary")?.focus();
          }
        }}
      >
        {nestedNode?.itemDefinition && (
          <details
            name="workbench-details"
            className="wb-nested"
            key={nestedNode.id}
          >
            <summary>
              Inside {nestedNode.title ?? nestedNode.id} ·{" "}
              {nestedNode.kind === "loop" ? "iteration" : "item"} program
            </summary>
            <div className="wb-extra-content">
              <p>
                This is the authored program inside the selected collection.
                Running the complete flow captures each item's requests and
                results in the main diagram.
              </p>
              <div className="wb-nested-viewer">
                <JevFlowViewer definition={nestedNode.itemDefinition} />
              </div>
            </div>
          </details>
        )}
        <details name="workbench-details">
          <summary>Sample input</summary>
          <div className="wb-extra-content">
            <pre>{detail.samples[sample].message}</pre>
          </div>
        </details>
        {result !== undefined && (
          <details name="workbench-details">
            <summary>Application result</summary>
            <div className="wb-extra-content">
              <pre>{JSON.stringify(result, null, 2)}</pre>
            </div>
          </details>
        )}
        <details name="workbench-details">
          <summary>About this adaptation</summary>
          <div className="wb-extra-content">
            <p>
              {
                cookbookCatalog.find((recipe) => recipe.slug === detail.slug)
                  ?.intro
              }
            </p>
            <p>{detail.adaptation}</p>
            <p className="wb-muted">
              Upstream revision: {detail.sourceRevision}. Local source:{" "}
              {detail.sourceFile}.
            </p>
          </div>
        </details>
      </div>
    </div>
  );
}

export function mount() {
  document.title = "jevtools playground";
  createRoot(document.getElementById("root")!).render(<App />);
}
