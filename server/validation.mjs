import { validApplicationRounds } from './application-rounds.mjs';

export class InputError extends Error {
  constructor(message, status = 422) { super(message); this.status = status; }
}

const isIsoDate = value => { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const d = new Date(value); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value; };

const bounded = (value, min, max, label, step) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (step && Math.abs(value / step - Math.round(value / step)) > 0.00001)) throw new InputError(`${label} is outside the allowed range or has an invalid increment.`);
  return value;
};
export function validateProfile(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new InputError('A valid background profile is required.');
  const major = String(input.major || '').trim();
  if (!major || major.length > 120) throw new InputError('Please enter your undergraduate major, using no more than 120 characters.');
  const degreeStatus = ['graduated', 'final_year', 'other'].includes(input.degreeStatus) ? input.degreeStatus : 'other';
  const classifications = ['unknown', 'ordinary', 'third', 'second_lower', 'second_upper', 'first'];
  const classification = classifications.includes(input.classification) ? input.classification : 'unknown';
  const gpa = bounded(input.gpa, 0, 100, 'GPA');
  const gpaScale = bounded(input.gpaScale, 1, 100, 'GPA scale');
  if ((gpa === null) !== (gpaScale === null)) throw new InputError('Please provide GPA and its original scale together, or leave both blank.');
  if (gpa !== null && gpa > gpaScale) throw new InputError('GPA cannot exceed the original scale maximum.');
  const languageInput = input.language || {};
  if (!['none', 'ielts', 'toefl_120', 'toefl_6', 'waiver'].includes(languageInput.type || 'none')) throw new InputError('Unknown language test or waiver route.');
  const type = languageInput.type || 'none';
  const max = type === 'toefl_120' ? 120 : type === 'toefl_6' ? 6 : 9;
  // ETS reports the updated TOEFL overall score on 1–6, not 0–6.
  const total = bounded(languageInput.total, type === 'toefl_6' ? 1 : 0, max, 'Language score', type === 'ielts' || type === 'toefl_6' ? 0.5 : 1);
  const components = {};
  for (const name of ['listening', 'reading', 'writing', 'speaking']) components[name] = bounded(languageInput.components?.[name], type === 'toefl_6' ? 1 : 0, type === 'toefl_120' ? 30 : type === 'toefl_6' ? 6 : 9, name, type === 'toefl_120' ? 1 : 0.5);
  const testDate = languageInput.testDate || null;
  if (testDate && !isIsoDate(testDate)) throw new InputError('Please enter a valid test date in YYYY-MM-DD format.');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  if (testDate && testDate > today) throw new InputError('The test date cannot be in the future.');
  if (testDate && ((type === 'toefl_120' && testDate >= '2026-01-21') || (type === 'toefl_6' && testDate < '2026-01-21'))) throw new InputError('The TOEFL score scale conflicts with the test date.');
  const experiences = bounded(input.experienceYears, 0, 60, 'Experience');
  return { major, degreeStatus, classification, gpa, gpaScale, experienceYears: experiences, language: { type, total, components, testDate, atHome: !!languageInput.atHome, singleAttempt: languageInput.singleAttempt === true, waiverBasis: ['first_language', 'english_degree'].includes(languageInput.waiverBasis) ? languageInput.waiverBasis : null } };
}

