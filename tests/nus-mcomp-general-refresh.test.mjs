import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CatalogueStore } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { matchProgramme } from '../server/matching.mjs';
import { resolveOffering } from '../server/offerings.mjs';
import { programmeTimeline } from '../server/application-dates.mjs';
import { optionSnapshot, shortlistExport } from '../public/saved-options.js';

const root = new URL('../', import.meta.url);
const batch = JSON.parse(readFileSync(new URL('data/checked-programmes.json', root), 'utf8'));
const observation = JSON.parse(readFileSync(new URL('data/research/nus-mcomp-general-observation-2026-10-22.json', root), 'utf8'));
const id = 'SG-NUS-P029', p = batch.programmes.find(p => p.id === id);
const official = 'https://www.comp.nus.edu.sg/programmes/pg/mcomp-gen/admissions/';
const application = 'https://www.comp.nus.edu.sg/programmes/pg/mcomp-gen/application/';
const fees = 'https://www.comp.nus.edu.sg/programmes/pg/mcomp-gen/fees/';
const faq = 'https://www.comp.nus.edu.sg/programmes/pg/mcomp-gen/faq/';
const profile = { major: 'History', degreeStatus: 'graduated', classification: 'first', gpa: 3.8, gpaScale: 4, experienceYears: 0, language: { type: 'ielts', total: 7, testDate: '2026-05-01' } };
const rule = name => p.rules.find(r => r.labelEn === name);

test('NUS refresh has its own evidence batch without restamping earlier observations', () => {
  assert.equal(batch.checkedOn, batch.programmes.map(q => q.lastChecked).sort().at(-1)); assert.equal(p.lastChecked, observation.checkedOn);
  assert.equal(p.researchBatch, 'nus-mcomp-general-refresh-2026-10-22');
  assert.deepEqual(batch.programmes.filter(q => q.researchBatch === p.researchBatch).map(q => q.id), [id]);
  assert.equal(batch.programmes.find(q => q.id === 'HK-EDUHK-P001').lastChecked, '2026-10-23');
  assert.equal(batch.programmes.find(q => q.id === 'SG-NTU-P018').lastChecked, '2026-10-21');
  assert.deepEqual(p.sources.map(s => s.url), Object.values(observation.sources));
  assert.ok(p.sources.every(s => s.checkedOn === '2026-10-22'));
});

test('General Track keeps stable FT/PT choices and the explicitly dated August 2027 window', () => {
  assert.equal(p.name, 'Master of Computing (General Track)'); assert.equal(p.faculty, 'School of Computing');
  assert.deepEqual(p.offerings.map(o => [o.id, o.mode, o.duration]), [[id + '-O1', 'Full-time', 'Normal 1.5–2 years; maximum 3 years'], [id + '-O2', 'Part-time', 'Normal 2.5 years; maximum 3 years']]);
  for (const o of p.offerings) {
    assert.equal(o.intake, 'August 2027'); assert.equal(o.academicYear, '2027/28');
    assert.equal(o.applicationOpen, '2026-10-01'); assert.equal(o.deadline, '2027-01-31');
    assert.equal(o.applicationRounds, undefined); assert.match(o.deadlineNote, /not a separate dated application round/);
  }
  assert.equal(p.fieldStatus.deadline.sourceUrl, application); assert.equal(p.fieldStatus.academicYear.sourceUrl, application);
  assert.equal(observation.cohort.dateYearsExplicit, true);
});

test('cohort-specific fees distinguish credited acceptance from separate charges and unassumed support', () => {
  assert.equal(p.fieldStatus.tuition.sourceUrl, fees);
  for (const o of p.offerings) {
    assert.equal(o.tuition, 76409); assert.equal(o.currency, 'SGD'); assert.equal(o.applicationFee, 109);
    for (const phrase of [/AY2027\/28/, /including 9% GST/, /up to 52 Units/, /fees may change/, /Miscellaneous Student Fees are additional/, /7,640.90 acceptance fee is credited towards tuition, not added twice/, /109 application fee is separate/, /No scholarship or Enhanced Tuition Fee Rebate is assumed or deducted/]) assert.match(o.feeBasis, phrase);
  }
  assert.equal(observation.fees.acceptanceFeeCreditedToTuition, 7640.9);
  assert.equal(observation.fees.rebateOrScholarshipDeducted, false);
});

