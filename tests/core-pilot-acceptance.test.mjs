import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildCoreAcceptance, loadCoreAcceptance, formatCoreAcceptance, parseCoreArgs, coreScenarios } from '../scripts/core-pilot-acceptance.mjs';
import { CatalogueStore } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { matchProgramme } from '../server/matching.mjs';

const root = new URL('../', import.meta.url), day = '2026-10-30', report = loadCoreAcceptance(day);
const read = f => JSON.parse(readFileSync(new URL(f, root), 'utf8'));
const batch = read('data/checked-programmes.json'), observed = read('data/research/core-pilot-source-checks-2026-10-25.json');
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const store = new CatalogueStore(':memory:', options);
const caseOf = (id, scenario, variant = 'BASE') => report.cases.find(c => c.programmeId === id && c.scenarioId === scenario && c.variant === variant);
const source = 'https://www.nus.edu.sg/example';
const fixture = () => ({ id: 'SG-NUS-P999', universityId: 'SG-NUS', university: { nameEn: 'Synthetic only' }, name: 'Synthetic acceptance fixture', officialUrl: source, verification: 'programme_page_checked', requirementsCoverage: 'partial', admissionRoute: 'direct', lastChecked: '2026-10-24', academicYear: '2027/28', sources: [{ url: source, checkedOn: '2026-10-24', purpose: 'Synthetic fixture' }], offerings: [{ id: 'SG-NUS-P999-FT', mode: 'Full-time', intake: 'August 2027', academicYear: '2027/28', currency: 'SGD', tuition: null, applicationOpen: null, deadline: null }], rules: [{ kind: 'degree', labelEn: 'Synthetic degree', labelZh: '', sourceUrl: source }] });
const build = (p = fixture(), changes = {}) => buildCoreAcceptance({ programmes: [p], pilotIds: [p.id], asOfDate: day, ...changes });

test('all twenty original core IDs cover seven synthetic backgrounds and seventy-one explicit selection variants', () => {
  assert.deepEqual(report.programmes.map(p => p.id), batch.pilotProgrammeIds);
  assert.deepEqual(report.counts, { coreProgrammes: 20, scenarios: 7, selectionVariants: 71, selectedCategoryContexts: 8, cases: 497, hasGap: 125, needsConfirmation: 372, meetsChecked: 0, violations: 0 });
  assert.equal(new Set(report.cases.map(c => [c.programmeId, c.variant, c.scenarioId].join('|'))).size, 497);
  assert.equal(report.syntheticOnly, true); assert.equal(report.independentReviewClaimed, false); assert.equal(report.sourceCoverageComplete, false);
  assert.ok(report.cases.every(c => c.tier === null && c.exportVerified && !('profile' in c) && !('probability' in c)));
  assert.deepEqual(report.violations, []);
});

test('known language gaps retain programme-specific reasons; low IELTS is not hidden by high GPA', () => {
  for (const id of batch.pilotProgrammeIds) {
    const p = store.get(id), hasIelts = p.rules.some(r => r.kind === 'language' && r.tests?.ielts);
    const c = caseOf(id, 'LOW-ENGLISH');
    if (hasIelts) { assert.equal(c.status, 'has_gap'); assert.ok(c.failed.some(f => f.kind === 'language' && /total/.test(f.reason))); }
  }
  assert.equal(caseOf('SG-NUS-P007', 'BUSINESS-GRADUATE').status, 'has_gap');
  assert.equal(caseOf('SG-NUS-P029', 'BUSINESS-GRADUATE').status, 'needs_confirmation');
});

test('degree alternatives, university recognition and actual work requirements are not replaced by generic gates', () => {
  assert.ok(caseOf('SG-SIT-P002', 'BUSINESS-GRADUATE').failed.some(f => f.kind === 'experience'));
  assert.ok(caseOf('SG-SUTD-P001', 'COMPUTING-STRONG').failed.some(f => f.kind === 'major'));
  for (const id of ['SG-NUS-P029', 'SG-NTU-P015', 'SG-SMU-P010']) assert.equal(caseOf(id, 'BUSINESS-GRADUATE').failed.some(f => f.kind === 'experience'), false);
  const p = store.get('SG-SUTD-P001'), r = matchProgramme(p, { ...coreScenarios[0].profile, major: 'Architecture' });
  assert.equal(r.status, 'needs_confirmation'); assert.equal(r.checks.some(c => c.kind === 'major' && c.status === 'fail'), false);
});

