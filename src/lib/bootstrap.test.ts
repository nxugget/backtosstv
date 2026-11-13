import { afterEach, describe, expect, it } from "vitest";

import { isBootstrapTokenValid } from "@/lib/bootstrap";

afterEach(() => {
  delete process.env.BOOTSTRAP_TOKEN;
});

describe("isBootstrapTokenValid", () => {
  it("accepts the configured token", () => {
    process.env.BOOTSTRAP_TOKEN = "a".repeat(64);

    expect(isBootstrapTokenValid("a".repeat(64))).toBe(true);
  });

  it("rejects a different token of the same length", () => {
    process.env.BOOTSTRAP_TOKEN = "a".repeat(64);

    expect(isBootstrapTokenValid("b".repeat(64))).toBe(false);
  });

  it("rejects a token of a different length", () => {
    process.env.BOOTSTRAP_TOKEN = "a".repeat(64);

    expect(isBootstrapTokenValid("a")).toBe(false);
    expect(isBootstrapTokenValid(`${"a".repeat(64)}a`)).toBe(false);
  });

  it("rejects a missing token", () => {
    process.env.BOOTSTRAP_TOKEN = "a".repeat(64);

    expect(isBootstrapTokenValid(null)).toBe(false);
  });

  it("never matches when the variable is unset, so the route stays inert", () => {
    expect(isBootstrapTokenValid("")).toBe(false);
    expect(isBootstrapTokenValid("a".repeat(64))).toBe(false);
  });

  it("never matches when the variable is empty", () => {
    process.env.BOOTSTRAP_TOKEN = "";

    expect(isBootstrapTokenValid("")).toBe(false);
  });
});
