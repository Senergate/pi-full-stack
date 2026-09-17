/*
 * Shared VUF presentation contract.
 *
 * IMPORTANT separation:
 * - classification uses the raw, finite VUF value;
 * - formatting may round for operator readability;
 * - signed scenario delta uses its own formatter and must never be clamped to 0.
 */

export const VUF_DISPLAY_DIGITS = 1;
export const VUF_BALANCED_LIMIT = 1.0;
export const VUF_CRITICAL_LIMIT = 2.0;

export const numberOrNullVuf = value => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : null;
};

export const numberOrNullSigned = value => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

export const roundVufForDisplay = value => {
  const numeric = numberOrNullVuf(value);
  if (numeric === null) return null;
  const factor = 10 ** VUF_DISPLAY_DIGITS;
  return Math.round((numeric + Number.EPSILON) * factor) / factor;
};

export const formatVufPercent = value => {
  const numeric = roundVufForDisplay(value);
  return numeric === null ? '--' : `${numeric.toFixed(VUF_DISPLAY_DIGITS)}%`;
};

export const formatSignedVufDeltaPercent = value => {
  const numeric = numberOrNullSigned(value);
  if (numeric === null) return '--';
  const factor = 10 ** VUF_DISPLAY_DIGITS;
  const rounded = Math.round((numeric + Math.sign(numeric) * Number.EPSILON) * factor) / factor;
  const normalized = Object.is(rounded, -0) ? 0 : rounded;
  const prefix = normalized > 0 ? '+' : '';
  return `${prefix}${normalized.toFixed(VUF_DISPLAY_DIGITS)}%`;
};

export const classifyVuf = value => {
  // Classification MUST use the raw value. Rounding belongs only to display.
  // Example: raw 2.04% is Critical even though the one-decimal display is 2.0%.
  const numeric = numberOrNullVuf(value);
  if (numeric === null) return { label: 'Unknown', className: 'unknown' };
  if (numeric > VUF_CRITICAL_LIMIT) return { label: 'Critical', className: 'critical' };
  if (numeric >= VUF_BALANCED_LIMIT) return { label: 'Warning', className: 'warning' };
  return { label: 'Balanced', className: 'balanced' };
};

export default {
  VUF_DISPLAY_DIGITS,
  VUF_BALANCED_LIMIT,
  VUF_CRITICAL_LIMIT,
  numberOrNullVuf,
  numberOrNullSigned,
  roundVufForDisplay,
  formatVufPercent,
  formatSignedVufDeltaPercent,
  classifyVuf,
};
