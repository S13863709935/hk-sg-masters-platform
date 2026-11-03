import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CatalogueStore } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { loadRoutes, resolveProgramme, hasResolvedRoute } from '../server/routes.mjs';
import { loadApplicantContexts, offeringFingerprint } from '../server/applicants.mjs';
import { programmeTimeline } from '../server/application-dates.mjs';
import { matchProgramme } from '../server/matching.mjs';

const root = new URL('../', import.meta.url);
const routePath = new URL('data/route-programmes.json', root);
const applicantPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', {
  seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root),
  checkedPath: new URL('data/checked-programmes.json', root), directoryAuditPath: new URL('data/directory-audit.json', root),
  scopeAuditPath: new URL('data/programme-scope-audit.json', root), directoryEvidencePath: new URL('data/directory-links.json', root)
});
const routes = loadRoutes(routePath, store.all());
const applicants = loadApplicantContexts(applicantPath, store.all(), routes);
const id = 'HK-HKU-P016', routeId = id + '-ROUTE-STANDARD';
const ft = id + '-STANDARD-FT-2027', pt = id + '-STANDARD-PT-2027';
const base = store.get(id);
const resolve = (offering, category) => resolveProgramme(base, routes, routeId, offering, category, applicants);
// Synthetic scores only: no real student's academic data is stored.
const profile = { major: 'Computer Science', degreeStatus: 'graduated', gpa: 3.5, gpaScale: 4,
  language: { type: 'ielts', total: 6, testDate: '2025-09-01', components: { listening: 5.5, reading: 5.5, writing: 5.5, speaking: 5.5 } } };
const check = language => matchProgramme(resolve(), { ...profile, language }).checks.find(c => c.kind === 'language');
const server = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: applicantPath, now: () => new Date('2026-10-21T04:00:00Z') });
await new Promise(done => server.listen(0, '127.0.0.1', done));
const url = `http://127.0.0.1:${server.address().port}`;
test.after(async () => { await new Promise(done => server.close(done)); store.close(); });
const get = async path => (await fetch(url + path)).json();
const details = (offering, category) => '/api/programmes/' + id + '?' + new URLSearchParams({ route: routeId, ...(offering ? { offering } : {}), ...(category ? { applicant: category } : {}) });

test('the HKU group never defaults to an ordinary or cross-border route; its parent stays unreviewed', () => {
  const p = resolveProgramme(base, routes, undefined, undefined, undefined, applicants);
  assert.equal(p.directoryListing.variants.length, 3);
  assert.deepEqual(p.routeOptions.map(r => r.id), [routeId, id + '-ROUTE-DELTA-AI', id + '-ROUTE-DELTA-STREAMS']);
  assert.equal(p.verification, 'catalogue_seed'); assert.equal(p.selectedRoute, undefined);
  assert.equal(programmeTimeline(p, '2026-10-21').state, 'route_required');
  assert.equal(matchProgramme(p, profile).checks.some(c => c.kind === 'route'), true);
  assert.throws(() => resolveProgramme(base, routes, id + '-ROUTE-DELTA', ft, undefined, applicants));
  assert.throws(() => resolveProgramme(base, routes, undefined, ft, undefined, applicants));
});

test('the ordinary route is a standalone partial snapshot, not inherited parent or Delta X criteria', () => {
  const poisoned = { ...base, rules: [{ kind: 'gpa', min: 99, scale: 100 }], notesEn: 'parent-marker' };
  const p = resolveProgramme(poisoned, routes, routeId, undefined, undefined, applicants);
  assert.ok(hasResolvedRoute(p)); assert.equal(p.id, base.id); assert.equal(p.lastChecked, '2026-10-21');
  assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.reviewer, null);
  assert.equal(p.rules.some(r => r.kind === 'gpa' || r.kind === 'major'), false);
  assert.equal(p.notesEn.includes('parent-marker'), false); assert.match(p.notesEn, /without Delta X/);
  assert.equal(p.fieldStatus.gpa.status, 'not_published'); assert.equal(p.fieldStatus.major.status, 'unknown');
});

