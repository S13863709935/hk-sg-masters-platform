import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCheckpoint } from '../server/app.mjs';
const root = new URL('../', import.meta.url);
const publication = JSON.parse(readFileSync(new URL('data/publication-week-06.json', root), 'utf8'));
const expectedDates = Object.fromEntries([...publication.selectedSources, ...publication.retainedSources].map(p => [p.programmeId, p.checkedOn]));
const server = createCheckpoint({ publicDir: new URL('public/', root), pilotPath: new URL('data/checked-programmes.json', root), directoryPath: new URL('data/directory-audit.json', root) });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
test.after(() => new Promise(resolve => server.close(resolve)));
const json = async path => (await fetch(url + path)).json();
const post = (value, extra = {}) => fetch(url + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(value) });
const profile = { major: 'Computer Science', gpa: 3.5, gpaScale: 4, degreeStatus: 'graduated', language: { type: 'ielts', total: 7, components: { listening: 7, reading: 7, writing: 5, speaking: 7 }, singleAttempt: true } };
test('health identifies the Week 6 data checkpoint', async () => { assert.equal((await json('/api/health')).checkpoint, 'week-06'); });
test('metadata separates preparation from actual mixed source dates and excluded features', async () => { const d = await json('/api/checkpoint'); assert.equal(d.pilotProgrammes, 20); assert.equal(d.transferOnlyReferenceRecords, 1); assert.equal(d.targetUniversities, 14); assert.equal(d.independentlyReviewed, 0); assert.equal(d.completeRequirements, 0); assert.equal(d.sourceSnapshotDate, '2026-10-06'); assert.equal(d.latestSourceCheckDate, '2026-10-24'); assert.deepEqual(Object.fromEntries(d.sourceRefreshes.map(p => [p.programmeId, p.checkedOn])), Object.fromEntries(Object.entries(expectedDates).filter(([,day]) => day !== '2026-10-06'))); assert.equal(d.publicationPreparedOn, '2026-10-27'); assert.deepEqual(d.designOnly, ['programme comparison', 'candidate lists']); assert.ok(d.notIncludedHere.includes('expanded catalogue')); });
test('the direct-entry pilot has 20 distinct records, not the larger local inventory', async () => { const d = await json('/api/catalogue'); assert.equal(d.total, 20); assert.equal(new Set(d.items.map(p => p.id)).size, 20); assert.ok(d.items.every(p => p.admissionRoute === 'direct')); });
test('school and region filters combine without leaking other records', async () => { const d = await json('/api/catalogue?school=SG-NUS&region=SG'); assert.ok(d.total > 0); assert.ok(d.items.every(p => p.universityId === 'SG-NUS')); assert.equal((await json('/api/catalogue?school=SG-NUS&region=HK')).total, 0); });
test('search is case-insensitive and empty results are explicit', async () => { assert.ok((await json('/api/catalogue?q=COMPUTER')).items.every(p => /computer/i.test(p.name))); assert.equal((await json('/api/catalogue?q=zzzz-no-such-pilot-record')).total, 0); });
test('details preserve academic year and original fee bases', async () => { const p = await json('/api/programmes/HK-HKUST-P002'); assert.equal(p.academicYear, '2026/27'); assert.equal(p.offerings.length, 2); assert.equal(p.offerings[0].tuition, 270000); assert.equal(p.offerings[1].tuition, 230000); assert.ok(p.sources.length); assert.equal(p.lastChecked, '2026-10-06'); });
test('transfer reference and unknown IDs are not direct-entry details', async () => { for (const id of ['HK-HKUST-P003', 'missing']) assert.equal((await fetch(url + '/api/programmes/' + id)).status, 404); });
test('background checks retain known gaps and unknowns without a tier', async () => { const r = await post({ profile }); assert.equal(r.status, 200); const d = await r.json(); assert.equal(d.items.length, 20); assert.ok(d.items.every(p => p.match.tier === null && p.match.counts.unknown > 0)); const p = d.items.find(p => p.id === 'HK-HKUST-P002'); assert.equal(p.match.status, 'has_gap'); assert.ok(p.match.checks.some(c => /writing/.test(c.reason))); assert.equal('profile' in d, false); });
test('malformed input is rejected without saving or reflecting background', async () => { const r = await post({ profile: { ...profile, gpa: 5 } }); assert.equal(r.status, 422); assert.equal(JSON.stringify(await r.json()).includes('Computer Science'), false); assert.equal((await post({ profile: null })).status, 422); });
test('malformed JSON and oversized requests are bounded', async () => { assert.equal((await fetch(url + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400); assert.equal((await post({ profile, extra: 'x'.repeat(17000) })).status, 413); });
test('cross-origin forms and unsupported content types are refused', async () => { assert.equal((await post({ profile }, { Origin: 'https://example.invalid' })).status, 403); assert.equal((await fetch(url + '/api/matches', { method: 'POST', body: '{}' })).status, 415); });
test('the UI and its two assets are served with restrictive security headers', async () => { for (const path of ['/', '/app.js', '/styles.css']) { const r = await fetch(url + path); assert.equal(r.status, 200); assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/); assert.equal(r.headers.get('cache-control'), 'no-store'); } });
test('server files, source JSON and future feature endpoints are not exposed', async () => { for (const path of ['/server/app.mjs', '/data/checked-programmes.json', '/api/export', '/api/compare', '/api/shortlist', '/api/admin/import']) assert.equal((await fetch(url + path)).status, 404); });
test('background processing does not alter the static catalogue or source file', async () => { const before = JSON.stringify(await json('/api/catalogue')); const raw = readFileSync(new URL('data/checked-programmes.json', root), 'utf8'); await post({ profile }); assert.equal(JSON.stringify(await json('/api/catalogue')), before); assert.equal(readFileSync(new URL('data/checked-programmes.json', root), 'utf8'), raw); });
test('English UI marks design-only features and contains no profile-persistence code', () => { const html = readFileSync(new URL('public/index.html', root), 'utf8'); const js = readFileSync(new URL('public/app.js', root), 'utf8'); assert.match(html, /<html lang="en">/); assert.equal(/\p{Script=Han}/u.test(html + js), false); assert.match(js, /Design preview only/); assert.equal(/localStorage|sessionStorage|indexedDB|document\.cookie/.test(js), false); assert.ok(js.includes("'<': '&lt;'")); assert.match(js, /officialDomains\.some/); });
test('HEAD returns metadata headers without a response body', async () => { const r = await fetch(url + '/api/checkpoint', { method: 'HEAD' }); assert.equal(r.status, 200); assert.equal(await r.text(), ''); });
test('an unrelated write endpoint is not accepted', async () => { assert.equal((await fetch(url + '/api/checkpoint', { method: 'POST', body: '{}' })).status, 405); });
test('selected and retained records keep their actual dates without a review upgrade', () => { const d = JSON.parse(readFileSync(new URL('data/checked-programmes.json', root), 'utf8')); assert.equal(d.programmes.length, 21); assert.ok(d.programmes.every(p => p.lastChecked === expectedDates[p.id] && p.requirementsCoverage === 'partial' && p.reviewer === null)); });

test('the refreshed SMU record is used by details and conservative background checks', async () => {
  const p = await json('/api/programmes/SG-SMU-P001');
  assert.equal(p.lastChecked, '2026-10-20');
  assert.equal(p.offerings[0].deadline, '2027-06-30');
  assert.equal(p.offerings[0].tuition, 58860);
  const response = await post({ profile });
  const checked = (await response.json()).items.find(p => p.id === 'SG-SMU-P001');
  assert.equal(checked.match.tier, null);
  assert.ok(checked.match.counts.unknown > 0);
  assert.ok(checked.match.checks.some(c => c.label === 'English waiver and test validity' && c.status === 'unknown'));
});

test('long fee and phase notes stay in an internally scrolling readable table', () => {
  const css = readFileSync(new URL('public/styles.css', root), 'utf8');
  const js = readFileSync(new URL('public/app.js', root), 'utf8');
  assert.match(css, /table-layout:fixed;min-width:720px/);
  assert.match(css, /\.table-scroll\{overflow-x:auto;max-width:100%\}/);
  assert.match(js, /Opening: \$\{esc\(o.applicationOpen/);
});

test('MITB details preserve four fee cohorts without inventing dated application windows', async () => {
  const p = await json('/api/programmes/SG-SMU-P010');
  assert.equal(p.offerings.length, 4);
  assert.equal(p.fieldStatus.tuition.status, 'known');
  assert.equal(p.fieldStatus.deadline.status, 'unknown');
  assert.ok(p.offerings.every(o => o.applicationOpen === null && o.deadline === null));
  const response = await post({ profile: { ...profile, experienceYears: 0 } });
  const checked = (await response.json()).items.find(item => item.id === p.id);
  assert.equal(checked.match.status, 'needs_confirmation');
  assert.equal(checked.match.tier, null);
  assert.equal(checked.match.checks.find(c => c.kind === 'experience').mandatory, false);
});
