import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CatalogueStore } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { matchProgramme } from '../server/matching.mjs';
import { validateProgramme } from '../server/validation.mjs';
import { loadApplicantContexts, resolveApplicantContext } from '../server/applicants.mjs';
import { resolveOffering } from '../server/offerings.mjs';
import { loadRoutes } from '../server/routes.mjs';
import { shortlistExport } from '../public/saved-options.js';

const root = new URL('../', import.meta.url);
const read = file => JSON.parse(readFileSync(new URL(file, root), 'utf8'));
const batch = read('data/checked-programmes.json');
const csId = 'HK-CITYU-P010', econId = 'HK-CITYU-P004';
const store = new CatalogueStore(':memory:', { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryAuditPath: new URL('data/directory-audit.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root), directoryEvidencePath: new URL('data/directory-links.json', root) });
const evidencePath = new URL('data/applicant-contexts.json', root);
const routePath = new URL('data/route-programmes.json', root), routes = loadRoutes(routePath, store.all());
const index = loadApplicantContexts(evidencePath, store.all(), routes);
const server = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: evidencePath, now: () => new Date('2026-10-20T04:00:00Z') });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
test.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); });
const get = path => fetch(url + path).then(r => r.json());
const selected = (option, category) => get(`/api/programmes/${csId}?offering=${csId}-${option}&applicant=${csId}-${option}-${category}`);
const profile = { major: 'Computer Science', degreeStatus: 'graduated', language: { type: 'ielts', total: 7, testDate: '2024-09-15', singleAttempt: true } };
const language = (id, date, extra = {}) => matchProgramme(store.get(id), { ...profile, language: { ...profile.language, testDate: date, ...extra } }).checks.find(c => c.kind === 'language');

test('two CityU parents are refreshed without adding programmes or independent reviews', () => {
  for (const id of [csId, econId]) {
    const p = batch.programmes.find(p => p.id === id);
    assert.equal(p.lastChecked, '2026-10-20'); assert.equal(p.academicYear, '2027/28');
    assert.equal(p.verification, 'programme_page_checked'); assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.reviewer, null);
    assert.ok(p.sources.every(s => s.checkedOn === p.lastChecked));
  }
  assert.equal(store.quality().total, 873); assert.equal(store.quality().checked, 27);
  assert.equal(store.quality().peerReviewed, 0); assert.equal(store.quality().complete, 0);
});

test('economics uses the current faculty total, not an older cohort or a compulsory economics major', () => {
  const p = store.get(econId), o = p.offerings[0];
  assert.equal(o.tuition, 354000); assert.equal(o.tuition, 30 * 11800);
  assert.equal(o.tuitionEstimate, undefined); assert.equal(o.applicationOpen, '2026-09-15'); assert.equal(o.deadline, '2027-03-31');
  assert.match(o.feeBasis, /Faculty-published/); assert.match(o.deadlineNote, /Rolling/);
  assert.equal(p.rules.find(r => r.kind === 'major').any, true);
  assert.equal(p.rules.some(r => r.kind === 'gpa'), false);
});

test('unselected CS category has no default price, fee or inferred classification', async () => {
  const p = await get('/api/programmes/' + csId);
  assert.equal(p.selectedApplicant, undefined); assert.equal(p.offerings.length, 2);
  assert.ok(p.offerings.every(o => o.tuition === null && o.applicationFee === null && o.applicantCategoryRequired));
  assert.equal(p.applicationTimeline.state, 'applicant_required');
});

test('both CS modes keep local and non-local minimum-credit estimates separate', async () => {
  for (const option of ['O1', 'O2']) {
    const local = await selected(option, 'LOCAL'), foreign = await selected(option, 'NONLOCAL');
    assert.equal(local.offerings[0].tuition, 30 * 8600); assert.equal(foreign.offerings[0].tuition, 30 * 10100);
    for (const p of [local, foreign]) {
      assert.equal(p.offerings.length, 1); assert.equal(p.offerings[0].tuitionEstimate, true);
      assert.equal(p.offerings[0].applicationFee, null);
      assert.match(p.offerings[0].feeBasis, /Minimum-credit estimate/);
      assert.match(p.offerings[0].deadlineNote, /Rolling review/);
      assert.equal(p.applicationTimeline.state, 'within_recorded_dates');
      assert.equal(p.applicationTimeline.livePortalChecked, false);
      assert.equal(p.offerings[0].feeEvidence.sourceUrl, 'https://www.cityu.edu.hk/sgs/tuitionfee/sf_p53.htm');
    }
  }
});

test('same-university subdomains are supported without accepting another university or spoofed hosts', () => {
  assert.equal(index.size, 17);
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-cityu-domain-')), file = join(dir, 'batch.json');
  try {
    for (const bad of ['https://www.nus.edu.sg/fees', 'https://cityu.edu.hk.attacker.invalid/fees', 'https://attacker@www.cityu.edu.hk/fees']) {
      const b = read('data/applicant-contexts.json'); b.contexts[1].feeSourceUrl = bad;
      writeFileSync(file, JSON.stringify(b)); assert.throws(() => loadApplicantContexts(file, store.all(), routes));
    }
  } finally { rmSync(file, { force: true }); rmdirSync(dir); }
});

