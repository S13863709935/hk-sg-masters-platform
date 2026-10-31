import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CatalogueStore } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { loadRoutes, resolveProgramme } from '../server/routes.mjs';
import { loadApplicantContexts, applicantSummary } from '../server/applicants.mjs';
import { programmeTimeline } from '../server/application-dates.mjs';
import { matchProgramme } from '../server/matching.mjs';
import { optionSnapshot, shortlistExport } from '../public/saved-options.js';

const root = new URL('../', import.meta.url), read = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const batch = read('data/checked-programmes.json'), obs = read('data/research/beyond-pilot-ai-observation-2026-10-24.json');
const hk = batch.programmes.find(p => p.id === obs.hkust.programmeId), nt = batch.programmes.find(p => p.id === obs.ntu.programmeId);
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
const manual = (p, label) => p.rules.find(r => r.kind === 'manual' && r.labelEn === label);
const profile = { major: 'Computer Science', degreeStatus: 'graduated', classification: 'first', gpa: 3.8, gpaScale: 4, experienceYears: 0, language: { type: 'ielts', total: 7, components: { listening: 6, reading: 6, writing: 6, speaking: 6 }, singleAttempt: true, testDate: '2026-05-01' } };
const lang = (p, language) => matchProgramme(p, { ...profile, language }).checks.find(c => c.kind === 'language');
const resolve = (p, i) => resolveProgramme(store.get(p.id), routes, undefined, p.offerings[i].id, undefined, contexts);

test('two existing expansion IDs gain partial AI programme observations without altering the original pilot or inventing human review', () => {
  assert.deepEqual(batch.programmes.filter(p => p.researchBatch === 'beyond-pilot-ai-2026-10-24').map(p => p.id), [hk.id, nt.id]);
  assert.equal(batch.pilotProgrammeIds.length, 20);
  const expansion = read('data/catalogue-expansion.json');
  for (const p of [hk, nt]) {
    assert.equal(expansion.programmes.find(s => s.id === p.id).verification, 'catalogue_seed');
    assert.equal(p.lastChecked, obs.checkedOn); assert.ok(p.sources.every(s => s.checkedOn === obs.checkedOn));
    assert.equal(p.award, 'MSc'); assert.equal(p.area, 'Computing'); assert.equal(p.admissionRoute, 'direct');
    assert.equal(p.verification, 'programme_page_checked'); assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.reviewer, null);
    assert.equal(p.offerings.some(o => o.id === p.id + '-catalogue'), false); assert.ok(!batch.pilotProgrammeIds.includes(p.id));
    assert.equal(/\p{Script=Han}/u.test(JSON.stringify({ notes: p.notesEn, rules: p.rules, fields: p.fieldStatus })), false);
  }
});

test('HKUST shared programme tuition and mode instalments do not require an artificial applicant-category selector', () => {
  assert.deepEqual(hk.offerings.map(o => [o.mode, o.duration, o.tuition, o.applicationFee]), [['Full-time', '1 year', 400000, 600], ['Part-time', '2 years', 400000, 600]]);
  for (const i of [0, 1]) {
    const p = resolve(hk, i), o = p.offerings[0]; assert.equal(o.tuition, 400000); assert.equal(p.applicantOptions, undefined); assert.equal(p.selectedApplicant, undefined);
    assert.match(o.feeBasis, i ? /four instalments/ : /two instalments/); assert.match(o.feeBasis, /not an annual fee multiplied by years/);
  }
  assert.equal([...contexts.values()].some(c => [hk.id, nt.id].includes(c.programmeId)), false);
  assert.deepEqual(applicantSummary(contexts), { studyOptions: 107, categories: 216, peerReviewed: 0 });
});

test('HKUST AI keeps its own common December/March rounds and unknown opening instead of copying DISC or CIEM', () => {
  for (const i of [0, 1]) {
    const p = resolve(hk, i), o = p.offerings[0]; assert.equal(o.intake, 'September 2027'); assert.equal(o.academicYear, '2027/28');
    assert.equal(o.applicationOpen, null); assert.equal(o.deadline, '2027-03-01');
    assert.deepEqual(o.applicationRounds.map(r => r.deadline), ['2026-12-01', '2027-03-01']); assert.ok(o.applicationRounds.every(r => r.applicationOpen === null && r.deadlineAt === null));
    for (const [day, next] of [['2026-10-24', 'ROUND-1'], ['2026-12-02', 'ROUND-2']]) { const t = programmeTimeline(p, day); assert.equal(t.state, 'dates_incomplete'); assert.equal(t.offerings[0].nextRoundId, next); assert.equal(t.livePortalChecked, false); }
    assert.equal(programmeTimeline(p, '2027-03-01').state, 'deadline_today'); assert.equal(programmeTimeline(p, '2027-03-02').state, 'deadline_passed');
  }
});

