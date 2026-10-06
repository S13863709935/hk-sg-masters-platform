export class InputError extends Error {
  constructor(message, status = 422) { super(message); this.status = status; }
}

const isIsoDate = value => { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const d = new Date(value); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value; };

const bounded = (value, min, max, label, step) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (step && Math.abs(value / step - Math.round(value / step)) > 0.00001)) throw new InputError(`${label} 不在允许范围内 / invalid value`);
  return value;
};
export function validateProfile(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new InputError('需要有效的背景信息 / Profile required');
  const major = String(input.major || '').trim();
  if (!major || major.length > 120) throw new InputError('请填写本科专业 / Undergraduate major required');
  const degreeStatus = ['graduated', 'final_year', 'other'].includes(input.degreeStatus) ? input.degreeStatus : 'other';
  const classifications = ['unknown', 'ordinary', 'third', 'second_lower', 'second_upper', 'first'];
  const classification = classifications.includes(input.classification) ? input.classification : 'unknown';
  const gpa = bounded(input.gpa, 0, 100, 'GPA');
  const gpaScale = bounded(input.gpaScale, 1, 100, 'GPA scale');
  if ((gpa === null) !== (gpaScale === null)) throw new InputError('GPA 和原始满分需要一起填写 / Provide GPA and its scale together');
  if (gpa !== null && gpa > gpaScale) throw new InputError('GPA 不能高于原始满分 / GPA exceeds scale');
  const languageInput = input.language || {};
  if (!['none', 'ielts', 'toefl_120', 'toefl_6', 'waiver'].includes(languageInput.type || 'none')) throw new InputError('未知语言考试 / Unknown language test');
  const type = languageInput.type || 'none';
  const max = type === 'toefl_120' ? 120 : type === 'toefl_6' ? 6 : 9;
  const total = bounded(languageInput.total, 0, max, 'Language score', type === 'ielts' || type === 'toefl_6' ? 0.5 : 1);
  const components = {};
  for (const name of ['listening', 'reading', 'writing', 'speaking']) components[name] = bounded(languageInput.components?.[name], 0, 9, name, 0.5);
  const testDate = languageInput.testDate || null;
  if (testDate && !isIsoDate(testDate)) throw new InputError('考试日期无效 / Invalid test date');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  if (testDate && testDate > today) throw new InputError('考试日期不能在未来 / Test date is in the future');
  if (testDate && ((type === 'toefl_120' && testDate >= '2026-01-21') || (type === 'toefl_6' && testDate < '2026-01-21'))) throw new InputError('托福版本与考试日期不一致 / TOEFL scale conflicts with test date');
  const experiences = bounded(input.experienceYears, 0, 60, 'Experience');
  return { major, degreeStatus, classification, gpa, gpaScale, experienceYears: experiences, language: { type, total, components, testDate, atHome: !!languageInput.atHome, singleAttempt: languageInput.singleAttempt === true, waiverBasis: ['first_language', 'english_degree'].includes(languageInput.waiverBasis) ? languageInput.waiverBasis : null } };
}

export const universityDomains = ['cityu.edu.hk', 'hkbu.edu.hk', 'ln.edu.hk', 'cuhk.edu.hk', 'eduhk.hk', 'polyu.edu.hk', 'hkust.edu.hk', 'ust.hk', 'hku.hk', 'nus.edu.sg', 'ntu.edu.sg', 'smu.edu.sg', 'sutd.edu.sg', 'singaporetech.edu.sg', 'suss.edu.sg'];
export function isOfficialUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && universityDomains.some(domain => u.hostname === domain || u.hostname.endsWith(`.${domain}`)); } catch { return false; }
}

export function validateProgramme(p, universityIds) {
  if (!p || !/^(HK|SG)-[A-Z]+-P\d{3,}$/.test(p.id || '')) throw new InputError('Invalid programme ID');
  if (!universityIds.has(p.universityId)) throw new InputError('Unknown university');
  if (!p.id.startsWith(`${p.universityId}-P`)) throw new InputError('Programme ID conflicts with university');
  if (typeof p.name !== 'string' || p.name.length < 3 || p.name.length > 300) throw new InputError('Invalid programme name');
  if (!isOfficialUrl(p.officialUrl)) throw new InputError('Programme source must be a university HTTPS URL');
  if (!['catalogue_seed', 'programme_page_checked', 'peer_reviewed', 'needs_confirmation', 'outdated'].includes(p.verification)) throw new InputError('Invalid verification status');
  if (!['unreviewed', 'partial', 'complete'].includes(p.requirementsCoverage)) throw new InputError('Invalid requirements coverage');
  if (!['unconfirmed', 'direct', 'transfer_only'].includes(p.admissionRoute)) throw new InputError('Invalid admission route');
  if (!Array.isArray(p.offerings) || !Array.isArray(p.rules)) throw new InputError('Offerings and rules must be arrays');
  if (!p.offerings.length || new Set(p.offerings.map(o => o.id)).size !== p.offerings.length) throw new InputError('Missing or duplicate offerings');
  for (const o of p.offerings) {
    if (typeof o.id !== 'string' || !o.id.startsWith(`${p.id}-`)) throw new InputError('Offering ID must belong to the programme');
    if (o.tuition !== null && o.tuition !== undefined && (!Number.isFinite(o.tuition) || o.tuition < 0 || !o.currency)) throw new InputError('Invalid tuition amount or missing currency');
  }
  if (p.verification === 'peer_reviewed' && (!p.reviewer || !p.collector || p.reviewer === p.collector)) throw new InputError('Independent reviewer required');
  if (p.verification !== 'catalogue_seed' && (!isIsoDate(p.lastChecked) || !p.academicYear)) throw new InputError('Checked data requires date and applicable intake/year');
  for (const r of p.rules) {
    if (!['degree', 'major', 'classification', 'gpa', 'language', 'experience', 'manual'].includes(r.kind) || typeof r.labelZh !== 'string' || typeof r.labelEn !== 'string' || !isOfficialUrl(r.sourceUrl)) throw new InputError('Invalid requirement or missing official source');
    if (r.kind === 'gpa' && (!Number.isFinite(r.min) || !Number.isFinite(r.scale) || r.min < 0 || r.scale <= 0 || r.min > r.scale)) throw new InputError('Invalid GPA requirement');
    if (r.kind === 'classification' && !['ordinary', 'third', 'second_lower', 'second_upper', 'first'].includes(r.min)) throw new InputError('Invalid degree classification');
    if (r.kind === 'major' && (!Array.isArray(r.accepted) || r.accepted.some(x => typeof x !== 'string'))) throw new InputError('Invalid major rule');
    if (r.kind === 'experience' && (!Number.isFinite(r.min) || r.min < 0)) throw new InputError('Invalid experience rule');
    if (r.kind === 'language' && (!r.tests || typeof r.tests !== 'object' || Object.entries(r.tests).some(([test, v]) => !['ielts', 'toefl_120', 'toefl_6'].includes(test) || !Number.isFinite(v.total) || v.total < 0 || (test === 'ielts' && v.total > 9) || (test === 'toefl_120' && v.total > 120) || (test === 'toefl_6' && v.total > 6)))) throw new InputError('Invalid language rule');
  }
  return p;
}
