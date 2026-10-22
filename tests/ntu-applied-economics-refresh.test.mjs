import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CatalogueStore } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { matchProgramme } from '../server/matching.mjs';
import { resolveOffering } from '../server/offerings.mjs';
import { programmeTimeline } from '../server/application-dates.mjs';
import { shortlistExport, optionSnapshot } from '../public/saved-options.js';

const root = new URL('../', import.meta.url);
const batch = JSON.parse(readFileSync(new URL('data/checked-programmes.json', root), 'utf8'));
const observation = JSON.parse(readFileSync(new URL('data/research/ntu-applied-economics-observation-2026-10-22.json', root), 'utf8'));
const id = 'SG-NTU-P015', august = id + '-O2', november = id + '-O3', retired = id + '-O1';
const p = batch.programmes.find(p => p.id === id);
const official = 'https://www.ntu.edu.sg/education/graduate-programme/master-of-applied-economics';
const guide = 'https://www.ntu.edu.sg/admissions/graduate/cwadmissionguide';
const profile = { major: 'Economics', degreeStatus: 'graduated', classification: 'first', gpa: 3.8, gpaScale: 4, experienceYears: 0, language: { type: 'ielts', total: 7, testDate: '2026-05-01' } };
const check = (profile, kind) => matchProgramme(p, profile).checks.find(c => c.kind === kind);

test('economics refresh preserves its own source batch and earlier observations', () => {
  assert.equal(batch.checkedOn, '2026-10-22');
  assert.equal(p.lastChecked, batch.checkedOn);
  assert.deepEqual(batch.programmes.filter(q => q.researchBatch === p.researchBatch).map(q => q.id), [id]);
  assert.equal(batch.programmes.find(q => q.id === 'SG-NTU-P018').lastChecked, '2026-10-21');
  assert.equal(batch.programmes.find(q => q.id === 'HK-EDUHK-P001').lastChecked, '2026-10-06');
  assert.deepEqual(p.sources.map(s => s.url), [official, guide]);
  assert.ok(p.sources.every(s => s.checkedOn === p.lastChecked));
  assert.equal(observation.programmeId, p.id); assert.equal(observation.checkedOn, p.lastChecked);
});

test('central cohort evidence separates August and November without neighbouring-row deadlines', () => {
  assert.equal(p.academicYear, '2027/28'); assert.equal(p.faculty, 'School of Social Sciences');
  assert.equal(p.fieldStatus.academicYear.sourceUrl, guide); assert.equal(p.fieldStatus.deadline.sourceUrl, guide);
  assert.deepEqual(p.offerings.map(o => [o.id, o.intake, o.applicationOpen, o.deadline]), [[august, 'August 2027', '2026-09-01', '2027-01-31'], [november, 'November 2027', '2027-03-01', '2027-05-31']]);
  for (const o of p.offerings) {
    assert.equal(o.academicYear, '2027/28'); assert.equal(o.mode, 'Full-time'); assert.equal(o.duration, 'Normally 1 year');
    assert.notEqual(o.deadline, '2027-02-15'); assert.notEqual(o.deadline, '2027-02-26');
    assert.match(o.deadlineNote, /No exact cutoff time or live portal availability was checked/);
  }
  assert.match(observation.centralTable.august.yearAssignment, /years are not printed/);
  assert.equal(observation.centralTable.november.openingCellRowSpan, 7);
  assert.equal(observation.centralTable.november.closingCellRowSpan, 7);
  assert.equal(observation.centralTable.november.openingYearExplicit, true);
});

test('a mixed parent timeline becomes cohort-specific only after explicit selection', () => {
  const timeline = programmeTimeline(p, '2026-10-22');
  assert.equal(timeline.state, 'mixed'); assert.equal(timeline.livePortalChecked, false);
  assert.deepEqual(timeline.offerings.map(o => o.state), ['within_recorded_dates', 'not_yet_open']);
  for (const [choice, expected] of [[august, 'within_recorded_dates'], [november, 'not_yet_open']]) {
    const selected = programmeTimeline(resolveOffering(p, choice), '2026-10-22');
    assert.equal(selected.state, expected); assert.equal(selected.offerings.length, 1);
    assert.equal(selected.offerings[0].sourceUrl, guide); assert.equal(selected.offerings[0].sourceCheckedOn, '2026-10-22');
  }
});

