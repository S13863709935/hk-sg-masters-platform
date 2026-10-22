import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CatalogueStore } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { matchProgramme } from '../server/matching.mjs';
import { programmeTimeline } from '../server/application-dates.mjs';
import { shortlistExport, optionSnapshot } from '../public/saved-options.js';

const root = new URL('../', import.meta.url);
const batch = JSON.parse(readFileSync(new URL('data/checked-programmes.json', root), 'utf8'));
const id = 'SG-NTU-P018';
const p = batch.programmes.find(p => p.id === id);
const official = 'https://www.ntu.edu.sg/education/graduate-programme/master-in-science-in-information-systems';
const guide = 'https://www.ntu.edu.sg/admissions/graduate/cwadmissionguide';
const profile = { major: 'Computer Science', degreeStatus: 'graduated', classification: 'first', gpa: 3.8, gpaScale: 4, experienceYears: 0, language: { type: 'ielts', total: 7, components: { listening: 7, reading: 7, writing: 7, speaking: 7 }, testDate: '2026-05-01' } };
const check = (profile, kind) => matchProgramme(p, profile).checks.find(c => c.kind === kind);

test('MSIS refresh changes only its observation date and preserves other source dates', () => {
  assert.equal(batch.checkedOn, batch.programmes.map(q => q.lastChecked).sort().at(-1));
  assert.equal(p.lastChecked, '2026-10-21');
  assert.deepEqual(batch.programmes.filter(q => q.lastChecked === '2026-10-21').map(q => q.id), [id]);
  assert.equal(batch.programmes.find(q => q.id === 'HK-EDUHK-P001').lastChecked, '2026-10-06');
  assert.deepEqual(p.sources.map(s => s.url), [official, guide]);
  assert.ok(p.sources.every(s => s.checkedOn === p.lastChecked));
});

test('the current cohort is from the central table without conflating Information Studies', () => {
  assert.equal(p.academicYear, '2027/28');
  assert.equal(p.faculty, 'Wee Kim Wee School of Communication and Information');
  assert.equal(p.fieldStatus.academicYear.sourceUrl, guide);
  assert.deepEqual(p.offerings.map(o => [o.id, o.mode, o.duration]), [[id + '-O1', 'Full-time', '1–2 years'], [id + '-O2', 'Part-time', '2–4 years']]);
  for (const o of p.offerings) {
    assert.equal(o.intake, 'August 2027');
    assert.equal(o.academicYear, '2027/28');
    assert.equal(o.deadline, '2027-02-15');
    assert.notEqual(o.deadline, '2027-01-31');
    assert.match(o.deadlineNote, /Information Studies row is not Information Systems/);
  }
});

test('conflicting opening dates remain null, not a live-open or inferred cutoff claim', () => {
  for (const o of p.offerings) {
    assert.equal(o.applicationOpen, null);
    assert.equal(o.applicationRounds, undefined);
    assert.match(o.deadlineNote, /central guide says 1 October/);
    assert.match(o.deadlineNote, /programme page says 1 November/);
    assert.match(o.deadlineNote, /No exact cutoff time/);
  }
  assert.equal(p.fieldStatus.deadline.sourceUrl, guide);
  for (const date of ['2026-10-21', '2026-11-02', '2027-02-14']) {
    const timeline = programmeTimeline(p, date);
    assert.equal(timeline.state, 'dates_incomplete');
    assert.equal(timeline.livePortalChecked, false);
    assert.ok(timeline.offerings.every(o => o.sourceUrl === guide && o.sourceCheckedOn === '2026-10-21'));
  }
  assert.equal(programmeTimeline(p, '2027-02-16').state, 'deadline_passed');
});

test('historical fees and rebates cannot become a numeric price for the next cohort', () => {
  assert.equal(p.fieldStatus.tuition.status, 'unknown');
  for (const o of p.offerings) {
    assert.equal(o.tuition, null); assert.equal(o.currency, 'SGD');
    for (const pattern of [/2027\/28 tuition is unconfirmed/, /Historical reference only: AY2026\/27/, /47,044.40/, /30 AU/, /inclusive of GST/, /miscellaneous fees/, /deposit offsets tuition/, /not a 2027\/28 quote/, /no rebate is deducted/]) assert.match(o.feeBasis, pattern);
  }
});

test('explicit majors pass individually but alternative degree/work routes need confirmation', () => {
  for (const major of ['Computer Science', 'Information Systems', 'Information Technology']) assert.equal(check({ ...profile, major }, 'major').status, 'pass');
  for (const major of ['Engineering', 'Sciences', 'History']) {
    const result = matchProgramme(p, { ...profile, major, experienceYears: 10 });
    assert.equal(result.checks.find(c => c.kind === 'major').status, 'unknown');
    assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
  }
  assert.equal(p.rules.some(r => r.kind === 'experience' && r.mandatory !== false), false);
  assert.match(p.rules.find(r => r.labelEn === 'Alternative subject and work routes').noteEn, /recommended, not a mandatory requirement/);
});

