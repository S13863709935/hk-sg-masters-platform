import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CatalogueStore } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { loadRoutes, resolveProgramme } from '../server/routes.mjs';
import { loadApplicantContexts } from '../server/applicants.mjs';
import { matchProgramme } from '../server/matching.mjs';
import { programmeTimeline } from '../server/application-dates.mjs';
import { optionSnapshot, shortlistExport } from '../public/saved-options.js';
import { loadRepositoryReviewQueue } from '../scripts/source-review-queue.mjs';

const root = new URL('../', import.meta.url), read = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const batch = read('data/checked-programmes.json'), obs = read('data/research/smu-mba-observation-2026-10-28.json'), pid = obs.programmeId;
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes), p = store.get(pid);
const selected = o => resolveProgramme(p, routes, undefined, o.id, undefined, contexts), rule = label => p.rules.find(r => r.labelEn === label), check = (r, label) => r.checks.find(c => c.labelEn === label);
// Synthetic total years do not establish a graduation date or full-time work history.
const profile = { major: 'Computer Science', degreeStatus: 'graduated', classification: 'ordinary', gpa: 3.5, gpaScale: 4, experienceYears: 2, language: { type: 'none' } };

test('MBA is one existing programme with four separate intake/mode choices, not extra specialisation degrees or route groups', () => {
  assert.deepEqual(p.offerings.map(o => [o.intake, o.mode]), [['January 2027', 'Full-time'], ['January 2027', 'Part-time'], ['August 2027', 'Full-time'], ['August 2027', 'Part-time']]);
  assert.equal(routes.has(pid), false); assert.equal(p.directoryListing, undefined); assert.equal(batch.pilotProgrammeIds.includes(pid), false); assert.equal(batch.pilotProgrammeIds.length, 20);
  assert.equal(new Set(p.offerings.map(o => o.id)).size, 4); assert.equal(p.rules.some(r => r.kind === 'major' && r.any === true), true);
});

test('strict two-year requirement detects insufficient total work but cannot approve post-degree full-time work from aggregate years', () => {
  assert.equal(obs.work.strictMinimum, true); assert.match(rule('Post-degree full-time work evidence').noteEn, /two years of full-time work after the degree/);
  for (const o of p.offerings) for (const experienceYears of [0, 1, 1.9, 2, 20, null]) {
    const match = matchProgramme(selected(o), { ...profile, experienceYears }); assert.equal(match.status, experienceYears !== null && experienceYears < 2 ? 'has_gap' : 'needs_confirmation'); assert.equal(match.tier, null);
    assert.equal(check(match, 'Total work years: necessary two-year lower bound only').status, experienceYears === null ? 'unknown' : experienceYears < 2 ? 'fail' : 'pass');
    assert.equal(check(match, 'Post-degree full-time work evidence').status, 'unknown');
  }
  const strong = matchProgramme(selected(p.offerings[0]), { ...profile, gpa: 4, experienceYears: 0, language: { type: 'ielts', total: 9 } }); assert.equal(strong.status, 'has_gap'); assert.equal(strong.tier, null);
});

test('any-field recognition and alumni test-substitute figures do not become entry GPA, a free admission-test waiver or a CFA work exception', () => {
  assert.equal(p.rules.some(r => r.kind === 'gpa' || r.kind === 'classification'), false);
  assert.match(rule('Admission-test alternatives and recent-alumni evidence').noteEn, /No minimum GMAT\/GRE score/);
  assert.match(rule('Admission-test alternatives and recent-alumni evidence').noteEn, /FAQ instead says a test is compulsory/);
  assert.match(rule('Post-degree full-time work evidence').noteEn, /No MWM CFA work-waiver/);
  for (const changes of [{ major: 'History' }, { major: 'Finance', gpa: 4 }, { gpa: 4.9, gpaScale: 5 }, { degreeStatus: 'final_year' }]) {
    const match = matchProgramme(selected(p.offerings[0]), { ...profile, ...changes }); assert.equal(match.status, 'needs_confirmation'); assert.equal(check(match, 'Any undergraduate field').status, 'pass');
    assert.equal(check(match, 'Admission-test alternatives and recent-alumni evidence').status, 'unknown'); assert.equal(match.tier, null);
  }
});

