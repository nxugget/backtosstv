import type { ReactNode } from "react";

interface ShackShellProps {
  children: ReactNode;
}

export function ShackShell({ children }: ShackShellProps) {
  return (
    <div className="shack-surface flex flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-6">
        {children}
      </main>
    </div>
  );
}