test('honours equivalence and programme CGPAs do not become undergraduate GPA thresholds', () => {
  assert.equal(p.rules.some(r => r.kind === 'gpa'), false);
  assert.equal(p.fieldStatus.gpa.status, 'not_published');
  assert.match(p.notesEn, /CGPA 2.50 and dissertation CGPA 4.00 are not admission cutoffs/);
  assert.match(p.rules.find(r => r.labelEn === 'Academic standing and equivalence').noteEn, /no numerical GPA conversion/);
  assert.ok(matchProgramme(p, profile).checks.some(c => c.kind === 'manual' && c.mandatory && c.status === 'unknown'));
});

test('central WKWSCI TOEFL scales keep the test-date boundary and do not weaken IELTS components', () => {
  const language = p.rules.find(r => r.kind === 'language');
  assert.equal(language.sourceUrl, guide);
  assert.deepEqual(language.tests, { ielts: { total: 6.5, componentMin: 6 }, toefl_120: { total: 100, validBefore: '2026-01-21' }, toefl_6: { total: 5, validFrom: '2026-01-21' } });
  assert.equal(check({ ...profile, language: { type: 'toefl_6', total: 5, testDate: '2026-01-21' } }, 'language').status, 'pass');
  assert.equal(check({ ...profile, language: { type: 'toefl_6', total: 4.5, testDate: '2026-01-21' } }, 'language').status, 'fail');
  assert.equal(check({ ...profile, language: { type: 'toefl_120', total: 100, testDate: '2026-01-20' } }, 'language').status, 'pass');
  assert.equal(check({ ...profile, language: { ...profile.language, components: { ...profile.language.components, writing: 5.5 } } }, 'language').status, 'fail');
});

test('submission-time English validity and exemption decisions remain mandatory unknowns', () => {
  const language = p.rules.find(r => r.kind === 'language');
  assert.equal(language.validityMonths, undefined); assert.equal(language.testDateNotBefore, undefined);
  const manual = p.rules.find(r => r.labelEn === 'English waiver and application-time validity');
  assert.equal(manual.mandatory, true);
  assert.match(manual.noteEn, /at application submission, not measured from today or the intake date/);
  const result = matchProgramme(p, { ...profile, language: { type: 'waiver', waiverBasis: 'english_degree' } });
  assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
  assert.equal(result.checks.find(c => c.kind === 'language').status, 'unknown');
});

test('source reading does not fabricate completeness, independent review or recommendation tiers', () => {
  assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.verification, 'programme_page_checked');
  assert.equal(p.reviewer, null); assert.equal(p.fieldStatus.independentReview.status, 'unknown');
  assert.equal(matchProgramme(p, profile).status, 'needs_confirmation');
  assert.equal(matchProgramme(p, profile).tier, null);
});

const store = new CatalogueStore(':memory:', { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root) });
const server = createApp({ store, publicDir: new URL('public/', root), now: () => new Date('2026-10-21T04:00:00Z') });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
test.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); });

test('catalogue and FT/PT APIs retain current unknown tuition, date discrepancy and source clock', async () => {
  const before = JSON.stringify(store.get(id));
  const list = await (await fetch(url + '/api/catalogue?school=SG-NTU&q=Information%20Systems')).json();
  assert.equal(list.total, 1); assert.equal(list.items[0].applicationTimeline.state, 'dates_incomplete');
  for (const offering of p.offerings) {
    const response = await fetch(url + '/api/programmes/' + id + '?offering=' + offering.id);
    assert.equal(response.status, 200);
    const detail = await response.json();
    assert.equal(detail.offerings.length, 1); assert.equal(detail.selectedOffering.id, offering.id);
    assert.equal(detail.offerings[0].tuition, null); assert.equal(detail.offerings[0].applicationOpen, null);
    assert.equal(detail.applicationTimeline.state, 'dates_incomplete');
    assert.equal(detail.applicationTimeline.offerings[0].sourceUrl, guide);
    assert.equal(detail.applicationTimeline.asOfDate, '2026-10-21');
    assert.match(detail.offerings[0].feeBasis, /Historical reference only/);
  }
  assert.equal(JSON.stringify(store.get(id)), before);
});

test('candidate export and remembered-choice resolution reload current facts without a historical price', async () => {
  const detail = await (await fetch(url + '/api/programmes/' + id + '?offering=' + id + '-O2')).json();
  const saved = optionSnapshot(detail, '2026-10-21T04:00:00.000Z');
  assert.equal(saved.offeringId, id + '-O2');
  assert.equal(Object.hasOwn(saved, 'tuition'), false);
  const output = shortlistExport([detail], { [id]: saved });
  assert.equal(output.programmes[0].offerings[0].tuition, null);
  assert.match(output.programmes[0].offerings[0].feeBasis, /Historical reference only/);
  assert.equal(output.programmes[0].applicationTimeline.state, 'dates_incomplete');
  const response = await fetch(url + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [saved] }) });
  assert.equal(response.status, 200);
  const resolved = (await response.json()).items[0].programme;
  assert.equal(resolved.offerings[0].tuition, null); assert.equal(resolved.offerings[0].deadline, '2027-02-15');
  assert.equal(resolved.applicationTimeline.state, 'dates_incomplete');
  assert.equal(resolved.lastChecked, '2026-10-21');
});
