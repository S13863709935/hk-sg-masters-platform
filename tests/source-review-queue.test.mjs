import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { buildSourceReviewQueue, loadRepositoryReviewQueue, formatSourceReviewMarkdown, parseReviewArgs } from '../scripts/source-review-queue.mjs';
import { offeringFingerprint } from '../server/applicants.mjs';

const root = new URL('../', import.meta.url), day = '2026-10-24', currentDay = '2026-10-30', report = loadRepositoryReviewQueue(currentDay);
const script = fileURLToPath(new URL('scripts/source-review-queue.mjs', root));
const read = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const source = 'https://www.nus.edu.sg/example';
const programme = changes => ({
  id: 'SG-NUS-P999', universityId: 'SG-NUS', name: 'Synthetic review fixture', officialUrl: source,
  academicYear: '2027/28', lastChecked: '2026-10-23', verification: 'programme_page_checked',
  requirementsCoverage: 'partial', reviewer: null, admissionRoute: 'direct',
  sources: [{ url: source, purpose: 'Synthetic evidence, not university admission data', checkedOn: '2026-10-23' }],
  fieldStatus: Object.fromEntries(['academicYear', 'major', 'gpa', 'language', 'tuition', 'deadline'].map(k => [k, { status: k === 'gpa' ? 'not_published' : 'known', noteEn: 'Synthetic only', sourceUrl: source }])),
  rules: [{ kind: 'manual', labelEn: 'Alternative conditions', noteEn: 'Do not invent admission criteria', sourceUrl: source }],
  offerings: [{ id: 'SG-NUS-P999-FT', academicYear: '2027/28', mode: 'Full-time', intake: 'August 2027', currency: 'SGD', tuition: 100, applicationOpen: null, deadline: '2026-11-01' }],
  ...changes
});
const one = (p = programme(), asOfDate = day) => buildSourceReviewQueue({ programmes: [p], asOfDate });
const unit = (q = report, id = 'SG-NUS-P032', kind = 'programme') => q.units.find(u => u.programmeId === id && u.kind === kind);

test('review units preserve separate programme, route and category counts without inflating catalogue coverage', () => {
  assert.deepEqual(report.counts, {
    catalogueRecords: 873, programmePageRecords: 174, remainingCatalogueLeads: 699,
    routeRecords: 15, applicantContexts: 78, applicantCategories: 158, reviewUnits: 267,
    pendingHumanReview: 267, reviewRecordedInSource: 0, nearCutoffUnits: 3, staleApplicantContexts: 0
  });
  assert.equal(report.units.filter(u => u.kind === 'programme').length, 174);
  assert.equal(new Set(report.units.map(u => u.key)).size, 267);
  assert.equal(report.livePortalChecked, false); assert.equal(report.reviewApprovalGranted, false);
  assert.ok(report.units.every(u => u.status === 'pending_human_review' && !u.sourceReviewRecorded));
});

test('all old source dates, manual conditions and not-published GPA labels survive without an invented reviewer', () => {
  const checked = read('data/checked-programmes.json');
  for (const p of checked.programmes) {
    const r = unit(report, p.id); assert.equal(r.sourceCheckedOn, p.lastChecked);
    assert.deepEqual(r.manualConditions.map(c => c.note), p.rules.filter(c => c.kind === 'manual').map(c => c.noteEn || ''));
    assert.equal(r.reviewer, undefined); assert.equal(r.reviewedOn, undefined);
    if (p.fieldStatus?.gpa?.status === 'not_published') {
      assert.ok(r.notPublishedFields.includes('gpa')); assert.equal(r.unconfirmedFields.includes('gpa'), false);
    }
  }
  assert.equal(unit(report, 'HK-HKUST-P003').sourceCheckedOn, '2026-10-06');
  assert.match(report.caution, /Missing GPA is not zero/);
});

