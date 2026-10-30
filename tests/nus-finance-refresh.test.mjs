import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CatalogueStore } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { matchProgramme } from '../server/matching.mjs';
import { programmeTimeline, applicationDate } from '../server/application-dates.mjs';
import { validApplicationRounds } from '../server/application-rounds.mjs';
import { optionSnapshot, shortlistExport } from '../public/saved-options.js';

const root = new URL('../', import.meta.url);
const batch = JSON.parse(readFileSync(new URL('data/checked-programmes.json', root), 'utf8'));
const observation = JSON.parse(readFileSync(new URL('data/research/nus-finance-observation-2026-10-22.json', root), 'utf8'));
const id = 'SG-NUS-P007', offeringId = id + '-O1', p = batch.programmes.find(p => p.id === id), o = p.offerings[0];
const official = observation.sources.admissions, application = observation.sources.application, feeSource = observation.sources.fees, faq = observation.sources.faq;
const profile = { major: 'Computer Science', degreeStatus: 'graduated', classification: 'first', gpa: 3.8, gpaScale: 4, experienceYears: 0, language: { type: 'ielts', total: 7, testDate: '2026-05-01' } };
const manual = label => p.rules.find(r => r.labelEn === label);
const at = instant => programmeTimeline(p, applicationDate(new Date(instant)), instant).offerings[0];

test('Finance refresh records its own five sources without restamping other programme observations', () => {
  assert.equal(p.lastChecked, '2026-10-22'); assert.equal(p.lastChecked, observation.checkedOn);
  assert.equal(p.researchBatch, 'nus-finance-refresh-2026-10-22');
  assert.deepEqual(batch.programmes.filter(q => q.researchBatch === p.researchBatch).map(q => q.id), [id]);
  assert.deepEqual(p.sources.map(s => s.url), Object.values(observation.sources));
  assert.ok(p.sources.every(s => s.checkedOn === '2026-10-22'));
  assert.equal(batch.programmes.find(q => q.id === 'HK-EDUHK-P001').lastChecked, '2026-10-30');
  assert.equal(batch.programmes.find(q => q.id === 'SG-NTU-P018').lastChecked, '2026-10-21');
});

test('single-degree Finance retains its stable full-time option and does not create sibling degrees or modes', () => {
  assert.equal(p.faculty, 'NUS Business School'); assert.equal(p.offerings.length, 1);
  assert.equal(o.id, offeringId); assert.equal(o.mode, 'Full-time'); assert.equal(o.duration, '16 months');
  assert.equal(o.intake, 'August 2027'); assert.equal(o.academicYear, '2027/28');
  assert.match(p.notesEn, /Single-degree MSc Finance only/); assert.match(p.notesEn, /criteria are not merged/);
  assert.equal(observation.cohort.partTimeCurrentlyOffered, false);
});

test('current tuition replaces the old amount without double-counting acceptance or applying unconfirmed aid', () => {
  assert.equal(o.tuition, 77608); assert.notEqual(o.tuition, observation.fees.previousLocalNumericTuition);
  assert.equal(o.currency, 'SGD'); assert.equal(o.applicationFee, 100);
  assert.equal(observation.fees.tuitionBeforeGst * 1.09, o.tuition);
  assert.equal(observation.fees.acceptancePayment + observation.fees.instalments.reduce((sum, n) => sum + n, 0), o.tuition);
  assert.equal(p.fieldStatus.tuition.sourceUrl, feeSource);
  for (const phrase of [/single-degree tuition/, /including 9% GST/, /10,900 acceptance/, /two SGD 33,354 instalments/, /do not add acceptance again/, /100 application fee and semester Miscellaneous Student Fees are separate/, /No alumni rebate, other financial aid or study award is assumed or deducted/]) assert.match(o.feeBasis, phrase);
  assert.equal(observation.fees.rebateOrAwardDeducted, false);
});

test('application cutoffs are explicit date-only records, not July completion conditions or invented times', () => {
  assert.equal(o.applicationOpen, '2026-09-01'); assert.equal(o.deadline, '2027-02-15');
  assert.deepEqual(o.applicationRounds.map(r => [r.id, r.deadline, r.applicationOpen, r.deadlineAt]), [['FIRST', '2026-11-15', null, null], ['FINAL', '2027-02-15', null, null]]);
  assert.ok(validApplicationRounds(o.applicationRounds, o));
  assert.match(o.applicationRounds[0].label, /study-award consideration/);
  assert.equal(p.fieldStatus.deadline.sourceUrl, application);
  assert.equal(p.fieldStatus.academicYear.sourceUrl, application);
  assert.match(o.deadlineNote, /Submission and application-fee payment/);
  assert.match(o.deadlineNote, /July completion-document dates are not application rounds/);
});

