import test from 'node:test';
import assert from 'node:assert/strict';
import { matchProgramme } from '../server/matching.mjs';
import { validateProfile, InputError, isOfficialUrl } from '../server/validation.mjs';

// Synthetic fixtures only. These are not real admissions requirements.
const source = 'https://prog-crs.hkust.edu.hk/pgprog/2026-27/msc-meng-disc';
const rules = [
  { kind: 'degree', labelZh: '测试学位', labelEn: 'Test degree', sourceUrl: source },
  { kind: 'major', labelZh: '测试专业', labelEn: 'Test major', accepted: ['Civil Engineering'], relatedAllowed: true, sourceUrl: source },
  { kind: 'gpa', labelZh: '测试 GPA', labelEn: 'Test GPA', min: 3, scale: 4, sourceUrl: source },
  { kind: 'language', labelZh: '测试语言', labelEn: 'Test language', tests: { ielts: { total: 6.5, componentMin: 5.5 }, toefl_120: { total: 80, validBefore: '2026-01-21' }, toefl_6: { total: 4.5, validFrom: '2026-01-21' } }, singleAttempt: true, atHomeAccepted: false, sourceUrl: source },
];
const programme = { id: 'HK-HKUST-P999', rules, officialUrl: source, verification: 'peer_reviewed', requirementsCoverage: 'complete', admissionRoute: 'direct' };
const profile = { major: 'Civil Engineering', degreeStatus: 'graduated', classification: 'second_upper', gpa: 3.5, gpaScale: 4, experienceYears: null, language: { type: 'ielts', total: 7, components: { listening: 6.5, reading: 6.5, writing: 6.5, speaking: 6.5 }, singleAttempt: true, atHome: false, testDate: '2025-09-01' } };
const clone = value => structuredClone(value);
test('fully reviewed synthetic rules show a margin tier without a probability', () => { const r = matchProgramme(programme, profile); assert.equal(r.status, 'meets_checked'); assert.equal(r.tier, 'relatively_safer'); assert.equal('probability' in r, false); });
test('exact minima are match, not relatively safer', () => { const p = clone(profile); p.gpa = 3; p.language.total = 6.5; assert.equal(matchProgramme(programme, p).tier, 'match'); });
test('a known preferred gap produces stretch only when mandatory criteria pass', () => { const p = clone(programme); p.rules.push({ kind: 'experience', min: 2, mandatory: false, labelZh: '测试偏好', labelEn: 'Synthetic preference', sourceUrl: source }); const v = clone(profile); v.experienceYears = 1; assert.equal(matchProgramme(p, v).tier, 'stretch'); });
test('a mandatory gap never becomes stretch', () => { const p = clone(profile); p.gpa = 2.9; const r = matchProgramme(programme, p); assert.equal(r.status, 'has_gap'); assert.equal(r.tier, null); });
test('IELTS total pass with one component gap is a failure', () => { const p = clone(profile); p.language.components.writing = 5; const r = matchProgramme(programme, p); assert.equal(r.status, 'has_gap'); assert.match(r.checks.find(c => c.kind === 'language').reasonEn, /writing/); });
test('zero component is a real score and not missing', () => { const p = clone(profile); p.language.components.writing = 0; assert.equal(matchProgramme(programme, p).status, 'has_gap'); });
test('different GPA scales stay unresolved, never linearly converted', () => { const p = clone(profile); p.gpa = 85; p.gpaScale = 100; const r = matchProgramme(programme, p); assert.equal(r.status, 'needs_confirmation'); assert.equal(r.tier, null); });
test('missing GPA stays unresolved', () => { const p = clone(profile); p.gpa = null; p.gpaScale = null; assert.equal(matchProgramme(programme, p).status, 'needs_confirmation'); });
test('related-field admission is not assumed', () => { const p = clone(profile); p.major = 'Computer Science'; assert.equal(matchProgramme(programme, p).status, 'needs_confirmation'); });
test('closed-list mismatch is a known gap', () => { const pg = clone(programme); pg.rules[1].relatedAllowed = false; const p = clone(profile); p.major = 'Accounting'; assert.equal(matchProgramme(pg, p).status, 'has_gap'); });
test('Chinese major alias works without changing the academic scale', () => { const p = clone(profile); p.major = '土木工程'; assert.equal(matchProgramme(programme, p).status, 'meets_checked'); });
test('honours is not inferred from GPA', () => { const pg = clone(programme); pg.rules[2] = { kind: 'classification', min: 'second_lower', labelZh: '测试荣誉', labelEn: 'Test honours', sourceUrl: source }; const p = clone(profile); p.classification = 'unknown'; assert.equal(matchProgramme(pg, p).status, 'needs_confirmation'); });
test('missing single-attempt confirmation stays unresolved', () => { const p = clone(profile); p.language.singleAttempt = false; assert.equal(matchProgramme(programme, p).status, 'needs_confirmation'); });
test('at-home version fails when the rule explicitly excludes it', () => { const p = clone(profile); p.language.atHome = true; assert.equal(matchProgramme(programme, p).status, 'has_gap'); });
test('waiver selections require confirmation', () => { const p = clone(profile); p.language.type = 'waiver'; assert.equal(matchProgramme(programme, p).status, 'needs_confirmation'); });
test('new TOEFL scale applies only to dates on or after the change', () => { const p = clone(profile); p.language = { type: 'toefl_6', total: 5, testDate: '2026-02-01', singleAttempt: true }; assert.equal(matchProgramme(programme, p).status, 'meets_checked'); });
test('TOEFL scale/date conflicts are rejected', () => { const p = clone(profile); p.language = { type: 'toefl_120', total: 90, testDate: '2026-02-01' }; assert.throws(() => validateProfile(p), InputError); });
test('missing TOEFL date remains unresolved', () => { const p = clone(profile); p.language = { type: 'toefl_6', total: 5, singleAttempt: true }; assert.equal(matchProgramme(programme, p).status, 'needs_confirmation'); });
test('a known failure and missing component are both retained', () => { const p = clone(profile); p.language.total = 5; p.language.components.reading = null; const r = matchProgramme(programme, p); assert.equal(r.status, 'has_gap'); assert.ok(r.counts.unknown > 0); });
test('catalogue seeds cannot produce admission conclusions or tiers', () => { const pg = { ...programme, verification: 'catalogue_seed' }; const r = matchProgramme(pg, profile); assert.equal(r.status, 'needs_confirmation'); assert.equal(r.tier, null); assert.equal(r.counts.pass, 0); });
test('partially checked pages remain unresolved', () => { assert.equal(matchProgramme({ ...programme, requirementsCoverage: 'partial' }, profile).status, 'needs_confirmation'); });
test('no independent review means no recommendation tier', () => { assert.equal(matchProgramme({ ...programme, verification: 'programme_page_checked' }, profile).tier, null); });
test('transfer-only routes cannot be presented as direct eligibility', () => { assert.equal(matchProgramme({ ...programme, admissionRoute: 'transfer_only' }, profile).status, 'has_gap'); });
test('invalid, overflow and half-step scores are rejected', () => { for (const total of [9.5, -1, 6.7, '7']) { const p = clone(profile); p.language.total = total; assert.throws(() => validateProfile(p), InputError); } });
test('GPA above scale is rejected', () => { assert.throws(() => validateProfile({ ...profile, gpa: 4.1 }), InputError); });
test('invalid dates are validation errors, not server crashes', () => { const p = clone(profile); p.language.testDate = '2026-13-01'; assert.throws(() => validateProfile(p), InputError); });
test('source domains cannot be spoofed with suffixes or URL credentials', () => { assert.equal(isOfficialUrl(source), true); assert.equal(isOfficialUrl('https://hkust.edu.hk.attacker.invalid/test'), false); assert.equal(isOfficialUrl('https://attacker@hkust.edu.hk/test'), false); assert.equal(isOfficialUrl('javascript:alert(1)'), false); });
test('an open-to-any-major rule does not prove a relevant-background margin', () => { const pg = clone(programme); pg.rules[1].any = true; assert.equal(matchProgramme(pg, profile).tier, 'match'); });
