import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filterProgrammes, filterMatchedProgrammes } from '../public/catalogue-filters.js';
import { filterProgrammes as serverFilter, createApp } from '../server/app.mjs';
import { CatalogueStore } from '../server/database.mjs';
import { shortlistExport } from '../public/saved-options.js';

const root = new URL('../', import.meta.url);
const fixture = (id, patch = {}) => ({ id, name: 'Synthetic Test Programme', area: 'Computing', faculty: 'Synthetic Faculty of Example Studies', universityId: 'SG-TEST', university: { nameEn: 'Synthetic Example University', nameZh: 'Synthetic alternate name', abbreviation: 'EXAMPLE', region: 'SG' }, admissionRoute: 'direct', verification: 'programme_page_checked', offerings: [{ id: id + '-FT', mode: 'Full-time' }], match: { status: 'needs_confirmation' }, ...patch });
const ids = items => items.map(p => p.id).sort();

test('server and browser use the same pure discovery filter implementation', () => {
  assert.equal(serverFilter, filterProgrammes);
  const app = readFileSync(new URL('public/app.js', root), 'utf8');
  assert.match(app, /import \{ filterMatchedProgrammes \} from '\.\/catalogue-filters\.js'/);
  assert.match(app, /return filterMatchedProgrammes\(items, state, savedOptionIssues\)/);
});

test('faculty-only queries survive background filtering, including case and surrounding spaces', () => {
  const all = [fixture('SG-TEST-P001'), fixture('SG-TEST-P002', { faculty: null })];
  for (const q of ['Faculty of Example', '  FACULTY OF EXAMPLE  ']) {
    assert.deepEqual(ids(filterProgrammes(all, { q })), ['SG-TEST-P001']);
    assert.deepEqual(ids(filterMatchedProgrammes(all, { q })), ['SG-TEST-P001']);
  }
});

test('titles, subject tags, institution names and directory variants remain searchable', () => {
  const all = [fixture('SG-TEST-P001', { directoryListing: { nameEn: 'Synthetic Directory Heading', variants: [{ nameEn: 'Synthetic Route Alpha' }] } })];
  for (const q of ['Test Programme', 'Computing', 'Example University', 'alternate name', 'EXAMPLE', 'Directory Heading', 'Route Alpha']) {
    assert.deepEqual(ids(filterProgrammes(all, { q })), ['SG-TEST-P001']);
    assert.deepEqual(ids(filterMatchedProgrammes(all, { q })), ['SG-TEST-P001']);
  }
  assert.equal(filterMatchedProgrammes(all, { q: 'Route Alpha' }).length, 1);
  assert.equal(filterMatchedProgrammes(all, { q: 'not in this record' }).length, 0);
});

test('query bounding is identical before and after a background is supplied', () => {
  const q = 'x'.repeat(200), all = [fixture('SG-TEST-P001', { name: q })];
  assert.equal(filterMatchedProgrammes(all, { q: q + 'discarded suffix' }).length, 1);
  assert.deepEqual(filterMatchedProgrammes(all, { q: q + 'discarded suffix' }), filterProgrammes(all, { q: q + 'discarded suffix' }));
});

test('combined region, school, area, mode and verification filters stay conjunctive', () => {
  const base = fixture('SG-TEST-P001');
  const all = [base, fixture('SG-TEST-P002', { universityId: 'HK-TEST', university: { ...base.university, region: 'HK' } }), fixture('SG-TEST-P003', { offerings: [{ mode: 'Part-time' }] }), fixture('SG-TEST-P004', { verification: 'catalogue_seed' })];
  const filters = { q: 'Faculty', region: 'SG', school: 'SG-TEST', area: 'Computing', mode: 'full-time', verification: 'programme_page_checked' };
  assert.deepEqual(ids(filterMatchedProgrammes(all, filters)), ['SG-TEST-P001']);
  assert.deepEqual(ids(filterMatchedProgrammes(all, filters)), ids(filterProgrammes(all, filters)));
});

test('transfer-only and excluded records stay hidden unless audit inclusion is explicit', () => {
  const all = [fixture('SG-TEST-P001'), fixture('SG-TEST-P002', { admissionRoute: 'transfer_only' }), fixture('SG-TEST-P003', { scope: { status: 'out_of_scope' } }), fixture('SG-TEST-P004', { scope: { status: 'unconfirmed' } })];
  assert.deepEqual(ids(filterMatchedProgrammes(all)), ['SG-TEST-P001', 'SG-TEST-P004']);
  assert.equal(filterProgrammes(all, { includeTransfer: true, includeOutOfScope: true }).length, 2);
  assert.equal(filterProgrammes(all, { includeTransfer: 'true', includeOutOfScope: 'true' }).length, 4);
});

test('background outcome filters exclude unresolved saved choices without hiding ordinary browsing', () => {
  const all = [fixture('SG-TEST-P001'), fixture('SG-TEST-P002', { match: { status: 'has_gap' } }), fixture('SG-TEST-P003', { match: undefined })];
  const issues = { 'SG-TEST-P001': 'Synthetic invalid saved route' };
  assert.equal(filterMatchedProgrammes(all, {}, issues).length, 3);
  assert.equal(filterMatchedProgrammes(all, { matchFilter: 'needs_confirmation' }, issues).length, 0);
  assert.deepEqual(ids(filterMatchedProgrammes(all, { matchFilter: 'has_gap' }, issues)), ['SG-TEST-P002']);
});

