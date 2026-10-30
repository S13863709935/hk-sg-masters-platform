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
const batch = read('data/checked-programmes.json'), obs = read('data/research/suss-msch-observation-2026-10-28.json');
const programmes = obs.programmeIds.map(id => batch.programmes.find(p => p.id === id)), [general, education] = programmes;
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
const selected = (p, o = p.offerings[0]) => resolveProgramme(store.get(p.id), routes, undefined, o.id, undefined, contexts);
// Synthetic only: no native language, Chinese-medium instruction, HSK, residence or employment category is established.
const profile = { major: 'Computer Science', degreeStatus: 'graduated', classification: 'ordinary', gpa: 2.5, gpaScale: 4, experienceYears: 0, language: { type: 'none' } };
const check = (result, label) => result.checks.find(c => c.labelEn === label);

test('both Chinese Management records keep zero work, unrelated major, award GPA and English scores from becoming false admission failures', () => {
  for (const p of programmes) {
    assert.equal(p.rules.some(r => ['gpa', 'classification', 'major', 'language', 'experience'].includes(r.kind)), false);
    for (const changes of [{}, { major: 'Physics', gpa: 1 }, { gpa: 3, gpaScale: 5 }, { language: { type: 'ielts', total: 4 } }, { language: { type: 'ielts', total: 9 } }, { language: { type: 'waiver' } }]) {
      const result = matchProgramme(selected(p), { ...profile, ...changes });
      assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null); assert.equal(result.checks.some(c => c.status === 'fail'), false);
      const chinese = check(result, 'Conditional Chinese proficiency and HSK evidence'); assert.equal(chinese.status, 'unknown');
      assert.equal(check(result, 'Work and social-service advantages versus requirements').mandatory, false);
    }
    const note = p.rules.find(r => /Conditional Chinese/.test(r.labelEn)).noteEn;
    assert.match(note, /BOTH first language is not Chinese AND undergraduate instruction was not Chinese/);
    assert.match(note, /HSK Level 5 at least 180/); assert.match(note, /do not require ELPR/);
    assert.equal(matchProgramme(p, { ...profile, degreeStatus: 'final_year' }).checks.find(c => c.kind === 'degree').status, 'unknown');
  }
});

test('selected general FT/PT and Education FT remain distinct without inferring passes, employment or a part-time Education route', () => {
  assert.deepEqual(general.offerings.map(o => o.mode), ['Part-time', 'Full-time']);
  assert.deepEqual(education.offerings.map(o => o.mode), ['Full-time']);
  for (const p of programmes) for (const o of p.offerings) {
    const result = matchProgramme(selected(p, o), { ...profile, experienceYears: 20 });
    assert.equal(result.status, 'needs_confirmation'); assert.equal(check(result, 'Selected study mode, residence and Student Pass').status, 'unknown');
    assert.equal(selected(p, o).selectedOffering.id, o.id);
  }
  assert.match(general.rules.find(r => /Selected study mode/.test(r.labelEn)).noteEn, /International students must choose the accelerated option/);
  assert.match(general.rules.find(r => /Selected study mode/.test(r.labelEn)).noteEn, /not a universal unemployment requirement/);
  assert.match(education.rules.find(r => /Selected study mode/.test(r.labelEn)).noteEn, /No part-time Education variant is established/);
  assert.match(education.rules.find(r => /Selected study mode/.test(r.labelEn)).noteEn, /Do not automatically copy MSMGT/);
});

test('study and CV evidence preserve programme-specific structures without extra exit credits, teaching gates or copied EMBA documents', () => {
  for (const p of programmes) {
    assert.equal(validateProgramme(p, new Set(['SG-SUSS'])), p); assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.reviewer, null);
    assert.equal(/\p{Script=Han}/u.test(JSON.stringify(p)), false);
    const result = matchProgramme(p, profile); assert.equal(check(result, 'Chinese CV, general documents and possible interview').status, 'unknown');
    assert.match(p.rules.find(r => /Chinese CV/.test(r.labelEn)).noteEn, /Submit a Chinese CV/);
    assert.match(p.rules.find(r => /Chinese CV/.test(r.labelEn)).noteEn, /Do not import EMBA/);
    assert.match(p.rules.find(r => /Study structure/.test(r.labelEn)).noteEn, /not undergraduate entry GPA/);
  }
  assert.match(general.rules.find(r => /Study structure/.test(r.labelEn)).noteEn, /not an extra 45 CU/);
  assert.match(general.rules.find(r => /Study structure/.test(r.labelEn)).noteEn, /no credit exemptions/);
  assert.match(education.rules.find(r => /Study structure/.test(r.labelEn)).noteEn, /all twelve compulsory at five CU each/);
  assert.match(education.rules.find(r => /Study structure/.test(r.labelEn)).noteEn, /not a third admission intake/);
  assert.match(education.rules.find(r => /Chinese CV/.test(r.labelEn)).noteEn, /additional Education materials are not assumed absent/);
});

