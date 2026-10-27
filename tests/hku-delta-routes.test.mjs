import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CatalogueStore } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { loadRoutes, resolveRoute, resolveProgramme } from '../server/routes.mjs';
import { loadApplicantContexts, offeringFingerprint } from '../server/applicants.mjs';
import { matchProgramme } from '../server/matching.mjs';
import { programmeTimeline } from '../server/application-dates.mjs';
import { optionSnapshot, shortlistExport, savedOptionsPayload } from '../public/saved-options.js';

const root = new URL('../', import.meta.url), routePath = new URL('data/route-programmes.json', root), applicantPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryAuditPath: new URL('data/directory-audit.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root), directoryEvidencePath: new URL('data/directory-links.json', root) });
const routes = loadRoutes(routePath, store.all()), applicants = loadApplicantContexts(applicantPath, store.all(), routes);
const id = 'HK-HKU-P016', standard = id + '-ROUTE-STANDARD', ai = id + '-ROUTE-DELTA-AI', streams = id + '-ROUTE-DELTA-STREAMS';
const aiFt = id + '-DELTA-AI-FT-2027', streamsFt = id + '-DELTA-STREAMS-FT-2027', streamsPt = id + '-DELTA-STREAMS-PT-2027';
const base = store.get(id), route = key => routes.get(id).find(r => r.routeId === key);
const resolve = (key, offering, applicant) => resolveProgramme(base, routes, key, offering, applicant, applicants);
// Synthetic student background only; not a real applicant or a user-testing result.
const profile = { major: 'Computer Science', degreeStatus: 'graduated', gpa: 4, gpaScale: 4, language: { type: 'ielts', total: 6, testDate: '2025-09-01', components: { listening: 5.5, reading: 5.5, writing: 5.5, speaking: 5.5 } } };
const server = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: applicantPath, now: () => new Date('2026-10-21T04:00:00Z') });
await new Promise(done => server.listen(0, '127.0.0.1', done));
const url = `http://127.0.0.1:${server.address().port}`;
test.after(async () => { await new Promise(done => server.close(done)); store.close(); });
const query = (key, offering, applicant) => '/api/programmes/' + id + '?' + new URLSearchParams({ route: key, ...(offering ? { offering } : {}), ...(applicant ? { applicant } : {}) });
const get = path => fetch(url + path).then(r => r.json());

test('all three exact HKU pathways are explicit options, never a silent default or extra catalogue degree', () => {
  const p = resolveProgramme(base, routes, undefined, undefined, undefined, applicants);
  assert.deepEqual(p.routeOptions.map(r => r.id), [standard, ai, streams]);
  assert.deepEqual(p.routeOptions.map(r => r.scope?.status || null), [null, 'unconfirmed', 'unconfirmed']);
  assert.equal(p.selectedRoute, undefined); assert.equal(p.verification, 'catalogue_seed');
  assert.equal(p.directoryListing.variants.length, 3); assert.equal(store.quality().total, 873);
});

test('Shanghai semesters are route-specific and remain a delivery/scope question, not an academic rejection', () => {
  for (const [key, semester] of [[ai, 1], [streams, 2]]) {
    const p = resolve(key), r = matchProgramme(p, profile);
    assert.match(p.scope.reasonEn, new RegExp('Semester ' + semester + ' study in Shanghai'));
    assert.equal(p.scope.status, 'unconfirmed'); assert.equal(p.scope.sourceUrl, p.officialUrl);
    assert.equal(r.checks.find(c => c.kind === 'scope').status, 'unknown');
    assert.equal(r.status, 'needs_confirmation'); assert.equal(r.tier, null);
  }
});

test('each Delta X route is a standalone source snapshot, without inherited parent or ordinary-route rules', () => {
  for (const key of [ai, streams]) {
    const p = resolveRoute({ ...base, notesEn: 'parent marker', rules: [{ kind: 'gpa', min: 99, scale: 100 }] }, routes, key);
    assert.equal(p.notesEn.includes('parent marker'), false); assert.equal(p.rules.some(r => r.kind === 'gpa' || r.kind === 'major'), false);
    assert.equal(p.rules.find(r => r.kind === 'degree').sourceUrl, p.officialUrl);
    assert.equal(p.fieldStatus.major.status, 'unknown'); assert.equal(p.fieldStatus.gpa.status, 'not_published');
    assert.equal(p.lastChecked, '2026-10-21'); assert.equal(p.reviewer, null); assert.equal(p.requirementsCoverage, 'partial');
    assert.ok(p.sources.some(s => s.url === p.officialUrl)); assert.ok(p.sources.every(s => s.checkedOn === '2026-10-21'));
  }
});