test('fourteen-day review ordering includes today and day fourteen, excludes passed/day-fifteen cutoffs and never asserts live opening', () => {
  for (const [deadline, near] of [['2026-10-23', false], ['2026-10-24', true], ['2026-11-07', true], ['2026-11-08', false]]) {
    const p = programme(); p.offerings[0].deadline = deadline;
    const q = one(p), r = q.units[0];
    assert.equal(r.upcomingRecordedCutoffs.length > 0, near);
    assert.equal(r.reviewOrder === 'cutoff_within_14_days', near);
    assert.equal(q.livePortalChecked, false);
  }
  const r = one().units[0]; assert.equal(r.upcomingRecordedCutoffs[0].daysFromSnapshot, 8);
  assert.match(r.reasons.join(' '), /not a live-open claim/);
});

test('unconfirmed dates, unidentified years, exclusions and future source observations cannot become urgent actionable dates', () => {
  for (const mutate of [
    p => { p.fieldStatus.deadline.status = 'unknown'; },
    p => { p.offerings[0].academicYear = 'Intake unconfirmed'; },
    p => { p.admissionRoute = 'transfer_only'; },
    p => { p.scope = { status: 'out_of_scope' }; },
    p => { p.directoryListing = { variants: [{ nameEn: 'Unselected route', officialUrl: source }] }; },
    p => { p.lastChecked = '2026-10-25'; }
  ]) {
    const p = programme(); mutate(p); const r = one(p).units[0];
    assert.equal(r.upcomingRecordedCutoffs.length, 0);
  }
  const unreviewed = programme({ verification: 'catalogue_seed' }); assert.equal(one(unreviewed).units.length, 0);
});

test('real imminent cutoffs retain cohort/round identity while the old transfer record stays archive-only', () => {
  const near = report.units.filter(u => u.reviewOrder === 'cutoff_within_14_days');
  assert.deepEqual(near.map(u => u.programmeId), ['HK-CUHK-P001', 'HK-HKUST-P001', 'HK-HKUST-P021']);
  const ciem = near.find(u => u.programmeId === 'HK-HKUST-P001');
  assert.deepEqual(ciem.upcomingRecordedCutoffs.map(d => [d.offeringId, d.deadline]), [['HK-HKUST-P001-FEB2027-PT', '2026-11-01']]);
  assert.ok(near[0].upcomingRecordedCutoffs.every(d => d.roundId === 'ROUND-2'));
  assert.equal(unit(report, 'HK-HKUST-P003').reviewOrder, 'archive_only');
});

test('NUS fee cases stay separate with no inferred/default category and their exact cohort/mode binding is checked', () => {
  const parent = unit(); assert.equal(parent.categories, undefined);
  const contexts = report.units.filter(u => u.kind === 'applicant_context' && u.programmeId === 'SG-NUS-P032');
  assert.equal(contexts.length, 2);
  for (const c of contexts) {
    assert.equal(c.offeringFingerprintMatches, true);
    assert.deepEqual(c.categories.map(o => o.tuition), [58860, 47088, 29866]);
    assert.ok(c.categories.every(o => o.id.startsWith(c.offeringId + '-')));
    assert.match(c.note, /separate quote/); assert.match(c.note, /visual verification remains pending/);
    assert.equal(c.selectedApplicant, undefined); assert.equal(c.defaultCategory, undefined);
    assert.ok(c.categories.every(o => o.recordedCutoffs[0].deadline === '2027-01-31'));
  }
  assert.ok(parent.manualConditions.some(c => /visual\/table verification remains pending/.test(c.note)));
});

