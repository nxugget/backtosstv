import Image from "next/image";
import type { Metadata } from "next";

import { Noise } from "@/components/noise";
import {
  listCreditFeeders,
  listCreditUsers,
  type CreditFeeder,
  type CreditUser,
} from "@/lib/credits";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Credits",
  description:
    "The people who fill the BackToSSTV catalogue by hand, and the projects that build on it.",
};

export default async function CreditsPage() {
  const [feeders, users] = await Promise.all([listCreditFeeders(), listCreditUsers()]);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12 sm:px-10 lg:px-16">
      <p className="retro-kicker">Acknowledgements</p>
      <h1 className="mt-1 text-4xl uppercase text-ink sm:text-5xl">Credits</h1>

      <section className="mt-12">
        <SectionHeading>The feeders</SectionHeading>
        <p className="mt-3 max-w-prose text-base leading-relaxed text-ink-dim">
          Every pass, frequency and mode in the schedule is entered by hand. These are the people
          who keep the catalogue worth reading.
        </p>

        {feeders.length === 0 ? (
          <EmptyNote>Nobody has opted in yet.</EmptyNote>
        ) : (
          <ul className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {feeders.map((feeder, index) => (
              // The position, because a feeder carries no identifier: an administrator's account id
              // has no business in a public page, and the list is rendered whole on the server.
              <FeederCard feeder={feeder} key={index} />
            ))}
          </ul>
        )}
      </section>

      <section className="mt-16">
        <SectionHeading>They use it</SectionHeading>
        <p className="mt-3 max-w-prose text-base leading-relaxed text-ink-dim">
          Applications and websites that run on the BackToSSTV catalogue. Thank you for putting the
          schedule where more people can catch a pass.
        </p>

        {users.length === 0 ? (
          <EmptyNote>No users listed yet.</EmptyNote>
        ) : (
          <ul className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {users.map((user) => (
              <UserCard key={user.id} user={user} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function SectionHeading({ children }: { children: string }) {
  return <h2 className="retro-kicker">{children}</h2>;
}

function EmptyNote({ children }: { children: string }) {
  return (
    <p className="mt-6 border border-edge-soft bg-panel/40 px-5 py-4 text-sm text-ink-dim">
      {children}
    </p>
  );
}

function FeederCard({ feeder }: { feeder: CreditFeeder }) {
  const name = feeder.displayName ?? "Anonymous";

  return (
    <li className="flex flex-col items-center gap-3">
      <FeederAvatar avatarUrl={feeder.avatarUrl} name={name} />
      <span className="text-center text-xl text-ink">{name}</span>
    </li>
  );
}

function FeederAvatar({ avatarUrl, name }: { avatarUrl: string | null; name: string }) {
  if (avatarUrl !== null) {
    return (
      <span className="relative block h-48 w-48 shrink-0">
        <Image
          alt=""
          className="h-48 w-48 rounded-full object-cover"
          height={192}
          src={avatarUrl}
          width={192}
        />
        <Noise
          blendMode="overlay"
          className="rounded-full"
          contrast={0.5}
          opacity={0.16}
          size={1.5}
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex h-48 w-48 shrink-0 items-center justify-center rounded-full border border-edge-soft bg-panel/70 font-mono text-5xl text-signal"
    >
      {initials(name)}
    </span>
  );
}

function UserCard({ user }: { user: CreditUser }) {
  const name =
    user.url === null ? (
      <span className="text-center text-base text-ink">{user.name}</span>
    ) : (
      <a
        className="text-center text-base text-ink underline decoration-signal/40 underline-offset-4 transition-colors hover:text-signal"
        href={user.url}
        rel="noreferrer"
        target="_blank"
      >
        {user.name}
      </a>
    );

  return (
    <li className="flex flex-col items-center gap-3">
      {user.logoUrl === null ? (
        <span className="flex h-32 w-32 shrink-0 items-center justify-center rounded-full border border-edge-soft bg-panel/70 font-mono text-3xl text-ink-faint">
          {initials(user.name)}
        </span>
      ) : (
        <span className="relative block h-32 w-32 shrink-0">
          <Image
            alt=""
            className="h-32 w-32 rounded-full object-cover"
            height={128}
            src={user.logoUrl}
            width={128}
          />
          <Noise
            blendMode="overlay"
            className="rounded-full"
            contrast={0.5}
            opacity={0.16}
            size={1.5}
          />
        </span>
      )}
      <span className="max-w-full">{name}</span>
    </li>
  );
}

function initials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word !== "");
  const first = words[0];

  if (first === undefined) {
    return "?";
  }

  if (words.length === 1) {
    return first.slice(0, 2).toUpperCase();
  }

  const second = words[1];

  return `${first.charAt(0)}${second?.charAt(0) ?? ""}`.toUpperCase();
}
