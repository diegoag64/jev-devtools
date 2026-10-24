import assert from "node:assert/strict";
import { mkdtemp, cp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { verificationPackage } from "./verification-package.mjs";

// Exercise the installed package through Next's real route bundles, RSC renderer,
// Server Action protocol, and server reloads. No browser or live inference needed.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const temp = await mkdtemp(join(tmpdir(), "jev-nextjs-"));
// Node won't spawn npm.cmd without a shell, so Windows runs npm's CLI script directly.
const npmCli = /npm-cli\.js$/.test(process.env.npm_execpath ?? "")
  ? process.env.npm_execpath
  : join(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
const npm = (args, options) =>
  process.platform === "win32"
    ? execFileSync(process.execPath, [npmCli, ...args], options)
    : execFileSync("npm", args, options);
const { dependency } = verificationPackage(npm, root, temp);
const app = join(temp, "app");
await cp(join(root, "examples/nextjs-app"), app, {
  recursive: true,
  filter: (path) =>
    !path.includes("node_modules") &&
    !path.includes("/.next") &&
    !path.endsWith(".tsbuildinfo"),
});
const pkg = JSON.parse(await readFile(join(app, "package.json"), "utf8"));
pkg.dependencies["jev-devtools"] = dependency;
await writeFile(join(app, "package.json"), JSON.stringify(pkg, null, 2));
npm(["install", "--ignore-scripts", "--no-audit", "--no-fund"], {
  cwd: app,
  stdio: "inherit",
});
const portServer = createServer().listen(0, "127.0.0.1");
await once(portServer, "listening");
const port = portServer.address().port;
await new Promise((resolve) => portServer.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: "1",
  JEV_DEVTOOLS_ORIGIN: origin,
};
delete env.NODE_ENV;
let child,
  exitPromise,
  logs = "";
function start(mode) {
  logs = "";
  child = spawn(
    process.execPath,
    [
      join(app, "node_modules/next/dist/bin/next"),
      mode,
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    { cwd: app, env, stdio: ["ignore", "pipe", "pipe"] },
  );
  exitPromise = once(child, "exit");
  child.stdout.on("data", (chunk) => {
    logs = (logs + chunk).slice(-24_000);
  });
  child.stderr.on("data", (chunk) => {
    logs = (logs + chunk).slice(-24_000);
  });
}
async function stop() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const kill = setTimeout(() => child.kill("SIGKILL"), 5000);
  try {
    await exitPromise;
  } finally {
    clearTimeout(kill);
  }
}
async function http(path, options = {}) {
  return fetch(origin + path, {
    signal: AbortSignal.timeout(60_000),
    ...options,
  });
}
async function ready() {
  const until = Date.now() + 120_000;
  while (Date.now() < until) {
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error("Next.js exited before ready");
    let response;
    try {
      response = await http("/");
    } catch {
      /* Startup/compilation still in progress. */
    }
    if (response?.ok) return await response.text();
    if (response && response.status >= 500)
      throw new Error(`Next SSR returned ${response.status}`);
    await delay(500);
  }
  throw new Error("Next.js startup timed out");
}
async function snapshot() {
  const response = await http("/api/jev-devtools/events");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/event-stream/);
  const reader = response.body.getReader();
  try {
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) throw new Error("SSE ended without a snapshot");
      buffer += new TextDecoder().decode(value);
      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const event = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = event
          .split("\n")
          .find((line) => line.startsWith("data: "));
        if (data) return JSON.parse(data.slice(6)).traces;
      }
    }
  } finally {
    await reader.cancel();
  }
}
async function completed(label) {
  for (let i = 0; i < 30; i++) {
    const traces = await snapshot();
    const trace = traces.find(
      (t) => t.label === label && t.status === "success",
    );
    if (trace) {
      assert.equal(trace.result.answers.category.choice, "billing");
      assert.equal(trace.request.state.email, "[redacted]");
      return trace;
    }
    await delay(100);
  }
  assert.fail(`Missing completed ${label} in the inspector route's history`);
}
try {
  start("dev");
  const html = await ready();
  assert.match(html, /One inspector/);
  assert.equal((await http("/api/jev-devtools")).status, 200);
  assert.deepEqual(await snapshot(), []);
  const route = await http("/api/triage", {
    method: "POST",
    headers: { origin },
  });
  assert.equal(route.status, 200);
  assert.equal((await route.json()).category, "billing");
  const original = await completed("Route Handler");

  // Submit the action field rendered by Next itself, as a progressive form POST.
  const actionField = html.match(/name="(\$ACTION_ID_[^"]+)"/);
  assert.ok(
    actionField,
    "Server Action form must be present in server-rendered HTML",
  );
  const form = new FormData();
  form.set(actionField[1], "");
  const action = await http("/", {
    method: "POST",
    headers: { origin },
    body: form,
    redirect: "manual",
  });
  assert.equal(action.status, 303);
  await completed("Server Action");

  const component = await http("/server");
  assert.equal(component.status, 200);
  assert.match(await component.text(), /billing/);
  await completed("Server Component");

  // Force the actual Next server module to re-evaluate. The changed label proves
  // the edited module ran; the earlier trace ID proves the history survived.
  const modulePath = join(app, "server/jev.ts");
  const moduleSource = await readFile(modulePath, "utf8");
  await writeFile(
    modulePath,
    moduleSource.replace("label: source", "label: source + ' reloaded'"),
  );
  for (let i = 0; i < 30; i++) {
    await http("/api/triage", { method: "POST", headers: { origin } });
    if ((await snapshot()).some((t) => t.label === "Route Handler reloaded"))
      break;
    await delay(250);
  }
  await completed("Route Handler reloaded");
  assert.ok(
    (await snapshot()).some((t) => t.id === original.id),
    "History lost on server reload",
  );
  await writeFile(modulePath, moduleSource);

  assert.equal(
    (
      await http("/api/jev-devtools/clear", {
        method: "DELETE",
        headers: { origin: "https://untrusted.example" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await http("/api/jev-devtools/clear", {
        method: "DELETE",
        headers: { origin },
      })
    ).status,
    200,
  );
  assert.deepEqual(await snapshot(), []);
  console.log(
    "Next dev: route handler, Server Action, Server Component, reload retention, SSE, and clear passed.",
  );
  await stop();
  npm(["run", "build"], { cwd: app, env, stdio: "inherit" });
  start("start");
  await ready();
  for (const path of ["", "/events", "/clear"]) {
    assert.equal(
      (
        await http("/api/jev-devtools" + path, {
          method: path === "/clear" ? "DELETE" : "GET",
          headers: { origin },
        })
      ).status,
      404,
    );
  }
  const productionRoute = await http("/api/triage", {
    method: "POST",
    headers: { origin },
  });
  assert.equal((await productionRoute.json()).category, "billing");
  console.log(
    "Next production: build/SSR passed; inspector endpoints disabled; ordinary sample calls still work.",
  );
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  await stop();
}
console.log(`Verified independent Next.js consumer: ${app}`);
