import { inspector } from "../../../../server/jev";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => inspector.handleNodeRoute(request);
export const DELETE = (request: Request) => inspector.handleNodeRoute(request);
