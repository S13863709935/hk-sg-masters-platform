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
const batch = read('data/checked-programmes.json'), obs = read('data/research/suss-mecch-observation-2026-10-28.json');
const p = batch.programmes.find(x => x.id === obs.programmeId), o = p.offerings[0];
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
const selected = () => resolveProgramme(store.get(p.id), routes, undefined, o.id, undefined, contexts);
// Synthetic only: the reported major does not prove award recognition, relevant work, Chinese credentials or residence.
const profile = { major: 'Early Childhood Education', degreeStatus: 'graduated', classification: 'ordinary', gpa: 2.5, gpaScale: 4, experienceYears: 0, language: { type: 'none' } };
const check = (result, label) => result.checks.find(c => c.labelEn === label);
const rule = label => p.rules.find(r => r.labelEn === label);

test('Chinese early-childhood MEd exposes the specific bachelor-field gap even when GPA and work totals are high', () => {
  for (const major of ['History', 'Business Administration', 'Education']) {
    const result = matchProgramme(selected(), { ...profile, major, gpa: 4, experienceYears: 20 });
    assert.equal(result.status, 'has_gap'); assert.equal(result.tier, null); assert.equal(result.checks.find(c => c.kind === 'major').status, 'fail');
  }
  for (const major of ['Early Childhood Education', 'Preschool Education']) {
    const result = matchProgramme(selected(), { ...profile, major, gpa: 1 });
    assert.equal(result.checks.find(c => c.kind === 'major').status, 'pass'); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(check(result, 'Early Childhood qualification recognition and relevant work').status, 'unknown');
  }
  assert.equal(p.rules.some(r => ['gpa', 'classification'].includes(r.kind)), false);
  assert.equal(matchProgramme(p, { ...profile, degreeStatus: 'final_year' }).checks.find(c => c.kind === 'degree').status, 'unknown');
});

test('required relevant work and programme-specific Chinese alternatives do not become invented years, HSK-5 or English-only passes', () => {
  assert.equal(p.rules.some(r => ['experience', 'language'].includes(r.kind)), false);
  assert.match(rule('Early Childhood qualification recognition and relevant work').noteEn, /work is required here/);
  assert.match(rule('Early Childhood qualification recognition and relevant work').noteEn, /No minimum number of work years is published/);
  const chinese = rule('Programme-specific Chinese qualification and test validity');
  assert.match(chinese.noteEn, /GCE 'A' level A2/); assert.match(chinese.noteEn, /HSK Level 6 within two years/);
  assert.match(chinese.noteEn, /No numeric HSK Level 6 score/); assert.match(chinese.noteEn, /Do not borrow HSK Level 5\/180/);
  for (const changes of [{ experienceYears: 0 }, { experienceYears: 20 }, { language: { type: 'ielts', total: 9 } }, { language: { type: 'waiver' } }]) {
    const result = matchProgramme(selected(), { ...profile, ...changes });
    assert.equal(result.status, 'needs_confirmation'); assert.equal(check(result, chinese.labelEn).status, 'unknown');
    assert.equal(check(result, 'Early Childhood qualification recognition and relevant work').status, 'unknown');
  }
});

test('800-character statement and distinct referee roles survive selection while the research project stays optional inside 60 CU', () => {
  assert.equal(validateProgramme(p, new Set(['SG-SUSS'])), p); assert.equal(p.award, 'MEd');
  assert.equal(obs.identity.compulsoryCu + obs.identity.electiveCu, 60);
  assert.equal(obs.identity.explicitInternationalDirectoryCourseworkListingNotEstablished, true);
  const documents = rule('Eight-hundred-character statement, two referee roles and assessment');
  assert.match(documents.noteEn, /within 800 Chinese characters/); assert.match(documents.noteEn, /past\/current work superior/);
  assert.match(documents.noteEn, /academic\/professional mentor/); assert.match(documents.noteEn, /Referees send letters directly/);
  assert.match(documents.noteEn, /dedicated CV requirement is not established/);
  assert.equal(check(matchProgramme(selected(), profile), documents.labelEn).status, 'unknown');
  const structure = rule('Coursework structure, optional research project and award GPA');
  assert.equal(structure.mandatory, false); assert.match(structure.noteEn, /either ECC511 and ECC512/);
  assert.match(structure.noteEn, /not an extra ten CU or a research-only identity/); assert.match(structure.noteEn, /not undergraduate entry GPA/);
  assert.equal(/\p{Script=Han}/u.test(JSON.stringify(p)), false);
});