test('AI offers FT only; the other Delta X pathway records FT/PT without promising PT Shanghai arrangements', () => {
  assert.deepEqual(route(ai).offerings.map(o => o.mode), ['Full-time']);
  assert.deepEqual(route(streams).offerings.map(o => o.mode), ['Full-time', 'Part-time']);
  assert.match(route(ai).offerings[0].duration, /1 year normative; 2 years maximum/);
  assert.match(route(streams).offerings[1].duration, /2 years normative; 3 years maximum/);
  assert.match(route(streams).rules.at(-1).noteEn, /Shanghai schedule.*require confirmation/);
  assert.throws(() => resolve(ai, streamsPt));
});

test('route, study option and applicant contexts cannot be reused across the three pathways', () => {
  assert.throws(() => resolve(ai, id + '-STANDARD-FT-2027'));
  assert.throws(() => resolve(streams, aiFt));
  assert.throws(() => resolve(standard, streamsFt));
  assert.throws(() => resolve(ai, aiFt, streamsFt + '-LOCAL'));
  assert.throws(() => resolve(streams, streamsPt, streamsFt + '-NONLOCAL'));
});

test('all three new study options have independently bound categories, with no automatic non-local default', () => {
  for (const [key, offering] of [[ai, aiFt], [streams, streamsFt], [streams, streamsPt]]) {
    const p = resolve(key, offering), record = [...applicants.values()].find(r => r.offeringId === offering);
    assert.equal(p.selectedApplicant, undefined); assert.equal(p.offerings[0].tuition, null); assert.equal(p.offerings[0].deadline, null);
    assert.equal(p.applicantOptions.length, 2); assert.equal(p.offerings[0].applicationRounds, undefined);
    assert.equal(record.routeId, key); assert.equal(record.officialUrl, route(key).officialUrl);
    assert.equal(record.offeringFingerprint, offeringFingerprint(route(key).offerings.find(o => o.id === offering)));
    assert.equal(programmeTimeline(p, '2026-10-21').state, 'applicant_required');
  }
});

test('published category tuition is not discounted by a Fellowship, increased by a credited deposit or treated as an all-in budget', () => {
  for (const [key, offering] of [[ai, aiFt], [streams, streamsFt], [streams, streamsPt]]) for (const [suffix, price] of [['LOCAL', 275000], ['NONLOCAL', 375000]]) {
    const p = resolve(key, offering, offering + '-' + suffix), o = p.offerings[0];
    assert.equal(o.tuition, price); assert.equal(o.applicationFee, 780); assert.equal(o.currency, 'HKD');
    assert.match(o.feeBasis, /subject to University approval/); assert.match(o.feeBasis, /credited, not extra tuition/);
    assert.match(o.feeBasis, /No Fellowship discount/); assert.match(o.feeBasis, /cross-border travel costs are excluded/);
    assert.match(o.feeBasis, offering === streamsPt ? /four instalments/ : /two instalments/);
    assert.equal(p.scope.status, 'unconfirmed'); assert.equal(p.reviewer, null);
  }
});

test('Fellowship opportunities and support do not become numeric guarantees or GPA minima', () => {
  for (const key of [ai, streams]) {
    const p = resolve(key);
    assert.match(p.notesEn, /No support amount, scholarship deduction, internship placement guarantee/);
    assert.match(p.rules.find(r => r.labelEn === 'Cross-border Fellowship arrangements').noteEn, /not guaranteed placements/);
    assert.equal(p.rules.some(r => r.kind === 'experience' || r.kind === 'gpa'), false);
    assert.equal(p.sources.some(s => /delta-x-26-27/.test(s.url)), false);
  }
});

