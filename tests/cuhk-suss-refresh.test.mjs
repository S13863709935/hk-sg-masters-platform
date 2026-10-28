import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CatalogueStore } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { matchProgramme } from '../server/matching.mjs';
import { programmeTimeline } from '../server/application-dates.mjs';
import { validApplicationRounds } from '../server/application-rounds.mjs';
import { shortlistExport } from '../public/saved-options.js';

const root = new URL('../', import.meta.url);
const batch = JSON.parse(readFileSync(new URL('data/checked-programmes.json', root), 'utf8'));
const observation = JSON.parse(readFileSync(new URL('data/research/cuhk-suss-observation-2026-10-23.json', root), 'utf8'));
const cu = batch.programmes.find(p => p.id === observation.cuhk.programmeId);
const su = batch.programmes.find(p => p.id === observation.suss.programmeId);
const profile = { major: 'Synthetic Data QA', degreeStatus: 'graduated', classification: 'first', gpa: 3.8, gpaScale: 4, language: { type: 'ielts', total: 7, testDate: '2026-05-01' } };
const manual = (p, label) => p.rules.find(r => r.kind === 'manual' && r.labelEn === label);

test('the original two-programme observation stays historical while CUHK gains a later source recheck', () => {
  assert.equal(batch.checkedOn, batch.programmes.map(p => p.lastChecked).sort().at(-1));
  assert.equal(observation.checkedOn, '2026-10-23');
  assert.deepEqual(batch.programmes.filter(p => p.researchBatch === 'cuhk-suss-refresh-2026-10-23').map(p => p.id), [su.id]);
  assert.equal(cu.researchBatch, 'urgent-cutoff-refresh-2026-10-24');
  assert.equal(cu.lastChecked, '2026-10-24'); assert.equal(su.lastChecked, observation.checkedOn);
  for (const p of [cu, su]) {
    assert.ok(p.sources.every(s => s.checkedOn === p.lastChecked));
    assert.equal(p.reviewer, null); assert.equal(p.verification, 'programme_page_checked');
    assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.fieldStatus.independentReview.status, 'unknown');
  }
  assert.equal(batch.programmes.find(p => p.id === 'HK-EDUHK-P001').lastChecked, '2026-10-23');
  assert.equal(batch.programmes.find(p => p.id === 'SG-NUS-P029').lastChecked, '2026-10-22');
  assert.equal(batch.programmes.find(p => p.id === 'SG-NTU-P018').lastChecked, '2026-10-21');
});

test('CUHK stable modes gain their first explicit cohort and date-only MA rounds, not neighbouring research deadlines', () => {
  assert.deepEqual(cu.offerings.map(o => [o.id, o.mode]), [[cu.id + '-O1', 'Full-time'], [cu.id + '-O2', 'Part-time']]);
  for (const o of cu.offerings) {
    assert.equal(o.intake, 'September 2027'); assert.equal(o.academicYear, '2027/28');
    assert.equal(o.applicationOpen, '2026-09-01'); assert.equal(o.deadline, '2027-01-31');
    assert.deepEqual(o.applicationRounds.map(r => r.deadline), observation.cuhk.dates.roundDeadlines);
    assert.ok(o.applicationRounds.every(r => r.applicationOpen === null && r.deadlineAt === null));
    assert.equal(validApplicationRounds(o.applicationRounds, o), true);
    assert.match(o.deadlineNote, /subject to places/);
  }
  assert.match(cu.fieldStatus.academicYear.noteEn, /Fall 2026 heading/);
  assert.equal(cu.fieldStatus.deadline.sourceUrl, observation.cuhk.sources.deadlines);
});

test('CUHK date comparisons advance through rounds without inventing a cutoff time or portal check', () => {
  for (const [day, next, roundState] of [
    ['2026-09-30', 'ROUND-1', 'deadline_today'], ['2026-10-23', 'ROUND-2', 'cutoff_ahead'],
    ['2026-10-31', 'ROUND-2', 'deadline_today'], ['2026-11-01', 'ROUND-3', 'cutoff_ahead'],
    ['2026-12-31', 'ROUND-4', 'deadline_today'], ['2027-01-01', 'ROUND-5', 'cutoff_ahead'],
    ['2027-01-31', 'ROUND-5', 'deadline_today']
  ]) {
    const timeline = programmeTimeline(cu, day);
    assert.equal(timeline.livePortalChecked, false);
    for (const o of timeline.offerings) {
      assert.equal(o.nextRoundId, next); assert.equal(o.rounds.find(r => r.id === next).state, roundState);
      assert.equal(o.sourceCheckedOn, cu.lastChecked);
    }
  }
  const expired = programmeTimeline(cu, '2027-02-01');
  assert.equal(expired.state, 'deadline_passed');
  assert.ok(expired.offerings.every(o => o.nextRoundId === null));
});

test('CUHK provisional annual tuition and application fee do not become an invented part-time total', () => {
  assert.equal(cu.offerings[0].tuition, 198000);
  assert.match(cu.offerings[0].feeBasis, /annual full-time tuition, pending university approval/);
  assert.equal(cu.offerings[1].tuition, null);
  for (const phrase of [/99,000 per annum/, /99,000 over two years/, /No two-year total/]) assert.match(cu.offerings[1].feeBasis, phrase);
  assert.ok(cu.offerings.every(o => o.applicationFee === 500 && o.currency === 'HKD'));
  assert.equal(cu.fieldStatus.tuition.status, 'unknown');
});