test('recurring intakes and general Chinese fee row never assign a cohort date, discounted personal price or Education tuition', () => {
  for (const p of programmes) for (const o of p.offerings) {
    for (const key of ['academicYear', 'applicationOpen', 'deadline', 'tuition', 'applicationFee']) assert.equal(o[key], null);
    for (const day of ['2026-10-28', '2027-01-01', '2027-05-01', '2027-07-01']) assert.equal(programmeTimeline(selected(p, o), day).state, 'dates_incomplete');
  }
  assert.match(general.offerings[0].feeBasis, /31,680 SC\/PR or 38,016 Other Residents before GST/);
  assert.match(general.offerings[0].feeBasis, /17,424 is separate/);
  assert.match(education.offerings[0].feeBasis, /No Education tuition quote is confirmed/);
  assert.match(education.offerings[0].feeBasis, /applicability to MSMGTEDC-A is not explicit/);
  assert.equal([...contexts.values()].some(c => programmes.some(p => p.id === c.programmeId)), false);
  const queue = loadRepositoryReviewQueue('2026-10-28');
  for (const p of programmes) assert.equal(queue.units.find(u => u.programmeId === p.id).upcomingRecordedCutoffs.length, 0);
});

test('two-record source migration preserves earlier objects and original pilot, with separate canonical identities after restart', () => {
  for (const [file, hash] of Object.entries(obs.preservation.previousSnapshotHashes)) assert.equal(createHash('sha256').update(readFileSync(new URL(file, root), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hash);
  assert.equal(batch.pilotProgrammeIds.length, 20); assert.equal(programmes.some(p => batch.pilotProgrammeIds.includes(p.id)), false);
  assert.equal(programmes.some(p => routes.has(p.id)), false);
  const queue = loadRepositoryReviewQueue('2026-10-28'); assert.equal(queue.counts.programmePageRecords, 141); assert.equal(queue.counts.reviewUnits, 196); assert.equal(queue.counts.reviewRecordedInSource, 0);
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-suss-msch-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    const other = p => !obs.programmeIds.includes(p.id);
    writeFileSync(checkedPath, JSON.stringify({ ...batch, programmes: batch.programmes.filter(other) }));
    db = new CatalogueStore(path, { ...options, checkedPath }); const earlier = db.all().filter(other), listings = programmes.map(p => db.get(p.id).directoryListing);
    assert.equal(db.quality().checked, batch.programmes.length - 2); db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) {
      db = new CatalogueStore(path, { ...options, checkedPath }); assert.equal(db.quality().checked, 141);
      for (const [i, p] of programmes.entries()) { assert.equal(db.get(p.id).verification, 'programme_page_checked'); assert.deepEqual(db.get(p.id).directoryListing, listings[i]); }
      assert.deepEqual(db.all().filter(other), earlier); assert.deepEqual(db.quality().sourceRefreshConflicts, []); db.close(); db = null;
    }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-28T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.address().port}`, get = async path => (await fetch(base + path)).json();
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('actual API, saved restore and export retain all three selected options, conditional HSK and unassigned Education fees', async () => {
  const before = JSON.stringify(store.all()), saved = [], details = [];
  for (const p of programmes) for (const o of p.offerings) {
    const detail = await get('/api/programmes/' + p.id + '?offering=' + o.id); details.push(detail);
    const snapshot = optionSnapshot(detail, '2026-10-28T04:00:00.000Z'); saved.push(snapshot); assert.equal(parseSavedOption(snapshot).offeringId, o.id);
    const response = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, offerings: { [p.id]: o.id } }) });
    assert.equal(response.status, 200); const match = (await response.json()).items.find(x => x.id === p.id).match;
    assert.equal(match.status, 'needs_confirmation'); assert.equal(match.tier, null); assert.equal(check(match, 'Conditional Chinese proficiency and HSK evidence').status, 'unknown');
  }
  const response = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [...saved, { programmeId: education.id, offeringId: education.id + '-seed' }] }) });
  assert.equal(response.status, 200); const items = (await response.json()).items; assert.deepEqual(items.map(x => x.status), ['resolved', 'resolved', 'resolved', 'needs_attention']);
  for (const [i, item] of items.slice(0, 3).entries()) {
    const exported = shortlistExport([item.programme], { [item.programme.id]: saved[i] }).programmes[0];
    assert.equal(exported.offerings[0].id, saved[i].offeringId); assert.equal(exported.offerings[0].tuition, null); assert.equal(exported.offerings[0].deadline, null);
    assert.match(exported.evidence.publishedRequirements.find(r => /Conditional Chinese/.test(r.labelEn)).noteEn, /BOTH/);
    assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined);
  }
  const meta = await get('/api/meta'); assert.equal(meta.quality.checked, 141); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 870);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0); assert.deepEqual(meta.quality.sourceRefreshConflicts, []);
  assert.deepEqual(applicantSummary(contexts), { studyOptions: 42, categories: 86, peerReviewed: 0 }); assert.equal(meta.routeEvidence.routes, 13);
  assert.equal(details.every(d => d.applicationTimeline.state === 'dates_incomplete'), true); assert.equal(JSON.stringify(store.all()), before);
});
