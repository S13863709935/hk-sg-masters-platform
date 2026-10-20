import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSavedOption, normalizeSavedOptions, optionSnapshot, sameOptions, savedOptionsPayload, shortlistExport } from '../public/saved-options.js';
import { CatalogueStore } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';

const root = new URL('../', import.meta.url);
const id = 'HK-EDUHK-P001', offering = id + '-O1', category = offering + '-LOCAL';
const savedAt = '2026-10-19T04:00:00.000Z';
const saved = { programmeId: id, routeId: null, offeringId: offering, applicantId: category, savedAt };
const fixture = { id, selectedOffering: { id: offering }, selectedApplicant: { id: category } };

test('saved context schema contains only explicit choice IDs and a timestamp', () => {
  assert.deepEqual(parseSavedOption(saved), saved);
  assert.deepEqual(optionSnapshot(fixture, savedAt), saved);
  assert.deepEqual(Object.keys(saved).sort(), ['applicantId', 'offeringId', 'programmeId', 'routeId', 'savedAt']);
});
test('legacy ID-only lists do not gain implicit saved contexts or inferred categories', () => {
  assert.equal(Object.keys(normalizeSavedOptions(null, [id]).entries).length, 0);
  assert.equal(Object.keys(normalizeSavedOptions(undefined, [id]).entries).length, 0);
  assert.equal(parseSavedOption({ programmeId: id }).applicantId, null);
});
test('storage normalization keeps valid attached contexts and reports rejected entries', () => {
  const result = normalizeSavedOptions({ schemaVersion: 1, items: [saved, saved, { ...saved, programmeId: 'SG-NUS-P999', offeringId: null, applicantId: null }] }, [id]);
  assert.deepEqual(result.entries[id], saved); assert.equal(Object.keys(result.entries).length, 1); assert.equal(result.rejected, 2);
});
test('contexts remain attached to either shortlist or comparison without copying student data', () => {
  const p = { ...fixture, profile: { major: 'Synthetic private background', gpa: 3.5 }, tuition: 123, deadline: '2027-01-01' };
  const payload = savedOptionsPayload({ [id]: optionSnapshot(p, savedAt) });
  assert.equal(JSON.stringify(payload).includes('Synthetic'), false); assert.equal(JSON.stringify(payload).includes('tuition'), false);
  assert.deepEqual(normalizeSavedOptions(payload, [id]).entries[id], saved);
  assert.equal(Object.keys(normalizeSavedOptions(payload, []).entries).length, 0);
});
test('malformed, nested, foreign and overlong choice values are rejected', () => {
  for (const input of [null, [], 'text', {}, { ...saved, programmeId: '__proto__' }, { ...saved, routeId: 'SG-NTU-P061-ROUTE-CYBER' }, { ...saved, offeringId: 'HK-HKUST-P002-O1' }, { ...saved, applicantId: 'HK-EDUHK-P001-O2-LOCAL' }, { ...saved, offeringId: null }, { ...saved, routeId: {} }, { ...saved, offeringId: 'x'.repeat(201) }, { ...saved, profile: { gpa: 4 } }, { ...saved, savedAt: '2026-02-30' }]) assert.equal(parseSavedOption(input), null);
});
test('prototype keys and unknown schema versions cannot become remembered options', () => {
  assert.equal(parseSavedOption(JSON.parse(JSON.stringify(saved).replace('"savedAt"', '"__proto__"'))), null);
  for (const value of [{}, [], { schemaVersion: 2, items: [saved] }, { schemaVersion: 1, items: {} }]) assert.equal(normalizeSavedOptions(value, [id]).rejected, 1);
  const result = normalizeSavedOptions({ schemaVersion: 1, items: [saved] }, [id]); assert.equal(Object.getPrototypeOf(result.entries), null);
});
test('storage processing is bounded to 500 contexts', () => {
  const result = normalizeSavedOptions({ schemaVersion: 1, items: Array(501).fill(saved) }, [id]);
  assert.equal(Object.keys(result.entries).length, 1); assert.equal(result.rejected, 500);
});
test('comparison uses the complete route/intake/category identity, not only programme ID', () => {
  assert.equal(sameOptions(fixture, saved), true);
  assert.equal(sameOptions({ ...fixture, selectedApplicant: { id: offering + '-NONLOCAL' } }, saved), false);
  assert.equal(sameOptions({ ...fixture, selectedRoute: { id: id + '-ROUTE-SYNTHETIC' } }, saved), false);
  assert.equal(sameOptions(fixture, null), false);
});