test('CUHK honours or average B alternatives and English waivers stay manual instead of becoming GPA gates', () => {
  assert.equal(cu.rules.some(r => r.kind === 'gpa' || r.kind === 'classification'), false);
  assert.match(manual(cu, 'Academic standing and equivalence').noteEn, /not a numeric GPA conversion/);
  assert.match(manual(cu, 'Programme documents and individual review').noteEn, /two references/);
  const language = cu.rules.find(r => r.kind === 'language');
  assert.equal(language.tests.ielts.total, 6.5); assert.equal(language.tests.toefl_6.total, 4.5);
  assert.equal(language.atHomeAccepted, true);
  assert.equal(matchProgramme(cu, profile).status, 'needs_confirmation');
  assert.equal(matchProgramme(cu, profile).tier, null);
  assert.equal(matchProgramme(cu, { ...profile, language: { type: 'ielts', total: 6 } }).status, 'has_gap');
});

test('SUSS keeps its grouped option and unknown cohort, dates, study mode and numeric tuition', () => {
  assert.deepEqual(su.offerings.map(o => o.id), [su.id + '-O1']);
  const o = su.offerings[0];
  for (const key of ['mode', 'deadline', 'tuition']) assert.equal(o[key], null);
  assert.equal(o.applicationOpen ?? null, null);
  for (const key of ['academicYear', 'major', 'tuition', 'deadline']) assert.equal(su.fieldStatus[key].status, 'unknown');
  assert.equal(programmeTimeline(su, '2026-10-23').state, 'dates_incomplete');
  assert.match(o.deadlineNote, /Dates of other featured programmes are not reused/);
  assert.match(o.feeBasis, /do not add it again as tuition/);
  assert.equal(observation.suss.fees.numericTuitionImported, false);
  assert.match(observation.suss.access, /not visually verified/);
});

test('SUSS pathway restrictions and contradictory durations remain visible mandatory unknowns', () => {
  assert.match(su.offerings[0].duration, /Conflicting/);
  const r = manual(su, 'Pathway, duration and applicant eligibility');
  for (const phrase of [/Singapore citizens\/PRs/, /international applicants/, /not employed full-time/, /1-4 years/, /18 months-4 years/, /12 or 18 months/, /no status or full-\/part-time mode is inferred/]) assert.match(r.noteEn, phrase);
  const check = matchProgramme(su, profile).checks.find(c => c.labelEn === r.labelEn);
  assert.equal(check.mandatory, true); assert.equal(check.status, 'unknown');
});

test('SUSS does not turn paper TOEFL, graduation CGPA or volunteering preference into entry thresholds', () => {
  assert.deepEqual(su.rules.find(r => r.kind === 'language').tests, { ielts: { total: 6.5 } });
  assert.equal(su.rules.some(r => ['gpa', 'classification', 'experience', 'major'].includes(r.kind)), false);
  assert.match(su.notesEn, /CGPA 3.0 is a graduation condition/);
  assert.match(manual(su, 'English evidence, validity and unsupported alternatives').noteEn, /not converted into iBT/);
  for (const p of [profile, { ...profile, language: { type: 'toefl_120', total: 120, testDate: '2026-01-20' } }]) {
    const result = matchProgramme(su, p); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
  }
});

const store = new CatalogueStore(':memory:', { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root) });
const server = createApp({ store, publicDir: new URL('public/', root), now: () => new Date('2026-10-23T04:00:00Z') });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
test.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); });

test('catalogue, detail and candidate exports preserve new source dates, provisional fee bases and unresolved duration', async () => {
  for (const [p, school, query] of [[cu, 'HK-CUHK', 'Anthropology'], [su, 'SG-SUSS', 'Master of Management']]) {
    const catalogue = await (await fetch(`${url}/api/catalogue?school=${school}&q=${encodeURIComponent(query)}`)).json();
    assert.ok(catalogue.items.some(item => item.id === p.id));
    const detail = await (await fetch(`${url}/api/programmes/${p.id}?offering=${p.id}-O${p === cu ? 2 : 1}`)).json();
    assert.equal(detail.lastChecked, p.lastChecked); assert.equal(detail.offerings[0].tuition, null);
    assert.equal(detail.selectedOffering.id, `${p.id}-O${p === cu ? 2 : 1}`);
    const exported = shortlistExport([detail], {}, '2026-10-23T04:00:00.000Z').programmes[0];
    assert.equal(exported.evidence.lastChecked, p.lastChecked);
    assert.equal(exported.offerings[0].tuition, null);
    assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined);
    if (p === cu) assert.equal(detail.applicationTimeline.offerings[0].nextRoundId, 'ROUND-2');
    else assert.match(exported.offerings[0].duration, /Conflicting/);
  }
});

test('refreshing stored facts does not add reviewed or complete records or mutate them through date/match/export reads', () => {
  const before = JSON.stringify([store.get(cu.id), store.get(su.id)]);
  for (const id of [cu.id, su.id]) { const p = store.get(id); programmeTimeline(p, '2027-02-01'); matchProgramme(p, profile); shortlistExport([p]); }
  assert.equal(JSON.stringify([store.get(cu.id), store.get(su.id)]), before);
  const q = store.quality(); assert.equal(q.total, 873); assert.equal(q.checked, 59);
  assert.equal(q.peerReviewed, 0); assert.equal(q.complete, 0);
});
