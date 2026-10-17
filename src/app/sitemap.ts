import type { MetadataRoute } from "next";

import { configuredSiteOrigin } from "@/lib/site";

const PAGES = [
  { path: "", priority: 1 },
  { path: "/api-reference", priority: 0.9 },
  { path: "/credits", priority: 0.7 },
  { path: "/status", priority: 0.5 },
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = configuredSiteOrigin() ?? "https://backtosstv.org";
  const now = new Date();

  return PAGES.map(({ path, priority }) => ({
    url: `${origin}${path}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority,
  }));
}
