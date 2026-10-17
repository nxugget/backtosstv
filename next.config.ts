import type { NextConfig } from "next";

/**
 * Event images live in the public Supabase Storage bucket the API returns in `image_url`. The host
 * is project-specific, so the allowed image source is derived from the environment instead of
 * hardcoded. When the variable is absent the list is simply empty.
 */
function supabaseImagePatterns() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (url === undefined || url === "") {
    return [];
  }

  try {
    return [
      {
        protocol: "https" as const,
        hostname: new URL(url).hostname,
        port: "",
        pathname: "/storage/v1/object/public/**",
        search: "",
      },
    ];
  } catch {
    return [];
  }
}

/**
 * Sent with every response. None of them change what the API answers; they are what a browser needs
 * in order not to make something of a response that was never meant to be read as a document.
 */
const SECURITY_HEADERS = [
  // A JSON body is a JSON body. Without this a browser may sniff a type out of the content.
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Two years, subdomains included. The site is HTTPS only, so this only closes the first visit.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
];

/**
 * The API and the OpenAPI document are data, never a page: nothing in them should ever be allowed
 * to load, run or frame anything. `/api-reference` is deliberately left out: it is a real page,
 * and Scalar loads its bundle from a CDN, so it needs a policy written against that page rather
 * than this one.
 */
const DATA_ONLY_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'";

const nextConfig: NextConfig = {
  // The framework and its version are not information a caller needs.
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Event images travel to Supabase Storage through a Server Action; the bucket caps them at 5 MB.
      bodySizeLimit: "6mb",
    },
  },
  images: {
    remotePatterns: supabaseImagePatterns(),
  },
  headers() {
    return Promise.resolve([
      { source: "/:path*", headers: SECURITY_HEADERS },
      {
        source: "/api/:path*",
        headers: [{ key: "Content-Security-Policy", value: DATA_ONLY_CSP }],
      },
      {
        // Served as a static file, so the route handlers' CORS headers never reach it, and a
        // reference document no browser tool can fetch is half a document.
        source: "/openapi.json",
        headers: [
          { key: "Content-Security-Policy", value: DATA_ONLY_CSP },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, HEAD, OPTIONS" },
          { key: "Access-Control-Expose-Headers", value: "ETag, Last-Modified" },
        ],
      },
    ]);
  },
};

export default nextConfig;
