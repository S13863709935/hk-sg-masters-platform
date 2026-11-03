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
const batch = read('data/checked-programmes.json'), obs = read('data/research/suss-chbiz-observation-2026-10-28.json');
const programmes = obs.programmeIds.map(id => batch.programmes.find(p => p.id === id)), [data, fintech, ip] = programmes;
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
const selected = (p, o = p.offerings[0]) => resolveProgramme(store.get(p.id), routes, undefined, o.id, undefined, contexts);
// Synthetic background: HSK, native language, institution medium, actual instruction, pass and employment are unverified.
const profile = { major: 'History', degreeStatus: 'graduated', classification: 'ordinary', gpa: 2.5, gpaScale: 4, experienceYears: 0, language: { type: 'none' } };
const check = (result, label) => result.checks.find(c => c.labelEn === label);
const rule = (p, label) => p.rules.find(r => r.labelEn === label);

test('three Chinese MScs preserve equivalent qualification, zero work and unreported academic gates without English-only failures', () => {
  for (const p of programmes) {
    assert.equal(validateProgramme(p, new Set(['SG-SUSS'])), p); assert.equal(p.area, 'Business');
    assert.equal(p.rules.some(r => ['gpa', 'classification', 'major', 'language', 'experience'].includes(r.kind)), false);
    for (const changes of [{}, { degreeStatus: 'other', experienceYears: 2 }, { gpa: 1 }, { gpa: 3, gpaScale: 5 }, { language: { type: 'ielts', total: 4 } }, { language: { type: 'ielts', total: 9 } }, { language: { type: 'waiver' } }]) {
      const result = matchProgramme(selected(p), { ...profile, ...changes });
      assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null); assert.equal(result.checks.some(c => c.status === 'fail'), false);
      assert.equal(check(result, 'Qualification recognition and case-by-case alternatives').status, 'unknown');
      assert.equal(check(result, 'Work, volunteering and study internships').mandatory, false);
    }
    assert.equal(matchProgramme(p, { ...profile, degreeStatus: 'other' }).checks.find(c => c.kind === 'degree').status, 'unknown');
    assert.equal(/\p{Script=Han}/u.test(JSON.stringify(p)), false);
  }
});

test('HSK evidence keeps three programme-specific trigger wordings instead of borrowing native-language or instruction exceptions', () => {
  const label = 'Programme-specific Chinese proficiency and HSK evidence';
  assert.match(rule(data, label).noteEn, /BOTH first language is not Chinese AND the degree was awarded by a non-Chinese-medium institution/);
  assert.match(rule(fintech, label).noteEn, /stated trigger does not include a native-Chinese exception/);
  assert.match(rule(ip, label).noteEn, /BOTH first language is not Chinese AND undergraduate instruction was not Chinese/);
  assert.doesNotMatch(rule(fintech, label).noteEn, /when BOTH/);
  for (const p of programmes) for (const o of p.offerings) {
    const result = matchProgramme(selected(p, o), { ...profile, language: { type: 'ielts', total: 9 } });
    assert.equal(check(result, label).status, 'unknown'); assert.match(rule(p, label).noteEn, /HSK Level 5 at least 180/);
  }
});

test('six selected modes keep Data Analytics extension/hybrid, FinTech postgraduate grades and Chinese IP structure separate', () => {
  for (const p of programmes) {
    assert.deepEqual(p.offerings.map(o => o.mode), ['Part-time', 'Full-time']);
    for (const o of p.offerings) {
      const detail = selected(p, o), result = matchProgramme(detail, { ...profile, experienceYears: 20 });
      assert.equal(detail.selectedOffering.id, o.id); assert.equal(check(result, 'Selected mode, employment, residence and Student Pass').status, 'unknown');
      assert.equal(result.status, 'needs_confirmation');
    }
  }
  assert.match(data.offerings[1].duration, /maximum 1.5 years/);
  assert.doesNotMatch(fintech.offerings[1].duration, /1.5/); assert.doesNotMatch(ip.offerings[1].duration, /1.5/);
  const label = 'Programme structure, award grades and sibling boundaries';
  assert.match(rule(data, label).noteEn, /without data-analysis\/programming background/);
  assert.match(rule(data, label).noteEn, /does not establish entirely offshore completion/);
  assert.match(rule(data, label).noteEn, /rather than adding both upper limits into 65 CU/);
  assert.match(rule(fintech, label).noteEn, /certificate and 30-CU diploma require CGPA 2.5/);
  assert.match(rule(fintech, label).noteEn, /not undergraduate entry GPA/);
  assert.match(rule(ip, label).noteEn, /six compulsory five-CU courses/);
  assert.match(rule(ip, label).noteEn, /do not establish the English programme dual-system WIPO application/);
});