test('next cutoff advances only after the first calendar deadline and no later round is invented', () => {
  assert.equal(programmeTimeline(p, '2026-08-31').state, 'not_yet_open');
  assert.equal(programmeTimeline(p, '2026-09-01').state, 'within_recorded_dates');
  const current = at('2026-10-22T04:00:00.000Z');
  assert.equal(current.nextRoundId, 'FIRST'); assert.equal(current.state, 'within_recorded_dates');
  assert.ok(current.rounds.every(r => r.state === 'cutoff_ahead' && r.openingDate === null));
  const later = at('2026-11-16T04:00:00.000Z');
  assert.equal(later.nextRoundId, 'FINAL'); assert.equal(later.rounds[0].state, 'deadline_passed');
  const after = at('2027-02-16T04:00:00.000Z');
  assert.equal(after.nextRoundId, null); assert.equal(after.state, 'deadline_passed');
  assert.ok(after.rounds.every(r => r.state === 'deadline_passed'));
});

test('unrecorded cutoff times never become assumed noon, midnight or an intraday closed verdict', () => {
  for (const instant of ['2026-11-15T00:00:00.000Z', '2026-11-15T15:59:59.000Z']) {
    const result = at(instant);
    assert.equal(result.rounds[0].state, 'deadline_today'); assert.equal(result.rounds[0].deadlineAt, null);
    assert.equal(result.nextRoundId, 'FIRST'); assert.match(result.rounds[0].reason, /do not assume midnight/);
  }
  const last = at('2027-02-15T15:59:59.000Z');
  assert.equal(last.state, 'deadline_today'); assert.equal(last.rounds[1].state, 'deadline_today');
  assert.equal(programmeTimeline(p, '2026-11-15').offerings[0].rounds[0].state, 'deadline_today');
});

test('conflicting completion dates remain manual and cannot extend the February application deadline', () => {
  const r = manual('Final-year completion-document date discrepancy');
  assert.equal(r.kind, 'manual'); assert.equal(r.mandatory, true); assert.equal(r.sourceUrl, application);
  for (const phrase of [/22 July 2027/, /undated FAQ says 15 July/, /Confirm the applicable date/, /not a later application deadline/]) assert.match(r.noteEn, phrase);
  assert.equal(observation.completionEvidenceDiscrepancy.automaticallyChosenDate, null);
  assert.ok(p.sources.some(s => s.url === faq));
  assert.equal(o.deadline, '2027-02-15');
  const result = matchProgramme(p, { ...profile, degreeStatus: 'final_year' });
  assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
  assert.equal(result.checks.find(c => c.labelEn === r.labelEn).status, 'unknown');
});

test('good-degree assessment and graduate GPA do not become an undergraduate numeric cutoff', () => {
  assert.equal(p.rules.some(r => r.kind === 'gpa'), false); assert.equal(p.fieldStatus.gpa.status, 'not_published');
  assert.equal(p.fieldStatus.gpa.sourceUrl, faq); assert.match(p.notesEn, /GPA 3.2\/5 is a graduation condition/);
  for (const major of ['Computer Science', 'History', 'Economics']) {
    const result = matchProgramme(p, { ...profile, major, gpa: 2.8 });
    assert.equal(result.checks.find(c => c.kind === 'major').status, 'pass');
    assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(result.checks.find(c => c.labelEn === 'Academic standing and equivalence').status, 'unknown');
  }
});

test('optional work experience and GMAT/GRE do not become mandatory failures or converted scores', () => {
  const optional = manual('Optional experience and aptitude tests');
  assert.equal(optional.mandatory, false); assert.equal(optional.sourceUrl, faq);
  assert.equal(p.rules.some(r => r.kind === 'experience'), false);
  assert.match(optional.noteEn, /not a mandatory minimum/); assert.match(optional.noteEn, /no GMAT-version conversion/);
  const result = matchProgramme(p, profile);
  assert.equal(result.counts.fail, 0); assert.equal(result.checks.find(c => c.labelEn === optional.labelEn).mandatory, false);
});

