import type { MetadataRoute } from "next";

import { configuredSiteOrigin } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  const origin = configuredSiteOrigin() ?? "https://backtosstv.org";

  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${origin}/sitemap.xml`,
  };
}
