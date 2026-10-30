import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shortlistExport, optionSnapshot } from '../public/saved-options.js';
import { CatalogueStore } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';

const root = new URL('../', import.meta.url);
const syntheticId = 'SG-NTU-P999', syntheticSource = 'https://www.ntu.edu.sg/synthetic-evidence-test';
const exportedAt = '2026-10-22T04:00:00.000Z';
// Synthetic projection fixtures, not additional university admissions evidence.
const baseRule = (kind, extra = {}) => ({ kind, labelEn: 'Synthetic ' + kind, labelZh: '', sourceUrl: syntheticSource, ...extra });
const fixture = () => ({ id: syntheticId, name: 'Synthetic evidence fixture', university: { nameEn: 'Synthetic university' }, officialUrl: syntheticSource,
  verification: 'programme_page_checked', requirementsCoverage: 'partial', lastChecked: '2026-10-06', academicYear: '2027/28',
  notesEn: 'Synthetic unresolved fee and degree-equivalence caution.',
  offerings: [{ id: syntheticId + '-O1', mode: 'Full-time', tuition: null }],
  sources: [{ url: syntheticSource, purpose: 'Synthetic test evidence', checkedOn: '2026-10-06' }],
  fieldStatus: { tuition: { status: 'unknown', noteEn: 'Synthetic fee gap', sourceUrl: syntheticSource }, independentReview: { status: 'unknown', noteEn: 'No independent reviewer in this fixture', sourceUrl: syntheticSource } },
  rules: [baseRule('manual', { noteEn: 'Synthetic unresolved equivalence', mandatory: true })]
});
const exportOne = p => shortlistExport([p], {}, exportedAt).programmes[0];

test('candidate evidence retains source dates, coverage, cautions and published manual conditions', () => {
  const p = fixture(), output = shortlistExport([p], {}, exportedAt), e = output.programmes[0].evidence;
  assert.equal(e.lastChecked, '2026-10-06'); assert.equal(output.exportedAt, exportedAt);
  assert.equal(e.requirementsCoverage, 'partial'); assert.equal(e.notesEn, p.notesEn);
  assert.deepEqual(e.sources, p.sources); assert.deepEqual(e.fieldStatus, p.fieldStatus);
  assert.deepEqual(e.publishedRequirements, [{ kind: 'manual', labelEn: 'Synthetic manual', noteEn: 'Synthetic unresolved equivalence', sourceUrl: syntheticSource, mandatory: true }]);
  assert.match(e.requirementsNotice, /selected intake, mode and applicant category still needs confirmation/);
  assert.match(output.evidenceNotice, /not a complete admissions assessment/);
  assert.match(output.evidenceNotice, /Source-read dates are separate from export and date-comparison times/);
});

test('all supported requirement kinds preserve explicit published values, including false and zero', () => {
  const p = fixture();
  p.rules = [baseRule('degree'), baseRule('major', { accepted: ['History', 'Economics'], any: false, relatedAllowed: true }), baseRule('classification', { min: 'second_upper' }), baseRule('gpa', { min: 3.2, scale: 4 }), baseRule('experience', { min: 0, mandatory: false }), baseRule('manual', { noteEn: 'Synthetic preference', mandatory: false })];
  const r = exportOne(p).evidence.publishedRequirements;
  assert.deepEqual(r.map(r => r.kind), ['degree', 'major', 'classification', 'gpa', 'experience', 'manual']);
  assert.equal(r[0].mandatory, true); assert.equal(r[1].any, false); assert.equal(r[1].relatedAllowed, true);
  assert.deepEqual(r[1].accepted, ['History', 'Economics']); assert.equal(r[2].min, 'second_upper');
  assert.equal(r[3].min, 3.2); assert.equal(r[3].scale, 4); assert.equal(r[4].min, 0); assert.equal(r[4].mandatory, false); assert.equal(r[5].mandatory, false);
});