test('resident eligibility, July-only recurrence and Chinese fee row stay separate from international access and sibling defaults', () => {
  assert.equal(o.mode, null); assert.match(o.intake, /July only/);
  for (const key of ['academicYear', 'applicationOpen', 'deadline', 'tuition', 'applicationFee']) assert.equal(o[key], null);
  for (const day of ['2026-10-28', '2027-01-01', '2027-04-15', '2027-07-01']) assert.equal(programmeTimeline(selected(), day).state, 'dates_incomplete');
  assert.match(rule('Singapore resident category and accepted pass evidence').noteEn, /Student Pass alone/);
  assert.equal(check(matchProgramme(selected(), { ...profile, gpa: 4, experienceYears: 20 }), 'Singapore resident category and accepted pass evidence').status, 'unknown');
  assert.match(rule('Study timing, teaching locations and exact intake').noteEn, /Sunday evening/);
  assert.match(rule('Study timing, teaching locations and exact intake').noteEn, /not silently rewrite it to weekday/);
  assert.match(o.feeBasis, /31,680 SC\/PR or 38,016 Other Residents before GST/); assert.match(o.feeBasis, /22,044 is not the Chinese default/);
  assert.equal([...contexts.values()].some(c => c.programmeId === p.id), false);
});

test('one existing Chinese MEd migrates independently without altering older records, reports, pilot or English sibling', () => {
  for (const [file, hash] of Object.entries(obs.preservation.previousSnapshotHashes)) assert.equal(createHash('sha256').update(readFileSync(new URL(file, root), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hash);
  assert.equal(batch.pilotProgrammeIds.length, 20); assert.equal(batch.pilotProgrammeIds.includes(p.id), false); assert.equal(routes.has(p.id), false);
  const queue = loadRepositoryReviewQueue('2026-10-28'); assert.equal(queue.counts.programmePageRecords, 109); assert.equal(queue.counts.reviewUnits, 153); assert.equal(queue.counts.reviewRecordedInSource, 0);
  assert.equal(queue.units.find(u => u.programmeId === p.id).upcomingRecordedCutoffs.length, 0);
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-suss-mecch-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    writeFileSync(checkedPath, JSON.stringify({ ...batch, programmes: batch.programmes.filter(x => x.id !== p.id) }));
    db = new CatalogueStore(path, { ...options, checkedPath }); const earlier = db.all().filter(x => x.id !== p.id), listing = db.get(p.id).directoryListing;
    assert.equal(db.get(p.id).verification, 'catalogue_seed'); assert.equal(db.quality().checked, batch.programmes.length - 1); db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) {
      db = new CatalogueStore(path, { ...options, checkedPath }); assert.equal(db.get(p.id).verification, 'programme_page_checked');
      assert.deepEqual(db.get(p.id).directoryListing, listing); assert.deepEqual(db.all().filter(x => x.id !== p.id), earlier);
      assert.deepEqual(db.quality().sourceRefreshConflicts, []); assert.equal(db.quality().checked, 109); db.close(); db = null;
    }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-28T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.address().port}`, get = async path => (await fetch(base + path)).json();
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('real matching/save/restore/export keeps major gaps and unresolved Chinese/work/referee requirements without mutating sources', async () => {
  const before = JSON.stringify(store.all()), detail = await get('/api/programmes/' + p.id + '?offering=' + o.id);
  for (const [major, expected] of [['History', 'has_gap'], ['Early Childhood Education', 'needs_confirmation'], ['Preschool Education', 'needs_confirmation']]) {
    const response = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: { ...profile, major }, offerings: { [p.id]: o.id } }) });
    assert.equal(response.status, 200); const match = (await response.json()).items.find(x => x.id === p.id).match;
    assert.equal(match.status, expected); assert.equal(match.tier, null); assert.equal(check(match, 'Programme-specific Chinese qualification and test validity').status, 'unknown');
  }
  const saved = optionSnapshot(detail, '2026-10-28T04:00:00.000Z'); assert.equal(parseSavedOption(saved).offeringId, o.id);
  const response = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [saved, { programmeId: p.id, offeringId: p.id + '-catalogue' }] }) });
  assert.equal(response.status, 200); const items = (await response.json()).items; assert.deepEqual(items.map(x => x.status), ['resolved', 'needs_attention']);
  const exported = shortlistExport([items[0].programme], { [p.id]: saved }).programmes[0]; assert.equal(exported.offerings[0].id, o.id);
  assert.equal(exported.offerings[0].tuition, null); assert.equal(exported.offerings[0].deadline, null); assert.match(exported.offerings[0].intake, /July only/);
  assert.match(exported.evidence.publishedRequirements.find(r => /Chinese qualification/.test(r.labelEn)).noteEn, /HSK Level 6/);
  assert.match(exported.evidence.publishedRequirements.find(r => /Eight-hundred-character/.test(r.labelEn)).noteEn, /800 Chinese characters/);
  assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined);
  const meta = await get('/api/meta'); assert.equal(meta.quality.checked, 109); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 870);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0); assert.deepEqual(meta.quality.sourceRefreshConflicts, []);
  assert.deepEqual(applicantSummary(contexts), { studyOptions: 33, categories: 68, peerReviewed: 0 }); assert.equal(meta.routeEvidence.routes, 11);
  assert.equal(detail.applicationTimeline.state, 'dates_incomplete'); assert.equal(JSON.stringify(store.all()), before);
});
