import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CatalogueStore } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { loadRoutes, resolveProgramme, routeSummary } from '../server/routes.mjs';
import { loadApplicantContexts } from '../server/applicants.mjs';
import { matchProgramme } from '../server/matching.mjs';
import { programmeTimeline } from '../server/application-dates.mjs';
import { optionSnapshot, shortlistExport } from '../public/saved-options.js';
import { loadRepositoryReviewQueue } from '../scripts/source-review-queue.mjs';

const root = new URL('../', import.meta.url), read = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const batch = read('data/checked-programmes.json'), obs = read('data/research/smu-llm-observation-2026-10-28.json'), pid = obs.programmeId;
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes), p = store.get(pid);
const getRoute = key => resolveProgramme(p, routes, pid + '-ROUTE-' + key), js = getRoute('JUDICIAL'), cb = getRoute('CROSSBORDER'), lt = getRoute('LAWTECH'), dual = getRoute('DUAL');
const all = [js, cb, lt, dual], select = (r, o) => resolveProgramme(p, routes, r.selectedRoute.id, o.id, undefined, contexts);
const rule = (r, label) => r.rules.find(x => x.labelEn === label);
// Synthetic input only. Undergraduate major does not prove a later LLB/JD or accepted work.
const profile = { major: 'Computer Science', degreeStatus: 'graduated', classification: 'ordinary', gpa: 3.5, gpaScale: 4, experienceYears: 0, language: { type: 'none' } };

test('four LLM tracks preserve regular versus dual identities, independent modes and unresolved parent selection', () => {
  const parent = resolveProgramme(p, routes); assert.equal(parent.routeOptions.length, 4); assert.equal(programmeTimeline(parent, '2026-10-28').state, 'route_required');
  assert.ok(matchProgramme(parent, profile).checks.some(c => c.kind === 'route' && c.status === 'unknown'));
  assert.deepEqual(all.map(r => r.offerings.length), [2, 2, 2, 1]); assert.equal(js.offerings[1].mode, null); assert.match(js.offerings[1].duration, /extended duration/);
  assert.deepEqual(cb.offerings.map(o => o.mode), ['Full-time', 'Part-time']); assert.deepEqual(lt.offerings.map(o => o.mode), ['Full-time', 'Part-time']);
  assert.equal(dual.offerings[0].mode, 'Full-time'); assert.equal(dual.admissionRoute, 'unconfirmed'); assert.equal(dual.scope.status, 'unconfirmed'); assert.match(dual.notesEn, /two degrees, not the single joint award/);
});

test('LLM route and offering choices reject sibling reuse and cannot inherit poisoned parent criteria', () => {
  const poisoned = { ...p, rules: [{ kind: 'gpa', min: 99, scale: 100 }], notesEn: 'parent-only-marker' };
  const resolved = resolveProgramme(poisoned, routes, cb.selectedRoute.id); assert.equal(resolved.rules.some(r => r.kind === 'gpa'), false); assert.equal(resolved.notesEn.includes('parent-only-marker'), false);
  for (const r of all) for (const sibling of all.filter(x => x !== r)) assert.throws(() => resolveProgramme(p, routes, r.selectedRoute.id, sibling.offerings[0].id));
  assert.throws(() => resolveProgramme(p, routes, undefined, cb.offerings[0].id));
});

test('judicial professional requirements and non-law consideration cannot become a universal any-major pass or closed major rejection', () => {
  assert.match(rule(js, 'Track academic and professional entry').noteEn, /significant relevant legal or judicial experience/);
  assert.match(rule(js, 'Track academic and professional entry').noteEn, /not assumed to override/);
  for (const r of [cb, lt, dual]) assert.match(rule(r, 'Track academic and professional entry').noteEn, /non-law graduates considered individually/);
  for (const r of all) {
    assert.equal(r.rules.some(x => ['major', 'gpa', 'classification', 'experience'].includes(x.kind)), false);
    for (const changes of [{ major: 'Law' }, { experienceYears: 20 }, { gpa: 4 }, { degreeStatus: 'final_year' }]) {
      const match = matchProgramme(r, { ...profile, ...changes }); assert.equal(match.status, 'needs_confirmation'); assert.equal(match.tier, null);
      assert.equal(match.checks.find(c => c.labelEn === 'Track academic and professional entry').status, 'unknown');
    }
  }
});