test('language minima use the current central source, with component and intake date checks rather than invented subject acceptance', () => {
  for (const key of [ai, streams]) {
    const p = resolve(key), evaluate = input => matchProgramme(p, input).checks.find(c => c.kind === 'language');
    assert.equal(evaluate(profile).status, 'pass');
    assert.equal(evaluate({ ...profile, language: { ...profile.language, components: { ...profile.language.components, writing: 5 } } }).status, 'fail');
    assert.equal(evaluate({ ...profile, language: { ...profile.language, testDate: '2025-08-31' } }).status, 'fail');
    assert.equal(evaluate({ ...profile, language: { type: 'toefl_120', total: 80, testDate: '2026-01-20' } }).status, 'pass');
    assert.equal(evaluate({ ...profile, language: { type: 'toefl_6', total: 4.5, testDate: '2026-01-21' } }).status, 'pass');
    assert.equal(evaluate({ ...profile, language: { type: 'waiver' } }).status, 'unknown');
    assert.equal(matchProgramme(p, { ...profile, major: 'History' }).status, 'needs_confirmation');
  }
});

test('unconfirmed delivery alone blocks a recommendation even in an otherwise complete synthetic checked fixture', () => {
  const synthetic = { officialUrl: route(ai).officialUrl, admissionRoute: 'direct', verification: 'peer_reviewed', requirementsCoverage: 'complete', rules: [{ kind: 'degree', labelEn: 'Synthetic degree', labelZh: '', sourceUrl: route(ai).officialUrl }], scope: route(ai).scope };
  assert.equal(matchProgramme(synthetic, profile).status, 'needs_confirmation'); assert.equal(matchProgramme(synthetic, profile).tier, null);
  const withoutScope = { ...synthetic }; delete withoutScope.scope;
  assert.equal(matchProgramme(withoutScope, profile).status, 'meets_checked');
});

test('scope uncertainty does not hide the unreviewed-data fallback when there are no usable requirements', () => {
  const synthetic = { ...route(ai), verification: 'catalogue_seed', rules: [] };
  const r = matchProgramme(synthetic, profile);
  assert.ok(r.checks.some(c => c.kind === 'data')); assert.ok(r.checks.some(c => c.kind === 'scope'));
  assert.equal(r.tier, null);
});

test('a global parent exclusion cannot be bypassed; a parent hint cannot overwrite an exact-route caution', () => {
  const excluded = { ...base, scope: { status: 'out_of_scope', reasonEn: 'Synthetic parent exclusion', sourceUrl: route(ai).officialUrl, checkedOn: '2026-10-21' } };
  assert.equal(resolveRoute(excluded, routes, ai).scope.status, 'out_of_scope');
  assert.equal(matchProgramme(resolveRoute(excluded, routes, ai), profile).status, 'out_of_scope');
  const hinted = { ...base, scope: { ...excluded.scope, status: 'unconfirmed', reasonEn: 'Generic parent hint' } };
  assert.equal(resolveRoute(hinted, routes, ai).scope.reasonEn, route(ai).scope.reasonEn);
});

test('switching back to ordinary CS leaves its criteria, category fingerprints and lack of a Delta X scope label intact', () => {
  resolve(ai, aiFt, aiFt + '-LOCAL'); resolve(streams, streamsPt, streamsPt + '-NONLOCAL');
  const p = resolve(standard, id + '-STANDARD-FT-2027', id + '-STANDARD-FT-2027-NONLOCAL');
  assert.equal(p.scope, undefined); assert.equal(p.offerings[0].tuition, 375000);
  assert.equal(matchProgramme(p, profile).checks.some(c => c.kind === 'scope'), false);
  assert.match(p.notesEn, /without Delta X Fellowship/);
});

test('round snapshots retain exact noon cutoffs but cannot establish cross-border eligibility or an open window', () => {
  for (const [key, offering] of [[ai, aiFt], [streams, streamsPt]]) {
    const p = resolve(key, offering, offering + '-NONLOCAL');
    const d = programmeTimeline(p, '2026-12-01', '2026-12-01T04:00:00.000Z');
    assert.equal(d.offerings[0].rounds[0].state, 'cutoff_reached'); assert.equal(d.offerings[0].nextRoundId, 'CLEARING');
    assert.equal(d.state, 'dates_incomplete'); assert.equal(d.livePortalChecked, false);
    assert.equal(matchProgramme(p, profile).checks.find(c => c.kind === 'scope').status, 'unknown');
  }
});

test('route loading rejects malformed scope evidence instead of displaying a false cleared status', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-delta-scope-')), file = join(dir, 'routes.json');
  try {
    for (const patch of [{ status: 'approved' }, { checkedOn: '2026-02-30' }, { checkedOn: '2026-10-22' }, { sourceUrl: 'https://hku.hk.attacker.invalid/' }, { sourceUrl: 'https://www.hku.hk/unobserved-scope' }, { reasonEn: '' }]) {
      const data = JSON.parse(readFileSync(routePath, 'utf8'));
      Object.assign(data.programmes.find(p => p.programmeId === id).routes.find(r => r.routeId === ai).scope, patch);
      writeFileSync(file, JSON.stringify(data)); assert.throws(() => loadRoutes(file, store.all()));
    }
  } finally { rmSync(file, { force: true }); rmdirSync(dir); }
});