test('mixed source dates keep refreshed EdUHK separate from CityU October 20 observations', async () => {
  const ed = await get('/api/programmes/HK-EDUHK-P001?offering=HK-EDUHK-P001-O1&applicant=HK-EDUHK-P001-O1-LOCAL');
  const cs = await selected('O1', 'LOCAL');
  assert.equal(ed.applicantEvidence.checkedOn, '2026-10-23'); assert.equal(ed.lastChecked, '2026-10-23');
  assert.equal(cs.applicantEvidence.checkedOn, '2026-10-20'); assert.equal(cs.lastChecked, '2026-10-20');
});

test('malformed dates, relabelled batch dates, unknown fees and estimate flags fail validation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-cityu-invalid-')), file = join(dir, 'batch.json');
  try {
    for (const alter of [b => { b.contexts[1].checkedOn = '2026-02-30'; }, b => { b.contexts[1].checkedOn = '2099-01-01'; }, b => { b.checkedOn = '2026-10-22'; }, b => { delete b.contexts[1].options[0].applicationFee; }, b => { b.contexts[1].options[0].applicationFee = -1; }, b => { b.contexts[1].options[0].tuitionEstimate = 'yes'; }, b => { b.contexts[1].options[0].deadlineNote = 1; }]) {
      const b = read('data/applicant-contexts.json'); alter(b); writeFileSync(file, JSON.stringify(b));
      assert.throws(() => loadApplicantContexts(file, store.all(), routes));
    }
  } finally { rmSync(file, { force: true }); rmdirSync(dir); }
});

test('a category from another mode is rejected rather than reused silently', async () => {
  const r = await fetch(url + `/api/programmes/${csId}?offering=${csId}-O2&applicant=${csId}-O1-LOCAL`);
  assert.equal(r.status, 422);
});

test('manual source changes invalidate fee contexts instead of replacing the edited programme', () => {
  const changed = structuredClone(store.get(csId)); changed.offerings[0].feeBasis = 'Synthetic manual correction';
  const p = resolveApplicantContext(resolveOffering(changed, csId + '-O1'), index);
  assert.equal(p.applicantContextStatus, 'stale'); assert.deepEqual(p.applicantOptions, []);
  assert.equal(p.offerings[0].tuition, null);
  assert.throws(() => resolveApplicantContext(resolveOffering(changed, csId + '-O1'), index, csId + '-O1-LOCAL'));
  assert.equal(changed.offerings[0].feeBasis, 'Synthetic manual correction');
});

test('published test-date floor is inclusive and is not a rolling two-year expiry', () => {
  for (const id of [csId, econId]) {
    assert.equal(language(id, '2024-09-14').status, 'fail');
    assert.match(language(id, '2024-09-14').reasonEn, /score validity window/);
    assert.equal(language(id, '2024-09-15').status, 'pass');
    assert.equal(language(id, '2024-09-16').status, 'pass');
    assert.match(language(id, '2024-09-15').reasonEn, /not a rolling expiry/);
    assert.equal(language(id, '2024-09-15').testDateEvidence.sourceUrl, 'https://www.cityu.edu.hk/pg/taught-postgraduate-programmes/list');
  }
});

test('missing IELTS date remains unresolved and a low score is still a known gap', () => {
  assert.equal(language(csId, null).status, 'unknown');
  const mixed = language(csId, null, { total: 5 });
  assert.equal(mixed.status, 'fail'); assert.equal(mixed.unresolved, true);
  assert.match(mixed.reasonEn, /total/); assert.match(mixed.reasonEn, /test date/);
});

test('TOEFL score-version checks are not replaced by the older accepted-date floor', () => {
  assert.equal(language(csId, '2024-09-15', { type: 'toefl_120', total: 90 }).status, 'pass');
  assert.equal(language(csId, '2026-02-01', { type: 'toefl_6', total: 5 }).status, 'pass');
  assert.throws(() => language(csId, '2024-09-15', { type: 'toefl_6', total: 5 }));
});

test('language waiver and other incomplete conditions never become full eligibility or a tier', () => {
  assert.equal(language(csId, null, { type: 'waiver' }).status, 'unknown');
  for (const id of [csId, econId]) {
    const result = matchProgramme(store.get(id), profile);
    assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
  }
});

test('invalid or unsourced accepted-date rules are rejected, including double rolling expiry', () => {
  const ids = new Set(store.universities().map(u => u.id));
  for (const changes of [{ testDateNotBefore: '2024-02-30' }, { testDateSourceUrl: 'https://unofficial.invalid/' }, { testDateSourceUrl: undefined }, { validityMonths: 24 }]) {
    const p = structuredClone(store.get(csId)); Object.assign(p.rules.find(r => r.kind === 'language'), changes);
    assert.throws(() => validateProgramme(p, ids));
  }
});

test('restoring/exporting a CityU choice retains estimate labels without a student profile', async () => {
  const context = { programmeId: csId, offeringId: csId + '-O2', applicantId: csId + '-O2-NONLOCAL' };
  const response = await fetch(url + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [context] }) });
  assert.equal(response.status, 200);
  const item = (await response.json()).items[0]; assert.equal(item.status, 'resolved');
  const output = shortlistExport([item.programme], { [csId]: context });
  assert.equal(output.programmes[0].offerings[0].tuitionEstimate, true);
  assert.equal(output.programmes[0].offerings[0].tuition, 303000);
  assert.equal('profile' in output.programmes[0], false);
});

test('UI explicitly labels minimum-credit estimates and links the accepted test-date source', () => {
  const js = readFileSync(new URL('public/app.js', root), 'utf8');
  assert.match(js, /Minimum-credit tuition estimate · not a fixed quote/);
  assert.match(js, /Official test-date source/);
  assert.match(js, /Published intake-specific rule, not a rolling expiry from today/);
});