test('filtering never changes ordering, requirements, prices or source objects', () => {
  const all = [fixture('SG-TEST-P002'), fixture('SG-TEST-P001')];
  const before = JSON.stringify(all);
  const result = filterMatchedProgrammes(all, { q: 'Faculty' });
  assert.deepEqual(result.map(p => p.id), ['SG-TEST-P002', 'SG-TEST-P001']);
  assert.equal(result[0], all[0]); assert.notEqual(result, all);
  assert.equal(JSON.stringify(all), before);
});

const store = new CatalogueStore(':memory:', { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryAuditPath: new URL('data/directory-audit.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root), directoryEvidencePath: new URL('data/directory-links.json', root) });
const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: new URL('data/route-programmes.json', root), applicantEvidencePath: new URL('data/applicant-contexts.json', root), now: () => new Date('2026-10-21T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${app.address().port}`;
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });
const get = async path => { const response = await fetch(url + path); assert.equal(response.status, 200); return response.json(); };
const post = async payload => { const response = await fetch(url + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: { major: 'Computer Science' }, ...payload }) }); assert.equal(response.status, 200); return response.json(); };

test('the shared browser module is explicitly served with existing security headers', async () => {
  const response = await fetch(url + '/catalogue-filters.js');
  assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /text\/javascript/);
  assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
  const text = await response.text();
  assert.equal(text, readFileSync(new URL('public/catalogue-filters.js', root), 'utf8'));
  assert.equal(/\p{Script=Han}/u.test(text), false);
  assert.equal((await fetch(url + '/server/catalogue-filters.js')).status, 404);
});

test('real catalogue, server-filtered matches and browser-filtered matches agree on membership', async () => {
  const allMatches = (await post({ filters: { includeTransfer: 'true' } })).items;
  for (const filters of [{ q: 'Wee Kim Wee', school: 'SG-NTU' }, { q: 'Applied Cryptography', school: 'SG-NTU' }, { q: 'Early Childhood', region: 'SG' }, { region: 'HK', verification: 'programme_page_checked' }, { school: 'SG-SMU', mode: 'part-time' }, { q: 'deliberately-no-record' }, { region: 'HK', school: 'SG-NTU' }]) {
    const catalogue = await get('/api/catalogue?' + new URLSearchParams({ ...filters, limit: '100' }));
    const catalogueItems = [...catalogue.items];
    assert.ok(catalogue.items.length <= 100);
    for (let page = 2; catalogueItems.length < catalogue.total; page++) {
      const next = await get('/api/catalogue?' + new URLSearchParams({ ...filters, limit: '100', page: String(page) }));
      assert.equal(next.total, catalogue.total); assert.ok(next.items.length > 0 && next.items.length <= 100);
      catalogueItems.push(...next.items);
    }
    assert.equal(catalogueItems.length, catalogue.total); assert.equal(new Set(ids(catalogueItems)).size, catalogue.total);
    const matches = await post({ filters });
    const browser = filterMatchedProgrammes(allMatches, filters);
    assert.deepEqual(ids(browser), ids(catalogueItems), JSON.stringify(filters));
    assert.deepEqual(ids(matches.items), ids(catalogueItems), JSON.stringify(filters));
  }
  assert.deepEqual(ids(filterMatchedProgrammes(allMatches, { q: 'Wee Kim Wee', school: 'SG-NTU' })), ['SG-NTU-P018']);
});

test('selected route, mode and applicant context remain identical across search and detail', async () => {
  const id = 'HK-HKU-P016', route = id + '-ROUTE-STANDARD', offering = id + '-STANDARD-PT-2027', applicant = offering + '-NONLOCAL';
  const selectedRoutes = { [id]: route }, selectedOfferings = { [id]: offering }, selectedApplicants = { [id]: applicant };
  const filters = { q: 'Computer Science', school: 'HK-HKU', mode: 'part-time' };
  const catalogue = await get('/api/catalogue?' + new URLSearchParams({ ...filters, routes: JSON.stringify(selectedRoutes), offerings: JSON.stringify(selectedOfferings), applicants: JSON.stringify(selectedApplicants) }));
  const matches = await post({ selectedRoutes, selectedOfferings, selectedApplicants });
  const browser = filterMatchedProgrammes(matches.items, filters).find(p => p.id === id);
  const detail = await get('/api/programmes/' + id + '?' + new URLSearchParams({ route, offering, applicant }));
  assert.ok(browser);
  for (const p of [catalogue.items.find(p => p.id === id), browser]) {
    assert.deepEqual(p.offerings, detail.offerings);
    assert.deepEqual(p.selectedRoute, detail.selectedRoute);
    assert.deepEqual(p.selectedOffering, detail.selectedOffering);
    assert.deepEqual(p.selectedApplicant, detail.selectedApplicant);
    assert.deepEqual(p.applicationTimeline, detail.applicationTimeline);
  }
  assert.equal(filterMatchedProgrammes(matches.items, { ...filters, mode: 'full-time' }).some(p => p.id === id), false);
  assert.equal(browser.match.tier, null);
});

test('a faculty search does not upgrade criteria or replace facts in candidate exports', async () => {
  const before = JSON.stringify(store.get('SG-NTU-P018'));
  const matches = await post({});
  const result = filterMatchedProgrammes(matches.items, { q: 'Wee Kim Wee' }).find(p => p.id === 'SG-NTU-P018');
  assert.ok(result); assert.equal(result.match.status, 'needs_confirmation'); assert.equal(result.match.tier, null);
  const output = shortlistExport([result]);
  assert.equal(output.programmes[0].offerings[0].tuition, null);
  assert.equal(output.programmes[0].applicationTimeline.state, 'dates_incomplete');
  assert.equal(output.programmes[0].verification, 'programme_page_checked');
  assert.equal(JSON.stringify(store.get(result.id)), before);
});
