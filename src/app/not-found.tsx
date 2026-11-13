import Link from "next/link";

/**
 * Also what `/shack/bootstrap` answers without a valid token, so it says nothing about what does or
 * does not exist behind the path.
 */
export default function NotFound() {
  return (
    <main className="flex w-full flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <p className="retro-kicker">No signal</p>
      <h1 className="text-6xl font-semibold tracking-[0.14em] text-signal uppercase sm:text-7xl">
        404
      </h1>

      <p className="text-xs tracking-[0.3em] text-ink-dim uppercase sm:text-sm">Nothing here</p>

      <Link className="mt-2 text-sm text-signal underline" href="/">
        Back to the start
      </Link>
    </main>
  );
}
