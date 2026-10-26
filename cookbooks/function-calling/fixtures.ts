import type { FunctionCase } from "./cases.js";
import { functionRequest, type ChoiceAnswer } from "./dispatcher.js";
type Fixture = {
  tool: string;
  values?: Record<string, string | number>;
  toolProbability?: number;
  choiceProbabilities?: Record<string, number>;
  apiConfidence?: number;
};
// Authored probabilities, not upstream cache values or measured inference.
export const fixtures: Record<FunctionCase, Fixture> = {
  roles: {
    tool: "rolling_correlation",
    values: { symbol: "AMD", benchmark: "NVDA", "benchmark?": 0.85 },
    choiceProbabilities: { symbol: 0.87, benchmark: 0.92 },
    toolProbability: 0.82,
    apiConfidence: 0.19,
  },
  members: {
    tool: "compare_returns",
    values: {
      "symbols.NVDA": 0.96,
      "symbols.AMD": 0.94,
      "symbols.MSFT": 0.98,
      window: "3mo",
      "window?": 0.97,
    },
  },
  omitted: {
    tool: "plot_price",
    values: { symbol: "NVDA", resolution: "1h", "resolution?": 0.9 },
  },
  flags: {
    tool: "plot_price",
    values: {
      symbol: "AAPL",
      style: "candles",
      "style?": 0.96,
      resolution: "1d",
      "resolution?": 0.97,
      include_volume: 0.01,
      "include_volume?": 0.98,
      moving_average: "20",
      "moving_average?": 0.9,
      log_scale: 0.02,
      "log_scale?": 0.99,
    },
  },
  low: {
    tool: "intraday_pattern",
    values: { symbol: "TSLA", metric: "volume", "metric?": 0.53 },
    choiceProbabilities: { metric: 0.41 },
    toolProbability: 0.6,
    apiConfidence: 0.95,
  },
  boundaries: {
    tool: "compare_returns",
    values: {
      "symbols.SPY": 0.499,
      "symbols.NVDA": 0.5,
      "symbols.AMD": 0.501,
      "symbols.AAPL": 0.01,
      "symbols.MSFT": 0.99,
      "symbols.TSLA": 0.01,
      "window?": 0.499,
      "normalize?": 0.5,
      normalize: 0.5,
    },
  },
  emptySet: { tool: "compare_returns" },
  list: { tool: "list_symbols", toolProbability: 0.77, apiConfidence: 0.31 },
  market: { tool: "market_summary", values: { window: "1w", "window?": 0.94 } },
  stats: { tool: "summary_stats", values: { symbol: "SPY" } },
  volatility: {
    tool: "volatility",
    values: { symbol: "TSLA", annualized: 0.03, "annualized?": 0.95 },
  },
  movers: {
    tool: "top_movers",
    values: { window: "1d", "window?": 0.96, direction: "losers" },
  },
  drawdown: {
    tool: "drawdown",
    values: {
      symbol: "NVDA",
      window: "3mo",
      "window?": 0.96,
      plot: 0.9,
      "plot?": 0.97,
    },
  },
};
function choiceAnswer(
  selected: string,
  members: string[],
  p: number,
  confidence: number,
): ChoiceAnswer {
  return {
    type: "choice",
    choice: selected,
    confidence,
    probabilities: Object.fromEntries(
      members.map((m) => [
        m,
        m === selected ? p : (1 - p) / (members.length - 1),
      ]),
    ),
  };
}
export function fixtureAnswers(caseId: FunctionCase) {
  const fixture = fixtures[caseId];
  const answers: Record<string, ChoiceAnswer | { type: "noul"; noul: number }> =
    {};
  for (const [key, question] of Object.entries(functionRequest("").questions)) {
    const relevant = key.startsWith(`${fixture.tool}.`),
      arg = key.slice(fixture.tool.length + 1),
      value = relevant ? fixture.values?.[arg] : undefined;
    if (question.type === "choice") {
      const members = Object.keys(question.criteria);
      answers[key] = choiceAnswer(
        key === "__tool__"
          ? fixture.tool
          : typeof value === "string"
            ? value
            : members[0],
        members,
        key === "__tool__"
          ? (fixture.toolProbability ?? 0.97)
          : relevant
            ? (fixture.choiceProbabilities?.[arg] ?? 0.94)
            : 0.6,
        fixture.apiConfidence ?? 0.73,
      );
    } else
      answers[key] = {
        type: "noul",
        noul: typeof value === "number" ? value : relevant ? 0.02 : 0.5,
      };
  }
  return answers;
}