test('unconfirmed English thresholds and postgraduate wording never inherit another SMU minimum or approve self-reported waivers', () => {
  assert.equal(p.rules.some(r => r.kind === 'language'), false); assert.equal(obs.language.numericMinimum, null); assert.equal(obs.language.validityAnchor, null);
  for (const language of [{ type: 'none' }, { type: 'ielts', total: 9 }, { type: 'toefl_6', total: 6 }, { type: 'waiver', waiverBasis: 'english_degree' }]) {
    const match = matchProgramme(selected(p.offerings[0]), { ...profile, language }); assert.equal(match.status, 'needs_confirmation'); assert.equal(check(match, 'Conditional English proof and unresolved thresholds').status, 'unknown');
  }
});

test('three January and two August final variants stay unresolved without inferred years, rounds, imminent cutoffs or live availability', () => {
  assert.deepEqual([obs.dateConflict.headerJanuaryFinal, obs.dateConflict.mainJanuaryFinal, obs.dateConflict.landingJanuaryFinal], ['30 October', '30 November', '31 October']);
  assert.equal(p.fieldStatus.deadline.status, 'unknown'); assert.equal(obs.dateConflict.applicableDeadlineYearsConfirmed, false);
  for (const o of p.offerings) {
    assert.equal(o.deadline, null); assert.equal(o.applicationOpen, null); assert.equal(o.applicationRounds, undefined);
    for (const day of ['2026-10-28', '2026-10-30', '2026-10-31', '2026-11-30', '2027-05-30', '2027-05-31', '2027-06-01']) {
      const timeline = programmeTimeline(selected(o), day); assert.equal(timeline.state, 'dates_incomplete'); assert.equal(timeline.livePortalChecked, false);
    }
  }
  const queue = loadRepositoryReviewQueue('2026-10-28'); assert.equal(queue.counts.nearCutoffUnits, 2); assert.deepEqual(queue.units.find(u => u.programmeId === pid).upcomingRecordedCutoffs, []);
});

test('cohort fees and credited advances stay separate; materials, pre-study and conflicting internship wording do not manufacture requirements or personal totals', () => {
  assert.equal(obs.fees.january2027.advanceCredited, 7000); assert.equal(obs.fees.august2027.advanceCredited, 10000); assert.equal(obs.fees.august2027.indicativeTuitionInclusiveGst, 82840);
  for (const o of p.offerings) { assert.equal(o.tuition, null); assert.equal(o.applicationFee, 100); assert.match(o.feeBasis, /credited/); }
  for (const o of p.offerings.slice(0, 2)) assert.match(o.feeBasis, /January applicability needs confirmation/);
  for (const o of p.offerings.slice(2)) { assert.match(o.feeBasis, /82,840/); assert.match(o.feeBasis, /excluding GST.*inclusive/); assert.match(o.feeBasis, /only one tuition discount/); }
  assert.match(rule('Current materials, referees and interview').noteEn, /resume with LinkedIn/); assert.match(rule('Current materials, referees and interview').noteEn, /two personal statements of 500-600 words each/);
  assert.equal(rule('Study format, pre-study and curriculum versions').mandatory, false); assert.match(rule('Study format, pre-study and curriculum versions').noteEn, /optional, while FAQ\/alumni wording calls.*compulsory/);
  assert.match(rule('Study format, pre-study and curriculum versions').noteEn, /not a prior qualification or entry GPA/); assert.equal(/\p{Script=Han}/u.test(JSON.stringify(batch.programmes.find(x => x.id === pid))), false);
});

