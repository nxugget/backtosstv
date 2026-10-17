import { NavLink } from "@/components/nav-link";
import {
  SHACK_EVENTS_PATH,
  SHACK_HOME_PATH,
  SHACK_OPERATORS_PATH,
  SHACK_SATELLITES_PATH,
  SHACK_SETTINGS_PATH,
  SHACK_USERS_PATH,
} from "@/lib/shack";

export function ShackNav() {
  return (
    <nav aria-label="Shack" className="sticky top-14 z-30 bg-void/95">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-1 px-6 py-2">
        <NavLink href={SHACK_HOME_PATH}>Add event</NavLink>
        <NavLink href={SHACK_EVENTS_PATH}>Events</NavLink>
        <NavLink href={SHACK_SATELLITES_PATH}>Satellites</NavLink>
        <NavLink href={SHACK_OPERATORS_PATH}>Operators</NavLink>
        <NavLink href={SHACK_USERS_PATH}>Users</NavLink>
        <NavLink href={SHACK_SETTINGS_PATH}>Account</NavLink>
      </div>
    </nav>
  );
}
