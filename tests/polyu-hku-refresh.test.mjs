import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CatalogueStore } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { programmeTimeline } from '../server/application-dates.mjs';
import { validApplicationRounds } from '../server/application-rounds.mjs';
import { matchProgramme } from '../server/matching.mjs';
import { optionSnapshot, shortlistExport } from '../public/saved-options.js';

const root = new URL('../', import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const batch = read('data/checked-programmes.json'), observed = read('data/research/polyu-hku-observation-2026-10-23.json');
const py = batch.programmes.find(p => p.id === observed.polyu.programmeId), hk = batch.programmes.find(p => p.id === observed.hku.programmeId);
const manual = (p, label) => p.rules.find(r => r.kind === 'manual' && r.labelEn === label);
const profile = { major: 'Urban Planning', degreeStatus: 'graduated', classification: 'first', gpa: 3.8, gpaScale: 4, experienceYears: 0, language: { type: 'ielts', total: 7, components: { listening: 7, reading: 7, writing: 7, speaking: 7 }, singleAttempt: true, testDate: '2026-05-01' } };
const check = (p, language) => matchProgramme(p, { ...profile, language }).checks.find(c => c.kind === 'language');

test('two PolyU/HKU refreshes retain partial evidence, stable study IDs and unrelated observation dates', () => {
  assert.deepEqual(batch.programmes.filter(p => p.researchBatch === 'polyu-hku-refresh-2026-10-23').map(p => p.id), [py.id, hk.id]);
  for (const p of [py, hk]) {
    assert.equal(p.lastChecked, observed.checkedOn); assert.ok(p.sources.every(s => s.checkedOn === observed.checkedOn));
    assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.verification, 'programme_page_checked'); assert.equal(p.reviewer, null);
    assert.equal(matchProgramme(p, profile).tier, null);
  }
  assert.deepEqual(py.offerings.map(o => o.id), [py.id + '-O1', py.id + '-O2']); assert.deepEqual(hk.offerings.map(o => o.id), [hk.id + '-O1']);
  assert.equal(batch.programmes.find(p => p.id === 'HK-EDUHK-P001').lastChecked, '2026-10-30');
  assert.equal(batch.programmes.find(p => p.id === 'SG-NUS-P029').lastChecked, '2026-10-22');
});

test('PolyU has a central opening and exactly two date-only programme rounds for both study loads', () => {
  for (const o of py.offerings) {
    assert.equal(o.applicationOpen, '2026-07-02'); assert.equal(o.deadline, '2027-02-25');
    assert.equal(o.academicYear, '2027/28'); assert.equal(o.intake, 'September 2027');
    assert.equal(validApplicationRounds(o.applicationRounds, o), true);
    assert.deepEqual(o.applicationRounds.map(r => [r.id, r.deadline]), [['EARLY', '2026-10-20'], ['MAIN', '2027-02-25']]);
    assert.ok(o.applicationRounds.every(r => r.applicationOpen === null && r.deadlineAt === null));
    assert.match(o.deadlineNote, /same for local\/non-local/);
  }
  assert.match(manual(py, 'Referral deadline wording and rolling selection').noteEn, /alumni-referral subsection/);
  assert.match(manual(py, 'Referral deadline wording and rolling selection').noteEn, /not additional application rounds/);
});

test('PolyU early cutoff advances to the main cutoff without claiming a guaranteed open place', () => {
  for (const [day, state, next] of [['2026-07-01', 'not_yet_open', 'EARLY'], ['2026-10-20', 'within_recorded_dates', 'EARLY'], ['2026-10-23', 'within_recorded_dates', 'MAIN'], ['2027-02-25', 'deadline_today', 'MAIN'], ['2027-02-26', 'deadline_passed', null]]) {
    const t = programmeTimeline(py, day); assert.equal(t.state, state); assert.equal(t.livePortalChecked, false);
    assert.ok(t.offerings.every(o => o.nextRoundId === next && o.sourceCheckedOn === observed.checkedOn));
  }
  const now = programmeTimeline(py, '2026-10-23').offerings[0];
  assert.equal(now.rounds[0].state, 'deadline_passed'); assert.equal(now.rounds[1].state, 'cutoff_ahead');
});

test('PolyU charges 36 of 43 credits and keeps summer costs and the non-MBA application fee separate', () => {
  assert.equal(observed.polyu.tuition.degreeCredits, 43);
  for (const o of py.offerings) {
    assert.equal(o.tuition, 424800); assert.equal(o.tuition, 36 * 11800); assert.notEqual(o.tuition, 43 * 11800);
    assert.equal(o.applicationFee, 600); assert.match(o.feeBasis, /1 ethics credit.*6 external credits/);
    assert.match(o.feeBasis, /excluding external summer-school/); assert.match(o.feeBasis, /No automatic scholarship discount/);
  }
  assert.match(py.offerings[0].duration, /1 year, including summer term/); assert.match(py.offerings[1].duration, /2 years, including summer term/);
});