test('materials, events, dates and separate Chinese fee rows remain unresolved without mandatory referee or personal-price inventions', () => {
  const label = 'Programme-specific materials and possible interview';
  assert.match(rule(data, label).noteEn, /contact remains optional/); assert.match(rule(ip, label).noteEn, /Chinese CV is explicitly required/);
  assert.match(rule(fintech, label).noteEn, /No explicit Financial Technology CV requirement was established/);
  assert.match(rule(fintech, label).noteEn, /does not establish that CV\/additional materials are unnecessary/);
  assert.match(rule(fintech, 'Programme structure, award grades and sibling boundaries').noteEn, /masterclass.*is an event/);
  for (const p of programmes) for (const o of p.offerings) {
    for (const key of ['academicYear', 'applicationOpen', 'deadline', 'tuition', 'applicationFee']) assert.equal(o[key], null);
    for (const day of ['2026-10-28', '2027-01-01', '2027-07-01']) assert.equal(programmeTimeline(selected(p, o), day).state, 'dates_incomplete');
    assert.match(o.feeBasis, /not an assigned personal price/);
  }
  assert.match(data.offerings[0].feeBasis, /31,680 SC\/PR or 38,016 Other Residents/);
  assert.match(fintech.offerings[0].feeBasis, /31,680 SC\/PR or 38,016 Other Residents/);
  assert.match(ip.offerings[0].feeBasis, /36,000 SC\/PR or 43,200 Other Residents/);
  assert.equal([...contexts.values()].some(c => programmes.some(p => p.id === c.programmeId)), false);
});

test('three-record source migration preserves prior objects, original pilot and previous report hashes across restarts', () => {
  for (const [file, hash] of Object.entries(obs.preservation.previousSnapshotHashes)) assert.equal(createHash('sha256').update(readFileSync(new URL(file, root), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hash);
  assert.equal(batch.pilotProgrammeIds.length, 20); assert.equal(programmes.some(p => batch.pilotProgrammeIds.includes(p.id) || routes.has(p.id)), false);
  const queue = loadRepositoryReviewQueue('2026-10-28'); assert.equal(queue.counts.programmePageRecords, 345); assert.equal(queue.counts.reviewUnits, 614); assert.equal(queue.counts.reviewRecordedInSource, 0);
  for (const p of programmes) assert.equal(queue.units.find(u => u.programmeId === p.id).upcomingRecordedCutoffs.length, 0);
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-suss-chbiz-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    const other = p => !obs.programmeIds.includes(p.id);
    writeFileSync(checkedPath, JSON.stringify({ ...batch, programmes: batch.programmes.filter(other) }));
    db = new CatalogueStore(path, { ...options, checkedPath }); const earlier = db.all().filter(other), listings = programmes.map(p => db.get(p.id).directoryListing);
    assert.equal(db.quality().checked, batch.programmes.length - 3); db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) {
      db = new CatalogueStore(path, { ...options, checkedPath }); assert.equal(db.quality().checked, 345);
      for (const [i, p] of programmes.entries()) { assert.equal(db.get(p.id).verification, 'programme_page_checked'); assert.deepEqual(db.get(p.id).directoryListing, listings[i]); }
      assert.deepEqual(db.all().filter(other), earlier); assert.deepEqual(db.quality().sourceRefreshConflicts, []); db.close(); db = null;
    }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-28T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.address().port}`, get = async path => (await fetch(base + path)).json();
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('real matching/save/restore/export preserves all six mode choices, distinct HSK conditions and null personal fees without mutating sources', async () => {
  const before = JSON.stringify(store.all()), saved = [];
  for (const p of programmes) for (const o of p.offerings) {
    const detail = await get('/api/programmes/' + p.id + '?offering=' + o.id), snapshot = optionSnapshot(detail, '2026-10-28T04:00:00.000Z');
    saved.push(snapshot); assert.equal(parseSavedOption(snapshot).offeringId, o.id);
    const response = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, offerings: { [p.id]: o.id } }) });
    assert.equal(response.status, 200); const match = (await response.json()).items.find(x => x.id === p.id).match;
    assert.equal(match.status, 'needs_confirmation'); assert.equal(match.tier, null);
    assert.equal(check(match, 'Programme-specific Chinese proficiency and HSK evidence').status, 'unknown');
  }
  const response = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [...saved, { programmeId: data.id, offeringId: data.id + '-seed' }] }) });
  assert.equal(response.status, 200); const items = (await response.json()).items; assert.deepEqual(items.map(x => x.status), [...Array(6).fill('resolved'), 'needs_attention']);
  for (const [i, item] of items.slice(0, 6).entries()) {
    const exported = shortlistExport([item.programme], { [item.programme.id]: saved[i] }).programmes[0];
    assert.equal(exported.offerings[0].id, saved[i].offeringId); assert.equal(exported.offerings[0].tuition, null); assert.equal(exported.offerings[0].deadline, null);
    assert.equal(exported.evidence.publishedRequirements.find(r => /Programme-specific Chinese/.test(r.labelEn)).noteEn, rule(programmes.find(p => p.id === item.programme.id), 'Programme-specific Chinese proficiency and HSK evidence').noteEn);
    assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined);
  }
  const meta = await get('/api/meta'); assert.equal(meta.quality.checked, 345); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 865);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0); assert.deepEqual(meta.quality.sourceRefreshConflicts, []);
  assert.deepEqual(applicantSummary(contexts), { studyOptions: 228, categories: 457, peerReviewed: 0 }); assert.equal(meta.routeEvidence.routes, 41);
  assert.equal(JSON.stringify(store.all()), before);
});