test('missing evidence, waiver claims and original GPA scales remain unresolved without invented admission GPA', () => {
  for (const p of report.programmes) {
    assert.ok(p.notPublishedFields.includes('gpa'));
    for (const id of ['MISSING-EVIDENCE', 'WAIVER-CLAIM', 'DIFFERENT-GPA-SCALE']) {
      const c = caseOf(p.id, id); assert.equal(c.failed.some(f => f.kind === 'gpa'), false);
      assert.equal(c.status === 'meets_checked', false);
    }
    const input = coreScenarios.find(s => s.id === 'WAIVER-CLAIM').profile;
    assert.ok(matchProgramme(store.get(p.id), input).checks.filter(c => c.kind === 'language').every(c => c.status === 'unknown'));
    const missing = matchProgramme(store.get(p.id), coreScenarios.find(s => s.id === 'MISSING-EVIDENCE').profile);
    assert.equal(missing.checks.find(c => c.kind === 'degree').status, 'unknown');
  }
});

test('category choices and closed dates retain their scope without a guessed default or live-open claim', () => {
  for (const id of ['HK-CITYU-P010', 'HK-HKBU-P001', 'HK-HKBU-P007', 'HK-EDUHK-P001', 'HK-HKUST-P002']) {
    const c = report.cases.filter(c => c.programmeId === id && c.offeringId && !c.applicantId);
    assert.ok(c.some(c => c.timeline === 'applicant_required'));
    assert.ok(report.cases.some(c => c.programmeId === id && c.applicantId && c.exportVerified));
  }
  assert.equal(caseOf('SG-SIT-P002', 'COMPUTING-STRONG').timeline, 'deadline_passed');
  assert.equal(report.livePortalChecked, false);
});

test('historical spot checks keep their own dates while a later scoped source check advances selected live records', () => {
  assert.deepEqual(observed.programmes.map(p => p.programmeId), batch.pilotProgrammeIds);
  assert.equal(observed.productionDataChanges, 0); assert.equal(observed.allLinkedSourcesRefreshed, false);
  assert.equal(observed.pdfReviewedThisBatch, false); assert.equal(observed.independentHumanReviews, 0);
  assert.equal(observed.checkedOn, '2026-10-25');
  const refreshed = new Set(read('data/research/hk-existing-records-observation-2026-10-30.json').changedProgrammeIds);
  for (const p of observed.programmes) {
    const actual = store.get(p.programmeId); assert.equal(actual.lastChecked, refreshed.has(p.programmeId) ? '2026-10-30' : p.recordSourceDate);
    if (refreshed.has(p.programmeId)) assert.equal(p.recordSourceDate, '2026-10-23');
    assert.equal(p.checkedOn, observed.checkedOn); assert.ok(p.scope && p.observation && p.remaining);
  }
});

test('acceptance is deterministic, preserves input objects and reports simulated results without authorising review or release', () => {
  const p = fixture(), before = JSON.stringify(p), a = build(p), b = build(p);
  assert.deepEqual(a, b); assert.equal(JSON.stringify(p), before); assert.equal(p.requirementsCoverage, 'partial');
  assert.equal(p.verification, 'programme_page_checked'); assert.match(a.limits, /not real-user research/);
  p.rules[0].labelEn = 'Changed synthetic label'; assert.notEqual(build(p).fingerprint, a.fingerprint);
});

test('missing reasons/sources produce violations rather than silently passing the acceptance', () => {
  const p = fixture(); p.rules[0].sourceUrl = 'https://attacker.invalid/criteria';
  assert.ok(build(p).violations.some(v => v.code === 'MISSING_REASON_SOURCE'));
});

