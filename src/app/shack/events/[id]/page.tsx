import { notFound } from "next/navigation";

import { updateEventAction } from "@/app/shack/event-actions";
import { EventForm } from "@/components/shack/event-form";
import { Panel } from "@/components/shack/panel";
import { ShackShell } from "@/components/shack/shack-shell";
import { requireAdminSession } from "@/lib/auth";
import { formatFrequency, toUtcDateTimeInput } from "@/lib/format";
import { listOperatorOptions } from "@/lib/operators";
import { isUuid } from "@/lib/parse";
import { listSatelliteOptions } from "@/lib/satellites";

export default async function ShackEditEventPage(props: PageProps<"/shack/events/[id]">) {
  const { id } = await props.params;
  const { supabase } = await requireAdminSession();

  if (!isUuid(id)) {
    notFound();
  }

  const { data: event, error } = await supabase
    .from("sstv_events")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error !== null) {
    throw new Error(error.message);
  }

  if (event === null) {
    notFound();
  }

  const [satellites, operators] = await Promise.all([
    listSatelliteOptions(supabase),
    listOperatorOptions(supabase),
  ]);

  return (
    <ShackShell>
      <Panel meta="UTC" title="Edit event">
        <EventForm
          action={updateEventAction}
          initial={{
            endTime: toUtcDateTimeInput(event.end_time),
            eventId: event.id,
            frequency: formatFrequency(event.frequency),
            imageIntervalSeconds:
              event.image_interval_seconds === null ? "" : String(event.image_interval_seconds),
            imageUrl: event.image_url,
            mode: event.mode,
            noradId: event.norad_id,
            operatorId: event.operator_id,
            sourceUrl: event.source_url ?? "",
            startTime: toUtcDateTimeInput(event.start_time),
            title: event.title ?? "",
            transmitPowerWatts:
              event.transmit_power_watts === null ? "" : String(event.transmit_power_watts),
          }}
          operators={operators}
          satellites={satellites}
          submitLabel="Save changes"
        />
      </Panel>
    </ShackShell>
  );
}
