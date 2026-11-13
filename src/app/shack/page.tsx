import { createEventAction } from "@/app/shack/event-actions";
import { EventForm } from "@/components/shack/event-form";
import { Panel } from "@/components/shack/panel";
import { ShackShell } from "@/components/shack/shack-shell";
import { requireAdminSession } from "@/lib/auth";
import { toUtcDateTimeInput } from "@/lib/format";
import { listOperatorOptions } from "@/lib/operators";
import { DEFAULT_SSTV_MODE } from "@/lib/shack";
import { listSatelliteOptions } from "@/lib/satellites";

export default async function ShackPage() {
  const { supabase } = await requireAdminSession();

  const [satellites, operators] = await Promise.all([
    listSatelliteOptions(supabase),
    listOperatorOptions(supabase),
  ]);

  return (
    <ShackShell>
      <Panel meta="UTC" title="Add event">
        <EventForm
          action={createEventAction}
          initial={{
            endTime: "",
            eventId: null,
            frequency: "",
            imageIntervalSeconds: "",
            imageUrl: null,
            mode: DEFAULT_SSTV_MODE,
            noradId: null,
            operatorId: null,
            sourceUrl: "",
            startTime: toUtcDateTimeInput(new Date()),
            title: "",
            transmitPowerWatts: "",
          }}
          operators={operators}
          satellites={satellites}
          submitLabel="Publish"
        />
      </Panel>
    </ShackShell>
  );
}
