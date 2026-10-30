import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CatalogueStore } from '../server/database.mjs';
import { createApp, filterProgrammes } from '../server/app.mjs';
import { loadRoutes, resolveProgramme } from '../server/routes.mjs';
import { loadApplicantContexts, applicantSummary, offeringFingerprint } from '../server/applicants.mjs';
import { programmeTimeline } from '../server/application-dates.mjs';
import { matchProgramme } from '../server/matching.mjs';
import { optionSnapshot, shortlistExport } from '../public/saved-options.js';

const root = new URL('../', import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const batch = read('data/checked-programmes.json'), obs = read('data/research/hkust-sit-observation-2026-10-24.json');
const hk = batch.programmes.find(p => p.id === obs.hkust.programmeId), sit = batch.programmes.find(p => p.id === obs.sit.programmeId);
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) });
const routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
const resolve = (number, category) => resolveProgramme(store.get(hk.id), routes, undefined, hk.id + '-O' + number, category && hk.id + '-O' + number + '-' + category, contexts);
const manual = (p, label) => p.rules.find(r => r.kind === 'manual' && r.labelEn === label);
const profile = { major: 'Civil Engineering', degreeStatus: 'graduated', classification: 'first', gpa: 3.8, gpaScale: 4, experienceYears: 2, language: { type: 'ielts', total: 7, components: { listening: 6, reading: 6, writing: 6, speaking: 6 }, singleAttempt: true, testDate: '2026-05-01' } };
const languageCheck = language => matchProgramme(hk, { ...profile, language }).checks.find(c => c.kind === 'language');

test('HKUST and SIT refresh exactly two partial records from actual 24 October source readings', () => {
  assert.deepEqual(batch.programmes.filter(p => p.researchBatch === 'hkust-sit-refresh-2026-10-24').map(p => p.id), [hk.id, sit.id]);
  for (const p of [hk, sit]) {
    assert.equal(p.lastChecked, obs.checkedOn); assert.ok(p.sources.every(s => s.checkedOn === obs.checkedOn));
    assert.equal(p.verification, 'programme_page_checked'); assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.reviewer, null);
    assert.deepEqual(p.offerings.map(o => o.id), [p.id + '-O1', p.id + '-O2']);
  }
  assert.equal(store.get('HK-EDUHK-P001').lastChecked, '2026-10-30');
  assert.equal(store.get('SG-NUS-P029').lastChecked, '2026-10-22');
  assert.equal(hk.academicYear, '2027/28'); assert.equal(hk.officialUrl, obs.sources.hkustCatalogue);
});

test('HKUST mode totals retain instalments and pathway exceptions without annual multiplication or MEng price substitution', () => {
  for (const [i, amount, duration, instalments] of [[0, 270000, '1 year', /two instalments/], [1, 230000, '2–2.5 years', /four instalments/]]) {
    const o = hk.offerings[i]; assert.equal(o.tuition, amount); assert.equal(o.duration, duration); assert.equal(o.applicationFee, 600);
    assert.equal(o.intake, 'September 2027'); assert.equal(o.academicYear, '2027/28'); assert.equal(o.deadline, null); assert.equal(o.applicationOpen, null);
    assert.match(o.feeBasis, instalments); assert.match(o.feeBasis, /not an annual amount/); assert.match(o.feeBasis, /pro-rata exception/);
    assert.match(o.feeBasis, /separate HKD 600 application fee/); assert.equal(o.applicationRounds, undefined);
  }
});

test('HKUST FT and PT category contexts bind complete current offerings and separate local/non-local final cutoffs', () => {
  for (const number of [1, 2]) {
    const context = [...contexts.values()].find(c => c.offeringId === hk.id + '-O' + number);
    assert.equal(context.offeringFingerprint, offeringFingerprint(hk.offerings[number - 1]));
    for (const [category, deadline] of [['LOCAL', '2027-05-15'], ['NONLOCAL', '2027-04-01']]) {
      const p = resolve(number, category), o = p.offerings[0];
      assert.equal(o.tuition, number === 1 ? 270000 : 230000); assert.equal(o.applicationFee, 600); assert.equal(o.deadline, deadline);
      assert.equal(o.applicationOpen, null); assert.deepEqual(o.applicationRounds.map(r => r.deadline), ['2026-12-15', deadline]);
      assert.ok(o.applicationRounds.every(r => r.applicationOpen === null && r.deadlineAt === null));
      assert.equal(p.applicantEvidence.checkedOn, obs.checkedOn); assert.equal(p.applicantEvidence.dateSourceUrl, obs.sources.hkustCatalogue);
    }
  }
});