test('language versions, components and explicit date anchors survive without copying match decisions', () => {
  const p = fixture();
  p.rules = [baseRule('language', { tests: { ielts: { total: 7, componentMin: 6 }, toefl_120: { total: 90, validBefore: '2026-01-21' }, toefl_6: { total: 5, validFrom: '2026-01-21' } }, singleAttempt: true, atHomeAccepted: false, testDateNotBefore: '2024-09-01', testDateSourceUrl: syntheticSource })];
  const r = exportOne(p).evidence.publishedRequirements[0];
  assert.deepEqual(r.tests, p.rules[0].tests); assert.equal(r.singleAttempt, true); assert.equal(r.atHomeAccepted, false);
  assert.equal(r.testDateNotBefore, '2024-09-01'); assert.equal(r.testDateSourceUrl, syntheticSource); assert.equal(r.validityMonths, undefined);
  p.rules[0] = baseRule('language', { tests: { ielts: { total: 6.5 } }, validityMonths: 24 });
  assert.equal(exportOne(p).evidence.publishedRequirements[0].validityMonths, 24);
});

test('catalogue, outdated and unconfirmed records do not export draft rules as published admission criteria', () => {
  for (const verification of ['catalogue_seed', 'outdated', 'needs_confirmation', undefined]) {
    const p = { ...fixture(), verification, requirementsCoverage: 'complete' }, exported = exportOne(p);
    assert.deepEqual(exported.evidence.publishedRequirements, []); assert.equal(exported.evidence.requirementsCoverage, 'unreviewed');
    assert.match(exported.evidence.requirementsNotice, /No source-checked admission criteria/);
    assert.equal(p.requirementsCoverage, 'complete');
  }
  const reviewed = exportOne({ ...fixture(), verification: 'peer_reviewed', requirementsCoverage: 'complete' });
  assert.equal(reviewed.evidence.requirementsCoverage, 'complete'); assert.equal(reviewed.evidence.publishedRequirements.length, 1);
});

test('missing evidence stays missing, without fabricated read dates, sources or verification', () => {
  const p = { id: syntheticId, name: 'Synthetic catalogue lead', university: { nameEn: 'Synthetic university' }, verification: 'catalogue_seed', offerings: [] };
  const e = exportOne(p).evidence;
  assert.equal(e.lastChecked, null); assert.equal(e.notesEn, null); assert.equal(e.requirementsCoverage, 'unreviewed');
  assert.deepEqual(e.sources, []); assert.deepEqual(e.fieldStatus, {}); assert.deepEqual(e.publishedRequirements, []);
});

test('evidence projection excludes unknown/private/staff keys at every newly exported level', () => {
  const p = fixture(), secret = 'SYNTHETIC_PRIVATE_SENTINEL';
  p.profile = { major: secret, gpa: 3.7 }; p.match = { tier: secret }; p.collector = secret; p.reviewer = secret;
  p.sources[0].profile = secret; p.sources[0].collector = secret;
  p.fieldStatus.tuition.profile = secret; p.fieldStatus.student = { noteEn: secret };
  p.rules[0].profile = secret; p.rules[0].labelZh = secret; p.rules[0].reasonEn = secret; p.rules[0].status = secret;
  p.rules.push(baseRule('major', { accepted: ['History', { private: secret }], profile: secret }));
  p.rules.push(baseRule('language', { tests: { ielts: { total: 7, reportedScore: secret, profile: secret }, student: { total: secret } }, profile: secret }));
  const output = shortlistExport([p], {}, exportedAt), e = output.programmes[0].evidence;
  assert.equal(JSON.stringify(output).includes(secret), false);
  assert.deepEqual(Object.keys(e.sources[0]).sort(), ['checkedOn', 'purpose', 'url']);
  assert.deepEqual(Object.keys(e.fieldStatus.tuition).sort(), ['noteEn', 'sourceUrl', 'status']);
  assert.deepEqual(e.publishedRequirements[1].accepted, ['History']);
  assert.deepEqual(e.publishedRequirements[2].tests, { ielts: { total: 7 } });
});

test('malformed nested values and prototype-like keys cannot become published fields', () => {
  const p = fixture(); p.sources = [null, [], 'not a source', { url: syntheticSource, purpose: { private: true }, checkedOn: '2026-10-06' }];
  p.fieldStatus = JSON.parse('{"__proto__":{"noteEn":"not evidence"},"tuition":{"status":"unknown","noteEn":{"private":true},"sourceUrl":"https://www.ntu.edu.sg/synthetic-evidence-test"}}');
  p.rules = [null, [], baseRule('constructor'), { kind: 'manual', labelEn: {}, sourceUrl: syntheticSource }, baseRule('gpa', { min: { private: true }, scale: Infinity }), baseRule('language', { tests: { ielts: { total: 6.5, validFrom: { private: true } }, toefl_6: [] } })];
  const e = exportOne(p).evidence;
  assert.equal(Object.hasOwn(e.fieldStatus, '__proto__'), false); assert.equal(e.fieldStatus.tuition.noteEn, undefined);
  assert.equal(e.sources.length, 1); assert.equal(e.sources[0].purpose, undefined);
  assert.deepEqual(e.publishedRequirements.map(r => r.kind), ['gpa', 'language']);
  assert.equal(e.publishedRequirements[0].min, undefined); assert.equal(e.publishedRequirements[0].scale, undefined);
  assert.deepEqual(e.publishedRequirements[1].tests, { ielts: { total: 6.5 } });
});