test('missing major lists and GPA minima cannot generate eligibility or safer/match tiers', () => {
  for (const major of ['Computer Science', 'History']) {
    const r = matchProgramme(resolve(), { ...profile, major, gpa: 4, gpaScale: 4 });
    assert.equal(r.status, 'needs_confirmation'); assert.equal(r.tier, null);
    assert.equal(r.checks.find(c => c.labelEn === 'Undergraduate subject and academic suitability').status, 'unknown');
    assert.equal(r.checks.some(c => c.kind === 'gpa' || c.kind === 'major'), false);
  }
  assert.equal(matchProgramme(resolve(), { ...profile, degreeStatus: 'final_year' }).checks.find(c => c.kind === 'degree').status, 'unknown');
});

test('IELTS uses both overall 6 and every component 5.5, with the intake-anchored date boundary', () => {
  assert.equal(check(profile.language).status, 'pass');
  assert.equal(check({ ...profile.language, total: 5.5 }).status, 'fail');
  for (const name of ['listening', 'reading', 'writing', 'speaking']) {
    assert.equal(check({ ...profile.language, components: { ...profile.language.components, [name]: 5 } }).status, 'fail');
    assert.equal(check({ ...profile.language, components: { ...profile.language.components, [name]: null } }).status, 'unknown');
  }
  assert.equal(check({ ...profile.language, testDate: '2025-08-31' }).status, 'fail');
  assert.equal(check({ ...profile.language, testDate: null }).status, 'unknown');
  assert.equal(check(profile.language).testDateEvidence.notBefore, '2025-09-01');
  assert.match(check(profile.language).reasonEn, /not a rolling expiry/);
});

test('old and new TOEFL scales keep their own dates and minima, not an Arts writing rule', () => {
  assert.equal(check({ type: 'toefl_120', total: 80, testDate: '2026-01-20' }).status, 'pass');
  assert.equal(check({ type: 'toefl_120', total: 79, testDate: '2026-01-20' }).status, 'fail');
  assert.equal(check({ type: 'toefl_6', total: 4.5, testDate: '2026-01-21' }).status, 'pass');
  assert.equal(check({ type: 'toefl_6', total: 4, testDate: '2026-01-21' }).status, 'fail');
  assert.throws(() => check({ type: 'toefl_120', total: 80, testDate: '2026-01-21' }));
  assert.throws(() => check({ type: 'toefl_6', total: 4.5, testDate: '2026-01-20' }));
  const rule = resolve().rules.find(r => r.kind === 'language');
  assert.equal(rule.validityMonths, undefined); assert.equal(rule.atHomeAccepted, undefined);
  assert.equal(rule.singleAttempt, undefined); assert.equal(rule.tests.toefl_120.componentMin, undefined);
});

test('waivers and alternate language applicability remain manual even with strong test scores', () => {
  assert.equal(check({ type: 'waiver', waiverBasis: 'english_degree' }).status, 'unknown');
  const r = matchProgramme(resolve(), profile);
  assert.equal(r.checks.find(c => c.labelEn === 'English requirement applicability and alternatives').status, 'unknown');
  assert.equal(r.tier, null);
});

test('FT and PT keep separate durations and exact fingerprinted applicant contexts', () => {
  const route = routes.get(id)[0];
  assert.match(route.offerings[0].duration, /1 year normative; 2 years maximum/);
  assert.match(route.offerings[1].duration, /2 years normative; 3 years maximum/);
  for (const o of route.offerings) {
    const context = [...applicants.values()].find(r => r.offeringId === o.id);
    assert.equal(context.routeId, routeId); assert.equal(context.offeringFingerprint, offeringFingerprint(o));
    assert.equal(context.checkedOn, '2026-10-21'); assert.equal(o.tuition, null);
  }
});

