import { cors, json } from "./http";
import { requestRfc3161 } from "../lib/timestamp";

export async function handleTimestamp(
  request: Request,
  strippedPath: string,
): Promise<Response | null> {
  if (strippedPath !== "/api/timestamp") return null;
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors() });
  }
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
  const body = (await request.json().catch(() => ({}))) as { hash?: string };
  const hash = String(body.hash || "").toLowerCase();
  try {
    const stamp = await requestRfc3161(hash);
    return json(stamp);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "timestamp failed";
    const status = /SHA-256|digest/.test(msg) ? 400 : 502;
    return json({ error: msg }, status);
  }
}