test('exported evidence is detached from the programme and cannot mutate its sources or rule arrays', () => {
  const p = fixture(); p.rules.push(baseRule('major', { accepted: ['History'] }), baseRule('language', { tests: { ielts: { total: 7 } } }));
  const before = JSON.stringify(p), e = exportOne(p).evidence;
  e.sources[0].checkedOn = '2099-01-01'; e.fieldStatus.tuition.status = 'known'; e.publishedRequirements[1].accepted.push('Synthetic extra'); e.publishedRequirements[2].tests.ielts.total = 0;
  assert.equal(JSON.stringify(p), before);
});

test('unresolved saved choices never acquire substitute source evidence or baseline conditions', () => {
  const p = { ...fixture(), savedOptionIssue: 'Synthetic stale choice' }, saved = { programmeId: syntheticId, offeringId: syntheticId + '-OLD' };
  const output = shortlistExport([p, { id: 'SG-NTU-P998', unavailable: true, issue: 'Synthetic unavailable' }], { [syntheticId]: saved }, exportedAt);
  assert.deepEqual(output.programmes, []); assert.equal(output.unresolved.length, 2);
  assert.equal(output.unresolved[0].requestedOptions.offeringId, syntheticId + '-OLD');
  assert.equal(Object.hasOwn(output.unresolved[0], 'evidence'), false);
  assert.equal(JSON.stringify(output).includes(syntheticSource), false);
});

const store = new CatalogueStore(':memory:', { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryAuditPath: new URL('data/directory-audit.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root), directoryEvidencePath: new URL('data/directory-links.json', root) });
const server = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: new URL('data/route-programmes.json', root), applicantEvidencePath: new URL('data/applicant-contexts.json', root), now: () => new Date('2026-10-22T04:00:00Z') });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
test.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); });
const get = path => fetch(url + path).then(r => r.json());

test('Finance exports preserve the July discrepancy, optional tests and unchanged source date', async () => {
  const id = 'SG-NUS-P007', before = JSON.stringify(store.get(id));
  const p = await get('/api/programmes/' + id + '?offering=' + id + '-O1'), output = shortlistExport([p], {}, '2026-10-23T04:00:00.000Z'), e = output.programmes[0].evidence;
  assert.equal(e.lastChecked, '2026-10-22'); assert.equal(e.requirementsCoverage, 'partial');
  const discrepancy = e.publishedRequirements.find(r => r.labelEn === 'Final-year completion-document date discrepancy');
  assert.match(discrepancy.noteEn, /22 July 2027/); assert.match(discrepancy.noteEn, /FAQ says 15 July/);
  assert.equal(e.publishedRequirements.find(r => r.labelEn === 'Optional experience and aptitude tests').mandatory, false);
  assert.equal(output.programmes[0].applicationTimeline.asOfDate, '2026-10-22');
  assert.equal(output.programmes[0].offerings[0].tuition, 77608); assert.equal(e.sources.length, 5);
  assert.ok(e.sources.every(s => s.checkedOn === '2026-10-22'));
  assert.equal(JSON.stringify(store.get(id)), before);
});

test('General Track exports preserve its GRE/GMAT disagreement without a user-specific decision', async () => {
  const p = await get('/api/programmes/SG-NUS-P029?offering=SG-NUS-P029-O2'), e = exportOne(p).evidence;
  const r = e.publishedRequirements.find(r => r.labelEn === 'GRE/GMAT source discrepancy and GATE alternative');
  assert.match(r.noteEn, /FAQ says GRE\/GMAT is not compulsory/); assert.equal(r.mandatory, true);
  assert.equal(r.kind, 'manual'); assert.equal(r.status, undefined); assert.equal(r.reasonEn, undefined);
  assert.equal(e.fieldStatus.independentReview.status, 'unknown');
});

