import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CatalogueStore } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { loadRoutes, resolveProgramme, hasResolvedRoute } from '../server/routes.mjs';
import { loadApplicantContexts, validateApplicantSelections, hasApplicantDateEvidence, offeringFingerprint, applicantSummary } from '../server/applicants.mjs';
import { programmeTimeline } from '../server/application-dates.mjs';
import { matchProgramme } from '../server/matching.mjs';

const root = new URL('../', import.meta.url), routePath = new URL('data/route-programmes.json', root), evidencePath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryAuditPath: new URL('data/directory-audit.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root), directoryEvidencePath: new URL('data/directory-links.json', root) });
const routes = loadRoutes(routePath, store.all()), index = loadApplicantContexts(evidencePath, store.all(), routes);
const id = 'HK-EDUHK-P001', offering = id + '-O1', local = offering + '-LOCAL', nonlocal = offering + '-NONLOCAL', base = store.get(id);
const resolve = category => resolveProgramme(base, routes, undefined, offering, category, index);
const profile = { major: 'Public Policy', degreeStatus: 'graduated', language: { type: 'ielts', total: 7 } };
const server = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: evidencePath, now: () => new Date('2026-10-19T04:00:00Z') });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
test.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); });
const get = async path => (await fetch(url + path)).json();
const post = value => fetch(url + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });

