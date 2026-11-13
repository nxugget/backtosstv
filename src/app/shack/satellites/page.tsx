import { Panel } from "@/components/shack/panel";
import { SatelliteForm } from "@/components/shack/satellite-form";
import { SatelliteList } from "@/components/shack/satellite-list";
import { ShackShell } from "@/components/shack/shack-shell";
import { requireAdminSession } from "@/lib/auth";
import { listOperatorOptions } from "@/lib/operators";

export default async function ShackSatellitesPage() {
  const { supabase } = await requireAdminSession();

  const [{ data, error }, operators] = await Promise.all([
    supabase
      .from("satellites")
      .select("norad_id, name, alternate_name, default_operator_id")
      .order("name", { ascending: true }),
    listOperatorOptions(supabase),
  ]);

  if (error !== null) {
    throw new Error(error.message);
  }

  return (
    <ShackShell>
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Panel meta={`${data.length} listed`} title="Satellites">
          <SatelliteList
            operators={operators}
            satellites={data.map((satellite) => ({
              alternateName: satellite.alternate_name,
              defaultOperatorId: satellite.default_operator_id,
              lastFrequency: null,
              lastImageIntervalSeconds: null,
              lastMode: null,
              name: satellite.name,
              noradId: satellite.norad_id,
            }))}
          />
        </Panel>

        <Panel meta="NORAD ID and name" title="Add satellite">
          <p className="mb-4 max-w-prose text-sm leading-relaxed text-ink-dim">
            Satellites are shared by every event, so a name added here also shows up in the picker
            on the Add event screen.
          </p>

          <SatelliteForm operators={operators} />
        </Panel>
      </div>
    </ShackShell>
  );
}