test('HKUST upcoming rounds do not invent an opening, exact midnight cutoff or shared final date', () => {
  for (const number of [1, 2]) for (const category of ['LOCAL', 'NONLOCAL']) {
    const p = resolve(number, category);
    const first = programmeTimeline(p, '2026-10-24'); assert.equal(first.state, 'dates_incomplete'); assert.equal(first.offerings[0].nextRoundId, 'ROUND-1');
    const second = programmeTimeline(p, '2026-12-16'); assert.equal(second.offerings[0].nextRoundId, 'ROUND-2'); assert.equal(second.state, 'dates_incomplete');
    const cutoff = programmeTimeline(p, category === 'LOCAL' ? '2027-05-15' : '2027-04-01'); assert.equal(cutoff.state, 'deadline_today'); assert.equal(cutoff.livePortalChecked, false);
  }
  assert.equal(programmeTimeline(resolve(1, 'NONLOCAL'), '2027-04-02').state, 'deadline_passed');
  assert.equal(programmeTimeline(resolve(1, 'LOCAL'), '2027-04-02').state, 'dates_incomplete');
  assert.equal(programmeTimeline(resolve(2, 'LOCAL'), '2027-05-16').offerings[0].nextRoundId, null);
});

test('HKUST unselected, foreign-mode and source-stale choices fail closed without a default category', () => {
  for (const number of [1, 2]) {
    const p = resolve(number); assert.equal(p.applicantOptions.length, 2); assert.equal(programmeTimeline(p, '2026-10-24').state, 'applicant_required');
    for (const k of ['tuition', 'applicationFee', 'deadline', 'applicationOpen']) assert.equal(p.offerings[0][k], null);
  }
  assert.throws(() => resolveProgramme(store.get(hk.id), routes, undefined, hk.id + '-O2', hk.id + '-O1-LOCAL', contexts));
  const changed = { ...store.get(hk.id), offerings: hk.offerings.map(o => ({ ...o, academicYear: '2028/29' })) };
  const p = resolveProgramme(changed, routes, undefined, hk.id + '-O1', undefined, contexts);
  assert.equal(p.applicantContextStatus, 'stale'); assert.deepEqual(p.applicantOptions, []);
  assert.throws(() => resolveProgramme(changed, routes, undefined, hk.id + '-O1', hk.id + '-O1-LOCAL', contexts));
});

test('HKUST language versions and honours remain distinct from relatedness, waivers and graduation GGA', () => {
  assert.equal(languageCheck({ ...profile.language, total: 6.5 }).status, 'pass');
  assert.equal(languageCheck({ ...profile.language, components: { ...profile.language.components, writing: 5 } }).status, 'fail');
  assert.equal(languageCheck({ type: 'toefl_6', total: 4.5, testDate: '2026-01-21', singleAttempt: true }).status, 'pass');
  assert.equal(languageCheck({ type: 'toefl_120', total: 80, testDate: '2026-01-20', singleAttempt: true }).status, 'pass');
  assert.throws(() => languageCheck({ type: 'toefl_120', total: 80, testDate: '2026-01-21', singleAttempt: true }), /scale conflicts/);
  assert.equal(languageCheck({ ...profile.language, atHome: true }).status, 'fail');
  assert.equal(languageCheck({ type: 'waiver' }).status, 'unknown');
  assert.equal(hk.rules.some(r => r.kind === 'gpa'), false); assert.equal(hk.rules.find(r => r.kind === 'classification').min, 'second_lower');
  assert.equal(matchProgramme(hk, { ...profile, classification: 'ordinary' }).status, 'has_gap');
  assert.equal(matchProgramme(hk, { ...profile, major: 'Mechanical Engineering' }).checks.find(c => c.kind === 'major').status, 'unknown');
  assert.match(manual(hk, 'Recognised qualification, related engineering field and remedial courses').noteEn, /2.850.*graduation, not admission/);
});