test('MBA migrates idempotently without changing earlier programmes or archived source files', () => {
  for (const [file, hash] of Object.entries(obs.preservation.previousSnapshotHashes)) assert.equal(createHash('sha256').update(readFileSync(new URL(file, root), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hash);
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-smu-mba-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    writeFileSync(checkedPath, JSON.stringify({ ...batch, programmes: batch.programmes.filter(x => x.id !== pid) })); db = new CatalogueStore(path, { ...options, checkedPath });
    const earlier = db.all().filter(x => x.id !== pid); assert.equal(db.get(pid).verification, 'catalogue_seed'); assert.equal(db.quality().checked, batch.programmes.length - 1); db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) { db = new CatalogueStore(path, { ...options, checkedPath }); assert.equal(db.get(pid).verification, 'programme_page_checked'); assert.deepEqual(db.all().filter(x => x.id !== pid), earlier); assert.deepEqual(db.quality().sourceRefreshConflicts, []); assert.equal(db.quality().checked, 429); db.close(); db = null; }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-28T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve)); const base = `http://127.0.0.1:${app.address().port}`;
const get = async path => (await fetch(base + path)).json(), post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('actual MBA matching/save/restore/export preserves intake choice, necessary work gaps and unresolved chronology/dates without background leakage', async () => {
  const before = JSON.stringify(store.all());
  for (const o of p.offerings) {
    const detail = await get('/api/programmes/' + pid + '?offering=' + o.id); assert.equal(detail.selectedOffering.id, o.id); assert.equal(detail.applicationTimeline.state, 'dates_incomplete');
    for (const experienceYears of [0, 2, 20]) {
      const response = await post('/api/matches', { profile: { ...profile, experienceYears }, offerings: { [pid]: o.id } }); assert.equal(response.status, 200);
      const match = (await response.json()).items.find(x => x.id === pid).match; assert.equal(match.status, experienceYears < 2 ? 'has_gap' : 'needs_confirmation'); assert.equal(match.tier, null);
    }
    const saved = optionSnapshot(detail, '2026-10-28T04:00:00.000Z');
    const reply = await post('/api/saved-options/resolve', { contexts: [saved, { programmeId: pid, offeringId: pid + '-catalogue' }, { programmeId: pid, offeringId: 'SG-SMU-P014-CROSSBORDER-AUG2027-FT' }] });
    assert.equal(reply.status, 200); const items = (await reply.json()).items; assert.deepEqual(items.map(x => x.status), ['resolved', 'needs_attention', 'needs_attention']);
    const exported = shortlistExport([{ ...items[0].programme, profile, match: { status: 'meets_checked' } }], { [pid]: saved }).programmes[0];
    assert.equal(exported.offerings[0].id, o.id); assert.equal(exported.offerings.length, 1); assert.equal(exported.offerings[0].tuition, null); assert.equal(exported.offerings[0].deadline, null);
    assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined); assert.ok(exported.evidence.publishedRequirements.some(x => x.labelEn === 'Post-degree full-time work evidence'));
  }
  assert.equal((await fetch(base + '/api/programmes/' + pid + '?offering=SG-SMU-P014-CROSSBORDER-AUG2027-FT')).status, 422); assert.equal(JSON.stringify(store.all()), before);
});

test('MBA increases partial programme and maintenance counts without extra routes, fake independent review or urgent dates', async () => {
  const meta = await get('/api/meta'), queue = loadRepositoryReviewQueue('2026-10-28');
  assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 865); assert.equal(meta.quality.checked, 429); assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0);
  assert.deepEqual(meta.routeEvidence, { groups: 28, routes: 63, pageChecked: 63, peerReviewed: 0, complete: 0 });
  assert.equal(queue.counts.programmePageRecords, 429); assert.equal(queue.counts.reviewUnits, 815); assert.equal(queue.counts.nearCutoffUnits, 2); assert.equal(queue.counts.reviewRecordedInSource, 0); assert.equal(queue.units.filter(u => u.programmeId === pid).length, 1);
});
