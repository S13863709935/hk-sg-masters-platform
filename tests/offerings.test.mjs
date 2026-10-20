import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CatalogueStore } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { resolveOffering, validateOfferingSelections } from '../server/offerings.mjs';
import { loadRoutes, resolveProgramme, hasResolvedRoute } from '../server/routes.mjs';
import { matchProgramme } from '../server/matching.mjs';
import { programmeTimeline } from '../server/application-dates.mjs';

const root = new URL('../', import.meta.url);
const routePath = new URL('data/route-programmes.json', root);
const store = new CatalogueStore(':memory:', { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryAuditPath: new URL('data/directory-audit.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root), directoryEvidencePath: new URL('data/directory-links.json', root) });
const routes = loadRoutes(routePath, store.all());
const server = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, now: () => new Date('2026-10-16T04:00:00Z') });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
test.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); });
const get = async path => (await fetch(url + path)).json();
const profile = { major: 'Computer Science', degreeStatus: 'graduated', language: { type: 'ielts', total: 7 } };
const post = value => fetch(url + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
const edu = store.get('HK-EDUHK-P001');
const ntu = 'SG-NTU-P061';
const crypto = ntu + '-ROUTE-CRYPTO', cyber = ntu + '-ROUTE-CYBER';
const cyberPT = ntu + '-CYBER-PT-2027';

test('no study option is selected automatically; the complete options remain available', () => {
  const p = resolveOffering(edu);
  assert.equal(p.selectedOffering, undefined);
  assert.equal(p.offerings.length, 2);
  assert.equal(p.offeringOptions.length, 2);
  assert.equal(p.academicYear, edu.academicYear);
});
test('January and September fees and years are never merged', () => {
  const jan = resolveOffering(edu, 'HK-EDUHK-P001-O1');
  const sep = resolveOffering(edu, 'HK-EDUHK-P001-O2');
  assert.equal(jan.offerings.length, 1);
  assert.equal(jan.offerings[0].tuition, 188888);
  assert.equal(jan.offerings[0].deadline, '2026-10-15');
  assert.equal(jan.academicYear, '2026/27');
  assert.equal(sep.offerings[0].tuition, 208000);
  assert.equal(sep.offerings[0].deadline, null);
  assert.equal(sep.academicYear, '2027/28');
});
test('applicant-category caveats survive selection without choosing a category for the user', () => {
  const p = resolveOffering(edu, 'HK-EDUHK-P001-O1');
  assert.match(p.offerings[0].deadlineNote, /Non-local.*local applicants/);
  assert.match(p.offerings[0].feeBasis, /non-local.*local tuition/);
  assert.match(p.offeringDisclaimer, /Applicant-category notes still apply/);
  assert.equal(p.selectedOffering.applicantCategory, undefined);
});
test('full-time and part-time HKUST prices and durations stay with their own option', () => {
  const p = store.get('HK-HKUST-P002');
  const ft = resolveOffering(p, p.id + '-O1'), pt = resolveOffering(p, p.id + '-O2');
  assert.equal(ft.offerings[0].tuition, 270000);
  assert.equal(ft.offerings[0].duration, '1 year');
  assert.equal(pt.offerings[0].tuition, 230000);
  assert.equal(pt.offerings[0].duration, '2–2.5 years');
  assert.equal(pt.selectedOffering.mode, 'Part-time');
});
test('unknown and foreign study-option IDs fail closed', () => {
  for (const id of ['unknown', 'HK-HKUST-P002-O1', 123, {}]) assert.throws(() => resolveOffering(edu, id));
  for (const value of [null, [], { unknown: 'O1' }, { [edu.id]: '' }, { [edu.id]: 123 }, { [edu.id]: 'x'.repeat(201) }]) assert.throws(() => validateOfferingSelections(value, store.all()));
});
test('a grouped programme requires explicit route evidence before study-option selection', () => {
  assert.throws(() => resolveProgramme(store.get(ntu), routes, undefined, cyberPT));
  assert.equal(resolveProgramme(store.get(ntu), routes).offeringOptions, undefined);
});
test('study options cannot leak across selected NTU routes', () => {
  assert.throws(() => resolveProgramme(store.get(ntu), routes, crypto, cyberPT));
  const p = resolveProgramme(store.get(ntu), routes, cyber, cyberPT);
  assert.equal(p.selectedRoute.id, cyber);
  assert.equal(p.offerings.length, 1);
  assert.equal(p.offerings[0].tuition, 65748.8);
  assert.equal(p.selectedOffering.id, cyberPT);
  assert.equal(p.offeringOptions.length, 2);
});
test('server-owned study-option projection retains route trust but JSON cannot forge it', () => {
  const p = resolveProgramme(store.get(ntu), routes, cyber, cyberPT);
  assert.equal(hasResolvedRoute(p), true);
  assert.equal(programmeTimeline(p, '2026-10-16').state, 'within_recorded_dates');
  assert.equal(matchProgramme(p, profile).checks.some(c => c.kind === 'route'), false);
  const forged = JSON.parse(JSON.stringify(p));
  assert.equal(hasResolvedRoute(forged), false);
  assert.equal(programmeTimeline(forged, '2026-10-16').state, 'route_required');
});
test('selection does not mark intake-specific requirements as verified or enable a tier', () => {
  const baseline = matchProgramme(edu, profile);
  const selected = matchProgramme(resolveOffering(edu, edu.id + '-O1'), profile);
  assert.deepEqual(selected.checks.filter(c => c.kind !== 'offering'), baseline.checks);
  assert.equal(selected.checks.find(c => c.kind === 'offering').status, 'unknown');
  assert.equal(selected.tier, null);
});
test('unresolved date-coverage flags remain unresolved after selecting a populated deadline', () => {
  const p = resolveProgramme(edu, routes, undefined, edu.id + '-O1');
  assert.equal(programmeTimeline(p, '2026-10-16').state, 'dates_incomplete');
});
test('projection does not modify stored evidence, review flags or source dates', () => {
  const before = JSON.stringify(edu);
  const p = resolveProgramme(edu, routes, undefined, edu.id + '-O1');
  assert.equal(p.lastChecked, '2026-10-06');
  assert.equal(p.requirementsCoverage, 'partial');
  assert.equal(p.reviewer, null);
  assert.equal(JSON.stringify(edu), before);
  assert.deepEqual(p.rules, edu.rules);
});
test('GET details and clearing the query restore all options without persisted selection', async () => {
  const selected = await get('/api/programmes/' + edu.id + '?offering=' + edu.id + '-O2');
  assert.equal(selected.selectedOffering.intake, 'September 2027');
  assert.equal(selected.offerings.length, 1);
  assert.equal(selected.applicationTimeline.offerings.length, 1);
  const cleared = await get('/api/programmes/' + edu.id);
  assert.equal(cleared.selectedOffering, undefined);
  assert.equal(cleared.offerings.length, 2);
});
test('no-profile catalogue and mode filters use the selected option', async () => {
  const query = new URLSearchParams({ school: 'HK-HKUST', q: 'Digital and Sustainable', offerings: JSON.stringify({ 'HK-HKUST-P002': 'HK-HKUST-P002-O2' }), mode: 'part-time' });
  const d = await get('/api/catalogue?' + query);
  assert.equal(d.total, 1);
  assert.equal(d.items[0].offerings[0].tuition, 230000);
  assert.equal(d.items[0].selectedOffering.mode, 'Part-time');
  query.set('mode', 'full-time');
  assert.equal((await get('/api/catalogue?' + query)).total, 0);
});
test('catalogue route and offering choices resolve together, including date comparisons', async () => {
  const query = new URLSearchParams({ school: 'SG-NTU', q: 'Cybersecurity', routes: JSON.stringify({ [ntu]: cyber }), offerings: JSON.stringify({ [ntu]: cyberPT }) });
  const d = await get('/api/catalogue?' + query);
  assert.equal(d.total, 1);
  assert.equal(d.items[0].selectedOffering.id, cyberPT);
  assert.equal(d.items[0].applicationTimeline.state, 'within_recorded_dates');
  assert.equal(d.items[0].applicationTimeline.offerings.length, 1);
});
test('GET selection queries are bounded, typed and fully validated', async () => {
  for (const [raw, code] of [['{', 400], ['[]', 422], ['null', 422], [JSON.stringify({ [edu.id]: 'unknown' }), 422], ['x'.repeat(8001), 413]]) {
    assert.equal((await fetch(url + '/api/catalogue?' + new URLSearchParams({ offerings: raw }))).status, code);
  }
  for (const path of ['/api/programmes/' + edu.id + '?offering=', '/api/programmes/' + edu.id + '?offering=unknown', '/api/programmes/' + ntu + '?route=' + crypto + '&offering=' + cyberPT]) assert.equal((await fetch(url + path)).status, 422);
});
test('POST matching keeps selected fees, dates and route checks in the same context', async () => {
  const d = await (await post({ profile, selectedRoutes: { [ntu]: cyber }, selectedOfferings: { [ntu]: cyberPT }, filters: { q: 'Cybersecurity', school: 'SG-NTU' } })).json();
  assert.equal(d.items.length, 1);
  assert.equal(d.items[0].selectedOffering.id, cyberPT);
  assert.equal(d.items[0].offerings.length, 1);
  assert.equal(d.items[0].match.checks.some(c => c.kind === 'route'), false);
  assert.equal(d.items[0].match.checks.find(c => c.kind === 'offering').status, 'unknown');
});
test('POST rejects stale, foreign and malformed choices even when filters would hide them', async () => {
  for (const selections of [null, [], { [edu.id]: 'unknown' }, { [ntu]: cyberPT }]) {
    const response = await post({ profile, selectedRoutes: { [ntu]: crypto }, selectedOfferings: selections, filters: { school: 'SG-SIT' } });
    assert.equal(response.status, 422);
  }
});
test('raw export and quality totals do not include request-time selections', async () => {
  const d = await get('/api/export');
  assert.ok(d.programmes.every(p => p.selectedOffering === undefined && p.offeringOptions === undefined));
  assert.equal(store.quality().total, 793);
  assert.equal(store.quality().complete, 0);
  assert.equal(store.quality().peerReviewed, 0);
});
test('UI shares transient context, resets dependent choices, and exports the exact selected option', () => {
  const js = readFileSync(new URL('public/app.js', root), 'utf8');
  assert.match(js, /selectedOfferings: \{ \.\.\.offeringChoices \}/);
  assert.match(readFileSync(new URL('public/saved-options.js', root), 'utf8'), /selectedOffering: p.selectedOffering \|\| null/);
  assert.match(js, /delete offeringChoices\[id\]/);
  assert.match(js, /const previousOffering = offeringChoices\[id\]/);
  assert.match(js, /if \(previousOffering\) offeringChoices\[id\] = previousOffering/);
  assert.match(js, /item.selectedOffering\?\.id/);
  assert.match(js, /offeringChoices\[id\].*query.set\('offering'/);
  assert.equal(/writeStorage\([^\n]*(routeChoices|offeringChoices)/.test(js), false);
  assert.match(js, /Intake and study mode/);
});