test('category evidence has its own dated scope and does not inflate programme review counts', () => {
  assert.deepEqual(applicantSummary(index), { studyOptions: 10, categories: 20, peerReviewed: 0 });
  assert.equal(store.quality().checked, 21); assert.equal(store.quality().complete, 0); assert.equal(store.quality().peerReviewed, 0);
});
test('the source binding fingerprints every field regardless of property order', () => {
  const o = base.offerings[0];
  assert.equal(offeringFingerprint(o), [...index.values()][0].offeringFingerprint);
  assert.equal(offeringFingerprint(Object.fromEntries(Object.entries(o).reverse())), offeringFingerprint(o));
  assert.notEqual(offeringFingerprint({ ...o, tuition: 1 }), offeringFingerprint(o));
  assert.notEqual(offeringFingerprint({ ...o, nested: { value: 1 } }), offeringFingerprint({ ...o, nested: { value: 2 } }));
});
test('the unselected category never silently becomes the non-local amount or date', () => {
  const p = resolve();
  assert.equal(p.selectedApplicant, undefined); assert.equal(p.applicantOptions.length, 2);
  assert.equal(p.offerings[0].tuition, null); assert.equal(p.offerings[0].deadline, null);
  assert.equal(programmeTimeline(p, '2026-10-19').state, 'applicant_required');
  assert.equal(programmeTimeline(p, '2026-10-19').offerings[0].sourceCheckedOn, '2026-10-19');
});
test('all-options browsing masks only the category-dependent offering', () => {
  const p = resolveProgramme(base, routes, undefined, undefined, undefined, index);
  assert.equal(p.offerings.length, 2); assert.equal(p.offerings[0].tuition, null); assert.equal(p.offerings[1].tuition, 208000);
  assert.equal(p.applicantOptions, undefined); assert.equal(p.offeringOptions[0].deadline, null);
});
test('local tuition, separate application fee and deadline stay in one exact intake', () => {
  const p = resolve(local), o = p.offerings[0];
  assert.equal(p.selectedApplicant.id, local); assert.equal(o.tuition, 151110); assert.equal(o.applicationFee, 300);
  assert.equal(o.deadline, '2026-11-20'); assert.equal(o.academicYear, '2026/27'); assert.equal(o.intake, 'January 2027');
});
test('non-local tuition is not replaced with local pricing and the recorded date is past', () => {
  const p = resolve(nonlocal);
  assert.equal(p.offerings[0].tuition, 188888); assert.equal(p.offerings[0].applicationFee, 400);
  assert.equal(p.offerings[0].deadline, '2026-10-15'); assert.equal(programmeTimeline(p, '2026-10-19').state, 'deadline_passed');
});
test('a future local deadline alone never establishes that applications are currently open', () => {
  assert.equal(programmeTimeline(resolve(local), '2026-10-19').state, 'dates_incomplete');
  assert.equal(programmeTimeline(resolve(local), '2026-11-20').state, 'deadline_today');
  assert.equal(programmeTimeline(resolve(local), '2026-11-21').state, 'deadline_passed');
});
test('new fee/date evidence does not relabel older academic criteria as rechecked', () => {
  const p = resolve(nonlocal), dates = programmeTimeline(p, '2026-10-19');
  assert.equal(p.lastChecked, '2026-10-06'); assert.equal(p.applicantEvidence.checkedOn, '2026-10-19');
  assert.equal(dates.offerings[0].sourceCheckedOn, '2026-10-19');
  assert.equal(dates.offerings[0].sourceUrl, 'https://www.eduhk.hk/acadprog/postgrad/');
  assert.deepEqual(p.rules, base.rules); assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.reviewer, null);
});
test('JSON cannot forge category evidence to override an unresolved date-coverage gate', () => {
  const p = resolve(nonlocal), copied = JSON.parse(JSON.stringify(p));
  assert.equal(hasApplicantDateEvidence(p.offerings[0]), true); assert.equal(hasApplicantDateEvidence(copied.offerings[0]), false);
  assert.equal(programmeTimeline(copied, '2026-10-19').state, 'dates_incomplete');
});
test('category selection without an intake or for a different intake fails closed', () => {
  assert.throws(() => resolveProgramme(base, routes, undefined, undefined, local, index));
  assert.throws(() => resolveProgramme(base, routes, undefined, id + '-O2', local, index));
  assert.throws(() => resolve('unknown'));
});
test('a foreign programme or a different route cannot reuse the January category', () => {
  assert.throws(() => resolveProgramme(store.get('HK-HKUST-P002'), routes, undefined, 'HK-HKUST-P002-O1', local, index));
  assert.throws(() => resolveProgramme(store.get('SG-NTU-P061'), routes, 'SG-NTU-P061-ROUTE-CYBER', 'SG-NTU-P061-CYBER-FT-2027', local, index));
});
test('source changes invalidate contextual evidence instead of clobbering manual data', () => {
  for (const changes of [{ tuition: 999 }, { deadline: '2026-12-01' }, { academicYear: '2028/29' }, { mode: 'Part-time' }]) {
    const edited = structuredClone(base); Object.assign(edited.offerings[0], changes);
    const before = JSON.stringify(edited);
    const p = resolveProgramme(edited, routes, undefined, offering, undefined, index);
    assert.equal(p.applicantContextStatus, 'stale'); assert.deepEqual(p.applicantOptions, []); assert.equal(p.offerings[0].tuition, null);
    assert.throws(() => resolveProgramme(edited, routes, undefined, offering, local, index));
    assert.equal(JSON.stringify(edited), before);
  }
});
test('applicant context leaves independently resolved NTU route trust intact', () => {
  const p = resolveProgramme(store.get('SG-NTU-P061'), routes, 'SG-NTU-P061-ROUTE-CYBER', 'SG-NTU-P061-CYBER-FT-2027', undefined, index);
  assert.equal(hasResolvedRoute(p), true); assert.equal(programmeTimeline(p, '2026-10-19').state, 'within_recorded_dates');
});
test('category choice adds a manual classification check without changing academic-rule results', () => {
  const a = matchProgramme(resolve(), profile), b = matchProgramme(resolve(local), profile);
  assert.deepEqual(a.checks, b.checks.filter(c => c.kind !== 'applicant'));
  assert.equal(b.checks.find(c => c.kind === 'applicant').status, 'unknown'); assert.equal(b.tier, null);
});
test('identity, source domain, date, fees and duplicate evidence are validated atomically', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-applicant-test-')), file = join(dir, 'fixture.json');
  try {
    const invalid = [b => { b.checkedOn = '2026-02-30'; }, b => { b.contexts[0].dateSourceUrl = 'https://www.nus.edu.sg/'; }, b => { b.contexts[0].options[0].tuition = -1; }, b => { b.contexts[0].options[0].applicationFee = '300'; }, b => { b.contexts[0].options[0].deadline = '2026-02-30'; }, b => { b.contexts[0].options[0].applicationOpen = '2027-01-01'; }, b => { b.contexts[0].options.push(b.contexts[0].options[0]); }, b => { b.contexts.push(b.contexts[0]); }, b => { b.contexts[0].reviewer = 'invented reviewer'; }, b => { b.contexts[0].routeId = 0; }];
    for (const alter of invalid) { const b = JSON.parse(readFileSync(evidencePath, 'utf8')); alter(b); writeFileSync(file, JSON.stringify(b)); assert.throws(() => loadApplicantContexts(file, store.all(), routes)); }
  } finally { rmSync(file, { force: true }); rmdirSync(dir); }
});
test('malformed selection maps are rejected before resolution', () => {
  for (const value of [null, [], { unknown: local }, { [id]: '' }, { [id]: 123 }, { [id]: 'x'.repeat(201) }]) assert.throws(() => validateApplicantSelections(value, store.all()));
});
test('details expose choices without a default and return exactly the selected category', async () => {
  const empty = await get('/api/programmes/' + id + '?offering=' + offering);
  assert.equal(empty.applicationTimeline.state, 'applicant_required'); assert.equal(empty.offerings[0].tuition, null);
  const selected = await get('/api/programmes/' + id + '?offering=' + offering + '&applicant=' + nonlocal);
  assert.equal(selected.selectedApplicant.id, nonlocal); assert.equal(selected.offerings[0].tuition, 188888); assert.equal(selected.applicationTimeline.state, 'deadline_passed');
  assert.equal((await get('/api/programmes/' + id + '?offering=' + offering)).selectedApplicant, undefined);
});
test('catalogue applies selections before mode filters and keeps category source dates', async () => {
  const q = new URLSearchParams({ school: 'HK-EDUHK', q: 'Public Policy', offerings: JSON.stringify({ [id]: offering }), applicants: JSON.stringify({ [id]: local }) });
  const d = await get('/api/catalogue?' + q);
  assert.equal(d.total, 1); assert.equal(d.items[0].selectedApplicant.id, local); assert.equal(d.items[0].offerings[0].tuition, 151110);
  assert.equal(d.items[0].applicationTimeline.offerings[0].sourceCheckedOn, '2026-10-19');
});
test('catalogue selection queries are bounded, parsed and validated', async () => {
  for (const [raw, code] of [['{', 400], ['[]', 422], ['null', 422], [JSON.stringify({ [id]: local }), 422], ['x'.repeat(8001), 413]]) assert.equal((await fetch(url + '/api/catalogue?' + new URLSearchParams({ applicants: raw }))).status, code);
  for (const path of ['/api/programmes/' + id + '?applicant=', '/api/programmes/' + id + '?applicant=' + local, '/api/programmes/' + id + '?offering=' + id + '-O2&applicant=' + local]) assert.equal((await fetch(url + path)).status, 422);
});
test('matching returns the same selection and never assigns applicant classification', async () => {
  const d = await (await post({ profile, selectedOfferings: { [id]: offering }, selectedApplicants: { [id]: local }, filters: { school: 'HK-EDUHK', q: 'Public Policy' } })).json();
  assert.equal(d.items[0].selectedApplicant.id, local); assert.equal(d.items[0].offerings[0].applicationFee, 300);
  assert.equal(d.items[0].match.checks.find(c => c.kind === 'applicant').status, 'unknown'); assert.equal(d.items[0].match.tier, null);
});
test('invalid matching choices are rejected even when current filters hide them', async () => {
  for (const selectedApplicants of [null, [], { [id]: local }, { unknown: local }]) assert.equal((await post({ profile, selectedApplicants, filters: { school: 'SG-SIT' } })).status, 422);
});
test('raw exports, original sources and original workbook-backed IDs remain unchanged', async () => {
  const before = JSON.stringify(store.get(id)); resolve(local); resolve(nonlocal);
  assert.equal(JSON.stringify(store.get(id)), before);
  const raw = await get('/api/export'); assert.ok(raw.programmes.every(p => p.selectedApplicant === undefined && p.applicantEvidence === undefined));
  assert.equal(raw.programmes.find(p => p.id === id).offerings[0].tuition, 188888);
  const meta = await get('/api/meta'); assert.deepEqual(meta.applicantEvidence, { studyOptions: 10, categories: 20, peerReviewed: 0 }); assert.equal(meta.quality.total, 873);
});
test('UI carries category context through matching, display and export without browser persistence', () => {
  const js = readFileSync(new URL('public/app.js', root), 'utf8');
  assert.match(js, /selectedApplicants: \{ \.\.\.applicantChoices \}/); assert.match(js, /item.selectedApplicant\?\.id/);
  const exports = readFileSync(new URL('public/saved-options.js', root), 'utf8');
  assert.match(exports, /selectedApplicant: p.selectedApplicant \|\| null/); assert.match(exports, /applicantEvidence: p.applicantEvidence \|\| null/);
  assert.match(js, /delete applicantChoices\[id\]/); assert.match(js, /if \(previous\.applicant\) applicantChoices\[id\] = previous\.applicant/);
  assert.equal(/writeStorage\([^\n]*applicantChoices/.test(js), false); assert.match(js, /not your current location/);
});
