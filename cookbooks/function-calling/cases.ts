export const functionCases = {
  roles: {
    label: "Correlation · argument roles and omitted defaults",
    message: "Is AMD tracking Nvidia lately?",
  },
  members: {
    label: "Compare · included and excluded set members",
    message: "Compare Nvidia, AMD and Microsoft over the last quarter.",
  },
  omitted: {
    label: "Price chart · optional arguments omitted",
    message: "Show Nvidia on hourly bars.",
  },
  flags: {
    label: "Price chart · explicit false and optional moving average",
    message:
      "Apple candles daily, without volume, with a twenty-bar moving average and a linear axis.",
  },
  low: {
    label: "Low certainty · still a proposal, no invented gate",
    message: "Show Tesla's usual daily pattern, maybe trading activity.",
  },
  boundaries: {
    label: "Boundary fixture · presence, membership and flag at 0.5",
    message: "Compare the selected tickers, perhaps using percentage returns.",
  },
  emptySet: {
    label: "Empty set · no members selected",
    message: "Compare nothing for now.",
  },
  list: {
    label: "List symbols · no arguments",
    message: "Which symbols are available?",
  },
  market: {
    label: "Market summary · stated window",
    message: "Summarize the board this week.",
  },
  stats: {
    label: "Summary statistics · default month",
    message: "Give me SPY statistics.",
  },
  volatility: {
    label: "Volatility · explicit per-bar flag",
    message: "Show Tesla volatility per bar.",
  },
  movers: {
    label: "Top movers · unasked numeric default",
    message: "Show today's biggest losers.",
  },
  drawdown: {
    label: "Drawdown · chart flag",
    message: "Chart Nvidia's drawdown this quarter.",
  },
} as const;
export type FunctionCase = keyof typeof functionCases;
export function isFunctionCase(value: unknown): value is FunctionCase {
  return typeof value === "string" && Object.hasOwn(functionCases, value);
}
