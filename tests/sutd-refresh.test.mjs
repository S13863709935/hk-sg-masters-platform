import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CatalogueStore } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { programmeTimeline } from '../server/application-dates.mjs';
import { matchProgramme } from '../server/matching.mjs';
import { optionSnapshot, shortlistExport } from '../public/saved-options.js';

const root = new URL('../', import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const batch = read('data/checked-programmes.json'), observation = read('data/research/sutd-observation-2026-10-23.json');
const ma = batch.programmes.find(p => p.id === observation.march.programmeId);
const mt = batch.programmes.find(p => p.id === observation.mtd.programmeId);
const manual = (p, label) => p.rules.find(r => r.kind === 'manual' && r.labelEn === label);
const profile = { major: 'Architecture', degreeStatus: 'graduated', classification: 'first', gpa: 3.8, gpaScale: 4, experienceYears: 0, language: { type: 'ielts', total: 7, testDate: '2026-05-01' } };

test('SUTD refresh is limited to two partial programme-page observations without inventing human review', () => {
  assert.deepEqual(batch.programmes.filter(p => p.researchBatch === 'sutd-refresh-2026-10-23').map(p => p.id), [ma.id, mt.id]);
  for (const p of [ma, mt]) {
    assert.equal(p.lastChecked, observation.checkedOn); assert.equal(p.reviewer, null);
    assert.equal(p.verification, 'programme_page_checked'); assert.equal(p.requirementsCoverage, 'partial');
    assert.ok(p.sources.every(s => s.checkedOn === observation.checkedOn));
    assert.equal(p.fieldStatus.independentReview.status, 'unknown');
  }
  assert.equal(batch.programmes.find(p => p.id === 'HK-EDUHK-P001').lastChecked, '2026-10-30');
  assert.equal(batch.programmes.find(p => p.id === 'SG-NUS-P029').lastChecked, '2026-10-22');
  assert.equal(observation.limits.livePortalChecked, false); assert.equal(observation.limits.independentHumanReviews, 0);
});

test('MArch uses its explicit 2027 window without turning score-submission allowances into rounds', () => {
  const o = ma.offerings[0];
  assert.equal(o.id, ma.id + '-O1'); assert.equal(o.academicYear, '2027 intake');
  assert.equal(o.applicationOpen, observation.march.window.open); assert.equal(o.deadline, observation.march.window.deadline);
  assert.equal(o.applicationRounds, undefined); assert.equal(o.deadlineAt, undefined);
  for (const [day, state] of [['2026-07-31', 'not_yet_open'], ['2026-10-23', 'within_recorded_dates'], ['2026-12-31', 'deadline_today'], ['2027-01-01', 'deadline_passed']]) {
    const result = programmeTimeline(ma, day); assert.equal(result.state, state);
    assert.equal(result.livePortalChecked, false); assert.equal(result.offerings[0].sourceCheckedOn, observation.checkedOn);
  }
  assert.match(manual(ma, 'English evidence and submission timing').noteEn, /two weeks after/);
  assert.match(manual(ma, 'English evidence and submission timing').noteEn, /not an application extension/);
});

test('MArch two-year track includes preliminary terms, not extra masters years or an older fee quotation', () => {
  assert.equal(ma.offerings.length, 1); const o = ma.offerings[0];
  assert.equal(o.mode, 'Full-time'); assert.match(o.duration, /Standard MArch: 1 year/);
  assert.match(o.duration, /two-year track includes 2 preliminary undergraduate terms/);
  assert.match(ma.notesEn, /not two extra years/);
  assert.equal(o.tuition, null); assert.equal(o.applicationFee, null); assert.equal(ma.fieldStatus.tuition.status, 'unknown');
  assert.match(o.feeBasis, /AY2026 and older cohorts, not AY2027/);
  assert.match(o.feeBasis, /subsidy table.*non-subsidised NG wording/);
  assert.equal(ma.fieldStatus.tuition.sourceUrl, observation.sources.marchFees);
});

test('architecture, accreditation and technical preparation do not become invented GPA or work-year thresholds', () => {
  const major = ma.rules.find(r => r.kind === 'major'); assert.deepEqual(major.accepted, ['Architecture']); assert.equal(major.any, false);
  assert.equal(ma.rules.some(r => ['gpa', 'experience', 'classification'].includes(r.kind)), false);
  assert.match(manual(ma, 'Accreditation, prior study and track placement').noteEn, /three years.*two-year track/);
  assert.match(manual(ma, 'Work experience and technical preparation').noteEn, /no numeric minimum years/);
  assert.match(manual(ma, 'Work experience and technical preparation').noteEn, /Rhino 3D, Grasshopper/);
  assert.equal(matchProgramme(ma, profile).status, 'needs_confirmation');
  assert.equal(matchProgramme(ma, { ...profile, major: 'Accounting' }).status, 'has_gap');
});

test('document conditions distinguish MArch optional referees and GRE from MTD requirements and minimum statement length', () => {
  const m = manual(ma, 'Programme documents, optional referees and selection').noteEn;
  assert.match(m, /1,000 words/); assert.match(m, /Two referees are optional/); assert.match(m, /one week after/); assert.match(m, /GRE is optional/);
  const t = manual(mt, 'Programme documents and referees').noteEn;
  assert.match(t, /two referees/); assert.match(t, /at least 500 words, not a maximum/);
  assert.equal(observation.march.documents.refereesOptional, true);
  assert.equal(observation.mtd.documents.statementMinimumWords, 500);
});

test('MArch does not inherit the other SUTD programme English thresholds', () => {
  assert.equal(ma.rules.some(r => r.kind === 'language'), false); assert.equal(ma.fieldStatus.language.status, 'unknown');
  assert.match(manual(ma, 'English evidence and submission timing').noteEn, /does not state a numeric minimum/);
  const result = matchProgramme(ma, profile); assert.equal(result.tier, null);
  assert.ok(result.checks.some(c => c.kind === 'manual' && c.labelEn === 'English evidence and submission timing' && c.status === 'unknown'));
});

test('MTD closed announcement withdraws the old future cutoff without inventing a closure date or intake month', () => {
  assert.equal(observation.mtd.actualClosureDate, null); assert.equal(observation.mtd.intakeMonth, null);
  assert.equal(observation.mtd.previousSnapshot.deadline, '2026-10-31');
  assert.equal(mt.academicYear, '2027 intake'); assert.equal(mt.fieldStatus.academicYear.status, 'unknown');
  const o = mt.offerings[0]; assert.equal(o.id, mt.id + '-O1'); assert.equal(o.intake, '2027 intake');
  assert.equal(o.deadline, null); assert.equal(o.applicationOpen, null); assert.equal(o.applicationRounds, undefined);
  assert.match(o.deadlineNote, /applications for 2027 are closed/); assert.match(o.deadlineNote, /do not infer closure on the observation date/);
  assert.equal(mt.fieldStatus.deadline.status, 'unknown');
  for (const day of ['2026-10-23', '2026-10-31', '2026-11-01']) assert.equal(programmeTimeline(mt, day).state, 'dates_incomplete');
});

test('MTD retains dated category evidence without a default international fee, rebate or double-counted deposit', () => {
  const o = mt.offerings[0]; assert.equal(o.tuition, null); assert.equal(o.applicationFee, 21.8);
  assert.equal(mt.fieldStatus.tuition.status, 'unknown');
  for (const phrase of [/AY2026\/27/, /49,050 for SC\/PR/, /54,500 for international/, /no default international price or automatic alumni rebate/, /5,450 acceptance fee is credited to tuition, not added twice/, /AY2025, not a current 2027 all-in quote/]) assert.match(o.feeBasis, phrase);
  const contexts = read('data/applicant-contexts.json');
  assert.equal(contexts.contexts.some(c => c.programmeId === mt.id || c.programmeId === ma.id), false);
  assert.equal(observation.mtd.publishedTuition.internationalSgd, 54500);
  assert.equal(observation.mtd.otherFees.acceptanceCreditedToTuition, true);
});

test('MTD keeps application-time score validity and unrelated-degree judgement manual, with no inferred new TOEFL score', () => {
  const language = mt.rules.find(r => r.kind === 'language');
  assert.equal(language.tests.ielts.total, 6); assert.equal(language.tests.toefl_120.total, 85);
  assert.equal(language.tests.toefl_6, undefined); assert.equal(language.validityMonths, undefined);
  assert.match(manual(mt, 'English medium, validity and test versions').noteEn, /at application, not at today's date/);
  assert.match(manual(mt, 'Innovation interest and unrelated-degree review').noteEn, /case-by-case/);
  assert.equal(mt.rules.some(r => ['gpa', 'experience'].includes(r.kind)), false);
  assert.equal(matchProgramme(mt, profile).status, 'needs_confirmation');
  assert.equal(matchProgramme(mt, { ...profile, language: { ...profile.language, total: 5.5 } }).status, 'has_gap');
  const newScale = matchProgramme(mt, { ...profile, language: { type: 'toefl_6', total: 6, testDate: '2026-05-01' } });
  assert.equal(newScale.checks.find(c => c.kind === 'language').status, 'unknown'); assert.equal(newScale.tier, null);
});

const store = new CatalogueStore(':memory:', { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) });
const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: new URL('data/route-programmes.json', root), applicantEvidencePath: new URL('data/applicant-contexts.json', root), now: () => new Date('2026-10-23T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${app.address().port}`;
const get = async path => { const r = await fetch(baseUrl + path); assert.equal(r.status, 200); return r.json(); };
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('real catalogue, detail and matching APIs preserve the SUTD closure and unresolved fees', async () => {
  const catalogue = await get('/api/catalogue?school=SG-SUTD&limit=100');
  for (const p of [ma, mt]) {
    const card = catalogue.items.find(c => c.id === p.id), detail = await get(`/api/programmes/${p.id}?offering=${p.id}-O1`);
    assert.equal(card.offerings[0].tuition, null); assert.equal(detail.offerings[0].tuition, null);
    assert.equal(detail.lastChecked, observation.checkedOn); assert.equal(detail.applicantOptions, undefined);
    if (p.id === mt.id) {
      assert.equal(card.applicationTimeline.state, 'dates_incomplete'); assert.equal(detail.applicationTimeline.state, 'dates_incomplete');
      assert.equal(detail.offerings[0].deadline, null); assert.match(detail.offerings[0].deadlineNote, /applications for 2027 are closed/);
    } else assert.equal(detail.applicationTimeline.state, 'within_recorded_dates');
  }
  const r = await fetch(baseUrl + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, filters: { school: 'SG-SUTD' } }) });
  assert.equal(r.status, 200); const result = await r.json();
  for (const p of [ma, mt]) { const item = result.items.find(c => c.id === p.id); assert.equal(item.match.tier, null); assert.equal(item.match.status, 'needs_confirmation'); }
});

