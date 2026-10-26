import { defineJevFlow } from "jev-devtools/flow";

export const fields = defineJevFlow<{
  message: string;
  tags: readonly string[];
}>("fields", (flow) => {
  const tags = flow.input.get("tags");
  const messageLength = flow.task("message-length", {
    input: flow.input.get("message"),
    run: (message) => message.length,
  });
  return flow.output("selected", {
    firstTag: tags.get(0),
    tagCount: tags.get("length"),
    messageLength,
    firstIsNew: tags.get(0).eq("new"),
  });
});

// No Jev steps: no API key or network access is needed.
const noInference = {
  systemOne() {
    throw new Error("This example does not call Jev");
  },
};

export async function tryFieldSelection() {
  const result = await fields.run(
    { message: "abc", tags: ["new", "support"] },
    { client: noInference },
  );
  console.log(result.value); // { firstTag: "new", tagCount: 2, messageLength: 3, firstIsNew: true }
  return result;
}
