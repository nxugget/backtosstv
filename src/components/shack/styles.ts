/**
 * Visual vocabulary for the admin screens. These are a tool rather than a poster, so they stay
 * quiet: no display font, no tracked-out capitals, no decoration that competes with the data.
 */
const shackFocusClass =
  "focus:border-signal focus:ring-2 focus:ring-signal/25 focus-visible:outline-none focus:outline-none";

export const shackInputClass = `w-full rounded-lg border border-edge-soft bg-panel/50 px-3 py-2.5 text-base text-ink placeholder:text-ink-faint ${shackFocusClass}`;

export const shackTextareaClass = `${shackInputClass} min-h-24 leading-relaxed`;

export const shackFileInputClass =
  "w-full rounded-lg border border-edge-soft bg-panel/50 px-3 py-2 text-sm text-ink-dim file:mr-3 file:rounded-md file:border-0 file:bg-signal/15 file:px-3 file:py-1.5 file:text-sm file:text-signal-bright";

export const shackLabelClass = "block text-sm font-medium text-ink";

export const shackHintClass = "block text-xs leading-relaxed text-ink-faint";

export const shackPrimaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-signal px-4 py-2.5 text-sm font-semibold text-void transition-colors hover:bg-signal-bright active:bg-signal-bright disabled:opacity-50";

export const shackSecondaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-edge-soft bg-panel/50 px-3.5 py-2 text-sm text-ink-dim transition-colors hover:border-edge hover:text-ink active:bg-panel disabled:opacity-50";

export const shackDangerButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-signal-deep/70 px-3.5 py-2 text-sm text-signal transition-colors hover:bg-signal/10 active:bg-signal/15 disabled:opacity-50";

export const shackNoticeClass =
  "rounded-lg border border-signal/40 bg-signal/10 px-4 py-3 text-sm text-ink";

export const shackAlertClass =
  "rounded-lg border border-signal-deep bg-signal/10 px-4 py-3 text-sm text-signal-bright";
