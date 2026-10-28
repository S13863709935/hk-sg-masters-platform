import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CatalogueStore } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';

const root = new URL('../', import.meta.url);
const seed = JSON.parse(readFileSync(new URL('data/catalogue.json', root), 'utf8'));
const checkedPath = new URL('data/checked-programmes.json', root);
const expansionPath = new URL('data/catalogue-expansion.json', root);
const expansion = JSON.parse(readFileSync(expansionPath, 'utf8'));
const totalRecords = seed.programmes.length + expansion.programmes.length;
const store = new CatalogueStore(':memory:', { seed, expansionPath, checkedPath, directoryAuditPath: new URL('data/directory-audit.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root), directoryEvidencePath: new URL('data/directory-links.json', root) });
const token = 'test-only-admin-token-not-a-secret-1234';
const app = createApp({ store, publicDir: new URL('public/', root), adminToken: token });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.address().port}`;
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });
const post = (path, payload, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(payload) });

test('health endpoint identifies the local app for the Windows launcher', async () => { const response = await fetch(base + '/api/health'); assert.deepEqual(await response.json(), { ok: true, app: 'gradpath', version: '0.1.0' }); });

test('all original 175 source records remain alongside directory expansions', async () => { assert.equal(store.quality().total, totalRecords); assert.equal(store.quality().universities, 14); assert.equal(store.quality().checked, 48); assert.equal(store.quality().peerReviewed, 0); const body = await (await fetch(base + '/api/catalogue')).json(); assert.equal(body.total, totalRecords - 3); assert.equal(body.items.length, 12); assert.equal(body.items.some(p => p.id === 'HK-HKUST-P003'), false); });
test('explicit includeTransfer retains the source record', async () => { const body = await (await fetch(base + '/api/catalogue?includeTransfer=true&q=MEng%20Digital')).json(); assert.equal(body.total, 1); assert.equal(body.items[0].admissionRoute, 'transfer_only'); });
test('default catalogue hides research scope corrections while explicit audit reads retain them', async () => {
  const defaultResponse = await (await fetch(base + '/api/catalogue?school=SG-SUTD&q=Innovation%20by%20Design')).json();
  assert.equal(defaultResponse.total, 0);
  const auditResponse = await (await fetch(base + '/api/catalogue?includeOutOfScope=true&school=SG-SUTD&q=Innovation%20by%20Design')).json();
  assert.equal(auditResponse.total, 1);
  assert.equal(auditResponse.items[0].scope.status, 'out_of_scope');
  const retained = await (await fetch(base + '/api/programmes/SG-SUSS-P008')).json();
  assert.equal(retained.scope.status, 'out_of_scope');
});
test('an explicit audit match cannot turn a research degree into student eligibility or an academic gap', async () => {
  const response = await post('/api/matches', {profile:{major:'Computer Science'},filters:{includeOutOfScope:'true',school:'SG-SUSS',q:'Applied Research'}});
  const result = (await response.json()).items[0].match;
  assert.equal(result.status, 'out_of_scope');
  assert.equal(result.tier, null);
  assert.equal(result.counts.fail, 0);
});
test('school and region filters do not leak records from the other region', async () => { const body = await (await fetch(base + '/api/catalogue?region=SG&school=SG-SIT')).json(); assert.equal(body.total, 4); assert.ok(body.items.every(p => p.university.region === 'SG')); });
test('specialisation keywords find their grouped programme without importing admissions rules', async () => {
  const response=await (await fetch(base+'/api/catalogue?region=SG&school=SG-NTU&q=Early%20Childhood')).json();
  assert.equal(response.total,1);assert.equal(response.items[0].name,'Master of Education');assert.equal(response.items[0].directoryListing.variants.length,16);assert.equal(response.items[0].rules.length,0);
  const cryptography=await (await fetch(base+'/api/catalogue?school=SG-NTU&q=Applied%20Cryptography')).json();assert.equal(cryptography.total,1);assert.equal(cryptography.items[0].directoryListing.variants.length,2);
});
test('programme details preserve study-mode fee bases and different prices without configured category evidence', async () => { const p = await (await fetch(base + '/api/programmes/HK-HKUST-P002')).json(); assert.equal(p.offerings[0].tuition, 270000); assert.equal(p.offerings[1].tuition, 230000); assert.match(p.offerings[0].feeBasis, /2027\/28 ordinary direct-entry MSc total/); assert.equal(p.offerings[0].deadline, null); assert.equal(p.requirementsCoverage, 'partial'); });
test('profiles are checked without creating a profile table', async () => { const response = await post('/api/matches', { profile: { major: 'Computer Science', gpa: 3.5, gpaScale: 4, language: { type: 'none' } } }); assert.equal(response.status, 200); const body = await response.json(); assert.equal(body.total, totalRecords - 3); assert.ok(body.items.every(p => p.match.tier === null)); const tables = store.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all(); assert.ok(tables.every(t => !/profile|student/i.test(t.name))); });
test('malformed scores return 422', async () => { const response = await post('/api/matches', { profile: { major: 'Computer Science', gpa: 5, gpaScale: 4 } }); assert.equal(response.status, 422); });
test('updated TOEFL report range is enforced even when browser validation is bypassed', async () => {
  for (const total of [0, 0.5, 6.5]) {
    const response = await post('/api/matches', { profile: { major: 'Synthetic Language QA', language: { type: 'toefl_6', total, testDate: '2026-01-21' } } });
    assert.equal(response.status, 422); assert.match((await response.json()).error, /Language score/);
  }
  for (const total of [null, 1, 6]) {
    const response = await post('/api/matches', { profile: { major: 'Synthetic Language QA', language: { type: 'toefl_6', total, testDate: '2026-01-21' } }, filters: { school: 'SG-NUS', q: 'Master of Computing' } });
    assert.equal(response.status, 200); assert.ok((await response.json()).items.every(item => item.match.tier === null));
  }
});
test('malformed JSON is rejected', async () => { const response = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }); assert.equal(response.status, 400); });
test('cross-origin writes are rejected', async () => { const response = await post('/api/matches', { profile: { major: 'Computer Science' } }, { Origin: 'https://external.invalid' }); assert.equal(response.status, 403); });
test('unknown programme IDs return 404', async () => { assert.equal((await fetch(base + '/api/programmes/NO-SUCH-ID')).status, 404); });
test('source file paths are never exposed as static assets', async () => { assert.equal((await fetch(base + '/data/catalogue.json')).status, 404); assert.equal((await fetch(base + '/server/index.mjs')).status, 404); });
test('security headers and main UI are served', async () => { const response = await fetch(base); assert.equal(response.status, 200); assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/); assert.match(await response.text(), /GradPath/); });
test('English copy is served and the retired language-switch module is not', async () => { const response = await fetch(base + '/copy.js'); assert.equal(response.status, 200); assert.equal(/\p{Script=Han}/u.test(await response.text()), false); assert.equal((await fetch(base + '/i18n.js')).status, 404); });
test('exports include sources but no student profiles', async () => { const response = await fetch(base + '/api/export'); const body = await response.json(); assert.equal(body.programmes.length, totalRecords); assert.equal('profiles' in body, false); assert.match(response.headers.get('content-disposition'), /attachment/); });
test('data imports require an admin token', async () => { const response = await post('/api/admin/import', { schemaVersion: 1, programmes: [store.get('HK-HKUST-P002')] }); assert.equal(response.status, 401); });
test('invalid imports roll back the entire batch', async () => { const p = store.get('HK-HKUST-P002'); const changed = { ...p, name: 'Temporary test-only rename' }; const invalid = { ...store.get('HK-HKUST-P001'), officialUrl: 'https://attacker.invalid/' }; const response = await post('/api/admin/import', { schemaVersion: 1, programmes: [changed, invalid] }, { Authorization: `Bearer ${token}` }); assert.equal(response.status, 422); assert.equal(store.get(p.id).name, p.name); });
test('authenticated valid batches retain an audit entry', async () => { const p = store.get('HK-HKUST-P002'); const response = await post('/api/admin/import', { schemaVersion: 1, programmes: [{ ...p, notesEn: p.notesEn + ' Test audit.' }] }, { Authorization: `Bearer ${token}` }); assert.equal(response.status, 200); const latest = store.db.prepare('SELECT reason FROM change_log ORDER BY id DESC LIMIT 1').get(); assert.equal(latest.reason, 'Authenticated local admin import'); });
test('independent review cannot use the same collector and reviewer', () => { const p = store.get('HK-HKUST-P002'); assert.throws(() => store.importBatch({ schemaVersion: 1, programmes: [{ ...p, verification: 'peer_reviewed', collector: 'same', reviewer: 'same' }] }, 'Test'), /Independent reviewer/); });
test('misattributed university IDs are rejected', () => { const p = store.get('HK-HKUST-P002'); assert.throws(() => store.importBatch({ schemaVersion: 1, programmes: [{ ...p, universityId: 'SG-NUS' }] }, 'Test'), /conflicts with university/); });
test('negative tuition and invalid check dates are rejected', () => { const p = structuredClone(store.get('HK-HKUST-P002')); p.offerings[0].tuition = -1; assert.throws(() => store.importBatch({ schemaVersion: 1, programmes: [p] }, 'Test'), /Invalid tuition/); p.offerings[0].tuition = 1; p.lastChecked = '2026-13-01'; assert.throws(() => store.importBatch({ schemaVersion: 1, programmes: [p] }, 'Test'), /requires date/); });
test('file-backed updates survive a restart', () => { const dir = mkdtempSync(join(tmpdir(), 'gradpath-tests-')); const dbPath = join(dir, 'test.sqlite'); let db; try { db = new CatalogueStore(dbPath, { seed }); const p = db.get('HK-HKUST-P001'); db.importBatch({ schemaVersion: 1, programmes: [{ ...p, notesEn: 'Persisted test-only note' }] }, 'Persistence test'); db.close(); db = new CatalogueStore(dbPath, { seed }); assert.equal(db.get(p.id).notesEn, 'Persisted test-only note'); } finally { db?.close(); rmSync(dbPath, { force: true }); rmdirSync(dir); } });