// Duke-NUS is a school of NUS (NUS Bulletin AY2026/27), not a fifteenth university.
export const universityDomains = ['cityu.edu.hk', 'hkbu.edu.hk', 'ln.edu.hk', 'cuhk.edu.hk', 'eduhk.hk', 'polyu.edu.hk', 'hkust.edu.hk', 'ust.hk', 'hku.hk', 'nus.edu.sg', 'duke-nus.edu.sg', 'ntu.edu.sg', 'smu.edu.sg', 'sutd.edu.sg', 'singaporetech.edu.sg', 'suss.edu.sg'];
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
  if (p.scope !== undefined) validateScopeDecision(p.scope);
  if (p.directoryListing !== undefined) validateDirectoryListing(p.directoryListing);
  if (!Array.isArray(p.offerings) || !Array.isArray(p.rules)) throw new InputError('Offerings and rules must be arrays');
  if (!p.offerings.length || new Set(p.offerings.map(o => o.id)).size !== p.offerings.length) throw new InputError('Missing or duplicate offerings');
  for (const o of p.offerings) {
    if (o.applicationAvailability !== undefined) {
      const a = o.applicationAvailability;
      if (!a || Object.keys(a).some(k => !['status', 'sourceUrl', 'checkedOn'].includes(k)) || a.status !== 'closed' || !isOfficialUrl(a.sourceUrl) || a.sourceUrl !== p.officialUrl || !isIsoDate(a.checkedOn) || !isIsoDate(p.lastChecked) || a.checkedOn > p.lastChecked || !['programme_page_checked', 'peer_reviewed'].includes(p.verification) || !Array.isArray(p.sources) || !p.sources.some(s => s?.url === a.sourceUrl && s.checkedOn === a.checkedOn)) throw new InputError('Closed-intake availability requires a dated checked programme source');
    }
    if (typeof o.id !== 'string' || !o.id.startsWith(`${p.id}-`)) throw new InputError('Offering ID must belong to the programme');
    if (o.tuition !== null && o.tuition !== undefined && (!Number.isFinite(o.tuition) || o.tuition < 0 || !o.currency)) throw new InputError('Invalid tuition amount or missing currency');
    if (o.deadline && !isIsoDate(o.deadline)) throw new InputError('A dated deadline must use YYYY-MM-DD; recurring dates belong in deadlineNote');
    if (o.applicationOpen && (!isIsoDate(o.applicationOpen) || (o.deadline && o.applicationOpen > o.deadline))) throw new InputError('Application opening date must be valid and no later than its deadline');
    if (o.deadlineNote !== null && o.deadlineNote !== undefined && (typeof o.deadlineNote !== 'string' || o.deadlineNote.length > 2000)) throw new InputError('Invalid deadline note');
    if (!validApplicationRounds(o.applicationRounds, o)) throw new InputError('Invalid application rounds or final deadline');
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
    if (r.kind === 'language') for (const [test, v] of Object.entries(r.tests)) {
      const max = test === 'toefl_120' ? 30 : test === 'toefl_6' ? 6 : 9;
      const valid = value => Number.isFinite(value) && value >= (test === 'toefl_6' ? 1 : 0) && value <= max && Number.isInteger(value * (test === 'toefl_120' ? 1 : 2));
      if (v.atHomeAccepted !== undefined && typeof v.atHomeAccepted !== 'boolean') throw new InputError('Invalid examination-specific at-home policy');
      if (v.componentMin !== undefined && !valid(v.componentMin)) throw new InputError('Invalid language component minimum');
      if (v.componentMins !== undefined && (!v.componentMins || typeof v.componentMins !== 'object' || Array.isArray(v.componentMins) || !Object.keys(v.componentMins).length || Object.entries(v.componentMins).some(([name, value]) => !['listening','reading','writing','speaking'].includes(name) || !valid(value)))) throw new InputError('Invalid named language component minima');
    }
    if (r.appliesTo !== undefined) {
      const a = r.appliesTo;
      if (!a || typeof a !== 'object' || Array.isArray(a) || !Array.isArray(a.offeringIds) || !a.offeringIds.length || new Set(a.offeringIds).size !== a.offeringIds.length || typeof a.labelEn !== 'string' || !a.labelEn.trim() || a.labelEn.length > 200 || typeof a.academicYear !== 'string' || !isIsoDate(a.checkedOn) || a.checkedOn > p.lastChecked || !Array.isArray(p.sources) || !p.sources.some(s => s.url === r.sourceUrl && s.checkedOn === a.checkedOn) || a.offeringIds.some(id => !p.offerings.some(o => o.id === id && (o.academicYear || p.academicYear) === a.academicYear))) throw new InputError('Requirement scope needs exact owned offerings, academic year and dated source evidence');
    }
    if (r.testDateNotBefore !== undefined || r.testDateSourceUrl !== undefined) {
      if (r.kind !== 'language' || !isIsoDate(r.testDateNotBefore) || !isOfficialUrl(r.testDateSourceUrl) || r.validityMonths !== undefined) throw new InputError('Explicit test-date minimum requires a valid date and official source, without rolling expiry');
    }
  }
  if (p.sources !== undefined && (!Array.isArray(p.sources) || p.sources.some(s => !isOfficialUrl(s.url) || !isIsoDate(s.checkedOn) || typeof s.purpose !== 'string'))) throw new InputError('Invalid programme evidence sources');
  if (p.fieldStatus !== undefined) {
    if (!p.fieldStatus || typeof p.fieldStatus !== 'object' || Array.isArray(p.fieldStatus)) throw new InputError('Invalid field coverage');
    const fields = new Set(['academicYear', 'major', 'gpa', 'language', 'tuition', 'deadline', 'independentReview']);
    if (Object.keys(p.fieldStatus).some(key => !fields.has(key))) throw new InputError('Unsupported field coverage key');
    for (const f of Object.values(p.fieldStatus)) if (!f || !['known', 'not_published', 'not_applicable', 'unknown'].includes(f.status) || typeof f.noteEn !== 'string' || f.noteEn.length > 2000 || !isOfficialUrl(f.sourceUrl)) throw new InputError('Invalid field coverage or evidence URL');
  }
  return p;
}

