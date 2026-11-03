import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CatalogueStore } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { loadRoutes, resolveProgramme } from '../server/routes.mjs';
import { loadApplicantContexts, applicantSummary, offeringFingerprint } from '../server/applicants.mjs';
import { programmeTimeline } from '../server/application-dates.mjs';
import { matchProgramme } from '../server/matching.mjs';
import { optionSnapshot, shortlistExport } from '../public/saved-options.js';

const root = new URL('../', import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const batch = read('data/checked-programmes.json'), observed = read('data/research/lingnan-eduhk-observation-2026-10-23.json');
const lu = batch.programmes.find(p => p.id === observed.lingnan.programmeId), ed = batch.programmes.find(p => p.id === observed.eduhk.programmeId);
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) });
const routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
const resolve = (number, category) => resolveProgramme(store.get(ed.id), routes, undefined, `${ed.id}-O${number}`, category && `${ed.id}-O${number}-${category}`, contexts);
const manual = (p, label) => p.rules.find(r => r.kind === 'manual' && r.labelEn === label);
const profile = { major: 'Public Policy', degreeStatus: 'graduated', classification: 'first', gpa: 3.8, gpaScale: 4, language: { type: 'ielts', total: 7, singleAttempt: true, testDate: '2026-05-01' } };
const check = (p, language) => matchProgramme(p, { ...profile, language }).checks.find(c => c.kind === 'language');

test('Lingnan and EdUHK refresh only their partial observations and preserve existing programme/study identities', () => {
  assert.deepEqual(batch.programmes.filter(p => p.researchBatch === 'lingnan-eduhk-refresh-2026-10-23').map(p => p.id), [lu.id, ed.id]);
  for (const p of [lu, ed]) {
    assert.equal(p.lastChecked, p.id === ed.id ? '2026-10-30' : observed.checkedOn); assert.ok(p.sources.every(s => s.checkedOn >= observed.checkedOn && s.checkedOn <= p.lastChecked)); assert.ok(p.sources.some(s => s.checkedOn === observed.checkedOn));
    assert.equal(p.verification, 'programme_page_checked'); assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.reviewer, null);
    assert.deepEqual(p.offerings.map(o => o.id), [p.id + '-O1', p.id + '-O2']);
  }
  assert.equal(store.get('HK-CITYU-P010').lastChecked, '2026-10-20');
  assert.equal(store.get('SG-NUS-P029').lastChecked, '2026-10-22');
});

test('Lingnan FT/PT keep one programme total and an explicit window rather than multiplying annual fees', () => {
  assert.deepEqual(lu.offerings.map(o => [o.mode, o.duration]), [['Full-time', '1 year'], ['Part-time', '2 years']]);
  for (const o of lu.offerings) {
    assert.equal(o.tuition, 198000); assert.equal(o.applicationFee, 400); assert.equal(o.applicationOpen, '2026-08-01'); assert.equal(o.deadline, '2027-06-30');
    assert.equal(o.applicationRounds, undefined); assert.match(o.feeBasis, /not an annual amount/); assert.match(o.deadlineNote, /change the closing date without notice/);
  }
  assert.equal(programmeTimeline(lu, '2026-07-31').state, 'not_yet_open');
  assert.equal(programmeTimeline(lu, '2026-10-23').state, 'within_recorded_dates');
  assert.equal(programmeTimeline(lu, '2027-07-01').state, 'deadline_passed');
});

test('Lingnan graduation GPAs, weekend format and qualitative alternatives do not become admission gates', () => {
  assert.equal(lu.rules.some(r => ['gpa', 'experience', 'classification', 'major'].includes(r.kind)), false);
  for (const phrase of [/2.67/, /3.50/, /2.33/, /graduation classifications/]) assert.match(lu.notesEn, phrase);
  assert.match(manual(lu, 'Relevant fields and alternative academic attainment').noteEn, /professional attainment/);
  assert.match(manual(lu, 'Study formats, concentration and selection').noteEn, /Regular and Weekend.*full-time/);
  assert.equal(matchProgramme(lu, profile).status, 'needs_confirmation'); assert.equal(matchProgramme(lu, profile).tier, null);
});

test('Lingnan language checks keep submission-time validity and CET-6 spoken evidence manual', () => {
  const language = lu.rules.find(r => r.kind === 'language'); assert.equal(language.tests.ielts.total, 6); assert.equal(language.tests.toefl_120.total, 79);
  assert.equal(language.tests.toefl_6, undefined); assert.equal(language.validityMonths, undefined);
  assert.equal(check(lu, { type: 'toefl_120', total: 79, testDate: '2026-01-20', singleAttempt: true }).status, 'pass');
  assert.equal(check(lu, { ...profile.language, singleAttempt: false }).status, 'unknown');
  assert.equal(check(lu, { ...profile.language, atHome: true }).status, 'fail');
  assert.equal(check(lu, { type: 'toefl_6', total: 6, testDate: '2026-05-01' }).status, 'unknown');
  const text = manual(lu, 'Language validity, CET-6 alternative and spoken evidence').noteEn;
  for (const phrase of [/submission date/, /CET-6 450/, /five-year/, /and\/or.*grade B/]) assert.match(text, phrase);
});

