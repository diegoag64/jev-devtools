import { existsSync, realpathSync } from "node:fs";
import { dirname, delimiter, join } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function assertSupportedNode(version = process.versions.node) {
  const [major, minor] = version.split(".").map(Number);
  if (!(major > 22 || (major === 22 && minor >= 12))) {
    throw new Error(
      `Node ${version} is unsupported. Use Node >=22.12; run nvm use from the repository root (see .nvmrc).`,
    );
  }
}

// Keep the invoking runtime even when npm changes cwd to an isolated consumer.
export function runtimeEnv(env = process.env) {
  const key =
    Object.keys(env).find((name) => name.toLowerCase() === "path") ?? "PATH";
  return {
    ...env,
    [key]: `${dirname(process.execPath)}${delimiter}${env[key] ?? ""}`,
  };
}

export function npmCommand(args) {
  assertSupportedNode();
  const bin = dirname(process.execPath);
  const cli = [
    process.env.npm_execpath,
    join(bin, "npm"),
    join(bin, "node_modules/npm/bin/npm-cli.js"),
    join(bin, "../lib/node_modules/npm/bin/npm-cli.js"),
  ]
    .filter(Boolean)
    .find(
      (path) => existsSync(path) && /npm-cli\.js$/.test(realpathSync(path)),
    );
  if (!cli)
    throw new Error(
      "Cannot locate npm's CLI. Invoke this command with npm run, or install npm alongside the selected Node runtime.",
    );
  return [process.execPath, [realpathSync(cli), ...args]];
}

export function npm(args, options = {}) {
  const [command, argv] = npmCommand(args);
  return execFileSync(command, argv, {
    ...options,
    env: runtimeEnv(options.env ?? process.env),
  });
}

assertSupportedNode();
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  console.log(`Node ${process.versions.node}: ${process.execPath}`);
  console.log(`npm ${npm(["--version"], { encoding: "utf8" }).trim()}`);
}
