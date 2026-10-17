import type { ReactNode } from "react";

interface PanelProps {
  children: ReactNode;
  meta?: string;
  title: string;
}

/**
 * Card used by the admin screens. The public site has its own numbered variant, which is why this
 * one lives next to the admin components instead of being shared.
 */
export function Panel({ children, meta, title }: PanelProps) {
  return (
    <section className="border border-edge-soft bg-shell/50">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 pt-4 pb-3">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {meta === undefined ? null : <span className="text-sm text-ink-faint">{meta}</span>}
      </header>

      <div className="px-5 pb-5">{children}</div>
    </section>
  );
}
