import { ApiReference } from "@scalar/nextjs-api-reference";

import { configuredSiteOrigin } from "@/lib/site";

/**
 * The OpenAPI document uses a relative server URL, which Scalar resolves against wherever the page
 * is viewed, so locally it showed `http://localhost:3000`. The public API lives on a fixed origin,
 * so the reference always points there. `SITE_URL` wins when a deployment sets it.
 */
const PUBLIC_ORIGIN = configuredSiteOrigin() ?? "https://backtosstv.org";

export const GET = ApiReference({
  baseServerURL: PUBLIC_ORIGIN,
  // `darkMode` is only the initial state, as the package's own comment says, and Scalar then
  // follows whatever the visitor's browser or its own stored preference says, which with the toggle
  // hidden leaves no way back. `forceDarkModeState` is the one that holds.
  darkMode: true,
  forceDarkModeState: "dark",
  hideDarkModeToggle: true,
  pageTitle: "BackToSSTV API",
  url: "/openapi.json",
  theme: "deepSpace",
});