test('date boundaries remain stored comparisons, not a live portal or eligibility pass', () => {
  for (const [choice, before, opening, closing, after] of [[august, '2026-08-31', '2026-09-01', '2027-01-31', '2027-02-01'], [november, '2027-02-28', '2027-03-01', '2027-05-31', '2027-06-01']]) {
    const selected = resolveOffering(p, choice);
    for (const [date, expected] of [[before, 'not_yet_open'], [opening, 'within_recorded_dates'], [closing, 'deadline_today'], [after, 'deadline_passed']]) {
      const result = programmeTimeline(selected, date);
      assert.equal(result.state, expected); assert.equal(result.livePortalChecked, false);
    }
  }
});

test('missing current tuition stays null for both intakes, never a historical quote', () => {
  assert.equal(p.fieldStatus.tuition.status, 'unknown');
  for (const o of p.offerings) {
    assert.equal(o.tuition, null); assert.equal(o.currency, 'SGD');
    assert.match(o.feeBasis, /AY2027\/28 tuition is unconfirmed/);
    assert.match(o.feeBasis, /No older brochure fee, subsidy or rebate/);
  }
  assert.equal(observation.brochureRechecked, false);
});

test('honours alternatives and during-study requirements cannot become hard entry thresholds', () => {
  assert.equal(p.rules.some(r => r.kind === 'gpa' || r.kind === 'major'), false);
  assert.equal(p.fieldStatus.gpa.status, 'not_published');
  assert.match(p.notesEn, /ARP GPA 4.75 is not an entry cutoff/);
  assert.match(p.notesEn, /during the trimester, not as a verified pre-entry qualification/);
  const manual = p.rules.find(r => r.labelEn === 'Academic standing and equivalence');
  assert.equal(manual.mandatory, true); assert.match(manual.noteEn, /another discipline/);
  assert.match(manual.noteEn, /no numerical GPA conversion/);
  for (const major of ['Economics', 'Mathematics', 'Computer Science', 'History']) {
    const result = matchProgramme(p, { ...profile, major });
    assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.ok(result.checks.some(c => c.kind === 'manual' && c.status === 'unknown' && c.mandatory));
  }
});

test('language thresholds keep the TOEFL date boundary without converting scores', () => {
  const language = p.rules.find(r => r.kind === 'language');
  assert.deepEqual(language.tests, { ielts: { total: 6.5 }, toefl_120: { total: 85, validBefore: '2026-01-21' }, toefl_6: { total: 4.5, validFrom: '2026-01-21' } });
  for (const [type, total, testDate, status] of [['ielts', 6.5, '2026-05-01', 'pass'], ['ielts', 6, '2026-05-01', 'fail'], ['toefl_120', 85, '2026-01-20', 'pass'], ['toefl_6', 4.5, '2026-01-21', 'pass'], ['toefl_6', 4, '2026-01-21', 'fail']]) {
    assert.equal(check({ ...profile, language: { type, total, testDate } }, 'language').status, status);
  }
  for (const language of [{ type: 'toefl_6', total: 4.5, testDate: '2026-01-20' }, { type: 'toefl_120', total: 85, testDate: '2026-01-21' }]) {
    assert.throws(() => check({ ...profile, language }, 'language'), /TOEFL score scale conflicts with the test date/);
  }
});

test('waiver geography and submission-time validity remain explicit unresolved checks', () => {
  const waiver = p.rules.find(r => r.labelEn === 'Programme-specific English waiver');
  const validity = p.rules.find(r => r.labelEn === 'Application-time English validity');
  assert.equal(waiver.mandatory, true); assert.equal(validity.mandatory, true);
  assert.match(waiver.noteEn, /on-campus/); assert.match(waiver.noteEn, /native English-speaking country/);
  assert.match(waiver.noteEn, /English-medium degree alone does not/);
  assert.match(validity.noteEn, /application date, not measured from today or the intake date/);
  assert.equal(validity.sourceUrl, guide);
  const language = p.rules.find(r => r.kind === 'language');
  assert.equal(language.validityMonths, undefined); assert.equal(language.testDateNotBefore, undefined);
  const result = matchProgramme(p, { ...profile, language: { type: 'waiver', waiverBasis: 'english_degree' } });
  assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
  assert.equal(result.checks.find(c => c.kind === 'language').status, 'unknown');
});

test('a known language gap is not erased by mandatory manual checks or discretion', () => {
  const result = matchProgramme(p, { ...profile, language: { type: 'ielts', total: 6 } });
  assert.equal(result.status, 'has_gap'); assert.equal(result.tier, null);
  assert.ok(result.checks.some(c => c.kind === 'language' && c.status === 'fail'));
  assert.ok(result.checks.some(c => c.kind === 'manual' && c.status === 'unknown'));
  assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.reviewer, null);
  assert.equal(p.fieldStatus.independentReview.status, 'unknown');
});