test('stale applicant bindings withhold all numeric prices/dates and separate old fee prose for reconciliation', () => {
  const p = programme(), o = p.offerings[0];
  const c = {
    programmeId: p.id, routeId: null, offeringId: o.id, offeringFingerprint: 'a'.repeat(64),
    officialUrl: source, academicYear: o.academicYear, mode: o.mode, intake: o.intake,
    checkedOn: '2026-10-23', verification: 'programme_page_checked', reviewer: null,
    feeSourceUrl: source, dateSourceUrl: source, noteEn: 'Synthetic stale evidence',
    options: [{ id: o.id + '-ONE', label: 'Synthetic one', tuition: 80, applicationFee: 10, currency: 'SGD', feeBasis: 'Old numeric fee 80', deadline: '2026-11-01', applicationOpen: null }]
  };
  const q = buildSourceReviewQueue({ programmes: [p], applicants: new Map([[p.id + '||' + o.id, c]]), asOfDate: day });
  const r = q.units.find(u => u.kind === 'applicant_context'); assert.equal(r.offeringFingerprintMatches, false);
  assert.equal(r.reviewOrder, 'reconcile_evidence'); assert.equal(q.counts.staleApplicantContexts, 1);
  assert.equal(r.categories[0].tuition, null); assert.equal(r.categories[0].applicationFee, null);
  assert.deepEqual(r.categories[0].recordedCutoffs, []); assert.match(r.categories[0].feeBasis, /withheld/);
  assert.equal(r.categories[0].recordedFeeBasisForReconciliation, 'Old numeric fee 80');
  assert.equal(r.sourceCheckedOn, '2026-10-23');
});

test('valid applicant evidence observed after the comparison date is withheld without changing source dates or fingerprints', () => {
  const p = programme(), o = p.offerings[0], c = {
    programmeId: p.id, routeId: null, offeringId: o.id, offeringFingerprint: offeringFingerprint(o),
    officialUrl: source, academicYear: o.academicYear, mode: o.mode, intake: o.intake,
    checkedOn: '2026-10-25', verification: 'programme_page_checked', reviewer: null,
    feeSourceUrl: source, dateSourceUrl: source, noteEn: 'Synthetic future evidence',
    options: [{ id: o.id + '-ONE', label: 'Synthetic one', tuition: 80, applicationFee: 10, currency: 'SGD', feeBasis: 'Synthetic old fee', deadline: '2026-11-01', applicationOpen: null }]
  };
  const before = JSON.stringify(c);
  const q = buildSourceReviewQueue({ programmes: [p], applicants: new Map([[p.id + '||' + o.id, c]]), asOfDate: day });
  const r = q.units.find(u => u.kind === 'applicant_context'); assert.equal(r.offeringFingerprintMatches, true);
  assert.equal(r.categories[0].tuition, null); assert.deepEqual(r.categories[0].recordedCutoffs, []);
  assert.match(r.reasons.join(' '), /postdates/); assert.equal(JSON.stringify(c), before);
});

test('route evidence remains separate from siblings and does not require a checked parent or manufacture a new programme', () => {
  const routes = report.units.filter(u => u.kind === 'route');
  assert.equal(routes.length, 15); assert.equal(routes.filter(u => u.programmeId === 'HK-HKU-P016').length, 3);
  assert.equal(report.units.some(u => u.kind === 'programme' && u.programmeId === 'HK-HKU-P016'), false);
  assert.equal(new Set(routes.map(u => u.sourceFingerprint)).size, 15);
  for (const route of routes) assert.ok(route.key.includes(route.routeId));
});

test('mismatched applicant index keys fail closed rather than leaving category-bound facts unmasked', () => {
  const p = programme(), c = { programmeId: p.id, routeId: null, offeringId: p.offerings[0].id };
  assert.throws(() => buildSourceReviewQueue({ programmes: [p], applicants: new Map([['wrong-key', c]]), asOfDate: day }), /index key/);
});

test('generating JSON/Markdown is deterministic, does not mutate inputs and never upgrades source review or completeness', () => {
  const p = programme(), before = JSON.stringify(p), a = one(p), b = one(p);
  assert.deepEqual(a, b); assert.equal(JSON.stringify(p), before);
  assert.match(a.queueFingerprint, /^[a-f0-9]{64}$/); assert.equal(formatSourceReviewMarkdown(a), formatSourceReviewMarkdown(b));
  p.rules[0].noteEn = 'Changed source condition';
  assert.notEqual(one(p).queueFingerprint, a.queueFingerprint);
  assert.equal(p.verification, 'programme_page_checked'); assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.reviewer, null);
});

