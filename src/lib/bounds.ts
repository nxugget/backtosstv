/**
 * Each of these has a `check` constraint behind it in `supabase/migrations`, mirrored here so the
 * admin forms can say which bound was crossed and the API can reject a parameter without asking
 * Postgres. Change one, change both.
 */

export const MAX_NORAD_ID = 999_999_999;
export const SATELLITE_NAME_MAX_LENGTH = 80;
export const MAX_FREQUENCY_MHZ = 100_000;
export const MAX_IMAGE_INTERVAL_SECONDS = 86_400;
export const TITLE_MAX_LENGTH = 2000;
export const SOURCE_URL_MAX_LENGTH = 2000;
export const MAX_EVENT_DURATION_DAYS = 90;
export const ADMIN_NAME_MAX_LENGTH = 40;
export const OPERATOR_NAME_MAX_LENGTH = 80;
export const OPERATOR_SLUG_MIN_LENGTH = 2;
export const OPERATOR_SLUG_MAX_LENGTH = 40;
export const MAX_TRANSMIT_POWER_WATTS = 1000;
export const USER_NAME_MAX_LENGTH = 80;