test('GET exposes the route warning and exact fee context without altering the unselected parent', async () => {
  const unselected = await get('/api/programmes/' + id);
  assert.equal(unselected.scope, undefined); assert.equal(unselected.selectedRoute, undefined);
  const p = await get(query(ai, aiFt, aiFt + '-NONLOCAL'));
  assert.equal(p.scope.status, 'unconfirmed'); assert.equal(p.offerings[0].tuition, 375000);
  assert.equal(p.selectedRoute.id, ai); assert.equal(p.selectedOffering.id, aiFt);
  assert.equal((await fetch(url + query(ai, streamsPt))).status, 422);
  assert.equal((await get(query(ai, aiFt))).offerings[0].tuition, null);
});

test('matching API keeps scope uncertainty separate from passed language and never returns an admission tier', async () => {
  const result = await fetch(url + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, selectedRoutes: { [id]: streams }, selectedOfferings: { [id]: streamsPt }, selectedApplicants: { [id]: streamsPt + '-LOCAL' }, filters: { school: 'HK-HKU', q: 'Computer Science' } }) });
  assert.equal(result.status, 200); const p = (await result.json()).items.find(p => p.id === id);
  assert.equal(p.match.checks.find(c => c.kind === 'language').status, 'pass');
  assert.equal(p.match.checks.find(c => c.kind === 'scope').status, 'unknown');
  assert.equal(p.match.status, 'needs_confirmation'); assert.equal(p.match.tier, null); assert.equal(p.scope.status, 'unconfirmed');
});

test('candidate export retains the route delivery warning while remembered browser storage contains IDs only', async () => {
  const p = await get(query(ai, aiFt, aiFt + '-NONLOCAL')), saved = optionSnapshot(p);
  const output = shortlistExport([p], { [id]: saved });
  assert.deepEqual(output.programmes[0].scope, p.scope); assert.match(output.programmes[0].scope.reasonEn, /Semester 1/);
  const stored = JSON.stringify(savedOptionsPayload({ [id]: saved }));
  assert.equal(stored.includes('Shanghai'), false); assert.equal(stored.includes('tuition'), false);
  const response = await fetch(url + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [saved] }) });
  assert.equal((await response.json()).items[0].programme.scope.status, 'unconfirmed');
});

test('route/category evidence is counted separately and no original parent, workbook-backed record or review is upgraded', async () => {
  const before = JSON.stringify(store.get(id)); resolve(ai, aiFt, aiFt + '-LOCAL');
  assert.equal(JSON.stringify(store.get(id)), before);
  const raw = await get('/api/export'); assert.equal(raw.programmes.find(p => p.id === id).verification, 'catalogue_seed');
  const meta = await get('/api/meta');
  assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 870); assert.equal(meta.quality.checked, 30);
  assert.deepEqual(meta.routeEvidence, { groups: 2, routes: 5, pageChecked: 5, peerReviewed: 0, complete: 0 });
  assert.deepEqual(meta.applicantEvidence, { studyOptions: 18, categories: 38, peerReviewed: 0 });
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0);
  assert.ok(routes.get('SG-NTU-P061').every(r => r.lastChecked === '2026-10-16'));
});

test('English cards, detail headers, route selectors, comparison and export carry the scope caution', () => {
  const js = readFileSync(new URL('public/app.js', root), 'utf8'), copy = readFileSync(new URL('public/copy.js', root), 'utf8');
  assert.ok([...js.matchAll(/\$\{scopeBadge\(p\)\}/g)].length >= 3);
  assert.match(js, /routeSelector\(p\) \+ scopeWarning\(p\)/);
  assert.match(js, /cross-border scope unconfirmed/); assert.match(js, /\['deliveryScope', p => scopeWarning\(p\)/);
  assert.match(js, /esc\(p.scope.reasonEn\)/); assert.match(copy, /Delivery \/ scope needs confirmation/);
  assert.match(readFileSync(new URL('public/saved-options.js', root), 'utf8'), /scope: p.scope \|\| null/);
});
