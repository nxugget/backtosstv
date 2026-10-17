import type { Metadata } from "next";
import Link from "next/link";
import localFont from "next/font/local";
import { Analytics } from "@vercel/analytics/next";

import { SiteNav } from "@/components/site-nav";
import { configuredSiteOrigin } from "@/lib/site";

import "./globals.css";

const dotGothic16 = localFont({
  src: [{ path: "../fonts/DotGothic16-Regular.ttf", weight: "400", style: "normal" }],
  variable: "--font-dotgothic16",
  display: "swap",
});

const sixtyfour = localFont({
  src: [{ path: "../fonts/Sixtyfour-Regular.ttf", weight: "400", style: "normal" }],
  variable: "--font-sixtyfour",
  display: "swap",
});

const origin = configuredSiteOrigin() ?? "https://backtosstv.org";

export const metadata: Metadata = {
  metadataBase: new URL(origin),
  title: {
    default: "BackToSSTV",
    template: "%s | BackToSSTV",
  },
  description:
    "Live tracker and free API for slow-scan television (SSTV) transmissions from amateur satellites. Every event is curated by hand and ready to integrate into any project.",
  openGraph: {
    title: "BackToSSTV",
    description:
      "Live tracker and free API for slow-scan television (SSTV) transmissions from amateur satellites.",
    url: origin,
    siteName: "BackToSSTV",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${dotGothic16.variable} ${sixtyfour.variable}`}>
      <body className="flex min-h-screen flex-col">
        <SiteNav />
        {children}
        <footer className="mt-auto border-t border-signal/40">
          <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-6 sm:px-10 lg:px-16">
            <span className="text-xs uppercase tracking-wider text-ink-faint">
              BackToSSTV · free SSTV catalogue and API
            </span>
            <nav
              aria-label="Legal"
              className="flex items-center gap-x-5 text-xs uppercase tracking-wider"
            >
              <Link className="text-ink-dim transition-colors hover:text-signal" href="/terms">
                Terms
              </Link>
              <Link className="text-ink-dim transition-colors hover:text-signal" href="/privacy">
                Privacy
              </Link>
            </nav>
          </div>
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
