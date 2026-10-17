import { notFound } from "next/navigation";

import { BootstrapForm } from "@/components/shack/bootstrap-form";
import { isBootstrapTokenValid } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";

export default async function ShackBootstrapPage(props: PageProps<"/shack/bootstrap">) {
  const searchParams = await props.searchParams;
  const token = typeof searchParams.token === "string" ? searchParams.token : null;

  if (!isBootstrapTokenValid(token)) {
    notFound();
  }

  const email = typeof searchParams.email === "string" ? searchParams.email : "";

  return (
    <main className="shack-surface mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-12">
      <header>
        <h1 className="text-2xl font-semibold text-ink">First passkey</h1>
        <p className="mt-1 text-sm text-ink-faint">One-time setup</p>
      </header>

      <p className="max-w-prose text-sm leading-relaxed text-ink-dim">
        Sign in with the temporary password you were given, then approve the passkey prompt. The
        passkey replaces that password right away, so from then on you sign in with the passkey.
      </p>

      <BootstrapForm email={email} />
    </main>
  );
}