test('application clock uses the application source and date-only boundaries, not a live-open claim', () => {
  for (const choice of p.offerings) {
    const selected = resolveOffering(p, choice.id);
    for (const [date, state] of [['2026-09-30', 'not_yet_open'], ['2026-10-01', 'within_recorded_dates'], ['2026-10-22', 'within_recorded_dates'], ['2027-01-31', 'deadline_today'], ['2027-02-01', 'deadline_passed']]) {
      const timeline = programmeTimeline(selected, date);
      assert.equal(timeline.state, state); assert.equal(timeline.livePortalChecked, false);
      assert.equal(timeline.offerings[0].sourceUrl, application); assert.equal(timeline.offerings[0].sourceCheckedOn, '2026-10-22');
    }
  }
});

test('any-discipline conversion focus does not become a non-computing-only hard gate or GPA cutoff', () => {
  assert.equal(p.rules.some(r => r.kind === 'gpa'), false); assert.equal(p.fieldStatus.gpa.status, 'not_published');
  assert.match(p.notesEn, /GPA 3.0 is a graduation criterion/); assert.match(p.notesEn, /Specialisations and Artificial Intelligence programme criteria are not merged/);
  for (const major of ['History', 'Business', 'Computer Science']) {
    const result = matchProgramme(p, { ...profile, major });
    assert.equal(result.checks.find(c => c.kind === 'major').status, 'pass');
    assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(result.checks.find(c => c.labelEn === 'Academic standing and equivalence').status, 'unknown');
  }
});

test('official GRE/GMAT disagreement remains visible and cannot produce a hard test failure or exemption', () => {
  const discrepancy = rule('GRE/GMAT source discrepancy and GATE alternative');
  assert.equal(discrepancy.kind, 'manual'); assert.equal(discrepancy.mandatory, true); assert.equal(discrepancy.sourceUrl, official);
  for (const phrase of [/320 and analytical 3.5/, /GMAT 650/, /FAQ says GRE\/GMAT is not compulsory/, /no automatic pass or failure/, /Indian-university graduates/, /no GMAT-version conversion/]) assert.match(discrepancy.noteEn, phrase);
  assert.equal(observation.testEvidence.greGmatConflict.resolved, false);
  assert.ok(p.sources.some(s => s.url === faq));
  const result = matchProgramme(p, profile);
  assert.equal(result.checks.find(c => c.labelEn === discrepancy.labelEn).status, 'unknown');
  assert.equal(result.status, 'needs_confirmation'); assert.equal(result.counts.fail, 0); assert.equal(result.tier, null);
});

test('IT experience is a preference and no mandatory work-duration rule is invented', () => {
  const preference = rule('IT experience preference');
  assert.equal(preference.mandatory, false); assert.equal(preference.sourceUrl, faq);
  assert.equal(p.rules.some(r => r.kind === 'experience'), false);
  assert.match(preference.noteEn, /programming and computing experience are not compulsory/);
  const result = matchProgramme(p, profile);
  assert.equal(result.checks.find(c => c.labelEn === preference.labelEn).mandatory, false);
  assert.equal(result.counts.fail, 0);
});

test('published language totals keep date-scale validation without clearing proof and validity gaps', () => {
  const language = p.rules.find(r => r.kind === 'language');
  assert.deepEqual(language.tests, { ielts: { total: 6 }, toefl_120: { total: 90, validBefore: '2026-01-21' }, toefl_6: { total: 4.5, validFrom: '2026-01-21' } });
  assert.equal(language.validityMonths, undefined); assert.equal(language.testDateNotBefore, undefined);
  for (const [type, total, testDate] of [['ielts', 6, '2026-05-01'], ['toefl_120', 90, '2026-01-20'], ['toefl_6', 4.5, '2026-01-21']]) {
    const result = matchProgramme(p, { ...profile, language: { type, total, testDate } });
    assert.equal(result.checks.find(c => c.kind === 'language').status, 'pass');
    assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
  }
  assert.throws(() => matchProgramme(p, { ...profile, language: { type: 'toefl_120', total: 90, testDate: '2026-01-21' } }), /scale conflicts/);
  const waiver = matchProgramme(p, { ...profile, language: { type: 'waiver', waiverBasis: 'english_degree' } });
  assert.equal(waiver.checks.find(c => c.kind === 'language').status, 'unknown');
  assert.match(rule('English-medium evidence and test validity').noteEn, /no expiry is calculated from today or intake date/);
});

