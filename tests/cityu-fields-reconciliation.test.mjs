import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CatalogueStore } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { loadRoutes, resolveProgramme } from '../server/routes.mjs';
import { loadApplicantContexts, applicantSummary } from '../server/applicants.mjs';
import { matchProgramme } from '../server/matching.mjs';
import { programmeTimeline } from '../server/application-dates.mjs';
import { loadRepositoryReviewQueue } from '../scripts/source-review-queue.mjs';
import { optionSnapshot, shortlistExport } from '../public/saved-options.js';

const root = new URL('../', import.meta.url), read = f => JSON.parse(readFileSync(new URL(f, root), 'utf8'));
const observation = read('data/research/cityu-fields-reconciliation-observation-2026-10-30.json');
const batch = read('data/checked-programmes.json');
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all());
const applicants = loadApplicantContexts(contextPath, store.all(), routes), p = n => store.get(`HK-CITYU-P${String(n).padStart(3, '0')}`);
const chosen = (n, suffix = 'LOCAL', mode = 'Full-time') => {
  const raw = p(n), o = raw.offerings.find(o => o.mode === mode);
  return resolveProgramme(raw, routes, undefined, o.id, suffix ? o.id + '-' + suffix : undefined, applicants);
};
const profile = { major: 'Computer Science', degreeStatus: 'graduated', classification: 'first', gpa: 4, gpaScale: 4, experienceYears: 0, language: { type: 'ielts', total: 8, testDate: '2026-09-01', singleAttempt: true } };

test('the scoped fee batch preserves award counts, separate category counts and zero complete or independent approvals', () => {
  assert.equal(observation.records.length, 21); assert.equal(observation.sourceAccess.browserFeeSchedulesRead, 22);
  const q = store.quality(); assert.equal(q.total, 873); assert.equal(q.checked, 226); assert.equal(q.browsable, 869);
  assert.equal(q.complete, 0); assert.equal(q.peerReviewed, 0); assert.deepEqual(q.sourceRefreshConflicts, []);
  assert.deepEqual(applicantSummary(applicants), { studyOptions: 146, categories: 294, peerReviewed: 0 });
  assert.equal(observation.newContextOfferingIds.length, 15);
  for (const record of observation.records) {
    const current = store.get(record.programmeId);
    assert.equal(current.requirementsCoverage, 'partial'); assert.equal(current.reviewer, null);
    assert.equal(current.fieldStatus.gpa.status, 'not_published');
    assert.ok(current.sources.some(s => s.url === record.feeUrl && s.checkedOn === '2026-10-30'));
    assert.equal(matchProgramme(current, profile).tier, null);
  }
});

test('four deadline differences resolve only after choosing the university category for the exact study mode', () => {
  for (const [n, local, nonlocal] of [[6, '2027-07-31', '2027-05-31'], [16, '2027-05-31', '2027-03-31'], [51, '2027-05-31', '2027-03-31'], [52, '2027-06-30', '2027-06-02']]) {
    for (const o of p(n).offerings) {
      const unselected = resolveProgramme(p(n), routes, undefined, o.id, undefined, applicants);
      assert.equal(unselected.offerings[0].tuition, null); assert.equal(unselected.offerings[0].deadline, null);
      assert.equal(programmeTimeline(unselected, '2026-10-30').state, 'applicant_required');
      for (const [id, cutoff] of [['LOCAL', local], ['NONLOCAL', nonlocal]]) {
        const selected = chosen(n, id, o.mode);
        assert.equal(selected.offerings[0].deadline, cutoff);
        assert.equal(programmeTimeline(selected, '2026-10-30').state, 'within_recorded_dates');
        assert.equal(programmeTimeline(selected, cutoff).state, 'deadline_today');
        assert.equal(selected.applicantEvidence.dateSourceUrl, 'https://www.cb.cityu.edu.hk/cb2025/programmes/all-programmes');
      }
    }
  }
});

