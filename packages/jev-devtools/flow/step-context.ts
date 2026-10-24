import { AsyncLocalStorage } from "node:async_hooks";
import type { Trace } from "../src/protocol.js";

export type StepLink = NonNullable<Trace["flow"]> & { flow: string };
/** The jev step whose SDK call is in progress, read by the replay client. */
export const stepContext = new AsyncLocalStorage<StepLink>();
