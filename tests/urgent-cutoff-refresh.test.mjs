import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CatalogueStore } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { loadRoutes, resolveProgramme } from '../server/routes.mjs';
import { loadApplicantContexts } from '../server/applicants.mjs';
import { programmeTimeline } from '../server/application-dates.mjs';
import { matchProgramme } from '../server/matching.mjs';
import { optionSnapshot, shortlistExport } from '../public/saved-options.js';
import { loadRepositoryReviewQueue } from '../scripts/source-review-queue.mjs';

const root = new URL('../', import.meta.url), read = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const batch = read('data/checked-programmes.json'), obs = read('data/research/urgent-cutoff-observation-2026-10-24.json');
const historical = read('data/research/cuhk-suss-observation-2026-10-23.json');
const cu = batch.programmes.find(p => p.id === obs.cuhk.programmeId), ci = batch.programmes.find(p => p.id === obs.hkust.programmeId);
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
const manual = label => cu.rules.find(r => r.kind === 'manual' && r.labelEn === label).noteEn;
const profile = { major: 'Computer Science', degreeStatus: 'graduated', classification: 'ordinary', gpa: 3.8, gpaScale: 4, experienceYears: 0, language: { type: 'ielts', total: 7, atHome: true, testDate: '2026-05-01' } };
const resolve = (p, i) => resolveProgramme(store.get(p.id), routes, undefined, p.offerings[i].id, undefined, contexts);

test('one CUHK re-reading advances only its observed dates without changing pilot identities, historical observations or review status', () => {
  assert.equal(obs.checkedOn, '2026-10-24'); assert.equal(historical.checkedOn, '2026-10-23');
  assert.equal(cu.lastChecked, obs.checkedOn); assert.equal(cu.sources.length, 6); assert.ok(cu.sources.every(s => s.checkedOn === obs.checkedOn));
  assert.equal(cu.researchBatch, 'urgent-cutoff-refresh-2026-10-24'); assert.equal(batch.pilotProgrammeIds.length, 20);
  assert.equal(batch.programmes.find(p => p.id === 'SG-SUSS-P001').lastChecked, '2026-10-23');
  assert.equal(obs.hkust.storedProgrammeUnchanged, true); assert.equal(obs.limits.parentRecordsChanged, 1);
  for (const p of [cu, ci]) { assert.equal(p.verification, 'programme_page_checked'); assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.reviewer, null); }
});

test('CUHK second-round cutoff, rolling/capacity condition and unconfirmed times survive the next-round transition', () => {
  assert.deepEqual(cu.offerings.map(o => o.id), ['HK-CUHK-P001-O1', 'HK-CUHK-P001-O2']);
  for (const i of [0, 1]) {
    const p = resolve(cu, i), o = p.offerings[0]; assert.equal(o.applicationOpen, '2026-09-01'); assert.equal(o.deadline, '2027-01-31');
    assert.deepEqual(o.applicationRounds.map(r => r.deadline), historical.cuhk.dates.roundDeadlines);
    assert.ok(o.applicationRounds.every(r => r.applicationOpen === null && r.deadlineAt === null));
    for (const [day, next] of [['2026-10-24', 'ROUND-2'], ['2026-10-31', 'ROUND-2'], ['2026-11-01', 'ROUND-3']]) {
      const t = programmeTimeline(p, day); assert.equal(t.offerings[0].nextRoundId, next); assert.equal(t.offerings[0].sourceCheckedOn, obs.checkedOn); assert.equal(t.livePortalChecked, false);
    }
    assert.match(o.deadlineNote, /subject to places/);
  }
});

