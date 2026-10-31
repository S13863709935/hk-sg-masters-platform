import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CatalogueStore } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { validateProgramme } from '../server/validation.mjs';
import { loadRoutes, resolveProgramme } from '../server/routes.mjs';
import { loadApplicantContexts, applicantSummary } from '../server/applicants.mjs';
import { matchProgramme } from '../server/matching.mjs';
import { programmeTimeline } from '../server/application-dates.mjs';
import { optionSnapshot, shortlistExport, parseSavedOption } from '../public/saved-options.js';
import { loadRepositoryReviewQueue } from '../scripts/source-review-queue.mjs';

const root = new URL('../', import.meta.url), read = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const batch = read('data/checked-programmes.json'), obs = read('data/research/smu-econ-observation-2026-10-28.json');
const programmes = obs.programmeIds.map(id => batch.programmes.find(p => p.id === id));
const [mse, mdse, msfe] = programmes;
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
const selected = (p, o = p.offerings[0]) => resolveProgramme(store.get(p.id), routes, undefined, o.id, undefined, contexts);
// Synthetic profiles do not establish institution, graduation year, test evidence, recognition or pass eligibility.
const profile = { major: 'History', degreeStatus: 'graduated', classification: 'ordinary', gpa: 2.5, gpaScale: 4, experienceYears: 0, language: { type: 'none' } };
const check = (result, label) => result.checks.find(c => c.labelEn === label);
const rule = (p, label) => p.rules.find(r => r.labelEn === label);

test('SMU alumni test substitutes and qualitative degree standards do not create global GPA, major or work-year failures', () => {
  for (const p of programmes) {
    assert.equal(validateProgramme(p, new Set(['SG-SMU'])), p);
    assert.equal(p.rules.some(r => ['gpa', 'classification', 'major', 'experience'].includes(r.kind)), false);
    for (const changes of [{ gpa: 1, major: 'History' }, { gpa: 4, major: 'Economics', experienceYears: 20 }, { gpa: 4.9, gpaScale: 5 }]) {
      const result = matchProgramme(selected(p), { ...profile, ...changes });
      assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
      assert.equal(check(result, 'Admission test or institution-specific recent-alumni substitution').status, 'unknown');
      assert.equal(check(result, 'Good bachelor and qualification assessment').status, 'unknown');
    }
    assert.equal(matchProgramme(selected(p), { ...profile, degreeStatus: 'final_year' }).checks.find(c => c.kind === 'degree').status, 'unknown');
  }
});

test('holistic English targets never become hard cutoffs or automatic waivers, and MDSE does not inherit sibling targets', () => {
  for (const p of programmes) {
    assert.equal(p.rules.some(r => r.kind === 'language'), false);
    for (const language of [{ type: 'none' }, { type: 'ielts', total: 6 }, { type: 'ielts', total: 9 }, { type: 'waiver', waiverBasis: 'english_degree' }]) {
      const result = matchProgramme(selected(p), { ...profile, language });
      assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
      assert.equal(check(result, 'Conditional English evidence and holistic score guidance').status, 'unknown');
    }
  }
  for (const p of [mse, msfe]) assert.match(rule(p, 'Conditional English evidence and holistic score guidance').noteEn, /not hard cutoffs/);
  const note = rule(mdse, 'Conditional English evidence and holistic score guidance').noteEn;
  assert.match(note, /neighbouring MSE\/MSFE targets are not inherited/); assert.doesNotMatch(note, /IELTS 6\.5|TOEFL 90/);
  assert.equal(mdse.rules.some(r => r.kind === 'gpa' && r.min === 2.5), false);
});

test('refreshed MSE/MSFE extensions produce calendar transitions while conflicting MDSE pages never generate an actionable cutoff', () => {
  const queue = loadRepositoryReviewQueue('2026-10-30');
  for (const p of [mse, msfe]) {
    for (const o of p.offerings.filter(o => o.intake === 'January 2027')) {
      const chosen = selected(p, o);
      for (const [day, state] of [['2026-06-30', 'not_yet_open'], ['2026-10-28', 'within_recorded_dates'], ['2026-11-30', 'deadline_today'], ['2026-12-01', 'deadline_passed']]) assert.equal(programmeTimeline(chosen, day).state, state);
      assert.equal(programmeTimeline(chosen, '2026-10-28').livePortalChecked, false);
    }
    const unit = queue.units.find(u => u.programmeId === p.id);
    assert.deepEqual(unit.recordedCutoffs.filter(d => d.deadline === '2026-11-30').map(d => [d.offeringId, d.deadline]), p.offerings.filter(o => o.intake === 'January 2027').map(o => [o.id, '2026-11-30']));
    assert.equal(unit.upcomingRecordedCutoffs.length, 0);
  }
  for (const o of mdse.offerings) {
    assert.equal(o.applicationOpen, null); assert.equal(o.deadline, null);
    assert.match(o.deadlineNote, /31 October/); assert.match(o.deadlineNote, /30 November/);
    for (const day of ['2026-10-28', '2026-11-15', '2027-01-01']) assert.equal(programmeTimeline(selected(mdse, o), day).state, 'dates_incomplete');
  }
  assert.equal(queue.units.find(u => u.programmeId === mdse.id).upcomingRecordedCutoffs.length, 0);
  assert.equal(queue.counts.nearCutoffUnits, 3);
});