test('MBA uses published category totals and does not fold overseas expenses into the programme price', () => {
  for (const mode of ['Full-time', 'Part-time']) {
    assert.equal(chosen(2, null, mode).offerings[0].tuition, null);
    const local = chosen(2, 'LOCAL', mode).offerings[0], nonlocal = chosen(2, 'NONLOCAL', mode).offerings[0];
    assert.equal(local.tuition, 512000); assert.equal(nonlocal.tuition, 560000);
    assert.notEqual(local.tuitionEstimate, true); assert.notEqual(nonlocal.tuitionEstimate, true);
    assert.match(local.feeBasis, /Published programme fee/); assert.match(nonlocal.feeBasis, /airfare\/accommodation/);
  }
});

test('31-credit computing prices stay separate from 30-credit assumptions and other programme categories', () => {
  for (const [n, local, nonlocal] of [[31, 353400, 399900], [32, 351000, 399000], [40, 350300, 396800]]) {
    for (const mode of ['Full-time', 'Part-time']) {
      const a = chosen(n, 'LOCAL', mode).offerings[0], b = chosen(n, 'NONLOCAL', mode).offerings[0];
      assert.equal(a.tuition, local); assert.equal(b.tuition, nonlocal);
      assert.equal(a.tuitionEstimate, true); assert.equal(b.tuitionEstimate, true);
      assert.match(a.feeBasis, n === 32 ? /30 credits/ : /31 credits/);
    }
  }
  const ai = p(31), o = ai.offerings[0], cyberCategory = p(40).offerings[0].id + '-LOCAL';
  assert.throws(() => resolveProgramme(ai, routes, undefined, o.id, cyberCategory, applicants));
});

test('Venture Creation uses 36 credits and ordinary CIE uses 30 rather than the 45-credit variants', () => {
  for (const o of p(58).offerings) { assert.equal(o.tuition, 428400); assert.match(o.feeBasis, /36 credits/); assert.equal(o.tuitionEstimate, true); }
  for (const o of p(39).offerings) { assert.equal(o.tuition, 279000); assert.match(o.feeBasis, /Ordinary 30-credit/); assert.equal(o.tuitionEstimate, true); }
  assert.equal(observation.records.find(r => r.code === 'P59').credits, 30);
  assert.equal(p(39).offerings.length, 2);
});

test('year-varying financial mathematics fees retain the credit ambiguity and no unsupported personal total', () => {
  assert.deepEqual(observation.specialFeeLimits.P68.credits, [30, 31]);
  assert.equal(observation.specialFeeLimits.P68.schedule['2028/29'], 9600);
  assert.equal(p(46).fieldStatus.tuition.status, 'unknown');
  for (const o of p(46).offerings) {
    assert.equal(o.tuition, null); assert.equal(o.currency, null); assert.equal(o.tuitionEstimate, undefined);
    assert.match(o.feeBasis, /30 or 31/); assert.match(o.feeBasis, /9,100/); assert.match(o.feeBasis, /11,100/);
    assert.match(o.feeBasis, /year-by-year load/); assert.equal(o.feeEvidence.checkedOn, '2026-10-30');
  }
});

test('P17 has one existing ID and partial conditions while pending title approval prevents old-title fee assignment', () => {
  const current = p(7);
  assert.equal(current.name, 'MSc Digital Commerce and Computing'); assert.equal(current.verification, 'programme_page_checked');
  assert.equal(current.requirementsCoverage, 'partial'); assert.equal(current.fieldStatus.tuition.status, 'unknown');
  assert.equal(observation.p17.titleSubjectToUniversityApproval, true);
  assert.equal(observation.p17.feeAmountsNotAssignedToPendingTitle, true);
  const result = matchProgramme(current, profile); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
  assert.equal(result.checks.find(c => /title approval/i.test(c.labelEn)).status, 'unknown');
  for (const o of current.offerings) { assert.equal(o.tuition, null); assert.equal(o.currency, null); assert.equal(o.deadline, '2027-05-31'); }
  assert.equal(store.all().filter(p => p.universityId === 'HK-CITYU').length, 62);
});