test('mislabelled peer review without a reviewer never counts as a recorded human review', () => {
  const q = one(programme({ verification: 'peer_reviewed', reviewer: null }));
  assert.equal(q.counts.reviewRecordedInSource, 0); assert.equal(q.units[0].status, 'pending_human_review');
  assert.equal(q.reviewApprovalGranted, false);
  const withLabel = one(programme({ verification: 'peer_reviewed', reviewer: 'Synthetic recorded reviewer' }));
  assert.equal(withLabel.counts.reviewRecordedInSource, 1); assert.match(withLabel.caution, /not independently authenticated/);
  assert.equal(withLabel.reviewApprovalGranted, false);
});

test('snapshot date is explicit and strictly real; CLI flags cannot silently select today or an alternative database/output path', () => {
  for (const d of [undefined, null, '', '2026-02-30', '2026-2-3', '2026-10-24T00:00:00Z', 42]) assert.throws(() => buildSourceReviewQueue({ programmes: [programme()], asOfDate: d }));
  for (const args of [[], ['--as-of'], ['--as-of', '2026-02-30'], ['--as-of', day, '--as-of', day], ['--as-of', day, '--format', 'html'], ['--as-of', day, '--database', 'production.sqlite'], ['--as-of', day, '--output', 'out.json']]) assert.throws(() => parseReviewArgs(args));
  assert.deepEqual(parseReviewArgs(['--format', 'markdown', '--as-of', day]), { format: 'markdown', asOfDate: day });
  assert.deepEqual(parseReviewArgs(['--help']), { help: true });
});

test('Markdown escapes labels/table delimiters and never turns untrusted non-official URLs into clickable sources', () => {
  const p = programme({ name: '<script>alert(1)</script> [bad] | unsafe', officialUrl: 'javascript:alert(1)' });
  const text = formatSourceReviewMarkdown(one(p));
  assert.equal(text.includes('<script>'), false); assert.equal(text.includes('](<javascript:'), false);
  assert.ok(text.includes('\\| unsafe')); assert.ok(text.includes('\\[bad\\]'));
});

test('real CLI works outside the repository without modifying source files or opening a daily database', () => {
  const inputPaths = Object.keys(report.inputFingerprints);
  const sha = file => createHash('sha256').update(readFileSync(new URL(file, root))).digest('hex');
  const before = inputPaths.map(sha);
  const output = execFileSync(process.execPath, [script, '--as-of', currentDay], { cwd: tmpdir(), encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  assert.deepEqual(JSON.parse(output), report);
  assert.deepEqual(inputPaths.map(sha), before);
  const bad = spawnSync(process.execPath, [script, '--as-of', '2026-02-30'], { cwd: tmpdir(), encoding: 'utf8' });
  assert.equal(bad.status, 1); assert.equal(bad.stdout, ''); assert.match(bad.stderr, /not generated/);
  const help = execFileSync(process.execPath, [script, '--help'], { cwd: tmpdir(), encoding: 'utf8' });
  assert.match(help, /No network.*database persistence or publication/);
});

test('committed human checklist exactly reproduces its snapshot and semantic source fingerprints', () => {
  assert.equal(formatSourceReviewMarkdown(report), readFileSync(new URL('docs/research/source-review-queue-2026-10-30-hkust-remaining.md', root), 'utf8').replaceAll('\r\n', '\n'));
  assert.equal(Object.keys(report.inputFingerprints).length, 8);
  for (const h of Object.values(report.inputFingerprints)) assert.match(h, /^[a-f0-9]{64}$/);
  const markdown = formatSourceReviewMarkdown(report);
  assert.match(markdown, /不是 267 个项目/); assert.match(markdown, /安全验证/); assert.match(markdown, /视觉验证或独立人工复核完成/);
});