const store = new CatalogueStore(':memory:', { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryAuditPath: new URL('data/directory-audit.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root), directoryEvidencePath: new URL('data/directory-links.json', root) });
let clock = new Date('2026-10-19T04:00:00Z');
const server = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: new URL('data/route-programmes.json', root), applicantEvidencePath: new URL('data/applicant-contexts.json', root), now: () => clock });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
test.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); });
const post = (payload, extra = {}) => fetch(url + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(payload) });
const resolved = async contexts => (await (await post({ contexts })).json()).items;

test('valid explicit choices restore current category fees and separately checked evidence', async () => {
  const [item] = await resolved([saved]);
  assert.equal(item.status, 'resolved'); assert.equal(item.programme.selectedApplicant.id, category);
  assert.equal(item.programme.offerings[0].tuition, 151110); assert.equal(item.programme.lastChecked, '2026-10-06');
  assert.equal(item.programme.applicantEvidence.checkedOn, '2026-10-19');
});
test('one invalid saved choice does not prevent valid saved programmes from loading', async () => {
  const result = await resolved([{ ...saved, offeringId: id + '-O2' }, saved, { programmeId: 'SG-NUS-P999' }]);
  assert.deepEqual(result.map(item => item.status), ['needs_attention', 'resolved', 'needs_attention']);
  assert.equal(result[0].code, 422); assert.equal(result[2].code, 404); assert.deepEqual(result.map(item => item.index), [0, 1, 2]);
});
test('resolved direction and study mode retain server-side route trust', async () => {
  const [item] = await resolved([{ programmeId: 'SG-NTU-P061', routeId: 'SG-NTU-P061-ROUTE-CYBER', offeringId: 'SG-NTU-P061-CYBER-PT-2027' }]);
  assert.equal(item.status, 'resolved'); assert.equal(item.programme.offerings.length, 1);
  assert.equal(item.programme.offerings[0].mode, 'Part-time'); assert.equal(item.programme.applicationTimeline.state, 'within_recorded_dates');
});
test('a route change cannot silently fall back to a sibling offering', async () => {
  const [item] = await resolved([{ programmeId: 'SG-NTU-P061', routeId: 'SG-NTU-P061-ROUTE-CRYPTO', offeringId: 'SG-NTU-P061-CYBER-PT-2027' }]);
  assert.equal(item.status, 'needs_attention'); assert.equal(item.programme, undefined);
});

test('retired combined MITB intake IDs require review instead of silently choosing January or August', async () => {
  const programmeId = 'SG-SMU-P010';
  const result = await resolved([{ programmeId, offeringId: programmeId + '-O1' }, { programmeId, offeringId: programmeId + '-O2' }, saved]);
  assert.deepEqual(result.map(r => r.status), ['needs_attention', 'needs_attention', 'resolved']);
  for (const item of result.slice(0, 2)) { assert.equal(item.code, 422); assert.equal(item.programme, undefined); }
  const [baseline] = await resolved([{ programmeId }]);
  assert.equal(baseline.status, 'resolved');
  assert.equal(baseline.programme.selectedOffering, undefined);
  assert.equal(baseline.programme.offerings.length, 4);
});

