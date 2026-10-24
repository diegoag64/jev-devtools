import type { ReactNode } from "react";
import "./style.css";
import { Devtools } from "./devtools";

export const metadata = { title: "Jev DevTools · Next.js" };
export const runtime = "nodejs";
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
        <Devtools />
      </body>
    </html>
  );
}
