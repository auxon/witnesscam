import { describe, expect, it } from "vitest";
import { readBillingFlag } from "./billingFlag";

describe("readBillingFlag", () => {
  it("reads the search string used after Checkout claim", () => {
    expect(readBillingFlag("?billing=pro", "#/")).toBe("pro");
    expect(readBillingFlag("?billing=failed", "#/")).toBe("failed");
  });

  it("falls back to a hash query", () => {
    expect(readBillingFlag("", "#/?billing=pro")).toBe("pro");
  });

  it("returns null when billing is absent", () => {
    expect(readBillingFlag("", "#/")).toBeNull();
  });
});