test('neither study option defaults to a local/non-local amount or date', () => {
  const all = resolve();
  assert.ok(all.offerings.every(o => o.tuition === null && o.deadline === null && o.applicantCategoryRequired));
  for (const offering of [ft, pt]) {
    const p = resolve(offering);
    assert.equal(p.selectedApplicant, undefined); assert.equal(p.applicantOptions.length, 2);
    assert.equal(p.offerings[0].tuition, null); assert.equal(programmeTimeline(p, '2026-10-21').state, 'applicant_required');
  }
});

test('category fees are 2027/28 tuition, not deposits added twice or a scholarship discount', () => {
  for (const offering of [ft, pt]) {
    for (const [suffix, tuition] of [['LOCAL', 275000], ['NONLOCAL', 375000]]) {
      const p = resolve(offering, offering + '-' + suffix), o = p.offerings[0];
      assert.equal(o.tuition, tuition); assert.equal(o.currency, 'HKD'); assert.equal(o.applicationFee, 780);
      assert.equal(o.academicYear, '2027/28'); assert.equal(o.intake, 'September 2027');
      assert.match(o.feeBasis, /subject to University approval/); assert.match(o.feeBasis, /not extra tuition/);
      assert.match(o.feeBasis, offering === ft ? /two equal instalments/ : /four equal instalments/);
      assert.equal(o.tuitionEstimate, undefined);
      assert.equal(matchProgramme(p, profile).checks.find(c => c.kind === 'applicant').status, 'unknown');
    }
  }
});

test('main and clearing noon cutoffs stay visible; a future clearing date is not proof of an open portal', () => {
  const p = resolve(ft, ft + '-NONLOCAL'), o = p.offerings[0];
  assert.equal(o.applicationOpen, null); assert.equal(o.deadline, '2027-04-30');
  assert.match(o.deadlineNote, /1 December 2026 at 12:00 noon GMT\+8/);
  assert.match(o.deadlineNote, /30 April 2027 at 12:00 noon GMT\+8/);
  assert.match(o.deadlineNote, /No notifications are scheduled/);
  assert.equal(programmeTimeline(p, '2026-10-21').state, 'dates_incomplete');
  assert.equal(programmeTimeline(p, '2027-04-30').state, 'deadline_today');
  assert.equal(programmeTimeline(p, '2027-05-01').state, 'deadline_passed');
});

test('applicant selections cannot cross modes, routes or institutions', () => {
  assert.throws(() => resolve(pt, ft + '-LOCAL'));
  assert.throws(() => resolve(undefined, ft + '-LOCAL'));
  assert.throws(() => resolveProgramme(base, routes, undefined, ft, ft + '-LOCAL', applicants));
  assert.throws(() => resolveProgramme(store.get('SG-NTU-P061'), routes, 'SG-NTU-P061-ROUTE-CYBER', 'SG-NTU-P061-CYBER-FT-2027', ft + '-LOCAL', applicants));
});

test('a route offering change invalidates its categories without borrowing the other mode', () => {
  const changed = new Map(routes), records = structuredClone(routes.get(id));
  records[0].offerings[0].academicYear = '2028/29'; changed.set(id, records);
  const p = resolveProgramme(base, changed, routeId, ft, undefined, applicants);
  assert.equal(p.applicantContextStatus, 'stale'); assert.deepEqual(p.applicantOptions, []);
  assert.throws(() => resolveProgramme(base, changed, routeId, ft, ft + '-LOCAL', applicants));
  assert.equal(resolveProgramme(base, changed, routeId, pt, pt + '-LOCAL', applicants).offerings[0].tuition, 275000);
});

test('mixed route observation dates retain the older NTU dates and their source dates', () => {
  const batch = JSON.parse(readFileSync(routePath, 'utf8'));
  assert.equal(batch.checkedOn, batch.programmes.flatMap(g => g.routes).map(r => r.lastChecked).sort().at(-1));
  assert.ok(routes.get('SG-NTU-P061').every(r => r.lastChecked === '2026-10-16' && r.sources.every(s => s.checkedOn === '2026-10-16')));
  assert.equal(routes.get(id)[0].lastChecked, '2026-10-21');
  const eduhkContext = [...applicants.values()].find(r => r.programmeId === 'HK-EDUHK-P001');
  assert.equal(eduhkContext.checkedOn, '2026-10-23');
});

