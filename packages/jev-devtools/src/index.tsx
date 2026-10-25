"use client";
import { lazy, Suspense, useEffect, useState } from "react";
export type {
  Trace,
  Snapshot,
  StreamSnapshot,
  TraceDelta,
  Json,
  AnswerView,
  QuestionView,
} from "./protocol.js";
export { flowFixture } from "./flow-fixture.js";
export type { FlowFixture, BuiltFlowFixture } from "./flow-fixture.js";
export type JevDevtoolsProps = {
  endpoint?: string;
  /** Opt in explicitly, normally with import.meta.env.DEV. */
  enabled?: boolean;
  defaultOpen?: boolean;
  /** Mask supported personal fields in DevTools views only. Defaults to true.
   * Captures still contain these values; credentials remain server-redacted. */
  redactAdditionalSensitiveData?: boolean;
};
const ConnectedInspector = lazy(() => import("./ConnectedInspector.js"));
/** SSR-safe entry. No requests or browser globals are accessed while disabled. */
export function JevDevtools({ enabled = false, ...props }: JevDevtoolsProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return enabled && mounted ? (
    <Suspense fallback={null}>
      <ConnectedInspector {...props} />
    </Suspense>
  ) : null;
}
