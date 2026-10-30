import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { matchProgramme } from '../server/matching.mjs';
import { summarizeRecordedCriteria } from '../server/criteria-summary.mjs';
import { filterMatchedProgrammes } from '../public/catalogue-filters.js';
import { loadSchoolQuality } from '../scripts/school-quality.mjs';
import { CatalogueStore } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';

const root = new URL('../', import.meta.url), source = 'https://masters.smu.edu.sg/programmes';
// Synthetic criteria and self-reported background, not actual university thresholds.
const programme = { id: 'SG-SMU-P999', verification: 'programme_page_checked', requirementsCoverage: 'partial', admissionRoute: 'direct', officialUrl: source,
  rules: [{ kind: 'degree', labelEn: 'Degree', sourceUrl: source }, { kind: 'gpa', min: 3, scale: 4, labelEn: 'Synthetic GPA', sourceUrl: source }, { kind: 'manual', labelEn: 'University assessment', sourceUrl: source }] };
const profile = { major: 'Computing', degreeStatus: 'graduated', gpa: 3.5, gpaScale: 4, language: { type: 'none' } };
const result = patch => matchProgramme({ ...programme, ...patch }, profile);

test('recorded comparisons can pass while overall eligibility and tiers remain unresolved', () => {
  const m = result();
  assert.equal(m.status, 'needs_confirmation'); assert.equal(m.tier, null);
  assert.deepEqual(m.recordedCriteria, { status: 'recorded_checks_met', total: 2, met: 2, gaps: 0, unresolved: 0, otherConditionsPending: 2 });
  assert.equal(m.counts.unknown, 2); assert.equal('probability' in m, false);
});

test('a real comparison failure takes precedence and missing original scales stay unresolved', () => {
  const gap = matchProgramme(programme, { ...profile, gpa: 2.5 });
  assert.equal(gap.recordedCriteria.status, 'has_gap'); assert.equal(gap.status, 'has_gap');
  const missing = matchProgramme(programme, { ...profile, gpa: 85, gpaScale: 100 });
  assert.equal(missing.recordedCriteria.status, 'needs_confirmation'); assert.equal(missing.recordedCriteria.unresolved, 1);
});

test('empty, manual-only and unverified records never pass through vacuous comparisons', () => {
  for (const patch of [{ rules: [] }, { rules: programme.rules.slice(2) }, { verification: 'catalogue_seed' }]) {
    const m = result(patch); assert.equal(m.recordedCriteria.status, 'not_available'); assert.equal(m.recordedCriteria.met, 0);
    assert.equal(m.status, 'needs_confirmation'); assert.equal(m.tier, null);
  }
});

test('preferred conditions and administrative checks are excluded from the comparable subset', () => {
  const m = result({ rules: [...programme.rules, { kind: 'experience', min: 10, mandatory: false, labelEn: 'Preference', sourceUrl: source }], selectedOffering: { id: 'OPTION' }, selectedApplicant: { id: 'CATEGORY' } });
  assert.equal(m.recordedCriteria.total, 2); assert.equal(m.recordedCriteria.otherConditionsPending, 4);
  assert.equal(m.status, 'needs_confirmation'); assert.equal(m.tier, null);
});

test('an unresolved component is retained even when the same test has a known score gap', () => {
  const m = summarizeRecordedCriteria([{ kind: 'language', mandatory: true, status: 'fail', unresolved: true }]);
  assert.equal(m.status, 'has_gap'); assert.equal(m.gaps, 1); assert.equal(m.unresolved, 1); assert.equal(m.met, 0);
  assert.equal(summarizeRecordedCriteria([{ kind: 'language', mandatory: true, status: 'pass', unresolved: true }]).status, 'needs_confirmation');
});

test('the new filter keeps unresolved overall results visible but excludes gaps, stale saved choices and missing comparisons', () => {
  const make = (id, match) => ({ id, name: id, universityId: 'SG-SMU', university: { region: 'SG' }, offerings: [], match });
  const good = result(), noData = result({ rules: [] });
  const all = [make('A', good), make('B', noData), make('C', { ...good, status: 'has_gap' }), make('D', { ...good, status: 'out_of_scope' }), make('E', good)];
  assert.deepEqual(filterMatchedProgrammes(all, { matchFilter: 'recorded_checks_met' }, { E: 'Choices changed' }).map(p => p.id), ['A']);
  assert.deepEqual(filterMatchedProgrammes(all, { matchFilter: 'needs_confirmation' }).map(p => p.id), ['A', 'B', 'E']);
  assert.equal(filterMatchedProgrammes(all, { matchFilter: 'meets_checked' }).length, 0);
});

test('English UI describes partial recorded comparisons and never labels them full eligibility', () => {
  const app = readFileSync(new URL('public/app.js', root), 'utf8');
  const renderer = app.slice(app.indexOf('function recordedCriteriaSummary('), app.indexOf('function card('));
  const context = vm.createContext({ esc: v => String(v) }); vm.runInContext(renderer, context);
  const html = context.recordedCriteriaSummary(result());
  assert.match(html, /2 met · 0 gaps · 0 unresolved/); assert.match(html, /2 other conditions need confirmation/);
  assert.match(html, /not full eligibility/); assert.equal(/\p{Script=Han}/u.test(html), false);
  assert.match(context.recordedCriteriaSummary(result({ rules: [] })), /No comparable background criteria/);
  assert.equal(context.recordedCriteriaSummary({}), '');
  assert.match(app, /aria-describedby="recorded-checks-note"/);
});

test('all real SMU records are covered by the school audit without claiming complete entry criteria', () => {
  const report = loadSchoolQuality('SG-SMU', '2026-10-30');
  assert.equal(report.counts.catalogueRecords, 17); assert.equal(report.counts.checkedRecords, 17);
  assert.equal(report.counts.withComparableRules, 14); assert.equal(report.counts.completeRequirementSets, 0); assert.equal(report.counts.independentlyReviewed, 0);
  assert.equal(report.rows.every(r => r.requirementsCoverage === 'partial'), true);
  assert.equal(report.rows.every(r => r.fieldStates.gpa === 'not_published'), true);
});

test('the real matching API returns summaries without enabling tiers or comparing catalogue-only notes', async () => {
  const store = new CatalogueStore(':memory:', { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root) });
  const app = createApp({ store, publicDir: new URL('public/', root) });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${app.address().port}/api/matches`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, filters: { includeTransfer: 'true' } }) });
    assert.equal(response.status, 200);
    const { items } = await response.json();
    assert.equal(items.length, 873);
    for (const p of items) {
      assert.equal(p.match.tier, null);
      if (p.verification === 'catalogue_seed') { assert.equal(p.match.recordedCriteria.total, 0); assert.equal(p.match.recordedCriteria.status, 'not_available'); }
    }
    const smu = items.filter(p => p.universityId === 'SG-SMU');
    assert.equal(smu.length, 17); assert.ok(filterMatchedProgrammes(smu, { matchFilter: 'recorded_checks_met' }).length > 0);
    for (const p of smu) assert.equal(p.match.status, 'needs_confirmation');
  } finally { await new Promise(resolve => app.close(resolve)); store.close(); }
});