test('route loader rejects malformed, future, inconsistent-source and nonlatest batch dates', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-hku-routes-')), file = join(dir, 'fixture.json');
  try {
    for (const change of [
      b => { b.programmes[0].routes[0].lastChecked = '2026-02-30'; },
      b => { b.programmes[0].routes[0].lastChecked = '2026-10-22'; },
      b => { b.programmes[0].routes[0].sources[0].checkedOn = '2026-10-21'; },
      b => { b.programmes[0].routes[0].sources[0] = null; },
      b => { b.checkedOn = '2026-10-22'; },
      b => { b.checkedOn = '2026-10-20'; }
    ]) {
      const batch = JSON.parse(readFileSync(routePath, 'utf8')); change(batch);
      writeFileSync(file, JSON.stringify(batch)); assert.throws(() => loadRoutes(file, store.all()));
    }
  } finally { rmSync(file, { force: true }); rmdirSync(dir); }
});

test('GET details requires explicit route, mode and category, and does not persist a choice', async () => {
  const unselected = await get('/api/programmes/' + id);
  assert.equal(unselected.selectedRoute, undefined); assert.equal(unselected.verification, 'catalogue_seed');
  const mode = await get(details(ft)); assert.equal(mode.offerings[0].tuition, null);
  const p = await get(details(pt, pt + '-NONLOCAL'));
  assert.equal(p.selectedRoute.id, routeId); assert.equal(p.selectedOffering.id, pt);
  assert.equal(p.selectedApplicant.id, pt + '-NONLOCAL'); assert.equal(p.offerings[0].tuition, 375000);
  assert.equal(p.applicationTimeline.state, 'dates_incomplete');
  assert.equal((await get(details(pt))).selectedApplicant, undefined);
  assert.equal((await fetch(url + details(pt, ft + '-LOCAL'))).status, 422);
});

test('matching API uses the selected ordinary snapshot and synthetic scores, never a recommendation tier', async () => {
  const response = await fetch(url + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    profile, selectedRoutes: { [id]: routeId }, selectedOfferings: { [id]: ft }, selectedApplicants: { [id]: ft + '-NONLOCAL' },
    filters: { school: 'HK-HKU', q: 'Computer Science' }
  }) });
  assert.equal(response.status, 200); const data = await response.json();
  const p = data.items.find(p => p.id === id);
  assert.ok(p); assert.equal(p.offerings[0].tuition, 375000);
  assert.equal(p.match.checks.find(c => c.kind === 'language').status, 'pass');
  assert.equal(p.match.status, 'needs_confirmation'); assert.equal(p.match.tier, null);
  assert.equal(p.match.checks.some(c => c.kind === 'route'), false);
});

test('parent records and raw export are unchanged; route and category evidence have separate counts', async () => {
  const before = JSON.stringify(store.get(id)); resolve(ft, ft + '-LOCAL'); resolve(pt, pt + '-NONLOCAL');
  assert.equal(JSON.stringify(store.get(id)), before);
  const raw = await get('/api/export'), exported = raw.programmes.find(p => p.id === id);
  assert.equal(exported.verification, 'catalogue_seed'); assert.equal(exported.selectedRoute, undefined);
  assert.equal(exported.applicantEvidence, undefined);
  const meta = await get('/api/meta');
  assert.deepEqual(meta.routeEvidence, { groups: 17, routes: 41, pageChecked: 41, peerReviewed: 0, complete: 0 });
  assert.deepEqual(meta.applicantEvidence, { studyOptions: 228, categories: 457, peerReviewed: 0 });
  assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 865);
  assert.equal(meta.quality.checked, 345); assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0);
});

test('cards and details only show the unresolved-route badge when no specific route is selected', () => {
  const js = readFileSync(new URL('public/app.js', root), 'utf8');
  assert.equal([...js.matchAll(/p\.directoryListing\?\.variants\.length && !p\.selectedRoute \? badge\('routeSelection'\)/g)].length, 2);
});