test('PolyU English scales, single sitting and excluded home variants stay distinct from HKU subtest rules', () => {
  const language = py.rules.find(r => r.kind === 'language');
  assert.equal(language.tests.ielts.total, 6); assert.equal(language.tests.ielts.componentMin, undefined);
  assert.equal(language.singleAttempt, true); assert.equal(language.atHomeAccepted, false); assert.equal(language.validityMonths, undefined);
  assert.equal(check(py, { ...profile.language, singleAttempt: false }).status, 'unknown');
  assert.equal(check(py, { ...profile.language, atHome: true }).status, 'fail');
  assert.equal(check(py, { type: 'toefl_120', total: 80, testDate: '2026-01-20', singleAttempt: true }).status, 'pass');
  assert.equal(check(py, { type: 'toefl_6', total: 4.5, testDate: '2026-01-21', singleAttempt: true }).status, 'pass');
  assert.equal(check(py, { type: 'toefl_6', total: 4, testDate: '2026-01-21', singleAttempt: true }).status, 'fail');
  assert.match(manual(py, 'English applicability, validity and excluded variants').noteEn, /exact validity reference date.*need confirmation/);
});

test('PolyU BM does not inherit neighbouring doctorate employment rules or make scholarships admission requirements', () => {
  assert.equal(py.rules.find(r => r.kind === 'major').any, true);
  assert.equal(py.rules.some(r => ['gpa', 'experience', 'classification'].includes(r.kind)), false);
  const documents = manual(py, 'Academic recognition, documents and selection').noteEn;
  assert.match(documents, /02022/); assert.match(documents, /grading system\/conversion table/); assert.match(documents, /not authority.*convert GPA/);
  assert.match(manual(py, 'International experience, mode and scholarship scope').noteEn, /full-time only, not part-time/);
  assert.match(manual(py, 'International experience, mode and scholarship scope').noteEn, /not admission requirements/);
  assert.equal(matchProgramme(py, profile).status, 'needs_confirmation');
});

test('HKU exact noon cutoff works without an invented opening, early round or clearing round', () => {
  const o = hk.offerings[0]; assert.equal(o.applicationOpen, null); assert.equal(o.deadline, '2027-01-04');
  assert.deepEqual(o.applicationRounds, [{ id: 'MAIN', label: 'Main round', applicationOpen: null, deadline: '2027-01-04', deadlineAt: '2027-01-04T12:00:00+08:00' }]);
  assert.equal(programmeTimeline(hk, '2026-10-23').state, 'dates_incomplete');
  const before = programmeTimeline(hk, '2027-01-04', '2027-01-04T03:59:59.000Z').offerings[0];
  assert.equal(before.rounds[0].state, 'cutoff_ahead'); assert.equal(before.nextRoundId, 'MAIN');
  assert.equal(programmeTimeline(hk, '2027-01-04').offerings[0].rounds[0].state, 'deadline_today');
  const noon = programmeTimeline(hk, '2027-01-04', '2027-01-04T04:00:00.000Z').offerings[0];
  assert.equal(noon.rounds[0].state, 'cutoff_reached'); assert.equal(noon.nextRoundId, null);
  assert.equal(programmeTimeline(hk, '2027-01-05').state, 'deadline_passed');
  assert.match(o.deadlineNote, /rolling review is not a dated early round/);
});

test('HKU one-year proposed tuition is not doubled, discounted or paired with an undated application fee', () => {
  const o = hk.offerings[0]; assert.equal(o.duration, '1 year'); assert.equal(o.tuition, 252000);
  assert.equal(o.tuition, observed.hku.fee.eachInstalmentHkd * observed.hku.fee.instalments);
  assert.match(o.feeBasis, /subject to University approval/); assert.match(o.feeBasis, /No automatic scholarship deduction/);
  assert.equal(o.applicationFee, null); assert.match(o.feeBasis, /HKD 300 is not bound to this intake/);
  assert.match(manual(hk, 'Current application-fee and approval confirmation').noteEn, /not readable/);
});

test('HKU score validity is cohort-anchored with real component gaps and independent TOEFL scale boundaries', () => {
  const language = hk.rules.find(r => r.kind === 'language');
  assert.equal(language.testDateNotBefore, '2025-09-01'); assert.equal(language.testDateSourceUrl, observed.sources.hkuAdmission);
  assert.equal(language.validityMonths, undefined); assert.equal(language.atHomeAccepted, undefined); assert.equal(language.singleAttempt, undefined);
  assert.equal(language.tests.toefl_120.componentMin, undefined);
  assert.equal(check(hk, { ...profile.language, testDate: '2025-08-31' }).status, 'fail');
  assert.equal(check(hk, { ...profile.language, testDate: '2025-09-01' }).status, 'pass');
  assert.equal(check(hk, { ...profile.language, testDate: null }).status, 'unknown');
  assert.equal(check(hk, { ...profile.language, components: { ...profile.language.components, writing: 5 } }).status, 'fail');
  assert.equal(check(hk, { ...profile.language, components: { ...profile.language.components, writing: null } }).status, 'unknown');
  assert.equal(check(hk, { type: 'toefl_120', total: 80, testDate: '2026-01-20' }).status, 'pass');
  assert.equal(check(hk, { type: 'toefl_6', total: 4.5, testDate: '2026-01-21' }).status, 'pass');
  assert.equal(check(hk, { type: 'toefl_6', total: 4, testDate: '2026-01-21' }).status, 'fail');
});

