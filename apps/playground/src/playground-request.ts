export class RunError extends Error {
  constructor(
    message: string,
    public cancelled = false,
    public timedOut = false,
  ) {
    super(message);
  }
}
/** Bound the full response, including a JSON body that stops arriving mid-stream. */
export async function postPlayground(
  url: string,
  body: unknown = {},
  {
    timeoutMs = 30_000,
    signal,
  }: { timeoutMs?: number; signal?: AbortSignal } = {},
) {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort(signal?.reason);
  if (signal?.aborted) cancel();
  else signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => {
    if (!controller.signal.aborted) {
      timedOut = true;
      controller.abort();
    }
  }, timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok)
      throw new RunError(
        data.error || "Request failed",
        data.cancelled === true,
      );
    return data;
  } catch (error) {
    if (timedOut)
      throw new RunError(
        "The playground server did not finish in time. Try again; if it keeps happening, restart the dev server.",
        false,
        true,
      );
    if (signal?.aborted) throw new RunError("Request cancelled", true);
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