test('unresolved NTU opening/tuition cautions retain their own source clock in a later export', async () => {
  const p = await get('/api/programmes/SG-NTU-P018?offering=SG-NTU-P018-O1'), result = exportOne(p), e = result.evidence;
  assert.equal(e.lastChecked, '2026-10-21'); assert.equal(e.fieldStatus.tuition.status, 'unknown');
  assert.equal(result.offerings[0].tuition, null); assert.equal(result.offerings[0].applicationOpen, null);
  assert.match(e.fieldStatus.deadline.noteEn, /Opening differs/);
  assert.ok(e.sources.every(s => s.checkedOn === '2026-10-21')); assert.equal(result.applicationTimeline.asOfDate, '2026-10-22');
});

test('parent, applicant-category and comparison dates remain separate for a selected EdUHK category', async () => {
  const id = 'HK-EDUHK-P001', choice = id + '-O1';
  const p = await get('/api/programmes/' + id + '?offering=' + choice + '&applicant=' + choice + '-LOCAL');
  const saved = optionSnapshot(p, exportedAt), result = shortlistExport([p], { [id]: saved }, exportedAt).programmes[0];
  assert.equal(result.evidence.lastChecked, '2026-10-30'); assert.ok(result.evidence.sources.every(s => ['2026-10-23', '2026-10-30'].includes(s.checkedOn))); assert.ok(result.evidence.sources.some(s => s.checkedOn === '2026-10-23')); assert.ok(result.evidence.sources.some(s => s.checkedOn === '2026-10-30'));
  assert.equal(result.applicantEvidence.checkedOn, '2026-10-23'); assert.equal(result.applicationTimeline.asOfDate, '2026-10-22');
  assert.equal(result.selectedApplicant.id, choice + '-LOCAL'); assert.equal(result.rememberedChoice, true);
});

test('route exports contain only selected-route criteria and preserve unresolved cross-region delivery', async () => {
  const id = 'HK-HKU-P016', route = id + '-ROUTE-DELTA-AI';
  const parent = await get('/api/programmes/' + id);
  assert.deepEqual(exportOne(parent).evidence.publishedRequirements, []);
  const p = await get('/api/programmes/' + id + '?route=' + route + '&offering=' + id + '-DELTA-AI-FT-2027');
  const result = exportOne(p), e = result.evidence;
  assert.equal(result.selectedRoute.id, route); assert.equal(result.scope.status, 'unconfirmed');
  assert.match(result.scope.reasonEn, /Semester 1/); assert.equal(e.lastChecked, '2026-10-21');
  assert.deepEqual(e.publishedRequirements.map(r => r.labelEn), p.rules.map(r => r.labelEn));
  assert.equal(e.requirementsCoverage, 'partial'); assert.equal(result.offerings[0].tuition, null);
});

test('matched API data exports published criteria only, never profile-specific status, reason or tier', async () => {
  const profile = { major: 'Synthetic private undergraduate field', degreeStatus: 'graduated', gpa: 3.7, gpaScale: 4, language: { type: 'ielts', total: 6.5 } };
  const response = await fetch(url + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, filters: { school: 'SG-NUS', q: 'MSc Finance' } }) });
  assert.equal(response.status, 200); const { items } = await response.json(); assert.equal(items.length, 1); assert.equal(items[0].match.status, 'has_gap');
  const result = exportOne(items[0]), json = JSON.stringify(result);
  assert.equal(json.includes(profile.major), false); assert.equal(result.match, undefined); assert.equal(result.profile, undefined);
  assert.ok(result.evidence.publishedRequirements.every(r => r.status === undefined && r.reasonEn === undefined));
  assert.equal(result.evidence.publishedRequirements.find(r => r.kind === 'language').tests.ielts.total, 7);
});

test('the English shortlist notice discloses evidence inclusion without changing storage or network boundaries', () => {
  const app = readFileSync(new URL('public/app.js', root), 'utf8'), copy = readFileSync(new URL('public/copy.js', root), 'utf8');
  assert.match(copy, /published requirements, source-read dates and unresolved conditions/);
  assert.match(app, /Published evidence and unresolved conditions are included, not a complete admissions assessment/);
  assert.match(app, /Background information and matching results are not included/);
  assert.equal(/\p{Script=Han}/u.test(readFileSync(new URL('public/saved-options.js', root), 'utf8')), false);
});