test('explicit MITB intake repair restores only that cohort and exports its unresolved dates', async () => {
  const programmeId = 'SG-SMU-P010';
  const [january, august] = await resolved(['JAN2027-PT', 'AUG2027-PT'].map(suffix => ({ programmeId, offeringId: programmeId + '-' + suffix })));
  assert.equal(january.status, 'resolved'); assert.equal(august.status, 'resolved');
  assert.equal(january.programme.offerings.length, 1); assert.equal(august.programme.offerings.length, 1);
  assert.match(january.programme.offerings[0].feeBasis, /SGD 10,000 deposit/);
  assert.match(august.programme.offerings[0].feeBasis, /SGD 8,000 deposit/);
  assert.equal(august.programme.applicationTimeline.state, 'dates_incomplete');
  const choice = optionSnapshot(august.programme, savedAt);
  const output = shortlistExport([august.programme], { [programmeId]: choice }, savedAt);
  assert.equal(output.programmes[0].selectedOffering.id, programmeId + '-AUG2027-PT');
  assert.equal(output.programmes[0].offerings[0].deadline, null);
  assert.equal(output.programmes[0].applicationTimeline.state, 'dates_incomplete');
});
test('a removed offering is flagged while other saved programmes remain usable, and recovery is explicit', async () => {
  const original = store.get('HK-HKUST-P002');
  const context = { programmeId: original.id, offeringId: original.id + '-O2' };
  try {
    store.importBatch({ schemaVersion: 1, programmes: [{ ...original, offerings: [original.offerings[0]] }] }, 'Synthetic removal in memory for saved-choice regression only');
    const result = await resolved([context, saved]);
    assert.equal(result[0].status, 'needs_attention'); assert.equal(result[0].programme, undefined); assert.equal(result[1].status, 'resolved');
    const [repaired] = await resolved([{ programmeId: original.id, offeringId: original.id + '-O1' }]);
    assert.equal(repaired.status, 'resolved'); assert.equal(repaired.programme.offerings[0].tuition, 270000);
  } finally { store.importBatch({ schemaVersion: 1, programmes: [original] }, 'Restore in-memory regression fixture'); }
});
test('invalid context entries do not reflect hidden profile or price fields', async () => {
  const result = await resolved([null, { ...saved, profile: { major: 'Synthetic private background' } }, saved]);
  assert.deepEqual(result.map(item => item.status), ['needs_attention', 'needs_attention', 'resolved']);
  assert.equal(JSON.stringify(result).includes('Synthetic private background'), false);
});
test('batch validation, origin protection and input bounds remain enforced', async () => {
  for (const input of [null, {}, { contexts: {} }, { contexts: Array(501).fill(saved) }, { contexts: [saved], profile: {} }]) assert.equal((await post(input)).status, 422);
  assert.equal((await post({ contexts: [saved] }, { Origin: 'https://external.invalid' })).status, 403);
  assert.equal((await post({ contexts: [] })).status, 200);
});
test('reopening recomputes date comparison instead of retaining an old availability snapshot', async () => {
  const [before] = await resolved([saved]); clock = new Date('2026-11-21T04:00:00Z');
  try { const [after] = await resolved([saved]); assert.equal(before.programme.applicationTimeline.state, 'dates_incomplete'); assert.equal(after.programme.applicationTimeline.state, 'deadline_passed'); assert.equal(after.programme.lastChecked, before.programme.lastChecked); } finally { clock = new Date('2026-10-19T04:00:00Z'); }
});
test('storage never becomes a source update or a database profile table', async () => {
  const before = JSON.stringify(store.get(id)); await resolved([saved]);
  assert.equal(JSON.stringify(store.get(id)), before); assert.equal(store.quality().total, 793);
  assert.equal(store.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().some(t => /saved|profile|student/.test(t.name)), false);
});
test('export uses current facts, retained choices and no student background', async () => {
  const [{ programme }] = await resolved([saved]);
  const output = shortlistExport([{ ...programme, profile: { major: 'Synthetic private background' }, match: { tier: 'invented' } }], { [id]: saved }, savedAt);
  assert.equal(output.programmes[0].rememberedChoice, true); assert.equal(output.programmes[0].offerings[0].tuition, 151110);
  assert.equal(output.programmes[0].selectedApplicant.id, category); assert.equal(JSON.stringify(output).includes('Synthetic private'), false);
  assert.equal(output.programmes[0].match, undefined); assert.deepEqual(output.unresolved, []);
});
test('unresolved exports do not substitute baseline prices or silently drop unavailable records', () => {
  const output = shortlistExport([{ id, name: 'Unselected baseline', offerings: [{ tuition: 999 }], savedOptionIssue: 'The original option is no longer valid' }, { id: 'SG-NUS-P999', unavailable: true, issue: 'Programme unavailable' }], { [id]: saved }, savedAt);
  assert.deepEqual(output.programmes, []); assert.equal(output.unresolved.length, 2); assert.equal(output.unresolved[0].requestedOptions.applicantId, category);
  assert.equal(JSON.stringify(output).includes('"tuition"'), false);
});
test('saving a changed current view requires an explicit update', () => {
  const changed = { ...fixture, selectedApplicant: { id: offering + '-NONLOCAL' } };
  assert.equal(sameOptions(changed, saved), false); assert.equal(saved.applicantId, category);
  assert.equal(optionSnapshot(changed, savedAt).applicantId, offering + '-NONLOCAL');
});
test('client explicitly gates persistence and revalidates saved contexts before background checks', () => {
  const js = readFileSync(new URL('public/app.js', root), 'utf8');
  assert.match(js, /action === 'rememberOptions'/); assert.match(js, /action === 'forgetOptions'/);
  assert.match(js, /await restoreRememberedOptions\(\); if \(state.profile\)/);
  assert.match(js, /savedOptionIssues\[p.id\] \? null/); assert.match(js, /remembered choices differ/);
  assert.equal(/writeStorage\([^\n]*(routeChoices|offeringChoices|applicantChoices)/.test(js), false);
  assert.match(js, /if \(error.status !== 422\) throw error/);
});
test('shared storage/export helper is served but private source paths remain blocked', async () => {
  assert.equal((await fetch(url + '/saved-options.js')).status, 200);
  assert.equal((await fetch(url + '/data/local/platform.sqlite')).status, 404);
});
