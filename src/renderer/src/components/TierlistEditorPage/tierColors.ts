// Classic tiermaker color bands (ported verbatim from the original CMR tierlist
// site). Color is bound to the row's position, exactly like tiermaker — the
// first 7 rows get the rainbow bands, any extra rows fall back to light gray.

export const TIER_COLORS = [
  '#ff4b5c', // S
  '#ffb347', // A
  '#ffe66d', // B
  '#c3ff68', // C
  '#7dffb3', // D
  '#5cd8ff', // E
  '#9f8bff' // F
];

export const TIER_OVERFLOW_COLOR = '#e5e7eb';

/** Dark label text used on every band (matches the reference site). */
export const TIER_LABEL_TEXT_COLOR = '#111827';

export const getTierColor = (index: number): string =>
  index >= 0 && index < TIER_COLORS.length ? TIER_COLORS[index] : TIER_OVERFLOW_COLOR;