test('EdUHK January context is freshly bound without changing its existing category prices or cutoffs', () => {
  for (const [category, tuition, fee, deadline] of [['LOCAL', 151110, 300, '2026-11-20'], ['NONLOCAL', 188888, 400, '2026-10-15']]) {
    const p = resolve(1, category), o = p.offerings[0];
    assert.equal(o.tuition, tuition); assert.equal(o.applicationFee, fee); assert.equal(o.deadline, deadline); assert.equal(o.applicationOpen, null);
    assert.equal(o.intake, 'January 2027'); assert.equal(o.academicYear, '2026/27'); assert.equal(o.applicationRounds, undefined);
    assert.equal(p.applicantEvidence.checkedOn, observed.checkedOn);
  }
  const context = [...contexts.values()].find(c => c.offeringId === ed.id + '-O1');
  assert.equal(context.offeringFingerprint, offeringFingerprint(ed.offerings[0]));
  assert.equal(programmeTimeline(resolve(1, 'NONLOCAL'), '2026-10-23').state, 'deadline_passed');
  assert.equal(programmeTimeline(resolve(1, 'LOCAL'), '2026-10-23').state, 'dates_incomplete');
});

test('EdUHK September has distinct application fees, central opening and three category-specific cutoffs', () => {
  for (const [category, fee, deadline] of [['LOCAL', 400, '2027-05-31'], ['NONLOCAL', 500, '2027-05-10']]) {
    const p = resolve(2, category), o = p.offerings[0];
    assert.equal(o.tuition, 208000); assert.equal(o.applicationFee, fee); assert.equal(o.applicationOpen, '2026-10-05'); assert.equal(o.deadline, deadline);
    assert.equal(o.academicYear, '2027/28'); assert.equal(o.intake, 'September 2027');
    assert.deepEqual(o.applicationRounds.map(r => r.deadline), ['2027-01-04', '2027-02-15', deadline]);
    assert.ok(o.applicationRounds.every(r => r.applicationOpen === null && r.deadlineAt === null));
    assert.equal(p.applicantEvidence.dateSourceUrl, observed.sources.eduhkSeptemberDates);
  }
  const context = [...contexts.values()].find(c => c.offeringId === ed.id + '-O2');
  assert.equal(context.offeringFingerprint, offeringFingerprint(ed.offerings[1]));
  assert.deepEqual(applicantSummary(contexts), { studyOptions: 239, categories: 478, peerReviewed: 0 });
});

test('EdUHK September next-round transitions and final dates stay within the selected category', () => {
  for (const [day, next] of [['2026-10-23', 'EARLY'], ['2027-01-05', 'MAIN'], ['2027-02-16', 'FINAL']]) {
    for (const category of ['LOCAL', 'NONLOCAL']) {
      const t = programmeTimeline(resolve(2, category), day); assert.equal(t.offerings[0].nextRoundId, next); assert.equal(t.livePortalChecked, false);
    }
  }
  assert.equal(programmeTimeline(resolve(2, 'NONLOCAL'), '2027-05-11').state, 'deadline_passed');
  assert.equal(programmeTimeline(resolve(2, 'LOCAL'), '2027-05-11').state, 'within_recorded_dates');
  assert.equal(programmeTimeline(resolve(2, 'LOCAL'), '2027-06-01').offerings[0].nextRoundId, null);
});

test('unselected, cross-intake and stale EdUHK contexts never fall back to the other price or window', () => {
  for (const number of [1, 2]) {
    const p = resolve(number); assert.equal(p.applicantOptions.length, 2);
    for (const key of ['tuition', 'applicationFee', 'applicationOpen', 'deadline']) assert.equal(p.offerings[0][key], null);
    assert.equal(programmeTimeline(p, '2026-10-23').state, 'applicant_required');
  }
  assert.equal(ed.offerings[0].tuition, null); assert.equal(ed.offerings[0].deadline, null);
  assert.throws(() => resolveProgramme(store.get(ed.id), routes, undefined, ed.id + '-O2', ed.id + '-O1-LOCAL', contexts));
  const altered = { ...store.get(ed.id), offerings: ed.offerings.map(o => ({ ...o, duration: o.duration + ' Synthetic drift.' })) };
  const stale = resolveProgramme(altered, routes, undefined, ed.id + '-O2', undefined, contexts);
  assert.equal(stale.applicantContextStatus, 'stale'); assert.deepEqual(stale.applicantOptions, []);
  assert.throws(() => resolveProgramme(altered, routes, undefined, ed.id + '-O2', ed.id + '-O2-NONLOCAL', contexts));
});

