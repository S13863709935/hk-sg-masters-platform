import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CatalogueStore } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { loadRoutes, resolveProgramme } from '../server/routes.mjs';
import { loadApplicantContexts, offeringFingerprint, applicantSummary } from '../server/applicants.mjs';
import { matchProgramme } from '../server/matching.mjs';
import { programmeTimeline } from '../server/application-dates.mjs';
import { optionSnapshot, shortlistExport } from '../public/saved-options.js';
import { validateProgramme } from '../server/validation.mjs';
import { loadRepositoryReviewQueue } from '../scripts/source-review-queue.mjs';

const root = new URL('../', import.meta.url), read = f => JSON.parse(readFileSync(new URL(f, root), 'utf8'));
const batch = read('data/checked-programmes.json'), obs = read('data/research/eduhk-ads-observation-2026-10-25.json');
const p = batch.programmes.find(x => x.id === obs.programmeId), o = p.offerings[0];
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
const context = [...contexts.values()].find(c => c.programmeId === p.id);
const manual = name => p.rules.find(r => r.kind === 'manual' && r.labelEn === name).noteEn;
const profile = { major: 'Computer Science', degreeStatus: 'graduated', classification: 'ordinary', gpa: 3, gpaScale: 4, experienceYears: 0, language: { type: 'ielts', total: 6.5, testDate: '2026-05-01' } };
const resolve = category => resolveProgramme(store.get(p.id), routes, undefined, o.id, category && o.id + '-' + category, contexts);

test('existing ADS identity gains one partial programme check and one category context, not a new catalogue or expanded pilot', () => {
  assert.equal(read('data/catalogue-expansion.json').programmes.find(x => x.id === p.id).verification, 'catalogue_seed');
  assert.equal(validateProgramme(p, new Set(['HK-EDUHK'])), p);
  assert.equal(p.verification, 'programme_page_checked'); assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.reviewer, null);
  assert.equal(p.lastChecked, obs.checkedOn); assert.ok(p.sources.every(s => s.checkedOn === obs.checkedOn));
  assert.equal(p.admissionRoute, 'direct'); assert.equal(p.award, 'MSc'); assert.equal(p.area, 'Computing');
  assert.equal(batch.pilotProgrammeIds.length, 20); assert.equal(batch.pilotProgrammeIds.includes(p.id), false);
  assert.equal(p.offerings.length, 1); assert.equal(o.mode, 'Full-time'); assert.equal(o.duration, '1 year');
  assert.equal(o.id, p.id + '-SEP2027-FT'); assert.equal(o.academicYear, '2027/28'); assert.equal(o.intake, 'September 2027');
  assert.equal(context.offeringFingerprint, offeringFingerprint(o)); assert.equal(context.checkedOn, obs.checkedOn);
  assert.equal(/\p{Script=Han}/u.test(JSON.stringify(p)), false);
});

test('science/engineering preference does not reject other degrees or invent hard GPA, honours or work requirements', () => {
  assert.equal(p.rules.some(r => ['major', 'gpa', 'classification', 'experience'].includes(r.kind)), false);
  assert.equal(p.fieldStatus.major.status, 'unknown'); assert.equal(p.fieldStatus.gpa.status, 'not_published');
  assert.match(manual('Subject preference and qualification recognition'), /preferred, not required-only/);
  for (const major of ['Computer Science', 'Economics', 'History']) {
    const r = matchProgramme(p, { ...profile, major }); assert.equal(r.status, 'needs_confirmation'); assert.equal(r.tier, null);
    assert.equal(r.checks.some(c => ['major', 'gpa', 'classification', 'experience'].includes(c.kind) && c.status === 'fail'), false);
  }
  assert.equal(matchProgramme(p, { ...profile, degreeStatus: 'final_year' }).checks.find(c => c.kind === 'degree').status, 'unknown');
});

test('Putonghua delivery neither imports English-medium IELTS thresholds nor silently grants a language waiver', () => {
  assert.equal(p.rules.some(r => r.kind === 'language'), false); assert.equal(p.fieldStatus.language.status, 'unknown');
  const note = manual('Putonghua instruction and unresolved admission-language evidence');
  for (const re of [/Putonghua supplemented by English/, /cannot automatically be assigned/, /no numeric language cutoff/, /no English waiver, automatic language pass/]) assert.match(note, re);
  for (const language of [{ type: 'ielts', total: 4 }, { type: 'ielts', total: 9 }, { type: 'waiver' }]) {
    const r = matchProgramme(p, { ...profile, language }); assert.equal(r.status, 'needs_confirmation'); assert.equal(r.tier, null);
    assert.equal(r.checks.some(c => c.kind === 'language' && ['pass', 'fail'].includes(c.status)), false);
  }
});