test('all new source/category bindings are valid and do not invent more near-cutoff units', () => {
  const q = loadRepositoryReviewQueue('2026-10-30');
  assert.equal(q.counts.programmePageRecords, 226); assert.equal(q.counts.remainingCatalogueLeads, 647);
  assert.equal(q.counts.applicantContexts, 146); assert.equal(q.counts.applicantCategories, 294);
  assert.equal(q.counts.reviewUnits, 389); assert.equal(q.counts.staleApplicantContexts, 0);
  assert.equal(q.counts.nearCutoffUnits, 3); assert.equal(q.counts.reviewRecordedInSource, 0);
});

test('same-day fee refresh and one new partial record are idempotent over isolated restarts', () => {
  const revised = new Set(observation.programmeIds), added = observation.newPartialProgrammeId;
  const before = { ...batch, programmes: batch.programmes.filter(p => p.id !== added).map(p => {
    if (!revised.has(p.id)) return p;
    const old = structuredClone(p); old.sources = old.sources.filter(s => !/tuitionfee|all-programmes/.test(s.url));
    old.fieldStatus.tuition = { status: 'unknown', noteEn: 'Synthetic pre-refresh fixture; fees not collected.', sourceUrl: old.officialUrl };
    old.offerings = old.offerings.map(o => { const copy = { ...o, currency: null, tuition: null, feeBasis: 'Synthetic pre-refresh fixture' }; delete copy.feeEvidence; delete copy.tuitionEstimate; return copy; });
    return old;
  }) };
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-cityu-fees-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json');
  let db;
  try {
    writeFileSync(checkedPath, JSON.stringify(before)); db = new CatalogueStore(path, { ...options, checkedPath });
    assert.equal(db.quality().checked, batch.programmes.length - 1); const untouched = db.all().filter(p => !revised.has(p.id) && p.id !== added);
    db.close(); db = null; writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) {
      db = new CatalogueStore(path, { ...options, checkedPath });
      assert.equal(db.quality().checked, 226); assert.deepEqual(db.quality().sourceRefreshConflicts, []);
      assert.deepEqual(db.all().filter(p => !revised.has(p.id) && p.id !== added), untouched);
      assert.equal(db.get('HK-CITYU-P058').offerings[0].tuition, 428400);
      const index = loadApplicantContexts(contextPath, db.all(), loadRoutes(routePath, db.all()));
      assert.equal(index.size, 146); db.close(); db = null;
    }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-30T05:00:00Z') });
let base;
test.before(async () => { await new Promise(resolve => app.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${app.address().port}`; });
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('real APIs, remembered category choices and export retain all 30 category values without storing a background', async () => {
  for (const offeringId of observation.newContextOfferingIds) {
    const record = [...applicants.values()].find(c => c.offeringId === offeringId);
    for (const option of record.options) {
      const response = await fetch(`${base}/api/programmes/${record.programmeId}?offering=${offeringId}&applicant=${option.id}`);
      assert.equal(response.status, 200); const detail = await response.json();
      assert.equal(detail.offerings[0].tuition, option.tuition); assert.equal(detail.offerings[0].deadline, option.deadline);
      assert.equal(detail.selectedApplicant.id, option.id);
      const remembered = optionSnapshot(detail, '2026-10-30T05:00:00.000Z');
      const restored = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [remembered] }) });
      assert.equal(restored.status, 200); const item = (await restored.json()).items[0]; assert.equal(item.status, 'resolved');
      assert.equal(item.programme.selectedApplicant.id, option.id);
      const exported = shortlistExport([detail], { [detail.id]: remembered }).programmes[0];
      assert.equal(exported.offerings[0].tuition, option.tuition); assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined);
    }
  }
  const unavailable = await fetch(`${base}/api/programmes/HK-CITYU-P031?offering=HK-CITYU-P031-2027-FT`);
  const detail = await unavailable.json(); assert.equal(detail.offerings[0].tuition, null); assert.equal(detail.selectedApplicant, undefined);
});
