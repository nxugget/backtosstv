import { Panel } from "@/components/shack/panel";
import { ShackShell } from "@/components/shack/shack-shell";
import { UserForm } from "@/components/shack/user-form";
import { UserList } from "@/components/shack/user-list";
import { requireAdminSession } from "@/lib/auth";

export default async function ShackUsersPage() {
  const { supabase } = await requireAdminSession();

  const { data, error } = await supabase
    .from("app_users")
    .select("id, name, url, logo_url")
    .order("name", { ascending: true });

  if (error !== null) {
    throw new Error(error.message);
  }

  return (
    <ShackShell>
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Panel meta={`${String(data.length)} listed`} title="App users">
          <p className="mb-4 max-w-prose text-sm leading-relaxed text-ink-dim">
            The apps and websites that use the data. They appear below the feeders on the public
            Credits page with their name, logo and official website.
          </p>

          <UserList
            users={data.map((user) => ({
              id: user.id,
              logoUrl: user.logo_url,
              name: user.name,
              url: user.url,
            }))}
          />
        </Panel>

        <Panel meta="Name, site and logo" title="Add app user">
          <UserForm />
        </Panel>
      </div>
    </ShackShell>
  );
}
