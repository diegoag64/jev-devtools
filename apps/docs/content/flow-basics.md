Build a flow that returns a name, then add a task that turns the name into a greeting. Both runs use ordinary server code and make no network requests. You can follow this tutorial without an API key or the inspector drawer.

To explore complete flows before writing code, open the [Cookbook Playground](https://playground.jevtools.dev/). Its source, diagrams, and step-by-step guides need no local setup or API key.

Use an ESM TypeScript project on Node **22.12+** with `jev-devtools` installed. See the [Quick start prerequisites](@/getting-started/#before-you-begin) if you need to install it. Run the files with your project's TypeScript runner, or compile them to JavaScript before running them with Node.

## Your first flow

<a id="return-interface"></a>

<a id="input-interface"></a>

Create `first-flow.ts` on your server:

<!-- example: first-flow.ts -->

The `defineJevFlow()` callback describes the steps synchronously. The call to `greet.run()` executes them. Importing the file alone does not run the flow.

Call `await tryGreeting()` from your Node code. For example, if your project uses `tsx`, run this from the directory containing the file:

```sh
node --import tsx --input-type=module -e 'import { tryGreeting } from "./first-flow.ts"; await tryGreeting();'
```

The console prints:

```text
greeted
Ada
```

Every flow run requires a `client`. This example supplies `noInference`, which throws if a Jev request is attempted. The flow has no Jev steps, so it never calls that client.

<a id="input-read-the-data-you-were-given"></a>
<a id="property-interface"></a>
<a id="output-finish-with-a-result"></a>
<a id="return-interface-3"></a>
<a id="input-interface-3"></a>

### Change the input

In `tryGreeting()`, change `{ name: "Ada" }` to `{ name: "Grace" }`. Run the function again. The console now prints:

```text
greeted
Grace
```

`flow.input.get("name")` selects the name supplied to `greet.run()`. `flow.output("greeted", ...)` gives the result its outcome name and value. The outcome stays `"greeted"` because you changed only the input.

## Add a greeting task

<a id="task-run-your-own-code"></a>

<a id="return-interface-1"></a>

<a id="input-interface-1"></a>

Now format the name into a greeting. Create `flow-task.ts` beside the first file:

<!-- example: flow-task.ts -->

Call `await tryTask()` from your Node code. With `tsx`, use:

```sh
node --import tsx --input-type=module -e 'import { tryTask } from "./flow-task.ts"; await tryTask();'
```

The console prints:

```text
greeted
Hello, Ada!
```

During definition, `flow.input.get("name")` is a reference to a future string. The task resolves that reference before calling its `run` callback, so `name` inside the callback is an ordinary string. The callback builds the greeting, and `flow.output()` returns it as the flow's value.

Change the input to `{ name: "Grace" }` and run the function again. You should see `Hello, Grace!`. Put string operations and other application work inside task callbacks; builder references are neither strings nor promises.

### Use the result in your application

Inside `tryTask()`, after the awaited `greeting.run()` call, narrow `result.value` before using it as a string:

```ts
if (typeof result.value !== "string") {
  throw new Error("Expected a greeting string");
}
console.log(result.value.toUpperCase());
```

For the original `{ name: "Ada" }` input, this adds `HELLO, ADA!` to the console output. The public `value` type is `unknown`, even though this task produces a string.

## Inspect the greeting flow

If you have connected the drawer through [Quick start](@/getting-started/), import the shared `inspector` into `flow-task.ts`. Replace the `greeting.run()` call inside `tryTask()` with this fragment:

```ts api=core
const result = await greeting.run(
  { name: "Ada" },
  { client: noInference, devtools: inspector },
);
```

Here `greeting` and `noInference` come from the complete example above. Use your server module's path for the `inspector` import.

Call `tryTask()` from a handler in the same Node process as that adapter. Open the drawer and select the flow run. You should see the `make-message` task and the `greeted` output. This flow makes no SDK request, so it adds no request trace.

<a id="give-steps-useful-names"></a>

The task ID `make-message` identifies the step; `greeted` names the output. Keep these names unique throughout the definition. See the [naming and execution limits](@/api/flow/#limits-and-errors) when adding more steps.

## Where to go next

You have defined a flow, run it with different inputs, and used a task's result. Continue with the operation your application needs. The linked reference sections contain complete examples, input and return tables, and limits.

- <a id="jev-ask-a-question"></a><a id="factory-input-interface"></a><a id="return-interface-2"></a><a id="input-interface-2"></a> [Ask a Jev question](@/api/reference/#flow-jev) to add a model request. `flow.jev()` creates future-answer references; the runner sends and awaits the SDK request. Use a server-side client and API key for these live examples.

- <a id="if-choose-a-value-then-continue"></a><a id="return-interface-4"></a><a id="input-interface-4"></a> [Choose a value with `if()`](@/api/reference/#flow-if) when two paths rejoin before the flow finishes.

- <a id="branch-choose-how-to-finish"></a><a id="return-interface-5"></a><a id="input-interface-5"></a> [Choose an outcome with `branch()`](@/api/reference/#flow-branch) when each path ends the flow.

- <a id="parallel-do-independent-work-together"></a><a id="return-interface-6"></a><a id="input-interface-6"></a> [Run independent work with `parallel()`](@/api/reference/#flow-parallel) when one step does not need another's result.

- <a id="map-repeat-a-recipe-for-each-item"></a><a id="return-interface-7"></a><a id="input-interface-7"></a> [Process a collection with `map()`](@/api/reference/#flow-map) to apply the same steps to each item.

- <a id="loop-repeat-until-a-condition-is-false"></a><a id="return-interface-8"></a><a id="input-interface-8"></a> [Repeat with `loop()`](@/api/reference/#flow-loop) when each iteration needs the previous result.

[Build a flow](@/guides/flows/) combines a Jev question, a terminal branch, and inspector capture in one example.