test('MEng archive remains a 2026 transfer identity while new MSc notes preserve restricted pathway and fee exceptions', () => {
  const meng = store.get('HK-HKUST-P003'); assert.equal(meng.lastChecked, '2026-10-06'); assert.equal(meng.academicYear, '2026/27');
  assert.equal(meng.admissionRoute, 'transfer_only'); assert.equal(meng.offerings[0].id, obs.hkust.meng.archivalIdUnchanged);
  assert.equal(meng.offerings[0].tuition, null); assert.equal(filterProgrammes(store.all()).some(p => p.id === meng.id), false);
  assert.equal(programmeTimeline(meng, '2026-10-24').state, 'excluded'); assert.equal(matchProgramme(meng, profile).tier, null);
  const note = manual(hk, 'MSc-to-MEng transfer and integrated pathway exceptions').noteEn;
  for (const p of [/current MSc/, /not open to new/, /Year 3-or-above/, /at least 21 credits/, /not.*automatically/]) assert.match(note, p);
});

test('SIT explicit September opening and past cutoff stay separate from later administrative dates and academic matching', () => {
  for (const o of sit.offerings) { assert.equal(o.applicationOpen, '2026-09-03'); assert.equal(o.deadline, '2026-09-30'); assert.equal(o.intake, '5 January 2027'); assert.equal(o.applicationRounds, undefined); }
  for (const [day, state] of [['2026-09-02', 'not_yet_open'], ['2026-09-03', 'within_recorded_dates'], ['2026-09-30', 'deadline_today'], ['2026-10-24', 'deadline_passed'], ['2026-11-03', 'deadline_passed']]) {
    const t = programmeTimeline(sit, day); assert.equal(t.state, state); assert.equal(t.livePortalChecked, false);
    assert.ok(t.offerings.every(o => o.sourceCheckedOn === obs.checkedOn));
  }
  assert.equal(matchProgramme(sit, profile).status, 'needs_confirmation'); assert.equal(matchProgramme(sit, profile).tier, null);
  assert.match(sit.offerings[0].deadlineNote, /not extended application deadlines/);
});

test('SIT narrow accreditation, experience relevance, duration and dissertation options do not become invented generic gates', () => {
  assert.deepEqual(sit.offerings.map(o => o.duration), ['3 trimesters', '5 trimesters; overview lists 2 years']);
  assert.equal(sit.rules.some(r => ['gpa', 'classification', 'major'].includes(r.kind)), false);
  assert.equal(sit.rules.find(r => r.kind === 'experience').min, 1);
  assert.equal(matchProgramme(sit, { ...profile, experienceYears: 0 }).checks.find(c => c.kind === 'experience').status, 'fail');
  assert.match(manual(sit, 'Civil Engineering accreditation and generic equivalence wording').noteEn, /does not establish that every Engineering major is accepted/);
  assert.match(manual(sit, 'Relevant post-bachelor experience and IWSP').noteEn, /IWSP/);
  assert.match(manual(sit, 'Study length, curriculum and interview').noteEn, /does not itself make.*research-admission/);
});