test('category-specific application fees and finals do not default to non-local or multiply whole-programme tuition', () => {
  for (const [category, fee, final] of [['LOCAL', 400, '2027-05-31'], ['NONLOCAL', 500, '2027-05-10']]) {
    const r = resolve(category), x = r.offerings[0];
    assert.equal(x.tuition, 227700); assert.equal(x.applicationFee, fee); assert.equal(x.deadline, final); assert.equal(x.applicationOpen, '2026-10-05');
    assert.equal(x.tuitionEstimate, undefined); assert.match(x.feeBasis, /whole-programme/); assert.match(x.feeBasis, /acceptance payment credited/);
    assert.equal(r.selectedApplicant.id, o.id + '-' + category); assert.equal(r.applicantEvidence.checkedOn, '2026-10-25');
    assert.equal(matchProgramme(r, profile).checks.find(c => c.kind === 'applicant').status, 'unknown');
  }
  assert.match(manual('Fees, credited acceptance payment and separate charges'), /No deposit amount/);
  const r = resolve(); assert.equal(r.applicantOptions.length, 2); assert.equal(r.selectedApplicant, undefined);
  for (const key of ['tuition', 'applicationFee', 'applicationOpen', 'deadline']) assert.equal(r.offerings[0][key], null);
  assert.equal(programmeTimeline(r, '2026-10-25').state, 'applicant_required');
});

test('central early/main/final rounds retain category identity and never use January MPPM or exact midnight assumptions', () => {
  for (const category of ['LOCAL', 'NONLOCAL']) {
    const r = resolve(category), final = category === 'LOCAL' ? '2027-05-31' : '2027-05-10';
    assert.deepEqual(r.offerings[0].applicationRounds.map(x => x.deadline), ['2027-01-04', '2027-02-15', final]);
    assert.ok(r.offerings[0].applicationRounds.every(x => x.applicationOpen === null && x.deadlineAt === null));
    assert.match(r.offerings[0].deadlineNote, /Earlier programme closure/);
    for (const [day, round] of [['2026-10-25', 'EARLY'], ['2027-01-05', 'MAIN'], ['2027-02-16', 'FINAL']]) {
      const t = programmeTimeline(r, day); assert.equal(t.offerings[0].nextRoundId, round); assert.equal(t.livePortalChecked, false);
    }
    assert.equal(programmeTimeline(r, category === 'LOCAL' ? '2027-06-01' : '2027-05-11').state, 'deadline_passed');
  }
  assert.throws(() => resolveProgramme(store.get(p.id), routes, undefined, o.id, 'HK-EDUHK-P001-O1-NONLOCAL', contexts));
});

test('stale offering bindings withhold prices and date evidence rather than accepting an old category choice', () => {
  const altered = { ...store.get(p.id), offerings: [{ ...o, duration: 'Synthetic changed duration' }] };
  const r = resolveProgramme(altered, routes, undefined, o.id, undefined, contexts);
  assert.equal(r.applicantContextStatus, 'stale'); assert.deepEqual(r.applicantOptions, []);
  assert.equal(r.offerings[0].tuition, null); assert.equal(r.offerings[0].deadline, null);
  assert.throws(() => resolveProgramme(altered, routes, undefined, o.id, context.options[0].id, contexts));
});

test('document provenance records full visual PDF pages without borrowing PSC, portfolio or all-applicant verification rules', () => {
  assert.deepEqual(obs.pdfs.map(x => [x.pages, x.visuallyReadPages]), [[1, [1]], [1, [1]], [2, [1, 2]]]);
  assert.ok(obs.pdfs.every(x => /^[a-f0-9]{64}$/.test(x.sha256)));
  assert.equal(obs.rendering.securityBypassed, false);
  assert.match(manual('Additional material scope and language verification'), /absence does not prove no further request/);
  assert.match(manual('Additional material scope and language verification'), /Do not import.*PSC certificate/);
  assert.match(manual('Academic documents, final-year status and validation'), /branches are distinct, not requirements for every nationality/);
  assert.match(manual('Translations and registration restrictions'), /certified English translation/);
  assert.match(manual('Study delivery and conditional interview'), /Python is a taught core/);
});

