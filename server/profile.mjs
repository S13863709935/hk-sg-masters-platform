export class InputError extends Error {
  constructor(message, status = 422) { super(message); this.status = status; }
}
const number = (value, max, label, step) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max || (step && Math.abs(value / step - Math.round(value / step)) > 0.00001)) throw new InputError(`${label} is outside its valid range or increment.`);
  return value;
};
export function validateProfile(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new InputError('A background object is required.');
  if (typeof input.major !== 'string' || !input.major.trim() || input.major.length > 120) throw new InputError('Enter your undergraduate major (up to 120 characters).');
  const gpa = number(input.gpa, 100, 'GPA'); const gpaScale = number(input.gpaScale, 100, 'GPA scale');
  if ((gpa === null) !== (gpaScale === null) || (gpaScale !== null && gpaScale < 1) || (gpa !== null && gpa > gpaScale)) throw new InputError('Provide GPA with its original scale, or leave both blank. GPA cannot exceed that scale.');
  const l = input.language || {};
  const type = l.type || 'none';
  if (!['none', 'ielts', 'toefl_120', 'toefl_6', 'waiver'].includes(type)) throw new InputError('Unknown language test.');
  const total = number(l.total, type === 'toefl_120' ? 120 : type === 'toefl_6' ? 6 : 9, 'Language total', type === 'toefl_120' ? 1 : 0.5);
  const components = Object.fromEntries(['listening', 'reading', 'writing', 'speaking'].map(k => [k, number(l.components?.[k], 9, k, 0.5)]));
  const testDate = l.testDate || null;
  if (testDate && (typeof testDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(testDate) || !Number.isFinite(Date.parse(testDate)) || new Date(testDate).toISOString().slice(0, 10) !== testDate)) throw new InputError('Enter a valid test date.');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  if (testDate && testDate > today) throw new InputError('Test date cannot be in the future.');
  if (testDate && ((type === 'toefl_120' && testDate >= '2026-01-21') || (type === 'toefl_6' && testDate < '2026-01-21'))) throw new InputError('TOEFL test date and score scale do not agree.');
  return { major: input.major.trim(), gpa, gpaScale, degreeStatus: input.degreeStatus === 'graduated' ? 'graduated' : 'unconfirmed', classification: ['ordinary', 'third', 'second_lower', 'second_upper', 'first'].includes(input.classification) ? input.classification : 'unknown', experienceYears: number(input.experienceYears, 60, 'Experience'), language: { type, total, components, testDate, singleAttempt: l.singleAttempt === true, atHome: l.atHome === true } };
}
