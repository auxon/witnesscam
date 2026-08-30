import { describe, expect, it } from "vitest";
import { handleOrg } from "../worker/org";

function memoryKv() {
  const map = new Map<string, string>();
  return {
    get: async (key: string) => map.get(key) ?? null,
    put: async (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

describe("org routes", () => {
  it("creates a desk and lets a second device join", async () => {
    const env = { LICENSES: memoryKv() };
    const created = await handleOrg(
      new Request("https://entangleit.com/witnesscam/api/org", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Newsdesk",
          deviceId: "DEV-AAA",
          displayName: "Ada",
          deviceLabel: "iPhone",
        }),
      }),
      env,
      "/api/org",
    );
    expect(created?.status).toBe(201);
    const body = (await created!.json()) as {
      org: { id: string; joinCode: string; members: unknown[] };
    };
    expect(body.org.joinCode.length).toBe(8);
    expect(body.org.members).toHaveLength(1);

    const joined = await handleOrg(
      new Request("https://entangleit.com/witnesscam/api/org/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: body.org.joinCode,
          deviceId: "DEV-BBB",
          displayName: "Bob",
          deviceLabel: "Pixel",
        }),
      }),
      env,
      "/api/org/join",
    );
    expect(joined?.status).toBe(200);
    const next = (await joined!.json()) as { org: { members: unknown[] } };
    expect(next.org.members).toHaveLength(2);
  });
});
