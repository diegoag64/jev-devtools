// server.ts (Node only)
import { createJevDevtools } from "jev-devtools/server";

export const inspector = createJevDevtools({
  enabled: process.env.NODE_ENV === "development",
  origin: "http://localhost:3000", // Must match the browser URL exactly.
});

export const jev = inspector.createClient({
  apiKey: process.env.TYPESAFE_API_KEY,
});
