export const VUF_DISPLAY_DIGITS = 1;
export const VUF_BALANCED_LIMIT = 1.0;
export const VUF_CRITICAL_LIMIT = 2.0;

export const numberOrNullVuf = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : null;
};

export const roundedVuf = value => {
  const n = numberOrNullVuf(value);
  if (n === null) return null;
  const factor = 10 ** VUF_DISPLAY_DIGITS;
  return Math.round(n * factor) / factor;
};

export const formatVufPercent = value => {
  const n = roundedVuf(value);
  return n === null ? '--' : `${n.toFixed(VUF_DISPLAY_DIGITS)}%`;
};

export const classifyVuf = value => {
  // Deliberately classify the same rounded value shown to the operator, so
  // "2.0% CRITICAL" cannot occur when the defined boundary is >2.0%.
  const n = roundedVuf(value);
  if (n === null) return { label: 'Unknown', className: 'unknown' };
  if (n > VUF_CRITICAL_LIMIT) return { label: 'Critical', className: 'critical' };
  if (n >= VUF_BALANCED_LIMIT) return { label: 'Warning', className: 'warning' };
  return { label: 'Balanced', className: 'balanced' };
};

export default { VUF_DISPLAY_DIGITS, VUF_BALANCED_LIMIT, VUF_CRITICAL_LIMIT, roundedVuf, formatVufPercent, classifyVuf };
