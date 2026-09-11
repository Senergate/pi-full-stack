/*
 * Shared VUF presentation contract.
 * Both the VUF card and the AI/Grid-condition card must use the same
 * thresholds, labels and decimal precision so the UI cannot disagree.
 */

export const VUF_DISPLAY_DIGITS = 1;
export const VUF_BALANCED_LIMIT = 1.0;
export const VUF_CRITICAL_LIMIT = 2.0;

export const numberOrNullVuf = value => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : null;
};

export const formatVufPercent = value => {
  const numeric = numberOrNullVuf(value);
  return numeric === null ? '--' : `${numeric.toFixed(VUF_DISPLAY_DIGITS)}%`;
};

export const classifyVuf = value => {
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
  formatVufPercent,
  classifyVuf,
};
