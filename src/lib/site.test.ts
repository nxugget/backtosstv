import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";

import { canonicalOrigin, configuredSiteOrigin } from "@/lib/site";

function request(url = "https://backtosstv.test/api/v1/events") {
  return new NextRequest(url);
}

afterEach(() => {
  delete process.env.SITE_URL;
});

describe("configuredSiteOrigin", () => {
  it("is null when the deployment does not say", () => {
    expect(configuredSiteOrigin()).toBeNull();

    process.env.SITE_URL = "";

    expect(configuredSiteOrigin()).toBeNull();
  });

  it("drops a trailing slash, so one can be configured either way", () => {
    process.env.SITE_URL = "https://backtosstv.org/";

    expect(configuredSiteOrigin()).toBe("https://backtosstv.org");
  });
});

describe("canonicalOrigin", () => {
  it("publishes the configured origin rather than the one the request arrived at", () => {
    process.env.SITE_URL = "https://backtosstv.org";

    expect(canonicalOrigin(request("https://forged.test/api/v1/events"))).toBe(
      "https://backtosstv.org",
    );
  });

  it("falls back to the request, so a preview and a local server point at themselves", () => {
    expect(canonicalOrigin(request())).toBe("https://backtosstv.test");
  });
});
