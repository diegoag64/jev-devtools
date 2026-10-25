// Fixed teaching fixtures. This module never calls an inference endpoint.
const samples = {
  billing: {
    label: "Billing",
    message: "I was charged twice for my order.",
    probabilities: [0.76, 0.14, 0.1],
  },
  delivery: {
    label: "Delivery",
    message: "My package hasn't arrived yet.",
    probabilities: [0.08, 0.85, 0.07],
  },
} as const;
for (const demo of document.querySelectorAll<HTMLElement>("[data-demo]")) {
  const buttons = demo.querySelectorAll<HTMLButtonElement>("[data-sample]");
  for (const button of buttons) {
    button.hidden = false;
    button.addEventListener("click", () => {
      const key = button.dataset.sample as keyof typeof samples;
      const sample = samples[key];
      for (const candidate of buttons)
        candidate.setAttribute("aria-pressed", String(candidate === button));
      demo.querySelector("[data-message]")!.textContent = sample.message;
      demo.querySelector("[data-result]")!.textContent = sample.label;
      for (const [index, bar] of [
        ...demo.querySelectorAll<HTMLElement>("[data-probability]"),
      ].entries()) {
        bar.querySelector("meter")!.value = sample.probabilities[index];
        bar.querySelector("output")!.textContent =
          `${Math.round(sample.probabilities[index] * 100)}%`;
      }
    });
  }
}
export {};