test('language gaps survive unresolved tests, while documents remain outside this platform', () => {
  const result = matchProgramme(p, { ...profile, language: { type: 'ielts', total: 5.5 } });
  assert.equal(result.status, 'has_gap'); assert.equal(result.tier, null);
  assert.equal(result.checks.find(c => c.kind === 'language').status, 'fail');
  assert.ok(result.checks.some(c => c.kind === 'manual' && c.status === 'unknown'));
  assert.match(rule('Supporting documents and completion evidence').noteEn, /at least one referee report/);
  assert.match(rule('Supporting documents and completion evidence').noteEn, /does not collect these documents/);
  assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.reviewer, null); assert.equal(p.fieldStatus.independentReview.status, 'unknown');
});

const store = new CatalogueStore(':memory:', { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root) });
const server = createApp({ store, publicDir: new URL('public/', root), now: () => new Date('2026-10-22T04:00:00Z') });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
test.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); });
const detail = async choice => (await fetch(url + '/api/programmes/' + id + '?offering=' + choice)).json();

test('catalogue and FT/PT APIs retain General Track identity, current fees and source clock', async () => {
  const before = JSON.stringify(store.get(id));
  const result = await (await fetch(url + '/api/catalogue?school=SG-NUS&q=General%20Track')).json();
  assert.equal(result.total, 1); assert.equal(result.items[0].id, id);
  assert.equal(result.items[0].applicationTimeline.state, 'within_recorded_dates');
  for (const choice of p.offerings) {
    const selected = await detail(choice.id);
    assert.equal(selected.selectedOffering.id, choice.id); assert.equal(selected.offerings.length, 1);
    assert.equal(selected.offerings[0].applicationOpen, '2026-10-01'); assert.equal(selected.offerings[0].tuition, 76409);
    assert.equal(selected.offerings[0].applicationFee, 109); assert.equal(selected.applicationTimeline.asOfDate, '2026-10-22');
    assert.equal(selected.applicationTimeline.offerings[0].sourceUrl, application);
    assert.match(selected.rules.find(r => r.labelEn.includes('source discrepancy')).noteEn, /FAQ says/);
  }
  assert.equal(JSON.stringify(store.get(id)), before);
});

test('match API never turns a dated application window into complete eligibility', async () => {
  const response = await fetch(url + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, selectedOfferings: { [id]: id + '-O2' }, filters: { school: 'SG-NUS', q: 'General Track' } }) });
  assert.equal(response.status, 200);
  const result = await response.json(); assert.equal(result.total, 1);
  assert.equal(result.items[0].selectedOffering.id, id + '-O2');
  assert.equal(result.items[0].applicationTimeline.state, 'within_recorded_dates');
  assert.equal(result.items[0].match.status, 'needs_confirmation'); assert.equal(result.items[0].match.tier, null);
});

test('existing explicit choices reload updated facts without changing their mode identity', async () => {
  const choices = p.offerings.map(o => ({ programmeId: id, offeringId: o.id, savedAt: '2026-10-06T04:00:00.000Z' }));
  const response = await fetch(url + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: choices }) });
  assert.equal(response.status, 200);
  const result = await response.json(); assert.equal(result.items.length, 2);
  for (const [index, item] of result.items.entries()) {
    assert.equal(item.status, 'resolved'); assert.equal(item.programme.selectedOffering.id, choices[index].offeringId);
    assert.equal(item.programme.offerings[0].mode, p.offerings[index].mode);
    assert.equal(item.programme.lastChecked, '2026-10-22'); assert.equal(item.programme.offerings[0].applicationOpen, '2026-10-01');
    assert.equal(item.programme.offerings[0].applicationFee, 109);
  }
});

test('current candidate export preserves the selected mode and fees but not student background or match claims', async () => {
  for (const choice of p.offerings) {
    const selected = await detail(choice.id), saved = optionSnapshot(selected, '2026-10-22T04:00:00.000Z');
    const output = shortlistExport([{ ...selected, profile: { major: 'Synthetic private background' }, match: { tier: 'invented' } }], { [id]: saved });
    assert.equal(output.programmes.length, 1); assert.deepEqual(output.unresolved, []);
    const exported = output.programmes[0];
    assert.equal(exported.selectedOffering.id, choice.id); assert.equal(exported.rememberedChoice, true);
    assert.equal(exported.offerings.length, 1); assert.equal(exported.offerings[0].tuition, 76409); assert.equal(exported.offerings[0].applicationFee, 109);
    assert.match(exported.offerings[0].feeBasis, /not added twice/);
    assert.equal(exported.applicationTimeline.livePortalChecked, false); assert.equal(exported.match, undefined);
    assert.equal(JSON.stringify(output).includes('Synthetic private'), false);
  }
});