const store = new CatalogueStore(':memory:', { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root) });
const server = createApp({ store, publicDir: new URL('public/', root), now: () => new Date('2026-10-22T04:00:00Z') });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
test.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); });
const detail = async choice => (await fetch(url + '/api/programmes/' + id + (choice ? '?offering=' + choice : ''))).json();
const resolveSaved = async contexts => (await (await fetch(url + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts }) })).json()).items;

test('catalogue and selected details expose one programme with two independent dated choices', async () => {
  const before = JSON.stringify(store.get(id));
  const result = await (await fetch(url + '/api/catalogue?school=SG-NTU&q=Applied%20Economics')).json();
  assert.equal(result.total, 1); assert.equal(result.items[0].applicationTimeline.state, 'mixed');
  for (const [choice, expected] of [[august, 'within_recorded_dates'], [november, 'not_yet_open']]) {
    const selected = await detail(choice);
    assert.equal(selected.selectedOffering.id, choice); assert.equal(selected.offerings.length, 1);
    assert.equal(selected.applicationTimeline.state, expected); assert.equal(selected.applicationTimeline.asOfDate, '2026-10-22');
    assert.equal(selected.offerings[0].tuition, null); assert.equal(selected.lastChecked, '2026-10-22');
  }
  assert.equal(JSON.stringify(store.get(id)), before);
});

test('match API keeps intake dates separate from unresolved admissions assessment', async () => {
  for (const choice of [august, november]) {
    const response = await fetch(url + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, filters: { school: 'SG-NTU', q: 'Applied Economics' }, selectedOfferings: { [id]: choice } }) });
    assert.equal(response.status, 200);
    const result = await response.json(); assert.equal(result.total, 1);
    assert.equal(result.items[0].selectedOffering.id, choice);
    assert.equal(result.items[0].match.status, 'needs_confirmation'); assert.equal(result.items[0].match.tier, null);
    assert.equal(result.items[0].offerings[0].tuition, null);
  }
});

test('retired combined choice cannot silently resolve as August or November or export their facts', async () => {
  assert.throws(() => resolveOffering(p, retired), /Unknown study option/);
  assert.equal((await fetch(url + '/api/programmes/' + id + '?offering=' + retired)).status, 422);
  const oldChoice = { programmeId: id, offeringId: retired, savedAt: '2026-10-06T04:00:00.000Z' };
  const [old, valid] = await resolveSaved([oldChoice, { programmeId: id, offeringId: november }]);
  assert.equal(old.status, 'needs_attention'); assert.equal(old.code, 422); assert.equal(old.programme, undefined);
  assert.equal(valid.status, 'resolved'); assert.equal(valid.programme.selectedOffering.id, november);
  const baseline = await detail();
  const output = shortlistExport([{ ...baseline, savedOptionIssue: old.message }], { [id]: oldChoice });
  assert.deepEqual(output.programmes, []); assert.equal(output.unresolved.length, 1);
  assert.equal(output.unresolved[0].requestedOptions.offeringId, retired);
  assert.equal(JSON.stringify(output).includes('2027-05-31'), false);
  assert.equal(JSON.stringify(output).includes('tuition'), false);
});

test('remembered current choices reload and export their own dates, null fees and no student background', async () => {
  for (const choice of [august, november]) {
    const selected = await detail(choice), saved = optionSnapshot(selected, '2026-10-22T04:00:00.000Z');
    const [item] = await resolveSaved([saved]); assert.equal(item.status, 'resolved');
    const output = shortlistExport([{ ...item.programme, profile: { major: 'Synthetic private background' }, match: { tier: 'invented' } }], { [id]: saved });
    assert.equal(output.programmes.length, 1); assert.deepEqual(output.unresolved, []);
    const exported = output.programmes[0], expected = p.offerings.find(o => o.id === choice);
    assert.equal(exported.selectedOffering.id, choice); assert.equal(exported.rememberedChoice, true);
    assert.equal(exported.offerings.length, 1); assert.equal(exported.offerings[0].applicationOpen, expected.applicationOpen);
    assert.equal(exported.offerings[0].deadline, expected.deadline); assert.equal(exported.offerings[0].tuition, null);
    assert.equal(exported.applicationTimeline.livePortalChecked, false); assert.equal(exported.match, undefined);
    assert.equal(JSON.stringify(output).includes('Synthetic private'), false);
  }
});
