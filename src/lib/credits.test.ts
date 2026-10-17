import { beforeEach, describe, expect, it, vi } from "vitest";

import { listCreditFeeders, listCreditUsers } from "@/lib/credits";

/**
 * The credits page is the one public page served with the secret key, so what matters here is not
 * the markup: it is which relation is read and which columns are asked for. A feeder is a person,
 * and the page used to carry an administrator's `auth.users` id into the HTML as a list key.
 */

const mocks = vi.hoisted(() => ({ from: vi.fn<(table: string) => FakeBuilder>() }));

vi.mock("@/lib/supabase", () => ({
  createSupabaseServiceRoleClient: () => ({ from: mocks.from }),
}));

interface Reply {
  data: unknown;
  error: { message: string } | null;
}

/** What was asked of one builder, so a test can check the relation and the column list. */
interface Recorded {
  columns: string;
  table: string;
}

interface FakeBuilder {
  order(column: string, options: { ascending: boolean }): FakeBuilder;
  select(columns: string): FakeBuilder;
  then<T>(resolve: (reply: Reply) => T): Promise<T>;
}

/** Answers each `from()` with the next reply, and records what was asked. */
function answerWith(...replies: Reply[]): Recorded[] {
  const calls: Recorded[] = [];

  mocks.from.mockImplementation((table: string) => {
    const call: Recorded = { columns: "", table };
    const reply = replies[calls.length] ?? { data: [], error: null };

    calls.push(call);

    const builder: FakeBuilder = {
      select(columns) {
        call.columns = columns;

        return builder;
      },
      order() {
        return builder;
      },
      then(resolve) {
        return Promise.resolve(reply).then(resolve);
      },
    };

    return builder;
  });

  return calls;
}

function rows(data: unknown): Reply {
  return { data, error: null };
}

beforeEach(() => {
  mocks.from.mockReset();
});

describe("listCreditFeeders", () => {
  it("reads the view, not the administrators table", async () => {
    const calls = answerWith(rows([]));

    await listCreditFeeders();

    expect(calls[0]?.table).toBe("public_credit_feeders");
  });

  it("asks for a name and a photo and nothing else", async () => {
    const calls = answerWith(rows([]));

    await listCreditFeeders();

    expect(calls[0]?.columns.split(",").map((column) => column.trim())).toEqual([
      "display_name",
      "avatar_url",
    ]);
  });

  it("returns feeders with no identifier at all", async () => {
    answerWith(rows([{ avatar_url: null, display_name: "Nina" }]));

    const feeders = await listCreditFeeders();

    expect(feeders).toEqual([{ avatarUrl: null, displayName: "Nina" }]);
    expect(Object.keys(feeders[0] ?? {})).not.toContain("id");
  });

  it("sorts by name, so the order does not leak when somebody opted in", async () => {
    answerWith(
      rows([
        { avatar_url: null, display_name: "Zoe" },
        { avatar_url: null, display_name: "Ada" },
      ]),
    );

    const feeders = await listCreditFeeders();

    expect(feeders.map((feeder) => feeder.displayName)).toEqual(["Ada", "Zoe"]);
  });

  it("fails loudly rather than showing an empty page", async () => {
    answerWith({ data: null, error: { message: "permission denied for view" } });

    await expect(listCreditFeeders()).rejects.toThrow("permission denied for view");
  });
});

describe("listCreditUsers", () => {
  it("reads the view, not the apps table", async () => {
    const calls = answerWith(rows([]));

    await listCreditUsers();

    expect(calls[0]?.table).toBe("public_credit_apps");
  });

  it("asks only for what the card shows", async () => {
    const calls = answerWith(rows([]));

    await listCreditUsers();

    expect(calls[0]?.columns.split(",").map((column) => column.trim())).toEqual([
      "id",
      "name",
      "url",
      "logo_url",
    ]);
  });

  it("maps a row to a card", async () => {
    answerWith(
      rows([
        {
          id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
          logo_url: null,
          name: "Pass Watcher",
          url: "https://example.org",
        },
      ]),
    );

    expect(await listCreditUsers()).toEqual([
      {
        id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
        logoUrl: null,
        name: "Pass Watcher",
        url: "https://example.org",
      },
    ]);
  });

  it("names the missing column when a view hands back a null the table forbids", async () => {
    answerWith(
      rows([{ id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", logo_url: null, name: null, url: null }]),
    );

    await expect(listCreditUsers()).rejects.toThrow("has no name");
  });

  it("fails loudly rather than showing an empty page", async () => {
    answerWith({ data: null, error: { message: "permission denied for view" } });

    await expect(listCreditUsers()).rejects.toThrow("permission denied for view");
  });
});
