import type { Json } from "./protocol.js";
/** Authored diagram copy, never instructions for Jev or executable routing logic. */
export type FlowDisplay = { title?: string; description?: string };
/** Rule literals are captured/redacted by the recorder before browser delivery. */
export type FlowCondition =
  | {
      op: "reference";
      label: string;
      probability: boolean;
      name?: string;
      stepId?: string;
      path?: string[];
      source?: "task";
    }
  | { op: "literal"; value: string | number | boolean | null }
  | {
      op: "eq" | "lt" | "gt" | "gte" | "all" | "any" | "not";
      args: FlowCondition[];
    };
/** Structural metadata and authored rules; runtime inputs/answers stay in request captures. */
export type FlowNode = FlowDisplay & {
  id: string;
  kind:
    | "jev"
    | "task"
    | "map"
    | "loop"
    | "if"
    | "merge"
    | "branch"
    | "parallel"
    | "output";
  dependencies: string[];
  path: string[];
  condition?: string;
  /** Conditional merge edges; only the selected arm supplies a value. */
  merge?: { condition: string; then: string; else: string };
  /** Optional for older captures; Json allows redacted/truncated subtrees. */
  conditionRule?: Json | FlowCondition;
  /** Named concurrent lanes; optional for older captures. */
  lanes?: string[];
  /** Reusable item program; map nesting is not supported in v1. */
  itemDefinition?: FlowDefinition;
};
export type FlowDefinition = {
  version: 1;
  id: string;
  name: string;
  nodes: FlowNode[];
};
export type FlowStep = {
  id: string;
  executionId: string;
  status:
    | "waiting"
    | "running"
    | "completed"
    | "untaken"
    | "blocked"
    | "error"
    | "cancelled";
  startedAt?: number;
  durationMs?: number;
  decision?: boolean;
  traceId?: string;
  error?: string;
  /** Optional bounded, redacted task input/output or selected merge value; never executable code. */
  data?: Json;
  captureWarnings?: string[];
  loop?: { maxIterations: number; stopReason?: "condition" | "limit" };
  collection?: {
    total: number;
    concurrency: number;
    items: Array<{
      index: number;
      status: FlowStep["status"];
      run?: FlowRun;
    }>;
  };
};
export type FlowRun = {
  version: 1;
  id: string;
  definitionId: string;
  name: string;
  startedAt: number;
  durationMs?: number;
  status: "pending" | "success" | "error" | "cancelled";
  steps: Record<string, FlowStep>;
  outcome?: string;
  value?: Json;
  error?: string;
};
export type FlowUpdate = {
  version: 1;
  definitions: FlowDefinition[];
  upserts: FlowRun[];
  order: string[];
};
