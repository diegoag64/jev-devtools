/** Release limited HTTP/1 connections while hidden or leaving the document. */
export function connectVisibleStream(connect: () => () => void): () => void {
  // Stream clients can also run with an EventSource polyfill outside the DOM.
  if (typeof document === "undefined") return connect();
  let disconnect: (() => void) | undefined;
  let pageHidden = false;
  let navigating = false;
  let resume: ReturnType<typeof setTimeout> | undefined;
  const pause = () => {
    disconnect?.();
    disconnect = undefined;
  };
  const update = () => {
    if (pageHidden || navigating || document.visibilityState === "hidden")
      pause();
    else disconnect ??= connect();
  };
  const hide = () => {
    clearTimeout(resume);
    pageHidden = true;
    pause();
  };
  const show = () => {
    clearTimeout(resume);
    pageHidden = false;
    navigating = false;
    update();
  };
  const navigate = () => {
    // pagehide occurs after the new response arrives, which is too late when
    // existing SSE connections fill the pool and queue that navigation request.
    navigating = true;
    pause();
    clearTimeout(resume);
    // A cancelled navigation has no pagehide/pageshow. Give the navigation
    // request a connection first, then resume if this document survives.
    resume = setTimeout(() => {
      navigating = false;
      update();
    }, 1000);
  };
  window.addEventListener("beforeunload", navigate);
  document.addEventListener("visibilitychange", update);
  window.addEventListener("pagehide", hide);
  window.addEventListener("pageshow", show);
  update();
  return () => {
    clearTimeout(resume);
    window.removeEventListener("beforeunload", navigate);
    document.removeEventListener("visibilitychange", update);
    window.removeEventListener("pagehide", hide);
    window.removeEventListener("pageshow", show);
    pause();
  };
}
