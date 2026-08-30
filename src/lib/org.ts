function apiUrl(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  return `${base.replace(/\/?$/, "/")}api/${path}`;
}

export type OrgPublic = {
  id: string;
  name: string;
  joinCode: string;
  createdAt: string;
  role: "admin" | "member";
  members: Array<{
    displayName: string;
    deviceLabel: string;
    role: "admin" | "member";
    joinedAt: string;
  }>;
};

async function readJson<T>(res: Response): Promise<T> {
  return (await res.json().catch(() => ({}))) as T;
}

export async function fetchOrg(deviceId: string): Promise<OrgPublic | null> {
  const res = await fetch(`${apiUrl("org")}?deviceId=${encodeURIComponent(deviceId)}`);
  const data = await readJson<{ org?: OrgPublic | null }>(res);
  return data.org ?? null;
}

export async function createOrg(input: {
  name: string;
  deviceId: string;
  displayName: string;
  deviceLabel: string;
}): Promise<OrgPublic> {
  const res = await fetch(apiUrl("org"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await readJson<{ org?: OrgPublic; error?: string }>(res);
  if (!res.ok || !data.org) throw new Error(data.error || "Could not create organization");
  return data.org;
}

export async function joinOrg(input: {
  code: string;
  deviceId: string;
  displayName: string;
  deviceLabel: string;
}): Promise<OrgPublic> {
  const res = await fetch(apiUrl("org/join"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await readJson<{ org?: OrgPublic; error?: string }>(res);
  if (!res.ok || !data.org) throw new Error(data.error || "Could not join organization");
  return data.org;
}

export async function leaveOrg(deviceId: string): Promise<void> {
  await fetch(apiUrl("org/leave"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deviceId }),
  });
}
