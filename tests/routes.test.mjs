import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CatalogueStore } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { matchProgramme } from '../server/matching.mjs';
import { loadRoutes, resolveRoute, validateSelections, hasResolvedRoute, routeSummary } from '../server/routes.mjs';

const root = new URL('../', import.meta.url);
const routePath = new URL('data/route-programmes.json', root);
const store = new CatalogueStore(':memory:', { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryAuditPath: new URL('data/directory-audit.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root), directoryEvidencePath: new URL('data/directory-links.json', root) });
const index = loadRoutes(routePath, store.all());
const id = 'SG-NTU-P061', cryptoId = id + '-ROUTE-CRYPTO', cyberId = id + '-ROUTE-CYBER';
const base = store.get(id);
const profile = { major: 'Computer Science', degreeStatus: 'graduated', gpa: 3.5, gpaScale: 4, language: { type: 'ielts', total: 6, components: { listening: 6, reading: 6, writing: 6, speaking: 6 } } };
const server = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
test.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); });
const post = value => fetch(url + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });

test('independently sourced routes do not add catalogue records or pretend human review', () => { assert.deepEqual(routeSummary(index), { groups: 7, routes: 17, pageChecked: 17, peerReviewed: 0, complete: 0 }); assert.equal(store.quality().total, 873); assert.equal(store.quality().checked, 226); });
test('an unselected group retains its original fields and unresolved route', () => { const p = resolveRoute(base, index); assert.equal(p.routeOptions.length, 2); assert.equal(p.name, base.name); assert.deepEqual(p.rules, base.rules); assert.equal(matchProgramme(p, profile).checks.some(c => c.kind === 'route'), true); });
test('a selected route uses only its own source snapshot without parent/sibling leakage', () => { const poisoned = { ...base, rules: [{ kind: 'gpa', min: 99, scale: 100 }], notesEn: 'parent-only-marker' }; const p = resolveRoute(poisoned, index, cryptoId); assert.equal(hasResolvedRoute(p), true); assert.equal(p.name.includes('Applied Cryptography'), true); assert.equal(p.rules.some(r => r.kind === 'gpa'), false); assert.equal(p.notesEn.includes('parent-only-marker'), false); assert.equal(p.universityId, base.universityId); });
test('only the loader-resolved object can bypass the unresolved-group gate', () => { const p = resolveRoute(base, index, cryptoId); const match = matchProgramme(p, profile); assert.equal(match.checks.some(c => c.kind === 'route'), false); assert.equal(match.status, 'needs_confirmation'); assert.equal(match.tier, null); const forged = { ...p }; assert.equal(hasResolvedRoute(forged), false); assert.equal(matchProgramme(forged, profile).checks.some(c => c.kind === 'route'), true); });
test('the two routes apply their different recorded language minima', () => { const crypto = matchProgramme(resolveRoute(base, index, cryptoId), profile); const cyber = matchProgramme(resolveRoute(base, index, cyberId), profile); assert.equal(crypto.checks.find(c => c.kind === 'language').status, 'pass'); assert.equal(cyber.checks.find(c => c.kind === 'language').status, 'fail'); assert.equal(crypto.tier, null); assert.equal(cyber.tier, null); });
test('2026/27 cryptography tuition is not reused for the August 2027 offering', () => { const p = resolveRoute(base, index, cryptoId); assert.ok(p.offerings.every(o => o.academicYear === '2027/28' && o.tuition === null && o.deadline === '2027-03-31' && o.applicationOpen === '2026-09-01')); assert.equal(p.fieldStatus.tuition.status, 'unknown'); });
test('cybersecurity tuition keeps GST/cohort and does not add the credited deposit', () => { const p = resolveRoute(base, index, cyberId); assert.ok(p.offerings.every(o => o.tuition === 65748.8 && o.currency === 'SGD' && o.academicYear === '2027/28' && o.deadline === '2027-03-31')); assert.match(p.notesEn, /credited/); assert.match(p.offerings[0].feeBasis, /9% GST/); });
test('two-year experience is not required in addition to the honours route', () => { const p = resolveRoute(base, index, cyberId); assert.equal(p.rules.some(r => r.kind === 'experience' && r.mandatory !== false), false); assert.match(p.rules.find(r => r.labelEn === 'Alternative academic entry routes').noteEn, /Either.*or/); });
test('preference work/tests do not become invented numeric requirements', () => { const p = resolveRoute(base, index, cryptoId); assert.equal(p.rules.some(r => r.kind === 'experience' || r.kind === 'gpa'), false); assert.equal(p.rules.find(r => r.labelEn === 'Optional experience and tests').mandatory, false); });
test('unknown or cross-programme route selections fail closed', () => { assert.throws(() => resolveRoute(base, index, 'unknown')); for (const input of [null, [], { unknown: cryptoId }, { 'SG-NUS-P029': cryptoId }, { [id]: 123 }]) assert.throws(() => validateSelections(input, store.all(), index)); });
test('loader rejects duplicate, unsafe or incomplete route evidence atomically', () => {
  const taskTemp = mkdtempSync(join(tmpdir(), 'gradpath-route-test-')); const file = join(taskTemp, 'fixture.json');
  try {
    for (const alter of [b => { b.programmes[0].routes.push(b.programmes[0].routes[0]); }, b => { b.programmes[0].routes[0].sources[1].url = 'https://example.invalid'; }, b => { delete b.programmes[0].routes[0].offerings; }, b => { b.programmes[0].routes[0].lastChecked = '2026-02-30'; }, b => { b.programmes[0].routes[0].officialUrl = 'https://www.ntu.edu.sg/education/unrelated'; }]) {
      const data = JSON.parse(readFileSync(routePath, 'utf8')); alter(data); writeFileSync(file, JSON.stringify(data)); assert.throws(() => loadRoutes(file, store.all()));
    }
  } finally { rmSync(file, { force: true }); rmdirSync(taskTemp); }
});
test('GET details offers explicit choices but never silently picks a route', async () => { const p = await (await fetch(url + '/api/programmes/' + id)).json(); assert.equal(p.routeOptions.length, 2); assert.equal(p.selectedRoute, undefined); assert.equal(p.verification, 'catalogue_seed'); });
test('GET selected route returns the route date, facts and parent identity', async () => { const p = await (await fetch(url + '/api/programmes/' + id + '?route=' + cyberId)).json(); assert.equal(p.id, id); assert.equal(p.selectedRoute.id, cyberId); assert.equal(p.lastChecked, '2026-10-16'); assert.equal(p.offerings[0].tuition, 65748.8); });
test('POST checks selected routes independently without storing choices or background', async () => { const before = JSON.stringify(store.get(id)); const d = await (await post({ profile, selectedRoutes: { [id]: cryptoId }, filters: { school: 'SG-NTU', q: 'Cybersecurity' } })).json(); assert.equal(d.items.length, 1); assert.equal(d.items[0].selectedRoute.id, cryptoId); assert.equal(d.items[0].match.tier, null); assert.equal(d.items[0].match.checks.find(c => c.kind === 'language').status, 'pass'); assert.equal(JSON.stringify(store.get(id)), before); const reset = await (await post({ profile, filters: { school: 'SG-NTU', q: 'Cybersecurity' } })).json(); assert.equal(reset.items[0].selectedRoute, undefined); assert.equal(reset.items[0].match.checks.some(c => c.kind === 'route'), true); });
test('route API rejects invalid selections and invalid background without 500 errors', async () => { assert.equal((await fetch(url + '/api/programmes/' + id + '?route=unknown')).status, 422); assert.equal((await post({ profile, selectedRoutes: { [id]: 'unknown' } })).status, 422); assert.equal((await post(null)).status, 422); });
test('metadata counts route evidence separately from programme completeness', async () => { const d = await (await fetch(url + '/api/meta')).json(); assert.equal(d.routeEvidence.pageChecked, 17); assert.equal(d.quality.complete, 0); assert.equal(d.quality.peerReviewed, 0); });
test('route UI uses explicit choices consistently in details, matching, comparison and export', () => { const js = readFileSync(new URL('public/app.js', root), 'utf8'); const exports = readFileSync(new URL('public/saved-options.js', root), 'utf8'); assert.match(js, /Specific programme route/); assert.match(js, /selectedRoutes: \{ \.\.\.routeChoices \}/); assert.match(js, /selectedProgrammes\(ids\).*programmePath/); assert.match(exports, /selectedRoute: p.selectedRoute \|\| null/); assert.equal(/writeStorage\([^\n]*routeChoices/.test(js), false); });
