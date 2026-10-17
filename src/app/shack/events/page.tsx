import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { cancelEventAction, restoreEventAction } from "@/app/shack/event-actions";
import { EventActionButton } from "@/components/shack/event-action-button";
import { Panel } from "@/components/shack/panel";
import { ShackShell } from "@/components/shack/shack-shell";
import { shackAlertClass, shackSecondaryButtonClass } from "@/components/shack/styles";
import { writerFor, writerProfiles, type WriterProfile } from "@/lib/admins";
import { requireAdminSession } from "@/lib/auth";
import { formatFrequency, formatUtcCalendarDate, formatUtcTime } from "@/lib/format";
import { parsePositiveInteger } from "@/lib/parse";
import { SHACK_EVENTS_PATH, SHACK_HOME_PATH } from "@/lib/shack";

/**
 * Live and upcoming events are listed in full, since that is what anyone opening this screen came
 * for and there are rarely many. The past is paged: it only grows.
 */
const CURRENT_LIMIT = 200;
const PAST_PAGE_SIZE = 25;

const EVENT_COLUMNS =
  "id, start_time, end_time, frequency, mode, title, image_url, cancelled_at, source_url, created_at, created_by, updated_at, updated_by, satellites ( name )";

interface ListedEvent {
  cancelled_at: string | null;
  created_at: string;
  created_by: string | null;
  end_time: string;
  frequency: number;
  id: string;
  image_url: string | null;
  mode: string;
  satellites: { name: string };
  source_url: string | null;
  start_time: string;
  title: string | null;
  updated_at: string;
  updated_by: string | null;
}

export default async function ShackEventsPage(props: PageProps<"/shack/events">) {
  const { supabase } = await requireAdminSession();
  const searchParams = await props.searchParams;
  const pastOffset = readOffset(searchParams.past);
  const now = new Date().toISOString();

  const [profiles, current, past] = await Promise.all([
    writerProfiles(),
    supabase
      .from("sstv_events")
      .select(EVENT_COLUMNS, { count: "exact" })
      .gte("end_time", now)
      .order("start_time", { ascending: true })
      .order("id", { ascending: true })
      .limit(CURRENT_LIMIT),
    supabase
      .from("sstv_events")
      .select(EVENT_COLUMNS, { count: "exact" })
      .lt("end_time", now)
      .order("start_time", { ascending: false })
      .order("id", { ascending: false })
      .range(pastOffset, pastOffset + PAST_PAGE_SIZE - 1),
  ]);

  if (current.error !== null) {
    throw new Error(current.error.message);
  }

  if (past.error !== null) {
    throw new Error(past.error.message);
  }

  const total = (current.count ?? 0) + (past.count ?? 0);

  return (
    <ShackShell>
      {searchParams.error === "cancel" ? (
        <p className={shackAlertClass}>Could not change that event.</p>
      ) : null}

      <Panel title="Events" meta={`${total} published`}>
        {total === 0 ? (
          <p className="text-sm text-ink-dim">
            No events yet. Publish one from the Add event screen.
          </p>
        ) : null}

        {current.data.length === 0 ? null : (
          <EventGroup events={current.data} heading="Live and upcoming" profiles={profiles} />
        )}

        {past.data.length === 0 ? null : (
          <EventGroup events={past.data} heading="Past" profiles={profiles}>
            <PastPager count={past.count ?? 0} offset={pastOffset} />
          </EventGroup>
        )}
      </Panel>

      <Link className={`${shackSecondaryButtonClass} self-start`} href={SHACK_HOME_PATH}>
        Add another event
      </Link>
    </ShackShell>
  );
}

function readOffset(value: string | string[] | undefined): number {
  if (typeof value !== "string") {
    return 0;
  }

  return parsePositiveInteger(value) ?? 0;
}

interface EventGroupProps {
  children?: ReactNode;
  events: readonly ListedEvent[];
  heading: string;
  profiles: Map<string, WriterProfile>;
}

function EventGroup({ children, events, heading, profiles }: EventGroupProps) {
  return (
    <section className="mt-5 first:mt-0">
      <h3 className="text-sm font-medium text-ink-dim">{heading}</h3>

      <ul className="mt-4 flex flex-col gap-4">
        {events.map((event) => (
          <EventRow key={event.id} event={event} profiles={profiles} />
        ))}
      </ul>

      {children}
    </section>
  );
}