test('remembered choices and exports reload current SUTD facts instead of the old January cutoff and fee', async () => {
  const detail = await get(`/api/programmes/${mt.id}?offering=${mt.id}-O1`), saved = optionSnapshot(detail);
  const r = await fetch(baseUrl + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [saved] }) });
  assert.equal(r.status, 200); const item = (await r.json()).items[0]; assert.equal(item.status, 'resolved');
  assert.equal(item.programme.offerings[0].deadline, null); assert.equal(item.programme.offerings[0].tuition, null);
  const exported = shortlistExport([item.programme], { [mt.id]: saved }, '2026-10-23T04:00:00.000Z').programmes[0];
  assert.equal(exported.rememberedChoice, true); assert.equal(exported.offerings[0].deadline, null);
  assert.equal(exported.offerings[0].tuition, null); assert.match(exported.evidence.notesEn, /applications for 2027 are closed/);
  assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined);
  const raw = (await get('/api/export')).programmes.find(p => p.id === mt.id);
  assert.equal(raw.offerings[0].deadline, null); assert.equal(raw.offerings[0].tuition, null);
});

test('read-only SUTD lookups do not mutate evidence or promote catalogue, review or contextual coverage', async () => {
  const before = JSON.stringify([store.get(ma.id), store.get(mt.id)]);
  for (const p of [ma, mt]) { programmeTimeline(p, '2026-10-23'); matchProgramme(p, profile); }
  const meta = await get('/api/meta');
  assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 865); assert.equal(meta.quality.checked, 429);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0);
  assert.deepEqual(meta.applicantEvidence, { studyOptions: 323, categories: 650, peerReviewed: 0 });
  assert.equal(JSON.stringify([store.get(ma.id), store.get(mt.id)]), before);
});