test('LLM limited language exemptions and opening-anchored two-year validity never become self-approved waivers or a rolling date check', () => {
  assert.equal(obs.english.anchor, 'beginning of track application period'); assert.equal(obs.english.openingDay, null);
  assert.equal(obs.english.exemptionInstitutionLocations.includes('Singapore'), false); assert.equal(obs.english.postgraduateDegreeFaqException, true);
  for (const r of all) {
    assert.equal(r.rules.some(x => x.kind === 'language'), false); assert.match(rule(r, 'English applicability and application-period validity').noteEn, /not start a rolling expiry from today/);
    for (const language of [{ type: 'ielts', total: 9, testDate: '2024-01-01' }, { type: 'ielts', total: 6 }, { type: 'waiver', waiverBasis: 'english_degree' }, { type: 'toefl_6', total: 6 }]) {
      const result = matchProgramme(r, { ...profile, language }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.checks.find(c => c.labelEn === 'English applicability and application-period validity').status, 'unknown');
    }
  }
});

test('regular date-only final and historical dual cycle never become live-open dates or an inferred intraday cutoff', () => {
  for (const r of [js, cb, lt]) for (const o of r.offerings) {
    assert.equal(o.deadline, '2027-05-31'); assert.equal(o.applicationOpen, null); assert.equal(o.applicationRounds, undefined);
    for (const [day, expected] of [['2026-10-28', 'dates_incomplete'], ['2027-05-31', 'deadline_today'], ['2027-06-01', 'deadline_passed']]) assert.equal(programmeTimeline(select(r, o), day).state, expected);
    assert.equal(programmeTimeline(select(r, o), '2027-05-31', '2027-05-31T15:59:30.000Z').state, 'deadline_today');
  }
  assert.equal(dual.offerings[0].intake, null); assert.equal(dual.offerings[0].deadline, null); assert.equal(dual.fieldStatus.deadline.status, 'unknown');
  assert.equal(programmeTimeline(dual, '2026-10-28').state, 'unverified'); assert.equal(programmeTimeline(dual, '2027-05-31').livePortalChecked, false);
  assert.equal(obs.dual.historicalDeadline, '2023-11-10'); assert.match(rule(dual, 'QMUL-first application and current-cycle confirmation').noteEn, /only shortlisted applicants/);
});

test('LLM distinct selection test, referees and regular versus dual fee legs retain their conditions without automatic extras or professional qualification', () => {
  for (const r of [js, cb, lt]) {
    const note = rule(r, 'Regular materials, referees and distinct LLM selection test').noteEn;
    assert.match(note, /two employers/); assert.match(note, /one-hour LLM written test/); assert.match(note, /GMAT\/GRE\/SMU Admission Test, which are not required/);
    assert.match(note, /500-1,000-word scholarship statements are not the admission statement/);
    for (const o of r.offerings) { assert.equal(o.tuition, null); assert.equal(o.applicationFee, 100); assert.match(o.feeBasis, /39,240.*8,000/); assert.match(o.feeBasis, /do not add it again/); }
  }
  assert.equal(rule(dual, 'Regular materials, referees and distinct LLM selection test'), undefined);
  assert.equal(dual.offerings[0].currency, null); assert.equal(dual.offerings[0].tuition, null); assert.match(dual.offerings[0].feeBasis, /GBP 22,975.*SGD 37,605/);
  assert.equal(dual.offerings[0].feeBasis.includes('39,240 quote'), true); assert.match(dual.offerings[0].feeBasis, /No currency conversion/);
  for (const r of all) assert.match(r.notesEn, /not a Singapore Bar-qualifying degree/);
  const raw = [batch.programmes.find(x => x.id === pid), ...read('data/route-programmes.json').programmes.find(x => x.programmeId === pid).routes];
  assert.equal(/\p{Script=Han}/u.test(JSON.stringify(raw)), false);
});

