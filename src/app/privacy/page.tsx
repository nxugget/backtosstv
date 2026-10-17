import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What BackToSSTV collects and why: as little as possible, with no cookies and no accounts.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12 sm:px-10 lg:px-16">
      <p className="retro-kicker">Legal</p>
      <h1 className="mt-1 text-4xl uppercase text-ink sm:text-5xl">Privacy</h1>
      <p className="mt-2 text-sm uppercase tracking-wider text-ink-faint">
        Last updated October 17, 2026
      </p>

      <p className="mt-6 max-w-prose text-base leading-relaxed text-ink-dim">
        BackToSSTV is a public catalogue and API. It is built to work without knowing who you are,
        and this page says exactly what it sees.
      </p>

      <h2 className="retro-kicker mt-12">The public site</h2>
      <ul className="mt-3 max-w-prose space-y-2 text-base leading-relaxed text-ink-dim">
        <li>
          <span className="text-signal">No cookies.</span> The site sets none, and stores nothing in
          your browser.
        </li>
        <li>
          <span className="text-signal">No account, no sign-up.</span> Reading the site asks nothing
          of you.
        </li>
        <li>
          <span className="text-signal">Aggregate analytics only.</span> The site uses Vercel
          Analytics, which counts visits in aggregate. It sets no tracking cookies, builds no
          profile across sites, and stores no information that identifies you personally. See{" "}
          <a
            className="text-signal underline decoration-signal/40 underline-offset-4 hover:text-signal-bright"
            href="https://vercel.com/docs/analytics"
            rel="noreferrer"
            target="_blank"
          >
            Vercel&apos;s analytics documentation
          </a>{" "}
          for how it works.
        </li>
      </ul>

      <h2 className="retro-kicker mt-12">The API</h2>
      <p className="mt-3 max-w-prose text-base leading-relaxed text-ink-dim">
        The API has no key and no registration, so it never asks for a name, an email, or anything
        else about you.
      </p>
      <p className="mt-4 max-w-prose text-base leading-relaxed text-ink-dim">
        It does enforce a request budget, and to do that it counts each caller by the address the
        host reports for the connection, which is normally your IP address, or the /64 prefix of it
        for IPv6. That address is used only to apply the budget within the current minute. It is not
        written into the catalogue, not kept after the window, and not linked to an identity. The
        host may keep short-lived request logs for abuse protection.
      </p>

      <h2 className="retro-kicker mt-12">The admin area</h2>
      <p className="mt-3 max-w-prose text-base leading-relaxed text-ink-dim">
        The Shack at <code className="font-mono">/shack</code> is for the people who maintain the
        catalogue. Signing in uses a passkey, handled by Supabase Auth, and stores nothing on your
        device. If you are not an administrator, that area collects nothing about you.
      </p>

      <h2 className="retro-kicker mt-12">Questions</h2>
      <p className="mt-3 max-w-prose text-base leading-relaxed text-ink-dim">
        Anything unclear or wrong here, open an issue on the{" "}
        <a
          className="text-signal underline decoration-signal/40 underline-offset-4 hover:text-signal-bright"
          href="https://github.com/nxugget/backtosstv"
          rel="noreferrer"
          target="_blank"
        >
          GitHub repository
        </a>
        .
      </p>

      <p className="mt-12 max-w-prose text-sm text-ink-faint">
        This page may change as the service does. If we ever collect anything beyond what it says
        here, this is the page that will say so first.
      </p>
    </main>
  );
}
