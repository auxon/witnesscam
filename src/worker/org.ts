import { json } from "./http";

export type OrgMember = {
  deviceId: string;
  displayName: string;
  deviceLabel: string;
  role: "admin" | "member";
  joinedAt: string;
};

export type OrgRecord = {
  id: string;
  name: string;
  joinCode: string;
  createdAt: string;
  members: OrgMember[];
};

type Kv = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
};

export function orgKey(id: string) {
  return `org:${id}`;
}
export function orgCodeKey(code: string) {
  return `orgcode:${code}`;
}
export function orgDeviceKey(deviceId: string) {
  return `orgdevice:${deviceId}`;
}
export function orgLicenseKey(id: string) {
  return `orglic:${id}`;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newJoinCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

export function newOrgId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return `ORG-${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

export function parseOrg(raw: string | null): OrgRecord | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OrgRecord;
  } catch {
    return null;
  }
}

export function publicOrg(org: OrgRecord, deviceId: string) {
  const me = org.members.find((m) => m.deviceId === deviceId);
  return {
    id: org.id,
    name: org.name,
    joinCode: org.joinCode,
    createdAt: org.createdAt,
    role: me?.role || "member",
    members: org.members.map((m) => ({
      displayName: m.displayName,
      deviceLabel: m.deviceLabel,
      role: m.role,
      joinedAt: m.joinedAt,
    })),
  };
}

export async function readOrgForDevice(
  kv: Kv,
  deviceId: string,
): Promise<OrgRecord | null> {
  if (!deviceId) return null;
  const orgId = await kv.get(orgDeviceKey(deviceId));
  if (!orgId || orgId === "none") return null;
  return parseOrg(await kv.get(orgKey(orgId)));
}

function cleanName(value: unknown, fallback: string) {
  const s = String(value || "").trim().slice(0, 80);
  return s || fallback;
}

function cleanId(value: unknown) {
  return String(value || "").trim().slice(0, 80);
}

export async function handleOrg(
  request: Request,
  env: { LICENSES: Kv },
  strippedPath: string,
): Promise<Response | null> {
  if (
    strippedPath !== "/api/org" &&
    strippedPath !== "/api/org/join" &&
    strippedPath !== "/api/org/leave"
  ) {
    return null;
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*" } });
  }

  if (strippedPath === "/api/org" && request.method === "GET") {
    const url = new URL(request.url);
    const deviceId = cleanId(url.searchParams.get("deviceId"));
    const org = await readOrgForDevice(env.LICENSES, deviceId);
    if (!org) return json({ org: null });
    return json({ org: publicOrg(org, deviceId) });
  }

  if (strippedPath === "/api/org" && request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      deviceId?: string;
      displayName?: string;
      deviceLabel?: string;
    };
    const deviceId = cleanId(body.deviceId);
    if (!deviceId) return json({ error: "deviceId required" }, 400);
    const existing = await readOrgForDevice(env.LICENSES, deviceId);
    if (existing) return json({ org: publicOrg(existing, deviceId) });

    const org: OrgRecord = {
      id: newOrgId(),
      name: cleanName(body.name, "Untitled desk"),
      joinCode: newJoinCode(),
      createdAt: new Date().toISOString(),
      members: [
        {
          deviceId,
          displayName: cleanName(body.displayName, "Admin"),
          deviceLabel: cleanName(body.deviceLabel, "field device"),
          role: "admin",
          joinedAt: new Date().toISOString(),
        },
      ],
    };
    await Promise.all([
      env.LICENSES.put(orgKey(org.id), JSON.stringify(org)),
      env.LICENSES.put(orgCodeKey(org.joinCode), org.id),
      env.LICENSES.put(orgDeviceKey(deviceId), org.id),
    ]);
    return json({ org: publicOrg(org, deviceId) }, 201);
  }

  if (strippedPath === "/api/org/join" && request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as {
      code?: string;
      deviceId?: string;
      displayName?: string;
      deviceLabel?: string;
    };
    const deviceId = cleanId(body.deviceId);
    const code = String(body.code || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    if (!deviceId || code.length < 6) return json({ error: "join code and deviceId required" }, 400);

    const orgId = await env.LICENSES.get(orgCodeKey(code));
    const org = parseOrg(orgId ? await env.LICENSES.get(orgKey(orgId)) : null);
    if (!org) return json({ error: "That join code is not recognized." }, 404);

    if (!org.members.some((m) => m.deviceId === deviceId)) {
      if (org.members.length >= 40) return json({ error: "This organization is full (40 devices)." }, 400);
      org.members.push({
        deviceId,
        displayName: cleanName(body.displayName, "Field device"),
        deviceLabel: cleanName(body.deviceLabel, "phone"),
        role: "member",
        joinedAt: new Date().toISOString(),
      });
      await env.LICENSES.put(orgKey(org.id), JSON.stringify(org));
    }
    await env.LICENSES.put(orgDeviceKey(deviceId), org.id);
    return json({ org: publicOrg(org, deviceId) });
  }

  if (strippedPath === "/api/org/leave" && request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as { deviceId?: string };
    const deviceId = cleanId(body.deviceId);
    const org = await readOrgForDevice(env.LICENSES, deviceId);
    if (!org) return json({ org: null });
    org.members = org.members.filter((m) => m.deviceId !== deviceId);
    await env.LICENSES.put(orgKey(org.id), JSON.stringify(org));
    await env.LICENSES.put(orgDeviceKey(deviceId), "none");
    return json({ org: null });
  }

  return json({ error: "method not allowed" }, 405);
}
