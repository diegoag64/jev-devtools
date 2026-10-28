import assert from "node:assert/strict";
import { mkdtemp, cp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { npm } from "./runtime.mjs";
import { verificationPackage } from "./verification-package.mjs";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const temp = await mkdtemp(join(tmpdir(), "jev-consumer-"));
const { tarball, files, dependency } = verificationPackage(npm, root, temp);
// Guard the shipped archive, not just the source manifest's intended allowlist.
// A widened files list or stale build output must not ship fixtures or secrets.
const shipped = new Set(files.map(({ path }) => path));
const setupDocs = new Set([
  "skills/setup-jev-devtools/SKILL.md",
  "skills/setup-jev-devtools/references/react-node.md",
  "skills/setup-jev-devtools/references/nextjs.md",
  "skills/setup-jev-devtools/references/verify.md",
  "skills/setup-jev-devtools/references/flows.md",
]);
for (const path of shipped) {
  assert.ok(
    setupDocs.has(path) ||
      /^(?:package\.json|README\.md|LICENSE|THIRD_PARTY_NOTICES\.txt|lib\/(?:src|server|flow)\/[\w-]+\.(?:js|d\.ts|css))$/.test(
        path,
      ),
    `Unexpected file in npm archive: ${path}`,
  );
}
for (const path of [
  "package.json",
  "README.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.txt",
  ...setupDocs,
]) {
  assert.ok(shipped.has(path), `Missing package documentation: ${path}`);
}
for (const extension of [".js", ".d.ts", ".css"]) {
  assert.ok(
    [...shipped].some((path) => path.endsWith(extension)),
    `Missing compiled ${extension} files`,
  );
}
console.log(
  `Archive contents: ${shipped.size} allowed library files; no app, tests, media, or env files`,
);
const consumer = join(temp, "react-app");
await cp(join(root, "examples/react-vite"), consumer, {
  recursive: true,
  filter: (p) => !p.includes("node_modules") && !p.includes("/dist"),
});
const pkg = JSON.parse(await readFile(join(consumer, "package.json"), "utf8"));
if (process.env.JEV_VERIFY_REACT) {
  pkg.dependencies.react = process.env.JEV_VERIFY_REACT;
  pkg.dependencies["react-dom"] = process.env.JEV_VERIFY_REACT;
}
pkg.dependencies["jev-devtools"] = dependency;
// Root and server declaration examples require the consumer's React/Node types.
const workspace = JSON.parse(
  await readFile(join(root, "package.json"), "utf8"),
);
for (const name of ["@types/react", "@types/node"])
  pkg.devDependencies[name] = workspace.devDependencies[name];
await writeFile(join(consumer, "package.json"), JSON.stringify(pkg, null, 2));
npm(
  [
    "install",
    ...(process.env.JEV_VERIFY_OFFLINE === "1" ? ["--offline"] : []),
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
  ],
  { cwd: consumer, stdio: "inherit" },
);
execFileSync(
  process.execPath,
  [
    "--input-type=module",
    "-e",
    `import assert from 'node:assert/strict';import React from 'react';import {renderToString} from 'react-dom/server';import {JevDevtools} from 'jev-devtools';import {JevFlowViewer} from 'jev-devtools/viewer';import {createJevDevtools} from 'jev-devtools/server';import {defineJevFlow} from 'jev-devtools/flow';assert.equal(renderToString(React.createElement(JevDevtools,{enabled:true})), '');assert.equal(renderToString(React.createElement(JevDevtools)), '');const tools=createJevDevtools({origin:'http://localhost:3000'});assert.equal((await tools.handle(new Request('http://localhost:3000/api/jev-devtools'))).status,404);assert.equal((await defineJevFlow('consumer',flow=>flow.output('done')).run({}, {client:tools.createClient({apiKey:'sample-only'})})).outcome,'done');assert.match(renderToString(React.createElement(JevFlowViewer,{definition:{version:1,id:'static',name:'Static',nodes:[]}})), /jev-flow-viewer/);tools.dispose();console.log('Packed exports, SSR, and disabled endpoint: passed');`,
  ],
  { cwd: consumer, stdio: "inherit" },
);
// Source checks can't see declaration emit, so type-check against the archive.
const types = join(consumer, "type-tests");
await cp(
  join(root, "scripts/fixtures/packed-flow-types.ts"),
  join(types, "flow.ts"),
);
await cp(
  join(root, "scripts/fixtures/packed-resolved-templates.ts"),
  join(types, "packed-resolved-templates.ts"),
);
await cp(
  join(root, "scripts/fixtures/packed-resolved-templates.test.mjs"),
  join(types, "packed-resolved-templates.test.mjs"),
);
for (const file of [
  "packed-capture.ts",
  "packed-capture.test.mjs",
  "packed-capture-context.ts",
  "packed-capture-context.test.mjs",
])
  await cp(join(root, "scripts/fixtures", file), join(types, file));
await cp(
  join(root, "scripts/fixtures/packed-viewer.ts"),
  join(types, "packed-viewer.ts"),
);
for (const file of [
  "packed-expression-contracts.ts",
  "packed-expression-contracts.test.mjs",
]) {
  await cp(join(root, "scripts/fixtures", file), join(types, file));
}
await cp(
  join(root, "scripts/fixtures/packed-flow-diagnostics.ts"),
  join(types, "packed-flow-diagnostics.ts"),
);
// No skipLibCheck: it would also skip the archive's own declarations.
await writeFile(
  join(types, "tsconfig.json"),
  JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      lib: ["ES2022", "DOM"],
      module: "ESNext",
      moduleResolution: "Bundler",
      strict: true,
      noEmitOnError: true,
      types: ["node"],
    },
    files: [
      "flow.ts",
      "packed-flow-diagnostics.ts",
      "packed-resolved-templates.ts",
      "packed-expression-contracts.ts",
      "packed-capture.ts",
      "packed-capture-context.ts",
      "packed-viewer.ts",
    ],
  }),
);
execFileSync(
  process.execPath,
  [join(root, "node_modules/typescript/bin/tsc"), "-p", types],
  { cwd: consumer, stdio: "inherit" },
);
console.log("Packed flow types: passed");
execFileSync(process.execPath, [join(types, "packed-flow-diagnostics.js")], {
  cwd: consumer,
  stdio: "inherit",
});
execFileSync(
  process.execPath,
  [
    "--test",
    join(types, "packed-resolved-templates.test.mjs"),
    join(types, "packed-capture.test.mjs"),
    join(types, "packed-capture-context.test.mjs"),
    join(types, "packed-expression-contracts.test.mjs"),
  ],
  { cwd: consumer, stdio: "inherit" },
);
npm(["run", "build"], { cwd: consumer, stdio: "inherit" });
console.log(`Independent consumer ready: ${consumer}`);
console.log(`Installable package: ${tarball}`);