test('language totals do not fill old-scale or waiver-proof gaps and a known low score still fails', () => {
  const language = p.rules.find(r => r.kind === 'language');
  assert.deepEqual(language.tests, { ielts: { total: 7 }, toefl_6: { total: 5, validFrom: '2026-01-21' } });
  assert.equal(language.validityMonths, undefined); assert.equal(language.testDateNotBefore, undefined);
  for (const [input, status] of [[{ type: 'ielts', total: 7 }, 'pass'], [{ type: 'ielts', total: 6.5 }, 'fail'], [{ type: 'toefl_6', total: 5, testDate: '2026-05-01' }, 'pass'], [{ type: 'toefl_120', total: 110, testDate: '2026-01-20' }, 'unknown'], [{ type: 'waiver', waiverBasis: 'english_degree' }, 'unknown']]) {
    const result = matchProgramme(p, { ...profile, language: input });
    assert.equal(result.checks.find(c => c.kind === 'language').status, status);
    assert.equal(result.status, status === 'fail' ? 'has_gap' : 'needs_confirmation'); assert.equal(result.tier, null);
  }
  assert.match(manual('English proof, waiver and score applicability').noteEn, /official medium-of-instruction proof, not an automatic exemption/);
});

test('Finance does not inherit another NUS programme reference-letter rule or claim complete review', () => {
  assert.match(manual('Shortlisted interview and programme documents').noteEn, /reference letters are not required/);
  assert.match(manual('Shortlisted interview and programme documents').noteEn, /does not collect documents/);
  assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.reviewer, null);
  assert.equal(p.fieldStatus.independentReview.status, 'unknown');
  const first = matchProgramme(p, profile);
  programmeTimeline(p, '2027-02-16');
  assert.deepEqual(matchProgramme(p, profile), first); assert.equal(first.tier, null);
});

const store = new CatalogueStore(':memory:', { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root) });
const server = createApp({ store, publicDir: new URL('public/', root), now: () => new Date('2026-10-22T04:00:00Z') });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
test.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); });

test('catalogue/detail/match APIs use the revised fee and first cutoff without promoting eligibility', async () => {
  const before = JSON.stringify(store.get(id));
  const result = await (await fetch(url + '/api/catalogue?school=SG-NUS&q=MSc%20Finance')).json();
  assert.equal(result.total, 1); assert.equal(result.items[0].id, id);
  assert.equal(result.items[0].offerings[0].tuition, 77608);
  const detail = await (await fetch(url + '/api/programmes/' + id + '?offering=' + offeringId)).json();
  assert.equal(detail.selectedOffering.id, offeringId); assert.equal(detail.applicationTimeline.asOfDate, '2026-10-22');
  assert.equal(detail.applicationTimeline.offerings[0].nextRoundId, 'FIRST');
  assert.equal(detail.applicationTimeline.offerings[0].sourceUrl, application);
  assert.equal(detail.applicationTimeline.offerings[0].sourceCheckedOn, '2026-10-22');
  assert.equal(detail.applicationTimeline.livePortalChecked, false); assert.equal(detail.offerings[0].applicationFee, 100);
  const response = await fetch(url + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, selectedOfferings: { [id]: offeringId }, filters: { school: 'SG-NUS', q: 'MSc Finance' } }) });
  assert.equal(response.status, 200); const matches = await response.json(); assert.equal(matches.total, 1);
  assert.equal(matches.items[0].match.status, 'needs_confirmation'); assert.equal(matches.items[0].match.tier, null);
  assert.equal(matches.items[0].offerings[0].tuition, 77608);
  assert.equal(JSON.stringify(store.get(id)), before);
});

test('old explicit saved choice reloads current fees and both cutoffs without storing a price snapshot', async () => {
  const choice = { programmeId: id, offeringId, savedAt: '2026-10-06T04:00:00.000Z' };
  const response = await fetch(url + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [choice] }) });
  assert.equal(response.status, 200); const { items } = await response.json(); assert.equal(items[0].status, 'resolved');
  const selected = items[0].programme; assert.equal(selected.selectedOffering.id, offeringId);
  assert.equal(selected.offerings[0].tuition, 77608); assert.equal(selected.lastChecked, '2026-10-22');
  assert.deepEqual(selected.offerings[0].applicationRounds.map(r => r.deadline), ['2026-11-15', '2027-02-15']);
  const saved = optionSnapshot(selected, '2026-10-22T04:00:00.000Z'); assert.equal(Object.hasOwn(saved, 'tuition'), false);
  const output = shortlistExport([{ ...selected, profile: { major: 'Synthetic private background' }, match: { tier: 'invented' } }], { [id]: saved });
  assert.deepEqual(output.unresolved, []); const exported = output.programmes[0];
  assert.equal(exported.rememberedChoice, true); assert.equal(exported.offerings[0].tuition, 77608);
  assert.equal(exported.offerings[0].applicationFee, 100); assert.equal(exported.applicationTimeline.offerings[0].nextRoundId, 'FIRST');
  assert.equal(exported.applicationTimeline.livePortalChecked, false);
  assert.equal(exported.match, undefined); assert.equal(JSON.stringify(output).includes('Synthetic private'), false);
});