test('EdUHK English thresholds do not reuse Lingnan CET-6 rules or one validity example across both intakes', () => {
  const language = ed.rules.find(r => r.kind === 'language'); assert.equal(language.tests.toefl_6.total, 4);
  assert.equal(language.validityMonths, undefined); assert.equal(language.testDateNotBefore, undefined);
  assert.equal(check(ed, { type: 'toefl_6', total: 4, testDate: '2026-01-21', singleAttempt: true }).status, 'pass');
  assert.equal(check(ed, { type: 'toefl_6', total: 3.5, testDate: '2026-01-21', singleAttempt: true }).status, 'fail');
  assert.equal(check(ed, { ...profile.language, atHome: true }).status, 'fail');
  const text = manual(ed, 'Intake-specific English validity and alternatives').noteEn;
  for (const phrase of [/1 January 2024/, /1 January 2025/, /CET-6 430/, /neither is a rolling expiry/, /MyBest/]) assert.match(text, phrase);
});

test('EdUHK recognised qualifications, conditional evidence and interview remain manual without admission probabilities', () => {
  assert.equal(ed.rules.some(r => ['gpa', 'major', 'experience'].includes(r.kind)), false);
  assert.match(manual(ed, 'Qualification evidence, confidential transcript and interview').noteEn, /not to every applicant/);
  assert.match(manual(ed, 'Delivery, curriculum and category applicability').noteEn, /optional thesis.*not.*research master/);
  for (const number of [1, 2]) for (const category of ['LOCAL', 'NONLOCAL']) {
    const result = matchProgramme(resolve(number, category), profile); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(result.checks.find(c => c.kind === 'applicant').status, 'unknown');
  }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-23T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${app.address().port}`;
const get = async path => { const r = await fetch(baseUrl + path); assert.equal(r.status, 200); return r.json(); };
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('catalogue, detail and matching APIs use the selected EdUHK intake and category without default substitution', async () => {
  for (const [number, category, tuition, fee] of [[1, 'LOCAL', 151110, 300], [1, 'NONLOCAL', 188888, 400], [2, 'LOCAL', 208000, 400], [2, 'NONLOCAL', 208000, 500]]) {
    const offering = `${ed.id}-O${number}`, applicant = offering + '-' + category;
    const detail = await get(`/api/programmes/${ed.id}?offering=${offering}&applicant=${applicant}`);
    assert.equal(detail.offerings[0].tuition, tuition); assert.equal(detail.offerings[0].applicationFee, fee);
    const qs = new URLSearchParams({ school: 'HK-EDUHK', offerings: JSON.stringify({ [ed.id]: offering }), applicants: JSON.stringify({ [ed.id]: applicant }), limit: '100' });
    const card = (await get('/api/catalogue?' + qs)).items.find(p => p.id === ed.id);
    assert.equal(card.offerings[0].tuition, tuition); assert.equal(card.offerings[0].applicationFee, fee);
    const r = await fetch(baseUrl + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, filters: { school: 'HK-EDUHK' }, selectedOfferings: { [ed.id]: offering }, selectedApplicants: { [ed.id]: applicant } }) });
    assert.equal(r.status, 200); const item = (await r.json()).items.find(p => p.id === ed.id);
    assert.equal(item.offerings[0].applicationFee, fee); assert.equal(item.match.tier, null);
  }
  const none = await get(`/api/programmes/${ed.id}`); assert.ok(none.offerings.every(o => o.tuition === null && o.deadline === null));
  const invalid = await fetch(`${baseUrl}/api/programmes/${ed.id}?offering=${ed.id}-O2&applicant=${ed.id}-O1-LOCAL`); assert.equal(invalid.status, 422);
});

test('saved choices and candidate exports retain fresh evidence while read-only use does not promote quality', async () => {
  const before = JSON.stringify([store.get(lu.id), store.get(ed.id)]);
  const detail = await get(`/api/programmes/${ed.id}?offering=${ed.id}-O2&applicant=${ed.id}-O2-NONLOCAL`), saved = optionSnapshot(detail);
  const r = await fetch(baseUrl + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [saved] }) });
  assert.equal(r.status, 200); const item = (await r.json()).items[0]; assert.equal(item.status, 'resolved');
  const exported = shortlistExport([item.programme], { [ed.id]: saved }).programmes[0];
  assert.equal(exported.offerings[0].applicationFee, 500); assert.equal(exported.offerings[0].deadline, '2027-05-10');
  assert.equal(exported.evidence.lastChecked, ed.lastChecked); assert.equal(exported.applicantEvidence.checkedOn, observed.checkedOn);
  assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined); assert.equal(exported.rememberedChoice, true);
  const meta = await get('/api/meta'); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 865);
  assert.equal(meta.quality.checked, 373); assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0);
  assert.deepEqual(meta.applicantEvidence, { studyOptions: 239, categories: 478, peerReviewed: 0 });
  assert.equal(JSON.stringify([store.get(lu.id), store.get(ed.id)]), before);
});