test('HKU urban-field equivalence, preferred qualification and professional membership never become invented hard thresholds', () => {
  assert.equal(hk.rules.some(r => ['gpa', 'experience', 'classification', 'major'].includes(r.kind)), false);
  assert.match(manual(hk, 'Urban-field equivalence and qualifying examination').noteEn, /professional qualification is preferred, not mandatory/);
  assert.match(manual(hk, 'Certified documents, referees and interview').noteEn, /two referees/);
  assert.match(manual(hk, 'Certified documents, referees and interview').noteEn, /not an entry work-year requirement/);
  assert.match(manual(hk, 'English applicability, alternatives and validity boundary').noteEn, /Faculty of Arts.*do not apply/);
  assert.equal(matchProgramme(hk, profile).status, 'needs_confirmation');
  assert.equal(matchProgramme(hk, { ...profile, language: { type: 'waiver', waiverBasis: 'english_degree' } }).checks.find(c => c.kind === 'language').status, 'unknown');
});

const store = new CatalogueStore(':memory:', { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) });
let clock = new Date('2026-10-23T04:00:00Z');
const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: new URL('data/route-programmes.json', root), applicantEvidencePath: new URL('data/applicant-contexts.json', root), now: () => clock });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${app.address().port}`;
const get = async path => { const r = await fetch(baseUrl + path); assert.equal(r.status, 200); return r.json(); };
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('real catalogue, detail, matching and export retain fee bases and exact cutoff evidence without changing source dates', async () => {
  for (const p of [py, hk]) {
    const detail = await get(`/api/programmes/${p.id}?offering=${p.id}-O1`);
    const list = await get(`/api/catalogue?school=${p.universityId}&limit=100`);
    const card = list.items.find(c => c.id === p.id); assert.equal(card.lastChecked, observed.checkedOn);
    assert.equal(card.offerings[0].tuition, p.offerings[0].tuition); assert.equal(detail.offerings[0].applicationFee, p.offerings[0].applicationFee);
    const r = await fetch(baseUrl + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, filters: { school: p.universityId } }) });
    assert.equal(r.status, 200); const item = (await r.json()).items.find(c => c.id === p.id);
    assert.equal(item.match.tier, null); assert.equal(item.match.status, 'needs_confirmation');
    const exported = shortlistExport([detail]).programmes[0]; assert.equal(exported.evidence.lastChecked, observed.checkedOn);
    assert.deepEqual(exported.offerings[0].applicationRounds, detail.offerings[0].applicationRounds);
    assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined);
  }
  try {
    clock = new Date('2027-01-04T03:59:59Z'); const before = await get(`/api/programmes/${hk.id}`);
    clock = new Date('2027-01-04T04:00:00Z'); const after = await get(`/api/programmes/${hk.id}?asOfInstant=2099-01-01T00:00:00.000Z`);
    assert.equal(before.applicationTimeline.offerings[0].nextRoundId, 'MAIN');
    assert.equal(after.applicationTimeline.offerings[0].rounds[0].state, 'cutoff_reached');
    assert.equal(after.applicationTimeline.offerings[0].nextRoundId, null); assert.equal(after.lastChecked, before.lastChecked);
    assert.equal(after.applicationTimeline.livePortalChecked, false);
  } finally { clock = new Date('2026-10-23T04:00:00Z'); }
});

test('saved choices reload refreshed mode facts and read-only access leaves quality and context counts unchanged', async () => {
  const before = JSON.stringify([store.get(py.id), store.get(hk.id)]);
  const detail = await get(`/api/programmes/${py.id}?offering=${py.id}-O2`), saved = optionSnapshot(detail);
  const r = await fetch(baseUrl + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [saved] }) });
  assert.equal(r.status, 200); const item = (await r.json()).items[0]; assert.equal(item.status, 'resolved');
  assert.equal(item.programme.selectedOffering.id, py.id + '-O2'); assert.equal(item.programme.offerings[0].applicationFee, 600);
  assert.match(item.programme.offerings[0].duration, /2 years, including summer term/);
  assert.equal(shortlistExport([item.programme], { [py.id]: saved }).programmes[0].rememberedChoice, true);
  const meta = await get('/api/meta'); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 865);
  assert.equal(meta.quality.checked, 345); assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0);
  assert.deepEqual(meta.applicantEvidence, { studyOptions: 228, categories: 457, peerReviewed: 0 });
  assert.equal(JSON.stringify([store.get(py.id), store.get(hk.id)]), before);
});