test('invalid dates, duplicate identities, missing programmes and unsupported CLI options fail closed', () => {
  for (const day of ['', '2026-02-30', '2026-10-25T00:00:00Z']) assert.throws(() => build(fixture(), { asOfDate: day }));
  const p = fixture(); assert.throws(() => build(p, { pilotIds: [p.id, p.id] })); assert.throws(() => build(p, { pilotIds: ['SG-NUS-P000'] }));
  assert.throws(() => build(p, { programmes: [p, p] })); assert.throws(() => build(p, { scenarios: [coreScenarios[0], coreScenarios[0]] }));
  assert.throws(() => build(p, { asOfDate: '2026-10-23' }), /postdates/);
  for (const args of [[], ['--as-of'], ['--as-of', day, '--output', 'report.json'], ['--as-of', day, '--database', 'daily.sqlite'], ['--as-of', day, '--as-of', day]]) assert.throws(() => parseCoreArgs(args));
  assert.deepEqual(parseCoreArgs(['--as-of', day, '--format', 'markdown']), { format: 'markdown', asOfDate: day });
});

test('saved acceptance Markdown reproduces exactly and escapes synthetic names in table cells', () => {
  const saved = readFileSync(new URL('docs/research/core-pilot-acceptance-2026-10-30-hkust-remaining.md', root), 'utf8').replaceAll('\r\n', '\n');
  assert.equal(formatCoreAcceptance(report), saved);
  assert.equal(/[ \t]+$/m.test(saved), false);
  const p = fixture(); p.name = '<script>bad</script> | [bad]';
  const text = formatCoreAcceptance(build(p)); assert.equal(text.includes('<script>'), false); assert.ok(text.includes('\\|'));
  assert.match(saved, /497 次比较/); assert.match(saved, /未修改网站功能/);
});

test('read-only CLI works outside the repository and does not alter the eight source inputs', () => {
  const script = fileURLToPath(new URL('scripts/core-pilot-acceptance.mjs', root));
  const sha = f => createHash('sha256').update(readFileSync(new URL(f, root))).digest('hex'), files = Object.keys(report.inputFingerprints);
  const before = files.map(sha);
  const r = execFileSync(process.execPath, [script, '--as-of', day], { cwd: tmpdir(), encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  assert.deepEqual(JSON.parse(r), report); assert.deepEqual(files.map(sha), before);
  const invalid = spawnSync(process.execPath, [script, '--as-of', '2026-02-30'], { cwd: tmpdir(), encoding: 'utf8' });
  assert.equal(invalid.status, 1); assert.equal(invalid.stdout, '');
  assert.match(execFileSync(process.execPath, [script, '--help'], { encoding: 'utf8' }), /No network, daily database/);
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: new URL('data/route-programmes.json', root), applicantEvidencePath: new URL('data/applicant-contexts.json', root), now: () => new Date(day + 'T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + app.address().port;
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('real matching API agrees with all 140 core base-background comparisons, not only the direct helper', async () => {
  for (const scenario of coreScenarios) {
    const r = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: scenario.profile, filters: {} }) });
    assert.equal(r.status, 200); const byId = new Map((await r.json()).items.map(p => [p.id, p]));
    for (const id of batch.pilotProgrammeIds) {
      const actual = byId.get(id), expected = caseOf(id, scenario.id);
      assert.ok(actual, id); assert.equal(actual.match.status, expected.status); assert.deepEqual(actual.match.counts, expected.counts); assert.equal(actual.match.tier, null);
    }
  }
});

test('all selected core contexts survive detail, saved-choice restore and privacy-safe export through APIs', async () => {
  const variants = report.cases.filter(c => c.scenarioId === 'COMPUTING-STRONG' && c.offeringId);
  for (const v of variants) {
    const qs = new URLSearchParams({ offering: v.offeringId }); if (v.applicantId) qs.set('applicant', v.applicantId);
    const r = await fetch(base + '/api/programmes/' + v.programmeId + '?' + qs); assert.equal(r.status, 200);
    const detail = await r.json(); assert.equal(detail.selectedOffering.id, v.offeringId);
    assert.equal(detail.selectedApplicant?.id || null, v.applicantId);
    const saved = { programmeId: v.programmeId, routeId: null, offeringId: v.offeringId, applicantId: v.applicantId, savedAt: day + 'T04:00:00.000Z' };
    const restored = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [saved] }) });
    assert.equal(restored.status, 200); const item = (await restored.json()).items[0]; assert.equal(item.status, 'resolved', v.programmeId + ': ' + item.message);
    assert.deepEqual(item.programme.offerings, detail.offerings); assert.equal(item.programme.profile, undefined);
  }
});
