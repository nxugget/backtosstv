import type { ReactNode } from "react";

import { ShackNav } from "@/components/shack/shack-nav";
import { getAdminSession } from "@/lib/auth";

export default async function ShackLayout({ children }: { children: ReactNode }) {
  const session = await getAdminSession();

  return (
    <>
      {session === null ? null : <ShackNav />}
      {children}
    </>
  );
}