test('one existing LLM migrates idempotently while previous records and research snapshots remain unchanged', () => {
  for (const [file, hash] of Object.entries(obs.preservation.previousSnapshotHashes)) assert.equal(createHash('sha256').update(readFileSync(new URL(file, root), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hash);
  assert.equal(batch.pilotProgrammeIds.length, 20); assert.equal(batch.pilotProgrammeIds.includes(pid), false);
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-smu-llm-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    writeFileSync(checkedPath, JSON.stringify({ ...batch, programmes: batch.programmes.filter(x => x.id !== pid) })); db = new CatalogueStore(path, { ...options, checkedPath });
    const earlier = db.all().filter(x => x.id !== pid); assert.equal(db.get(pid).verification, 'catalogue_seed'); assert.equal(db.quality().checked, batch.programmes.length - 1); db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) { db = new CatalogueStore(path, { ...options, checkedPath }); assert.equal(db.get(pid).verification, 'programme_page_checked'); assert.deepEqual(db.all().filter(x => x.id !== pid), earlier); assert.deepEqual(db.quality().sourceRefreshConflicts, []); assert.equal(db.quality().checked, 392); db.close(); db = null; }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-28T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve)); const base = `http://127.0.0.1:${app.address().port}`;
const get = async path => (await fetch(base + path)).json(), post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('actual APIs match, save, restore and export each LLM track without sibling dates, prices or student-background leakage', async () => {
  const before = JSON.stringify(store.all());
  for (const r of all) for (const o of r.offerings) {
    const detail = await get('/api/programmes/' + pid + '?route=' + r.selectedRoute.id + '&offering=' + o.id);
    assert.equal(detail.selectedRoute.id, r.selectedRoute.id); assert.equal(detail.selectedOffering.id, o.id);
    const response = await post('/api/matches', { profile, selectedRoutes: { [pid]: r.selectedRoute.id }, offerings: { [pid]: o.id } }); assert.equal(response.status, 200);
    const matched = (await response.json()).items.find(x => x.id === pid); assert.equal(matched.match.status, 'needs_confirmation'); assert.equal(matched.match.tier, null);
    const saved = optionSnapshot(detail, '2026-10-28T04:00:00.000Z'), sibling = all.find(x => x !== r);
    const reply = await post('/api/saved-options/resolve', { contexts: [saved, { programmeId: pid, offeringId: pid + '-catalogue' }, { programmeId: pid, routeId: sibling.selectedRoute.id, offeringId: o.id }] });
    assert.equal(reply.status, 200); const items = (await reply.json()).items; assert.deepEqual(items.map(x => x.status), ['resolved', 'needs_attention', 'needs_attention']);
    const exported = shortlistExport([{ ...items[0].programme, profile, match: matched.match }], { [pid]: saved }).programmes[0];
    assert.equal(exported.selectedRoute.id, r.selectedRoute.id); assert.equal(exported.offerings[0].id, o.id); assert.equal(exported.offerings.length, 1); assert.equal(exported.offerings[0].tuition, null);
    assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined); assert.ok(exported.evidence.publishedRequirements.some(x => x.labelEn === 'Track academic and professional entry'));
    if (r === dual) { assert.equal(exported.offerings[0].deadline, null); assert.equal(exported.scope.status, 'unconfirmed'); assert.equal(exported.applicationTimeline.state, 'unverified'); }
  }
  assert.equal((await fetch(base + '/api/programmes/' + pid + '?offering=' + cb.offerings[0].id)).status, 422); assert.equal(JSON.stringify(store.all()), before);
});

test('LLM observations increase evidence units without inventing new catalogue programmes, review or completeness', async () => {
  const meta = await get('/api/meta'), queue = loadRepositoryReviewQueue('2026-10-28');
  assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 865); assert.equal(meta.quality.checked, 392); assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0);
  assert.deepEqual(meta.routeEvidence, { groups: 23, routes: 53, pageChecked: 53, peerReviewed: 0, complete: 0 }); assert.deepEqual(routeSummary(routes), meta.routeEvidence);
  assert.equal(queue.counts.programmePageRecords, 392); assert.equal(queue.counts.reviewUnits, 716); assert.equal(queue.counts.routeRecords, 53); assert.equal(queue.counts.nearCutoffUnits, 2);
  assert.equal(queue.units.filter(u => u.programmeId === pid).length, 5); assert.equal(queue.counts.reviewRecordedInSource, 0);
});
