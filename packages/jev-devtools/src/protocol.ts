// Browser-safe, versioned snapshots. Never send SDK clients, options, or headers.
export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };
export type QuestionView = {
  type: string;
  instructions?: Json;
  criteria?: Json;
};
export type AnswerView = {
  type: string;
  choice?: string;
  score?: number;
  noul?: number;
  confidence?: number;
  probabilities?: Record<string, number>;
  legend?: Record<string, Json>;
  box?: { left: number; top: number; right: number; bottom: number };
};
export type Trace = {
  version: 1;
  id: string;
  session: string;
  flow?: { runId: string; stepId: string; executionId: string };
  label: string;
  source: "sample" | "live";
  startedAt: number;
  durationMs?: number;
  status: "pending" | "success" | "error" | "cancelled";
  request: {
    model: string;
    state: Json;
    questions: Record<string, QuestionView>;
    assets?: Json;
  };
  result?: {
    model: string;
    answers: Record<string, AnswerView>;
    usage?: { input_tokens: number; output_tokens: number };
  };
  /** Bounded redacted JSON whose structured request/result view is unavailable.
   * Presence, including null, identifies an unavailable section. Never infer
   * availability from user strings. The recorder owns this metadata. */
  capture?: { request?: Json; result?: Json };
  requestId?: string;
  error?: { name: string; message: string; status?: number };
  attempts: {
    number: number;
    durationMs?: number;
    status?: number;
    error?: string;
  }[];
  captureWarnings: string[];
};
export type Snapshot = { version: 1; traces: Trace[] };

// Incremental stream is opt-in via /events?protocol=2. Trace payloads remain v1.
export type StreamSnapshot = { version: 2; revision: number; traces: Trace[] };
export type TraceDelta = {
  version: 2;
  base: number;
  revision: number;
  upserts: Trace[];
  /** Authoritative newest-first retained IDs. Omitted IDs are removed. */
  order: string[];
};