test('HKUST conditional other-discipline experience never becomes a universal two-year or honours/GPA gate', () => {
  assert.equal(hk.rules.some(r => ['gpa', 'classification', 'experience'].includes(r.kind)), false);
  for (const p of [{ ...profile, classification: 'ordinary' }, { ...profile, major: 'Economics', experienceYears: 2 }]) {
    const result = matchProgramme(hk, p); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null); assert.equal(result.checks.some(c => c.kind === 'experience' && c.status === 'fail'), false);
  }
  const text = manual(hk, 'Alternative discipline and conditional work experience').noteEn;
  for (const pattern of [/OR.*another discipline/, /two years.*post-qualification/, /Do not impose two years on a computing-route/, /2.850.*graduation/]) assert.match(text, pattern);
});

test('HKUST language conditions and ordinary versus restricted integrated credit rules retain their own scope', () => {
  assert.equal(lang(hk, { ...profile.language, total: 6.5 }).status, 'pass');
  assert.equal(lang(hk, { ...profile.language, components: { ...profile.language.components, writing: 5 } }).status, 'fail');
  assert.equal(lang(hk, { ...profile.language, atHome: true }).status, 'fail'); assert.equal(lang(hk, { type: 'waiver' }).status, 'unknown');
  assert.equal(lang(hk, { type: 'toefl_6', total: 4.5, testDate: '2026-01-21', singleAttempt: true }).status, 'pass');
  const text = manual(hk, 'Ordinary credit transfer and restricted integrated pathway').noteEn;
  for (const pattern of [/up to 9 credits/, /up to 6 prior credits/, /at least 24 credits/, /not a discount/]) assert.match(text, pattern);
  assert.equal(hk.rules.find(r => r.kind === 'language').validityMonths, undefined);
});

test('NTU FT/PT gross fee and minimum/maximum duration preserve deposits, extra charges and unresolved concessions', () => {
  assert.deepEqual(nt.offerings.map(o => [o.mode, o.duration, o.tuition, o.applicationFee]), [['Full-time', 'Normal/minimum 12 months; maximum 30 months', 65748.8, 50], ['Part-time', 'Normal/minimum 24 months; maximum 48 months', 65748.8, 50]]);
  for (const i of [0, 1]) {
    const o = nt.offerings[i]; assert.match(o.feeBasis, /AY2027\/28-and-after/); assert.match(o.feeBasis, /including prevailing 9% GST/);
    assert.match(o.feeBasis, i ? /four semesters/ : /two semesters/); assert.match(o.feeBasis, /5,000.*deducted.*not added again/);
    assert.match(o.feeBasis, /No scholarship, citizenship subsidy or alumni rebate automatically deducted/);
  }
  assert.match(manual(nt, 'Gross fees, credited deposit and unconfirmed concessions').noteEn, /one-time but billed every academic year/);
  assert.match(manual(nt, 'Gross fees, credited deposit and unconfirmed concessions').noteEn, /generic grants paragraph mentions two instalments/);
});

test('NTU honours OR bachelor-plus-experience paths retain mathematics and relevance without mandatory optional evidence', () => {
  assert.equal(nt.rules.some(r => ['gpa', 'classification', 'experience'].includes(r.kind)), false);
  for (const p of [profile, { ...profile, classification: 'ordinary', experienceYears: 2 }]) { const r = matchProgramme(nt, p); assert.equal(r.status, 'needs_confirmation'); assert.equal(r.tier, null); }
  const text = manual(nt, 'Alternative academic routes, mathematics and conditional experience').noteEn;
  for (const pattern of [/Route A.*honours/, /Route B.*bachelor.*AND two years/, /solid mathematical training/, /not universal/, /GPA field.*not a cutoff/]) assert.match(text, pattern);
  assert.match(manual(nt, 'Programme documents, optional evidence and final-year status').noteEn, /GRE and reference letters are optional/);
  assert.match(manual(nt, 'Coursework, optional project and non-compulsory bridge').noteEn, /project is optional.*zero-AU Python bridge/);
  assert.equal(matchProgramme(nt, { ...profile, degreeStatus: 'final_year' }).checks.find(c => c.kind === 'degree').status, 'unknown');
});

test('NTU score thresholds use the CCDS scale row but do not inherit HKUST components, delivery rules or validity countdown', () => {
  const rule = nt.rules.find(r => r.kind === 'language'); assert.equal(rule.tests.ielts.total, 6.5); assert.equal(rule.tests.ielts.componentMin, undefined);
  for (const key of ['singleAttempt', 'atHomeAccepted', 'validityMonths', 'testDateNotBefore']) assert.equal(rule[key], undefined);
  assert.equal(lang(nt, { type: 'ielts', total: 6.5 }).status, 'pass');
  assert.equal(lang(nt, { type: 'toefl_6', total: 5, testDate: '2026-01-21' }).status, 'pass');
  assert.equal(lang(nt, { type: 'toefl_6', total: 4.5, testDate: '2026-01-21' }).status, 'fail');
  assert.equal(lang(nt, { type: 'toefl_120', total: 100, testDate: '2026-01-20' }).status, 'pass');
  assert.equal(lang(nt, { type: 'waiver' }).status, 'unknown');
  assert.match(manual(nt, 'English scope, evidence and application-time validity').noteEn, /two years of application submission, not today/);
});