test('cohort fee differences, credited deposits, track decisions and Beijing exclusion survive each Singapore study option', () => {
  for (const p of programmes) {
    assert.equal(p.offerings.length, 4); assert.equal(routes.has(p.id), false);
    for (const o of p.offerings) {
      const chosen = selected(p, o);
      assert.equal(chosen.offerings.length, 1); assert.equal(chosen.offerings[0].tuition, null);
      assert.equal(o.applicationFee, 100); assert.match(o.feeBasis, /Deposits contribute to tuition/);
      assert.equal(check(matchProgramme(chosen, profile), 'Individual tuition, deposit and ancillary fee applicability').status, 'unknown');
      assert.equal(check(matchProgramme(chosen, profile), 'Academic documents, resume, statement, referees and interview').status, 'unknown');
      assert.equal(o.intake.includes('Beijing'), false);
    }
    assert.equal(/\p{Script=Han}/u.test(JSON.stringify(p)), false);
  }
  assert.match(mse.offerings[0].feeBasis, /49,050/); assert.match(mse.offerings[0].feeBasis, /54,500/);
  assert.match(msfe.offerings[0].feeBasis, /57,700/); assert.match(mdse.offerings[0].feeBasis, /indicative/);
  assert.match(rule(mse, 'MSE tracks and part-time attendance').noteEn, /weekday daytime/);
  assert.match(rule(mdse, 'Singapore location, foundations and graduation standard').noteEn, /Beijing programme is outside/);
  assert.equal(rule(mdse, 'Singapore location, foundations and graduation standard').mandatory, false);
  assert.match(rule(msfe, 'MSFE curriculum versions and study pathways').noteEn, /older FAQ lists four/);
});

test('three existing catalogue IDs migrate together and idempotently while preceding objects, reports and pilot remain intact', () => {
  for (const [file, hash] of Object.entries(obs.preservation.previousSnapshotHashes)) assert.equal(createHash('sha256').update(readFileSync(new URL(file, root), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hash);
  assert.equal(batch.pilotProgrammeIds.length, 20); assert.equal(obs.programmeIds.some(id => batch.pilotProgrammeIds.includes(id)), false);
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-smu-econ-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    writeFileSync(checkedPath, JSON.stringify({ ...batch, programmes: batch.programmes.filter(p => !obs.programmeIds.includes(p.id)) }));
    db = new CatalogueStore(path, { ...options, checkedPath }); const earlier = db.all().filter(p => !obs.programmeIds.includes(p.id));
    const listings = obs.programmeIds.map(id => db.get(id).directoryListing);
    for (const id of obs.programmeIds) assert.equal(db.get(id).verification, 'catalogue_seed');
    assert.equal(db.quality().checked, batch.programmes.length - 3); db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) {
      db = new CatalogueStore(path, { ...options, checkedPath });
      for (const [i, id] of obs.programmeIds.entries()) { assert.equal(db.get(id).verification, 'programme_page_checked'); assert.deepEqual(db.get(id).directoryListing, listings[i]); }
      assert.deepEqual(db.all().filter(p => !obs.programmeIds.includes(p.id)), earlier);
      assert.deepEqual(db.quality().sourceRefreshConflicts, []); assert.equal(db.quality().checked, 194); db.close(); db = null;
    }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-28T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.address().port}`, get = async path => (await fetch(base + path)).json();
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('API matching, save/restore and export retain all twelve study selections with fee/date caveats and obsolete seed attention', async () => {
  const before = JSON.stringify(store.all());
  for (const p of programmes) for (const o of p.offerings) {
    const detail = await get('/api/programmes/' + p.id + '?offering=' + o.id);
    const response = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, offerings: { [p.id]: o.id } }) });
    assert.equal(response.status, 200); const match = (await response.json()).items.find(x => x.id === p.id).match;
    assert.equal(match.status, 'needs_confirmation'); assert.equal(match.tier, null);
    const saved = optionSnapshot(detail, '2026-10-28T04:00:00.000Z'); assert.equal(parseSavedOption(saved).offeringId, o.id);
    const resolved = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [saved, { programmeId: p.id, offeringId: p.id + '-seed' }] }) });
    assert.equal(resolved.status, 200); const items = (await resolved.json()).items; assert.deepEqual(items.map(x => x.status), ['resolved', 'needs_attention']);
    const exported = shortlistExport([items[0].programme], { [p.id]: saved }).programmes[0];
    assert.equal(exported.offerings[0].id, o.id); assert.equal(exported.offerings[0].tuition, null); assert.equal(exported.offerings[0].deadline, o.deadline);
    assert.equal(exported.offerings[0].applicationFee, 100); assert.match(exported.offerings[0].feeBasis, /Deposits contribute to tuition/);
    assert.match(exported.evidence.publishedRequirements.find(r => /institution-specific/.test(r.labelEn)).noteEn, /within five years/);
    assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined);
    assert.equal(detail.applicationTimeline.state, p.id === mdse.id ? 'dates_incomplete' : 'within_recorded_dates');
  }
  const meta = await get('/api/meta'); assert.equal(meta.quality.checked, 194); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 869);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0); assert.deepEqual(meta.quality.sourceRefreshConflicts, []);
  assert.deepEqual(applicantSummary(contexts), { studyOptions: 107, categories: 216, peerReviewed: 0 }); assert.equal(meta.routeEvidence.routes, 17);
  assert.equal(JSON.stringify(store.all()), before);
});
