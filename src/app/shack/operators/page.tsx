import { OperatorForm } from "@/components/shack/operator-form";
import { OperatorList } from "@/components/shack/operator-list";
import { Panel } from "@/components/shack/panel";
import { ShackShell } from "@/components/shack/shack-shell";
import { requireAdminSession } from "@/lib/auth";

export default async function ShackOperatorsPage() {
  const { supabase } = await requireAdminSession();

  const { data, error } = await supabase
    .from("operators")
    .select("id, slug, name, url, logo_url")
    .order("name", { ascending: true });

  if (error !== null) {
    throw new Error(error.message);
  }

  return (
    <ShackShell>
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Panel meta={`${String(data.length)} listed`} title="Operators">
          <p className="mb-4 max-w-prose text-sm leading-relaxed text-ink-dim">
            Who runs a transmission: ARISS, the university behind the satellite, a club. Every event
            names one, and the API publishes the name, the link and the logo so an application can
            show whose transmission it is.
          </p>

          <OperatorList
            operators={data.map((operator) => ({
              id: operator.id,
              logoUrl: operator.logo_url,
              name: operator.name,
              slug: operator.slug,
              url: operator.url,
            }))}
          />
        </Panel>

        <Panel meta="Name, slug and logo" title="Add operator">
          <OperatorForm />
        </Panel>
      </div>
    </ShackShell>
  );
}