function EventRow({
  event,
  profiles,
}: {
  event: ListedEvent;
  profiles: Map<string, WriterProfile>;
}) {
  const cancelled = event.cancelled_at !== null;
  const addedBy = writerFor(profiles, event.created_by);
  // Only worth naming an editor when there was an edit: the trigger stamps both on the insert.
  const editedBy =
    event.updated_at === event.created_at ? null : writerFor(profiles, event.updated_by);

  return (
    <li
      className={`rounded-xl border px-6 py-6 ${
        cancelled ? "border-edge-soft bg-void/10" : "border-edge-soft bg-void/30"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
            <span
              className={`text-xl font-semibold sm:text-2xl ${cancelled ? "text-ink-dim line-through" : "text-ink"}`}
            >
              {event.title ?? event.satellites.name}
            </span>
            {event.title === null ? null : (
              <span className="text-sm text-ink-faint">{event.satellites.name}</span>
            )}
            <span className="font-mono text-lg text-signal">
              {formatFrequency(event.frequency)} MHz
            </span>
            <span className="text-sm text-ink-faint">{event.mode}</span>
            {cancelled ? (
              <span className="border border-signal-deep px-2 py-1 text-sm text-signal-bright">
                Cancelled
              </span>
            ) : null}
            {event.source_url === null ? (
              <span className="text-sm text-ink-faint">no source</span>
            ) : (
              <a
                className="text-sm text-signal underline"
                href={event.source_url}
                rel="noreferrer"
                target="_blank"
              >
                source
              </a>
            )}
          </div>

          {event.image_url === null ? null : (
            <Image
              alt=""
              className="mt-4 h-24 w-24 shrink-0 rounded object-cover"
              height={96}
              src={event.image_url}
              width={96}
            />
          )}

          {addedBy === null && editedBy === null ? null : (
            <div className="mt-3 flex flex-col gap-1 text-sm text-ink-faint">
              {addedBy === null ? null : (
                <span className="inline-flex items-center gap-1.5">
                  <WriterAvatar avatarUrl={addedBy.avatarUrl} />
                  Added by {addedBy.name}
                </span>
              )}
              {editedBy === null ? null : (
                <span className="inline-flex items-center gap-1.5">
                  <WriterAvatar avatarUrl={editedBy.avatarUrl} />
                  Edited by {editedBy.name} on {formatUtcCalendarDate(event.updated_at)}
                </span>
              )}
            </div>
          )}
        </div>

        <dl className="flex flex-wrap gap-x-10 gap-y-2">
          <div>
            <dt className="text-sm text-ink-faint">Start UTC</dt>
            <dd className="mt-0.5 font-mono text-lg text-ink">
              {formatUtcStamp(event.start_time)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-ink-faint">End UTC</dt>
            <dd className="mt-0.5 font-mono text-lg text-ink">{formatUtcStamp(event.end_time)}</dd>
          </div>
        </dl>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Link className={shackSecondaryButtonClass} href={`/shack/events/${event.id}`}>
            Edit
          </Link>

          {cancelled ? (
            <EventActionButton
              action={restoreEventAction}
              className={shackSecondaryButtonClass}
              id={event.id}
              label="Reinstate"
              pendingLabel="Reinstating…"
            />
          ) : (
            <EventActionButton
              action={cancelEventAction}
              className={shackSecondaryButtonClass}
              confirmation="Mark this event as cancelled? It stays in the API so anyone who cached it finds out."
              id={event.id}
              label="Cancel"
              pendingLabel="Cancelling…"
            />
          )}
        </div>
      </div>
    </li>
  );
}

function WriterAvatar({ avatarUrl }: { avatarUrl: string | null }) {
  if (avatarUrl === null) {
    return null;
  }

  return (
    <Image
      alt=""
      className="h-5 w-5 shrink-0 rounded-full object-cover"
      height={20}
      src={avatarUrl}
      width={20}
    />
  );
}

function PastPager({ count, offset }: { count: number; offset: number }) {
  const first = offset + 1;
  const last = Math.min(offset + PAST_PAGE_SIZE, count);
  const previous = Math.max(0, offset - PAST_PAGE_SIZE);
  const next = offset + PAST_PAGE_SIZE;

  if (count <= PAST_PAGE_SIZE) {
    return null;
  }

  return (
    <nav className="mt-3 flex items-center gap-3">
      {offset === 0 ? null : (
        <Link
          className={shackSecondaryButtonClass}
          href={previous === 0 ? SHACK_EVENTS_PATH : `${SHACK_EVENTS_PATH}?past=${previous}`}
        >
          Newer
        </Link>
      )}

      <span className="text-xs text-ink-faint">
        {first}–{last} of {count}
      </span>

      {next >= count ? null : (
        <Link className={shackSecondaryButtonClass} href={`${SHACK_EVENTS_PATH}?past=${next}`}>
          Older
        </Link>
      )}
    </nav>
  );
}

function formatUtcStamp(value: string): string {
  return `${formatUtcCalendarDate(value)} ${formatUtcTime(value)}`;
}