export function validateDirectoryAudit(audit, universityIds) {
  if (audit?.schemaVersion !== 1 || !isIsoDate(audit.checkedOn) || !Array.isArray(audit.universities) || audit.universities.length !== universityIds.size || new Set(audit.universities.map(u => u?.universityId)).size !== universityIds.size || audit.universities.some(u => !u)) throw new InputError('Invalid directory audit');
  for (const u of audit.universities) {
    if (!universityIds.has(u.universityId) || !isOfficialUrl(u.directoryUrl) || !['entry_checked', 'search_index_checked', 'access_limited'].includes(u.entryStatus) || !['pending', 'entries_enumerated', 'complete_for_consulted_directory'].includes(u.enumerationStatus) || !isIsoDate(u.checkedOn) || typeof u.noteEn !== 'string') throw new InputError('Invalid directory audit entry');
    if (u.confirmedProgrammeCount !== null && (!Number.isInteger(u.confirmedProgrammeCount) || u.confirmedProgrammeCount < 0 || u.enumerationStatus !== 'complete_for_consulted_directory')) throw new InputError('Directory count requires completed enumeration');
    if (u.enumerationStatus === 'complete_for_consulted_directory' && u.confirmedProgrammeCount === null) throw new InputError('Completed enumeration requires a count');
  }
  return audit;
}

export function validateScopeDecision(scope) {
  if (!scope || !['out_of_scope', 'in_scope', 'unconfirmed'].includes(scope.status) || !isIsoDate(scope.checkedOn) || !isOfficialUrl(scope.sourceUrl) || typeof scope.reasonEn !== 'string' || !scope.reasonEn.trim() || scope.reasonEn.length > 2000) throw new InputError('Invalid scope decision or evidence');
  return scope;
}

export function validateDirectoryListing(listing) {
  if (!listing || typeof listing.nameEn !== 'string' || !listing.nameEn.trim() || listing.nameEn.length > 300 || !isIsoDate(listing.checkedOn) || !isOfficialUrl(listing.sourceUrl) || !isOfficialUrl(listing.programmeUrl) || typeof listing.noteEn !== 'string' || listing.noteEn.length > 2000 || !Array.isArray(listing.variants) || listing.variants.length > 50) throw new InputError('Invalid directory listing evidence');
  for (const v of listing.variants) if (!v || typeof v.nameEn !== 'string' || !v.nameEn.trim() || v.nameEn.length > 300 || !isOfficialUrl(v.officialUrl)) throw new InputError('Invalid directory route evidence');
  return listing;
}
export function validateScopeAudit(audit, programmeIds) {
  if (audit?.schemaVersion !== 1 || !isIsoDate(audit.checkedOn) || !Array.isArray(audit.decisions) || audit.decisions.length > 1000 || new Set(audit.decisions.map(d => d?.programmeId)).size !== audit.decisions.length) throw new InputError('Invalid scope audit');
  for (const d of audit.decisions) {
    if (!programmeIds.has(d?.programmeId)) throw new InputError('Scope audit refers to an unknown programme');
    validateScopeDecision(d);
  }
  return audit;
}
