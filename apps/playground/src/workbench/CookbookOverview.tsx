import type { CookbookDetail } from "./types.js";

/** Render only authored inline code, without interpreting HTML or links. */
export function Explanation({ text }: { text: string }) {
  return text
    .split(/(`[^`]+`)/g)
    .map((part, index) =>
      part.startsWith("`") ? (
        <code key={index}>{part.slice(1, -1)}</code>
      ) : (
        part
      ),
    );
}

// Set native targets through refs because React 18 predates the popover target props.
export function CookbookOverview({
  detail,
  title,
  disabled,
}: {
  detail: CookbookDetail;
  title: string;
  disabled: boolean;
}) {
  return (
    <>
      <button
        className="wb-overview-trigger"
        disabled={disabled}
        data-cookbook-content
        ref={(button) => {
          button?.setAttribute("popovertarget", "cookbook-overview");
        }}
        aria-label="Cookbook overview"
        title="Cookbook overview"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v6M12 7v1" />
        </svg>
        <span>Cookbook overview</span>
      </button>
      <section
        id="cookbook-overview"
        data-cookbook-content
        className="wb-overview wb-prose"
        popover="auto"
        role="dialog"
        aria-labelledby="cookbook-overview-title"
      >
        <header>
          <h2 id="cookbook-overview-title">{title}</h2>
          <button
            ref={(button) => {
              button?.setAttribute("popovertarget", "cookbook-overview");
              button?.setAttribute("popovertargetaction", "hide");
            }}
            aria-label="Close cookbook overview"
            title="Close overview"
          >
            ×
          </button>
        </header>
        <p>
          <Explanation text={detail.overview.purpose} />
        </p>
        <h3>How the flow fits together</h3>
        <p>
          <Explanation text={detail.overview.flow} />
        </p>
        <p className="wb-overview-sample">
          Playground runs use fixed synthetic answers. Follow the guide to build
          the diagram, or run a sample to inspect the captured requests and
          results.
        </p>
      </section>
    </>
  );
}