test('NTU semester-row cutoff preserves October/November disagreement without a January intake or MComp trimester substitution', () => {
  assert.deepEqual(obs.ntu.centralTableObservation.dateCellRowspans, [12, 12]); assert.equal(obs.ntu.centralTableObservation.table, 'Semester Programmes');
  for (const o of nt.offerings) { assert.equal(o.intake, 'August 2027'); assert.equal(o.applicationOpen, null); assert.equal(o.deadline, '2027-03-31'); assert.equal(o.applicationRounds, undefined); assert.match(o.deadlineNote, /1 October 2026.*November/); }
  for (const [day, state] of [['2026-10-24', 'dates_incomplete'], ['2026-11-01', 'dates_incomplete'], ['2027-03-31', 'deadline_today'], ['2027-04-01', 'deadline_passed']]) assert.equal(programmeTimeline(nt, day).state, state);
  assert.match(manual(nt, 'Opening-date conflict, cohort and study-mode permission').noteEn, /does not permit simultaneous FT and PT applications/);
  assert.equal(nt.fieldStatus.deadline.sourceUrl, obs.sources.ntuGuide); assert.equal(programmeTimeline(nt, '2026-10-24').livePortalChecked, false);
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-24T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.address().port}`, get = async path => { const r = await fetch(base + path); assert.equal(r.status, 200); return r.json(); };
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('APIs and saved/exported AI choices reload the selected mode while old catalogue selections require explicit repair', async () => {
  const details = [];
  for (const p of [hk, nt]) {
    const o = p.offerings[1], detail = await get(`/api/programmes/${p.id}?offering=${o.id}`); details.push(detail);
    assert.equal(detail.offerings[0].tuition, o.tuition); assert.equal(detail.offerings[0].deadline, o.deadline); assert.equal(detail.applicationTimeline.state, 'dates_incomplete'); assert.equal(detail.applicantOptions, undefined);
    const qs = new URLSearchParams({ school: p.universityId, offerings: JSON.stringify({ [p.id]: o.id }), limit: '100' });
    assert.equal((await get('/api/catalogue?' + qs)).items.find(r => r.id === p.id).offerings[0].deadline, o.deadline);
    const r = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, filters: { school: p.universityId }, selectedOfferings: { [p.id]: o.id } }) });
    assert.equal(r.status, 200); const item = (await r.json()).items.find(i => i.id === p.id); assert.equal(item.match.tier, null); assert.equal(item.match.status, 'needs_confirmation');
  }
  const saved = details.map(p => optionSnapshot(p));
  const response = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [...saved, ...[hk, nt].map(p => ({ programmeId: p.id, offeringId: p.id + '-catalogue' }))] }) });
  assert.equal(response.status, 200); const items = (await response.json()).items; assert.deepEqual(items.map(i => i.status), ['resolved', 'resolved', 'needs_attention', 'needs_attention']);
  const exported = shortlistExport(items.slice(0, 2).map(i => i.programme), Object.fromEntries(saved.map(c => [c.programmeId, c]))).programmes;
  assert.deepEqual(exported.map(p => p.offerings[0].tuition), [400000, 65748.8]); assert.ok(exported.every(p => p.profile === undefined && p.match === undefined && p.evidence.lastChecked === obs.checkedOn));
});

test('previously expanded file-backed catalogues load first AI checks beneath directory metadata without replacing old observations', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-ai-source-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    const before = { ...batch, programmes: batch.programmes.filter(p => ![hk.id, nt.id].includes(p.id)) };
    writeFileSync(checkedPath, JSON.stringify(before)); db = new CatalogueStore(path, { ...options, checkedPath });
    const directory = [hk, nt].map(p => db.get(p.id).directoryListing), prior = db.get('HK-HKUST-P001');
    for (const p of [hk, nt]) assert.equal(db.get(p.id).verification, 'catalogue_seed');
    db.close(); db = null; writeFileSync(checkedPath, JSON.stringify(batch)); db = new CatalogueStore(path, { ...options, checkedPath });
    for (const [i, p] of [hk, nt].entries()) { assert.equal(db.get(p.id).verification, 'programme_page_checked'); assert.deepEqual(db.get(p.id).directoryListing, directory[i]); }
    assert.deepEqual(db.get('HK-HKUST-P001'), prior); assert.equal(db.quality().checked, 194); assert.deepEqual(db.quality().sourceRefreshConflicts, []);
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

test('AI lookup, matching and exporting remain read-only with unchanged record and category totals', async () => {
  const before = JSON.stringify(store.all()); for (const p of [hk, nt]) { programmeTimeline(p, '2026-10-24'); matchProgramme(p, profile); }
  const meta = await get('/api/meta'); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 869); assert.equal(meta.quality.checked, 194);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0); assert.deepEqual(meta.quality.sourceRefreshConflicts, []);
  assert.deepEqual(meta.applicantEvidence, { studyOptions: 107, categories: 216, peerReviewed: 0 }); assert.equal(meta.routeEvidence.routes, 17);
  assert.equal(JSON.stringify(store.all()), before);
});
