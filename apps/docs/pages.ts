export const groups = [
  "Getting started",
  "Guides",
  "API reference",
  "Resources",
] as const;
export type Page = {
  slug: string;
  title: string;
  description: string;
  group: (typeof groups)[number];
  file: string;
};
export const pages: Page[] = [
  {
    slug: "",
    title: "Introduction",
    description:
      "See what your Jev calls are doing. A local development inspector for TypeSafe applications.",
    group: "Getting started",
    file: "introduction.md",
  },
  {
    slug: "getting-started",
    title: "Quick start",
    description:
      "Connect your server, mount the drawer, and inspect your first request.",
    group: "Getting started",
    file: "getting-started.md",
  },
  {
    slug: "concepts",
    title: "How it fits together",
    description:
      "Understand the client, recorder, and drawer before connecting them to your application.",
    group: "Getting started",
    file: "concepts.md",
  },
  {
    slug: "guides/nextjs",
    title: "Next.js",
    description:
      "Share a Node adapter across Route Handlers, Server Actions, and Server Components.",
    group: "Guides",
    file: "nextjs.md",
  },
  {
    slug: "guides/flows",
    title: "Build a flow",
    description:
      "Connect requests and application code in an inspectable, bounded flow.",
    group: "Guides",
    file: "flows.md",
  },
  {
    slug: "guides/privacy",
    title: "Privacy & access",
    description:
      "Choose what is captured, who can inspect it, and how long it stays in memory.",
    group: "Guides",
    file: "privacy.md",
  },
  {
    slug: "guides/troubleshooting",
    title: "Troubleshooting",
    description:
      "Resolve an empty drawer, rejected connections, and missing flow captures.",
    group: "Guides",
    file: "troubleshooting.md",
  },
  {
    slug: "api/react",
    title: "JevDevtools",
    description:
      "The React component, its props, and the optional stylesheet export.",
    group: "API reference",
    file: "react.md",
  },
  {
    slug: "api/server",
    title: "Server adapter",
    description:
      "Create and share an adapter, instrument a client, and expose the inspector endpoints.",
    group: "API reference",
    file: "server.md",
  },
  {
    slug: "api/flow",
    title: "Flow builder",
    description:
      "Define requests, tasks, branches, parallel work, collections, and loops.",
    group: "API reference",
    file: "flow-api.md",
  },
  {
    slug: "api/expressions",
    title: "Expressions & conditions",
    description: "Reference typed values and compose inspectable decisions.",
    group: "API reference",
    file: "expressions.md",
  },
  {
    slug: "api/recorder",
    title: "Recorder & types",
    description:
      "Lower-level recording, custom observers, and public TypeScript contracts.",
    group: "API reference",
    file: "recorder.md",
  },
  {
    slug: "examples",
    title: "Examples & cookbooks",
    description:
      "Start from an independent sample or explore a complete application flow.",
    group: "Resources",
    file: "examples.md",
  },
  {
    slug: "agents",
    title: "For coding agents",
    description:
      "Version-matched setup guidance and plain Markdown for tooling.",
    group: "Resources",
    file: "agents.md",
  },
  {
    slug: "changelog",
    title: "Changelog",
    description: "Releases, fixes, and changes to Jev DevTools.",
    group: "Resources",
    file: "../../../CHANGELOG.md",
  },
];
