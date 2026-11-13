import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms",
  description:
    "Terms of use for the BackToSSTV catalogue and API. Free to use, with credit, and please cache.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12 sm:px-10 lg:px-16">
      <p className="retro-kicker">Legal</p>
      <h1 className="mt-1 text-4xl uppercase text-ink sm:text-5xl">Terms of use</h1>
      <p className="mt-2 text-sm uppercase tracking-wider text-ink-faint">
        Last updated October 17, 2026
      </p>

      <p className="mt-6 max-w-prose text-base leading-relaxed text-ink-dim">
        Short version: the data is free to use, you must credit BackToSSTV, there is no warranty,
        and don&apos;t hammer the API.
      </p>

      <h2 className="retro-kicker mt-12">The data</h2>
      <p className="mt-3 max-w-prose text-base leading-relaxed text-ink-dim">
        Everything the API returns is licensed{" "}
        <a
          className="text-signal underline decoration-signal/40 underline-offset-4 hover:text-signal-bright"
          href="https://creativecommons.org/licenses/by/4.0/"
          rel="noreferrer"
          target="_blank"
        >
          CC BY 4.0
        </a>
        . You may copy it, redistribute it, remix it and build on it, for any purpose including a
        commercial one, provided you credit BackToSSTV, link to the licence, and say if you changed
        anything.
      </p>
      <p className="mt-4 max-w-prose text-base leading-relaxed text-ink-dim">
        A credit that satisfies this:
      </p>
      <blockquote className="mt-3 border-l-2 border-signal pl-4 font-mono text-sm text-ink">
        SSTV event data from BackToSSTV, licensed{" "}
        <a
          className="text-signal underline decoration-signal/40 underline-offset-4 hover:text-signal-bright"
          href="https://creativecommons.org/licenses/by/4.0/"
          rel="noreferrer"
          target="_blank"
        >
          CC BY 4.0
        </a>
        .
      </blockquote>
      <p className="mt-4 max-w-prose text-base leading-relaxed text-ink-dim">
        Every response repeats these terms in its <code className="font-mono">license</code> object
        and in a <code className="font-mono">Link: &lt;...&gt;; rel=&quot;license&quot;</code>{" "}
        header, so an integration never has to go looking. The code is separately licensed under the
        MIT licence.
      </p>

      <h2 className="retro-kicker mt-12">No warranty</h2>
      <p className="mt-3 max-w-prose text-base leading-relaxed text-ink-dim">
        The catalogue is compiled by volunteers from public announcements. It will sometimes be
        wrong, out of date, or missing an event entirely. Do not rely on it for anything that
        matters: it is not a source of truth for operating a station, for predicting a pass, or for
        anything safety-related. The data is provided as is, with no warranty of any kind, and the
        maintainers are not liable for anything that follows from using it.
      </p>

      <h2 className="retro-kicker mt-12">Using the API</h2>
      <p className="mt-3 max-w-prose text-base leading-relaxed text-ink-dim">
        There is no key and no sign-up, and we would like to keep it that way. In exchange:
      </p>
      <ul className="mt-4 max-w-prose space-y-2 text-base leading-relaxed text-ink-dim">
        <li>
          <span className="text-signal">Cache.</span> Responses carry{" "}
          <code className="font-mono">Cache-Control</code>, <code className="font-mono">ETag</code>{" "}
          and <code className="font-mono">Last-Modified</code>. Respect them, and send{" "}
          <code className="font-mono">If-None-Match</code> so an unchanged response comes back as a{" "}
          <code className="font-mono">304</code> with no body.
        </li>
        <li>
          <span className="text-signal">Synchronise.</span> Use{" "}
          <code className="font-mono">?status=all&amp;since=</code> instead of refetching the
          catalogue, and ask <code className="font-mono">/api/v1/deletions?since=</code> in the same
          breath.
        </li>
        <li>
          <span className="text-signal">Keep polling sane.</span> Events are entered by hand, a
          handful a week. Once an hour is plenty.
        </li>
        <li>
          <span className="text-signal">Identify yourself.</span> Send a{" "}
          <code className="font-mono">User-Agent</code> naming your application and a way to reach
          you, as <code className="font-mono">AllmySat/2.3.0 (+https://allmysat.com)</code> does.
        </li>
        <li>
          <span className="text-signal">Do not scrape around the API.</span> The endpoints are the
          interface; the database behind them is not reachable another way by design.
        </li>
      </ul>

      <h2 className="retro-kicker mt-12">The request budget</h2>
      <p className="mt-3 max-w-prose text-base leading-relaxed text-ink-dim">
        There is a per-caller limit, counted per minute, and set generously. A response served from
        your cache does not count against it at all. Every response tells you where you stand:
      </p>
      <div className="mt-4 max-w-prose overflow-x-auto">
        <table className="w-full border-collapse border border-edge-soft text-sm">
          <tbody>
            <tr className="border-b border-edge-soft">
              <th className="border-r border-edge-soft bg-panel/60 px-3 py-2 text-left font-mono text-ink">
                Header
              </th>
              <th className="bg-panel/60 px-3 py-2 text-left font-mono text-ink">Meaning</th>
            </tr>
            <tr className="border-b border-edge-soft">
              <td className="border-r border-edge-soft px-3 py-2 font-mono text-signal">
                RateLimit-Limit
              </td>
              <td className="px-3 py-2 text-ink-dim">requests allowed per minute</td>
            </tr>
            <tr className="border-b border-edge-soft">
              <td className="border-r border-edge-soft px-3 py-2 font-mono text-signal">
                RateLimit-Remaining
              </td>
              <td className="px-3 py-2 text-ink-dim">how many are left in this window</td>
            </tr>
            <tr>
              <td className="border-r border-edge-soft px-3 py-2 font-mono text-signal">
                RateLimit-Reset
              </td>
              <td className="px-3 py-2 text-ink-dim">seconds until the window resets</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-4 max-w-prose text-base leading-relaxed text-ink-dim">
        Over the budget, the answer is <code className="font-mono">429</code> with{" "}
        <code className="font-mono">Retry-After</code>. Wait the stated number of seconds. If your
        use needs more than the budget allows, say so in an issue on GitHub.
      </p>

      <p className="mt-12 max-w-prose text-sm text-ink-faint">
        These terms may change; the licence on data already published will not be made more
        restrictive.
      </p>
    </main>
  );
}