test('HKUST near cutoff applies only to February part-time MSc and never imports September category rounds or a PGD option', () => {
  const p = resolve(ci, 0), o = p.offerings[0];
  assert.equal(o.id, 'HK-HKUST-P001-FEB2027-PT'); assert.equal(o.mode, 'Part-time'); assert.equal(o.academicYear, '2026/27');
  assert.equal(o.applicationOpen, null); assert.equal(o.applicationRounds, undefined); assert.equal(o.deadline, '2026-11-01');
  assert.equal(p.applicantOptions, undefined); assert.equal(o.tuition, 180000); assert.equal(o.applicationFee, 600);
  assert.equal(ci.offerings.some(o => o.intake === 'February 2027' && o.mode === 'Full-time'), false);
  for (const [day, state] of [['2026-10-24', 'dates_incomplete'], ['2026-11-01', 'deadline_today'], ['2026-11-02', 'deadline_passed']]) assert.equal(programmeTimeline(p, day).state, state);
  for (const i of [1, 2]) { assert.equal(ci.offerings[i].academicYear, '2027/28'); assert.equal(programmeTimeline(resolve(ci, i), '2026-10-24').state, 'applicant_required'); }
});

test('CUHK provisional annual fees and part-time conflict stay unresolved despite matching deadline sources', () => {
  assert.equal(cu.offerings[0].tuition, 198000); assert.match(cu.offerings[0].feeBasis, /pending university approval/);
  assert.equal(cu.offerings[0].tuitionEstimate, undefined); // Not a minimum-credit estimate.
  assert.equal(cu.offerings[1].tuition, null); assert.equal(cu.fieldStatus.tuition.status, 'unknown');
  assert.match(cu.offerings[1].feeBasis, /99,000 per annum.*99,000 over two years/);
  assert.match(cu.fieldStatus.tuition.noteEn, /older update footer/); assert.equal(obs.cuhk.fees.approvalConfirmed, false);
  assert.match(cu.fieldStatus.academicYear.noteEn, /Fall 2026 heading/);
});

test('application, payment and mailed supporting evidence retain a joint deadline without site submission or unnecessary personal details', () => {
  const note = manual('Programme documents and individual review');
  for (const re of [/two references \(online or hard copy\)/, /online application plus mailed supporting documents/, /BY THE DEADLINE/, /application, payment and all supporting documents/, /receipt\/delivery instructions/, /does not collect, mail or submit/]) assert.match(note, re);
  assert.equal(obs.cuhk.documents.purposeStatementPages, 1); assert.equal(obs.cuhk.documents.references, 2);
  assert.equal(obs.cuhk.documents.websiteCollectsOrSubmits, false);
});

test('taught MA scope, course language and mixed research FAQ do not become anthropology/Cantonese/writing-sample prerequisites or stipends', () => {
  const note = manual('Taught MA scope, delivery language and mixed FAQ boundaries');
  for (const re of [/without previous anthropology study/, /entirely coursework.*no thesis/, /MPhil.*not MA admission gates/, /required MA courses are in English/, /some electives are in Cantonese/, /No Cantonese test/, /stipends.*not MA fee deductions/, /1 September 2025/]) assert.match(note, re);
  assert.equal(cu.rules.some(r => r.kind === 'major' || r.kind === 'experience'), false);
  assert.equal(cu.fieldStatus.major.status, 'unknown'); assert.equal(obs.cuhk.academic.universalAnyMajorRule, false);
  assert.equal(matchProgramme(cu, { ...profile, major: 'Anthropology' }).tier, null);
});

