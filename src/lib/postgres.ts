/**
 * PostgREST passes these through from Postgres. They are the only way to tell "that already exists"
 * from "that is still referenced" without matching on message text.
 */
export const UNIQUE_VIOLATION = "23505";
export const FOREIGN_KEY_VIOLATION = "23503";