test('today adds a new review snapshot without rewriting yesterday or relabelling old source dates', () => {
  const old = readFileSync(new URL('docs/research/source-review-queue-2026-10-24.md', root), 'utf8').replaceAll('\r\n', '\n');
  assert.equal(createHash('sha256').update(old).digest('hex'), '439d1b0b11c0f2ed71380e1d707d90729652bc990b98cad94a6650e7a28a5a6f');
  assert.match(old, /项目页记录 28 条/); assert.match(old, /共 50 个工作单元/); assert.equal(old.includes(p.id), false);
  const today = loadRepositoryReviewQueue('2026-10-25'), yesterday = loadRepositoryReviewQueue('2026-10-24');
  const current = today.units.find(x => x.kind === 'applicant_context' && x.programmeId === p.id);
  const future = yesterday.units.find(x => x.kind === 'applicant_context' && x.programmeId === p.id);
  assert.ok(current.categories.every(x => x.tuition === 227700)); assert.ok(future.categories.every(x => x.tuition === null && x.recordedCutoffs.length === 0));
  assert.equal(today.counts.reviewUnits, 58); assert.equal(today.counts.reviewRecordedInSource, 0);
  assert.equal(today.units.find(x => x.programmeId === 'SG-NTU-P062').sourceCheckedOn, '2026-10-24');
  assert.deepEqual(today.units.filter(x => x.upcomingRecordedCutoffs.length).map(x => x.programmeId), ['HK-CUHK-P001', 'HK-HKUST-P001']);
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-25T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + app.address().port, get = async path => { const r = await fetch(base + path); assert.equal(r.status, 200); return r.json(); };
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('browse and match APIs retain category fees/dates and unresolved admission language', async () => {
  for (const suffix of ['LOCAL', 'NONLOCAL']) {
    const applicant = o.id + '-' + suffix, qs = new URLSearchParams({ offering: o.id, applicant });
    const detail = await get('/api/programmes/' + p.id + '?' + qs);
    assert.equal(detail.offerings[0].tuition, 227700); assert.equal(detail.fieldStatus.language.status, 'unknown');
    assert.equal(detail.selectedApplicant.id, applicant);
    const list = await get('/api/catalogue?' + new URLSearchParams({ school: 'HK-EDUHK', limit: '100', offerings: JSON.stringify({ [p.id]: o.id }), applicants: JSON.stringify({ [p.id]: applicant }) }));
    assert.equal(list.items.find(x => x.id === p.id).offerings[0].applicationFee, suffix === 'LOCAL' ? 400 : 500);
    const r = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, filters: { school: 'HK-EDUHK' }, selectedOfferings: { [p.id]: o.id }, selectedApplicants: { [p.id]: applicant } }) });
    assert.equal(r.status, 200); const item = (await r.json()).items.find(x => x.id === p.id);
    assert.equal(item.match.status, 'needs_confirmation'); assert.equal(item.match.tier, null);
  }
});

test('saved ADS context reloads the chosen category; retired catalogue choices require explicit repair without profile export', async () => {
  const detail = await get('/api/programmes/' + p.id + '?offering=' + o.id + '&applicant=' + o.id + '-NONLOCAL');
  const saved = optionSnapshot(detail);
  const r = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [saved, { programmeId: p.id, offeringId: p.id + '-catalogue' }] }) });
  assert.equal(r.status, 200); const items = (await r.json()).items; assert.deepEqual(items.map(x => x.status), ['resolved', 'needs_attention']);
  const exported = shortlistExport([items[0].programme], { [p.id]: saved }).programmes[0];
  assert.equal(exported.offerings[0].tuition, 227700); assert.equal(exported.offerings[0].applicationFee, 500);
  assert.equal(exported.offerings[0].deadline, '2027-05-10'); assert.equal(exported.selectedApplicant.id, o.id + '-NONLOCAL');
  assert.equal(exported.evidence.lastChecked, '2026-10-25'); assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined);
});

test('first ADS source migration preserves all prior programme objects, directory evidence and restart state', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-ads-source-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    writeFileSync(checkedPath, JSON.stringify({ ...batch, checkedOn: '2026-10-24', programmes: batch.programmes.filter(x => x.id !== p.id) }));
    db = new CatalogueStore(path, { ...options, checkedPath });
    const previous = db.all().filter(x => x.id !== p.id), directory = db.get(p.id).directoryListing;
    assert.equal(db.get(p.id).verification, 'catalogue_seed'); assert.equal(db.quality().checked, 34); db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) {
      db = new CatalogueStore(path, { ...options, checkedPath });
      assert.equal(db.get(p.id).verification, 'programme_page_checked'); assert.deepEqual(db.get(p.id).directoryListing, directory);
      assert.deepEqual(db.all().filter(x => x.id !== p.id), previous); assert.deepEqual(db.quality().sourceRefreshConflicts, []);
      const ri = loadRoutes(routePath, db.all()); assert.deepEqual(applicantSummary(loadApplicantContexts(contextPath, db.all(), ri)), { studyOptions: 18, categories: 38, peerReviewed: 0 });
      db.close(); db = null;
    }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

test('ADS lookup, matching and export do not write data or inflate independent review and catalogue coverage', async () => {
  const before = JSON.stringify(store.all()); resolve('LOCAL'); matchProgramme(resolve('NONLOCAL'), profile);
  const meta = await get('/api/meta'); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 870); assert.equal(meta.quality.checked, 35);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0); assert.deepEqual(meta.quality.sourceRefreshConflicts, []);
  assert.deepEqual(meta.applicantEvidence, { studyOptions: 18, categories: 38, peerReviewed: 0 }); assert.equal(meta.routeEvidence.routes, 5);
  assert.equal(JSON.stringify(store.all()), before);
});