test('CUHK alternative academic/English evidence stays manual and does not inherit HKUST no-home or numeric-GPA gates', () => {
  assert.equal(cu.rules.some(r => ['gpa', 'classification'].includes(r.kind)), false);
  assert.match(manual('Academic standing and equivalence'), /OR an accepted professional\/similar qualification/);
  assert.match(manual('English evidence, alternatives and validity'), /Home Edition.*Test Centre\/Online/);
  assert.match(manual('English evidence, alternatives and validity'), /no expiry countdown from today/);
  assert.equal(matchProgramme(cu, profile).status, 'needs_confirmation');
  assert.equal(matchProgramme(cu, profile).checks.find(c => c.kind === 'language').status, 'pass');
  const hk = matchProgramme(ci, { ...profile, major: 'Civil Engineering', classification: 'first', language: { ...profile.language, components: { listening: 6, reading: 6, writing: 6, speaking: 6 }, singleAttempt: true } });
  assert.equal(hk.checks.find(c => c.kind === 'language').status, 'fail');
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-24T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + app.address().port, get = async path => { const r = await fetch(base + path); assert.equal(r.status, 200); return r.json(); };
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('saved CUHK modes reload the new source notes and date without replacing the selection or exporting the student profile', async () => {
  const detail = await get('/api/programmes/HK-CUHK-P001?offering=HK-CUHK-P001-O2');
  const saved = optionSnapshot(detail, '2026-10-23T04:00:00.000Z');
  const r = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [saved] }) });
  assert.equal(r.status, 200); const row = (await r.json()).items[0]; assert.equal(row.status, 'resolved');
  assert.equal(row.programme.selectedOffering.id, saved.offeringId); assert.equal(row.programme.lastChecked, obs.checkedOn);
  assert.equal(row.programme.offerings[0].tuition, null);
  const out = shortlistExport([row.programme], { [cu.id]: saved }).programmes[0];
  assert.equal(out.evidence.lastChecked, obs.checkedOn); assert.equal(out.profile, undefined); assert.equal(out.match, undefined);
  assert.ok(out.evidence.publishedRequirements.some(r => /mailed supporting documents/.test(r.noteEn || '')));
  const list = await get('/api/catalogue?' + new URLSearchParams({ school: 'HK-CUHK', q: 'Anthropology' }));
  assert.equal(list.items.find(p => p.id === cu.id).lastChecked, obs.checkedOn);
});

test('an isolated synthetic older-source database reloads CUHK notes after restart without rewriting the unchanged CIEM object', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-cutoff-recheck-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    const older = structuredClone(batch), p = older.programmes.find(p => p.id === cu.id);
    p.lastChecked = historical.checkedOn; p.sources.forEach(s => { s.checkedOn = historical.checkedOn; });
    p.rules = p.rules.filter(r => r.labelEn !== 'Taught MA scope, delivery language and mixed FAQ boundaries');
    p.researchBatch = 'cuhk-suss-refresh-2026-10-23';
    writeFileSync(checkedPath, JSON.stringify(older)); db = new CatalogueStore(path, { ...options, checkedPath });
    const prior = db.get(ci.id); assert.equal(db.get(cu.id).lastChecked, historical.checkedOn);
    db.close(); db = null; writeFileSync(checkedPath, JSON.stringify(batch)); db = new CatalogueStore(path, { ...options, checkedPath });
    assert.equal(db.get(cu.id).lastChecked, obs.checkedOn); assert.equal(db.get(cu.id).rules.length, cu.rules.length);
    assert.deepEqual(db.get(ci.id), prior); assert.deepEqual(db.quality().sourceRefreshConflicts, []);
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

test('review worklist and API counts remain unchanged; source rereading is not independent review or a live-open result', async () => {
  const before = JSON.stringify(store.all()), q = loadRepositoryReviewQueue(obs.checkedOn), meta = await get('/api/meta');
  assert.equal(q.counts.reviewUnits, 70); assert.equal(q.counts.pendingHumanReview, 70);
  assert.equal(q.units.find(u => u.kind === 'programme' && u.programmeId === cu.id).sourceCheckedOn, obs.checkedOn);
  const next = loadRepositoryReviewQueue('2026-11-02');
  assert.ok(next.units.filter(u => [cu.id, ci.id].includes(u.programmeId)).every(u => u.upcomingRecordedCutoffs.length === 0));
  assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 870); assert.equal(meta.quality.checked, 47);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0); assert.deepEqual(meta.quality.sourceRefreshConflicts, []);
  assert.deepEqual(meta.applicantEvidence, { studyOptions: 18, categories: 38, peerReviewed: 0 }); assert.equal(meta.routeEvidence.routes, 5);
  assert.equal(JSON.stringify(store.all()), before);
});
