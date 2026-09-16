import { CONTROL_INPUT_SPECS } from './ControlPolicyConfig.js';

const finiteOrNull = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export const rangeText = spec => `${Number(spec.min).toFixed(spec.decimals)}–${Number(spec.max).toFixed(spec.decimals)} ${spec.unit}`;

export const validateDecimalInput = (rawValue, spec) => {
  const raw = String(rawValue ?? '').trim();
  const allowedRange = `Allowed range: ${rangeText(spec)}.`;

  if (raw === '') return { valid: false, value: null, error: `Enter a numeric value. ${allowedRange}` };
  if (raw.includes(',')) return { valid: false, value: null, error: `Use "." as the decimal separator. ${allowedRange}` };
  if (!/^[0-9.]+$/.test(raw)) return { valid: false, value: null, error: `Use digits and "." only. ${allowedRange}` };
  if ((raw.match(/\./g) ?? []).length > 1) return { valid: false, value: null, error: `Use only one decimal point. ${allowedRange}` };

  const parts = raw.split('.');
  if ((parts[1]?.length ?? 0) > spec.decimals) {
    return { valid: false, value: null, error: `Use no more than ${spec.decimals} decimal places. ${allowedRange}` };
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) return { valid: false, value: null, error: `Enter a numeric value. ${allowedRange}` };
  if (value < spec.min || value > spec.max) {
    return { valid: false, value: null, error: `Enter a value in the range ${rangeText(spec)}.` };
  }

  return { valid: true, value, error: '' };
};

export const formatControlValue = (key, value) => {
  const spec = CONTROL_INPUT_SPECS[key];
  if (!spec) return String(value ?? '');
  const n = finiteOrNull(value);
  return n === null ? '' : n.toFixed(spec.decimals);
};

export const validateControlInput = (key, rawValue) => {
  const spec = CONTROL_INPUT_SPECS[key];
  if (!spec) return { valid: false, value: null, error: 'Unknown control parameter.' };
  return validateDecimalInput(rawValue, spec);
};

export const validateControlPolicyRelations = (candidate, changedKey = '') => {
  const enter = finiteOrNull(candidate?.vufEnterPct);
  const exit = finiteOrNull(candidate?.vufExitPct);
  if (enter !== null && exit !== null && !(exit < enter)) {
    const error = 'VUF Exit must be lower than VUF Enter.';
    return { valid: false, key: changedKey || 'vufExitPct', error };
  }

  const effective = finiteOrNull(candidate?.batteryEffectiveMinA);
  const predicted = finiteOrNull(candidate?.batteryPredictedOnCurrentA);
  if (effective !== null && predicted !== null && effective > predicted) {
    const error = changedKey === 'batteryEffectiveMinA'
      ? 'Battery effective minimum must not exceed Battery predicted ON current.'
      : 'Battery predicted ON current must be greater than or equal to Battery effective minimum.';
    return { valid: false, key: changedKey || 'batteryPredictedOnCurrentA', error };
  }

  return { valid: true, key: '', error: '' };
};

export default {
  formatControlValue,
  validateControlInput,
  validateDecimalInput,
  validateControlPolicyRelations,
};