test('SIT text-only English guide and undated fee examples stay manual without invented cohort prices or new TOEFL-scale cutoffs', () => {
  assert.equal(obs.sit.english.visualPdfVerified, false); assert.equal(obs.sit.english.guidePagesTextRead, 2);
  assert.equal(sit.rules.some(r => r.kind === 'language'), false); assert.equal(sit.fieldStatus.language.status, 'unknown'); assert.equal(sit.fieldStatus.tuition.status, 'unknown');
  const text = manual(sit, 'English applicability and guide scores pending visual confirmation').noteEn;
  for (const p of [/non-native/, /not taught in English/, /6.0/, /85/, /could not be retrieved/, /No new-scale TOEFL cutoff/]) assert.match(text, p);
  assert.match(manual(sit, 'English validity, alternatives and documents').noteEn, /before application, not today/);
  for (const o of sit.offerings) { assert.equal(o.tuition, null); assert.equal(o.applicationFee, null); assert.match(o.feeBasis, /not use them as an international\/default cohort quote/); }
  assert.equal([...contexts.values()].some(c => c.programmeId === sit.id), false);
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-24T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${app.address().port}`;
const get = async path => { const r = await fetch(baseUrl + path); assert.equal(r.status, 200); return r.json(); };
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('catalogue, detail and matching APIs resolve each HKUST mode/category without leaking another cutoff', async () => {
  for (const number of [1, 2]) for (const category of ['LOCAL', 'NONLOCAL']) {
    const offering = hk.id + '-O' + number, applicant = offering + '-' + category, deadline = category === 'LOCAL' ? '2027-05-15' : '2027-04-01';
    const detail = await get(`/api/programmes/${hk.id}?offering=${offering}&applicant=${applicant}`);
    assert.equal(detail.offerings[0].deadline, deadline); assert.equal(detail.offerings[0].tuition, number === 1 ? 270000 : 230000);
    const qs = new URLSearchParams({ school: 'HK-HKUST', offerings: JSON.stringify({ [hk.id]: offering }), applicants: JSON.stringify({ [hk.id]: applicant }), limit: '100' });
    assert.equal((await get('/api/catalogue?' + qs)).items.find(p => p.id === hk.id).offerings[0].deadline, deadline);
    const r = await fetch(baseUrl + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, filters: { school: 'HK-HKUST' }, selectedOfferings: { [hk.id]: offering }, selectedApplicants: { [hk.id]: applicant } }) });
    assert.equal(r.status, 200); const p = (await r.json()).items.find(p => p.id === hk.id);
    assert.equal(p.offerings[0].deadline, deadline); assert.equal(p.match.tier, null); assert.equal(p.match.status, 'needs_confirmation');
  }
  const none = await get(`/api/programmes/${hk.id}`); assert.ok(none.offerings.every(o => o.tuition === null && o.deadline === null));
  const s = await get(`/api/programmes/${sit.id}`); assert.equal(s.applicationTimeline.state, 'deadline_passed'); assert.equal(s.offerings[0].tuition, null);
});

test('remembered HKUST mode-only choices need category selection while explicit saved choices and exports reload current evidence', async () => {
  const detail = await get(`/api/programmes/${hk.id}?offering=${hk.id}-O2&applicant=${hk.id}-O2-NONLOCAL`), saved = optionSnapshot(detail);
  const r = await fetch(baseUrl + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [saved, { programmeId: hk.id, offeringId: hk.id + '-O1' }] }) });
  assert.equal(r.status, 200); const items = (await r.json()).items; assert.ok(items.every(i => i.status === 'resolved'));
  assert.equal(items[1].programme.offerings[0].tuition, null); assert.equal(items[1].programme.applicationTimeline.state, 'applicant_required');
  const out = shortlistExport([items[0].programme], { [hk.id]: saved }).programmes[0];
  assert.equal(out.offerings[0].tuition, 230000); assert.equal(out.offerings[0].deadline, '2027-04-01'); assert.equal(out.offerings[0].applicationFee, 600);
  assert.equal(out.evidence.lastChecked, obs.checkedOn); assert.equal(out.profile, undefined); assert.equal(out.match, undefined);
});

test('read-only use preserves partial coverage and quality without new programmes or artificial human review', async () => {
  const before = JSON.stringify([store.get(hk.id), store.get(sit.id), store.get('HK-HKUST-P003')]);
  for (const p of [resolve(1, 'LOCAL'), sit]) { programmeTimeline(p, '2026-10-24'); matchProgramme(p, profile); }
  const meta = await get('/api/meta'); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 869); assert.equal(meta.quality.checked, 174);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0); assert.deepEqual(meta.quality.sourceRefreshConflicts, []);
  assert.deepEqual(meta.applicantEvidence, { studyOptions: 78, categories: 158, peerReviewed: 0 }); assert.deepEqual(applicantSummary(contexts), meta.applicantEvidence);
  assert.equal(JSON.stringify([store.get(hk.id), store.get(sit.id), store.get('HK-HKUST-P003')]), before);
});
