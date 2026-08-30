import type { Rfc3161Stamp } from "./types";

function apiUrl(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  return `${base.replace(/\/?$/, "/")}api/${path}`;
}

/** Browser path: Worker talks to the TSA so CORS is not involved. */
export async function stampEvidenceHash(sha256Hex: string): Promise<Rfc3161Stamp> {
  const res = await fetch(apiUrl("timestamp"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hash: sha256Hex }),
  });
  const data = (await res.json().catch(() => ({}))) as Rfc3161Stamp & { error?: string };
  if (!res.ok || !data.tokenB64) {
    throw new Error(data.error || "RFC 3161 timestamp failed");
  }
  return data;
}
