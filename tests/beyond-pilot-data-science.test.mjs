import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CatalogueStore } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { loadRoutes, resolveProgramme } from '../server/routes.mjs';
import { loadApplicantContexts, applicantSummary, offeringFingerprint } from '../server/applicants.mjs';
import { programmeTimeline } from '../server/application-dates.mjs';
import { matchProgramme } from '../server/matching.mjs';
import { optionSnapshot, shortlistExport } from '../public/saved-options.js';
import { validateProgramme } from '../server/validation.mjs';

const root = new URL('../', import.meta.url), read = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const batch = read('data/checked-programmes.json'), obs = read('data/research/beyond-pilot-data-science-observation-2026-10-24.json');
const hk = batch.programmes.find(p => p.id === obs.hkust.programmeId), nu = batch.programmes.find(p => p.id === obs.nus.programmeId);
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
const manual = (p, label) => p.rules.find(r => r.kind === 'manual' && r.labelEn === label).noteEn;
const profile = { major: 'Computer Science', degreeStatus: 'graduated', classification: 'first', gpa: 3.8, gpaScale: 4, experienceYears: 0, language: { type: 'ielts', total: 7, components: { listening: 6, reading: 6, writing: 6, speaking: 6 }, singleAttempt: true, testDate: '2026-05-01' } };
const lang = (p, language) => matchProgramme(p, { ...profile, language }).checks.find(c => c.kind === 'language');
const resolve = (p, i, category, index = contexts) => resolveProgramme(store.get(p.id), routes, undefined, p.offerings[i].id, category, index);
const expected = [['INTERNATIONAL-STANDARD', 58860], ['INTERNATIONAL-ALUMNI', 47088], ['SC-PR-ELIGIBLE', 29866]];

test('existing seed and expansion identities gain partial data-science checks without an expanded pilot or fabricated review', () => {
  assert.deepEqual(batch.programmes.filter(p => p.researchBatch === 'beyond-pilot-data-science-2026-10-24').map(p => p.id), [hk.id, nu.id]);
  const seed = read('data/catalogue.json'), expansion = read('data/catalogue-expansion.json');
  assert.equal(seed.programmes.find(p => p.id === nu.id).verification, 'catalogue_seed');
  assert.equal(expansion.programmes.find(p => p.id === hk.id).verification, 'catalogue_seed');
  assert.equal(batch.pilotProgrammeIds.length, 20);
  for (const p of [hk, nu]) {
    assert.equal(validateProgramme(p, new Set([p.universityId])), p);
    assert.equal(p.verification, 'programme_page_checked'); assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.reviewer, null);
    assert.equal(p.lastChecked, obs.checkedOn); assert.ok(p.sources.every(s => s.checkedOn === obs.checkedOn));
    assert.equal(p.admissionRoute, 'direct'); assert.equal(batch.pilotProgrammeIds.includes(p.id), false);
    assert.equal(p.offerings.some(o => /-(?:seed|catalogue)$/.test(o.id)), false);
    assert.equal(/\p{Script=Han}/u.test(JSON.stringify({ notes: p.notesEn, rules: p.rules, fields: p.fieldStatus })), false);
  }
});

test('HKUST BDT fees depend on study mode, not an invented applicant classification or annual multiplier', () => {
  assert.deepEqual(hk.offerings.map(o => [o.mode, o.duration, o.tuition, o.applicationFee]), [['Full-time', '1 year', 350000, 600], ['Part-time', '2 years', 290000, 600]]);
  for (const i of [0, 1]) {
    const p = resolve(hk, i); assert.equal(p.offerings[0].tuition, hk.offerings[i].tuition); assert.equal(p.applicantOptions, undefined);
    assert.match(p.offerings[0].feeBasis, i ? /four instalments/ : /two instalments/); assert.match(p.offerings[0].feeBasis, /not an annual fee/);
  }
  assert.equal([...contexts.values()].some(c => c.programmeId === hk.id), false);
});

test('HKUST BDT conditional experience has no invented two-year, honours or entry-GPA minimum', () => {
  assert.equal(hk.rules.some(r => ['gpa', 'classification', 'experience'].includes(r.kind)), false);
  for (const input of [{ ...profile, classification: 'ordinary' }, { ...profile, major: 'Economics', experienceYears: 0 }]) {
    const r = matchProgramme(hk, input); assert.equal(r.status, 'needs_confirmation'); assert.equal(r.tier, null);
  }
  const note = manual(hk, 'Alternative discipline and unquantified relevant experience');
  for (const pattern of [/Route A.*Mathematics/, /OR Route B.*AND relevant work experience/, /No numeric work-year minimum/, /separate MSc AI two-year/, /2.850.*graduation/]) assert.match(note, pattern);
});

test('HKUST BDT common admission rounds exclude MicroMasters credit-transfer deadlines and preserve unknown opening times', () => {
  for (const i of [0, 1]) {
    const p = resolve(hk, i), o = p.offerings[0];
    assert.equal(o.applicationOpen, null); assert.equal(o.deadline, '2027-03-01'); assert.equal(o.academicYear, '2027/28');
    assert.deepEqual(o.applicationRounds.map(r => r.deadline), ['2026-12-01', '2027-03-01']);
    assert.ok(o.applicationRounds.every(r => r.applicationOpen === null && r.deadlineAt === null));
    const t = programmeTimeline(p, '2026-10-24'); assert.equal(t.state, 'dates_incomplete'); assert.equal(t.offerings[0].nextRoundId, 'ROUND-1'); assert.equal(t.livePortalChecked, false);
    assert.equal(programmeTimeline(p, '2026-12-02').offerings[0].nextRoundId, 'ROUND-2');
    assert.equal(programmeTimeline(p, '2027-03-02').state, 'deadline_passed');
  }
  assert.equal(obs.hkust.microMasters.notAdmissionDeadlines, true);
});

test('ordinary transfer, full MicroMasters approval and restricted integrated discounts remain distinct manual exceptions', () => {
  const note = manual(hk, 'Three distinct credit-transfer and fee arrangements');
  for (const pattern of [/Ordinary.*9 credits.*full tuition/, /13,000.*second term/, /30 June 2027.*30 July 2027/, /individual courses or late submissions do not suffice/, /up to 6 credits.*at least 24 credits/, /No exception is applied/]) assert.match(note, pattern);
  assert.deepEqual(hk.offerings.map(o => o.tuition), [350000, 290000]);
});

test('each programme retains its own language total, component, delivery and TOEFL scale/date rules', () => {
  assert.equal(lang(hk, { ...profile.language, components: { ...profile.language.components, writing: 5 } }).status, 'fail');
  assert.equal(lang(hk, { type: 'toefl_6', total: 4.5, testDate: '2026-01-21', singleAttempt: true }).status, 'pass');
  assert.equal(lang(nu, { type: 'ielts', total: 6 }).status, 'pass');
  assert.equal(lang(nu, { type: 'toefl_120', total: 85, testDate: '2026-01-20' }).status, 'pass');
  assert.equal(lang(nu, { type: 'toefl_6', total: 4.5, testDate: '2026-01-21' }).status, 'pass');
  assert.equal(lang(nu, { type: 'ielts', total: 6, atHome: true }).status, 'fail');
  assert.equal(lang(nu, { type: 'waiver' }).status, 'unknown');
  assert.equal(nu.rules.find(r => r.kind === 'language').tests.ielts.componentMin, undefined);
  for (const p of [hk, nu]) assert.equal(p.rules.find(r => r.kind === 'language').validityMonths, undefined);
  assert.equal(nu.rules.find(r => r.kind === 'language').singleAttempt, undefined);
});

test('NUS normal honours OR four-year routes and FAQ exceptions do not reject ordinary-degree/other-discipline applicants automatically', () => {
  assert.equal(nu.rules.some(r => ['classification', 'gpa', 'experience'].includes(r.kind)), false);
  const input = { ...profile, classification: 'ordinary', major: 'Economics', experienceYears: 0 };
  const m = matchProgramme(nu, input); assert.equal(m.status, 'needs_confirmation'); assert.equal(m.tier, null);
  const note = manual(nu, 'Normal academic routes and FAQ exceptions');
  for (const pattern of [/honours degree OR four-year/, /FAQ.*other fields/, /reject every three-year degree/, /3.00 GPA is a graduation/, /experience are advantageous, not mandatory/]) assert.match(note, pattern);
  assert.match(manual(nu, 'English scope, waiver evidence and application-time validity'), /BOTH.*AND.*and\/or/);
  assert.match(manual(nu, 'English scope, waiver evidence and application-time validity'), /two years.*no rolling validity check against today/);
  assert.equal(matchProgramme(nu, { ...profile, degreeStatus: 'final_year' }).checks.find(c => c.kind === 'degree').status, 'unknown');
});

test('NUS regular-cycle windows do not merge the closed early cycle or outcome date into an invented admission period', () => {
  assert.deepEqual(obs.nus.cycle.closedEarlyCycle, { applicationOpen: '2026-05-16', deadline: '2026-07-15', sameIntake: true });
  for (const i of [0, 1]) {
    const o = nu.offerings[i], p = resolve(nu, i, o.id + '-INTERNATIONAL-STANDARD');
    assert.equal(o.applicationOpen, '2026-10-01'); assert.equal(o.deadline, '2027-01-31'); assert.equal(o.applicationRounds, undefined);
    for (const [day, state] of [['2026-08-20', 'not_yet_open'], ['2026-10-24', 'within_recorded_dates'], ['2027-01-31', 'deadline_today'], ['2027-02-01', 'deadline_passed']]) assert.equal(programmeTimeline(p, day).state, state);
    assert.equal(programmeTimeline(p, '2026-10-24').livePortalChecked, false);
  }
});

test('NUS fee cases require explicit eligibility selection, retain GST/deposit basis and exclude unsupported funded-local defaults', () => {
  const records = [...contexts.values()].filter(c => c.programmeId === nu.id); assert.equal(records.length, 2);
  for (const [i, record] of records.entries()) {
    assert.equal(record.offeringFingerprint, offeringFingerprint(nu.offerings[i])); assert.equal(record.reviewer, null);
    const unresolved = resolve(nu, i); assert.equal(unresolved.offerings[0].tuition, null); assert.equal(unresolved.offerings[0].applicationFee, null);
    assert.equal(programmeTimeline(unresolved, '2026-10-24').state, 'applicant_required'); assert.equal(unresolved.selectedApplicant, undefined);
    for (const [suffix, price] of expected) {
      const selected = resolve(nu, i, nu.offerings[i].id + '-' + suffix), o = selected.offerings[0];
      assert.equal(o.tuition, price); assert.equal(o.applicationFee, 100); assert.equal(o.applicationOpen, '2026-10-01');
      assert.match(o.feeBasis, /Includes 9% GST.*10,900.*not an additional charge/);
      assert.match(o.feeBasis, /miscellaneous.*extra\/repeated/);
      assert.equal(matchProgramme(selected, profile).tier, null);
    }
    assert.match(record.noteEn, /Scholarship\/sponsored local cases.*separate quote/);
    assert.throws(() => resolve(nu, i, nu.offerings[i].id + '-FUNDED-LOCAL'));
  }
  assert.equal(obs.nus.fees.fundedLocalPrice, null); assert.equal(obs.nus.fees.visualPdfVerified, false);
  assert.equal(58860 * 0.8, 47088); assert.equal(58860 * 0.6 - 5450, 29866);
  assert.match(manual(nu, 'Fee cases, funding exclusions and PDF verification limit'), /visual\/table verification remains pending/);
});

test('stale NUS cohort/mode fingerprints mask fees and reject the old category rather than silently applying a concession', () => {
  const changed = new Map(contexts), key = [...changed.keys()].find(k => k.endsWith('|' + nu.offerings[0].id));
  const record = structuredClone(changed.get(key)); record.offeringFingerprint = 'a'.repeat(64); changed.set(key, record);
  const p = resolve(nu, 0, undefined, changed); assert.equal(p.applicantContextStatus, 'stale'); assert.equal(p.offerings[0].tuition, null); assert.equal(p.applicantOptions.length, 0);
  assert.throws(() => resolve(nu, 0, nu.offerings[0].id + '-INTERNATIONAL-ALUMNI', changed));
  assert.equal(resolve(nu, 1, nu.offerings[1].id + '-INTERNATIONAL-STANDARD', changed).offerings[0].tuition, 58860);
});

test('financial evidence alternatives and optional GRE/referees are not turned into extra tuition or mandatory entry gates', () => {
  const note = manual(nu, 'Supporting documents and conditional completion');
  for (const pattern of [/30,000.*OR approved scholarship\/sponsorship\/loan/, /not extra tuition/, /GRE and referee reports are not required/, /personal statement and internship certificates are optional/]) assert.match(note, pattern);
  assert.equal(obs.nus.numericEntryGpa, null); assert.equal(obs.nus.fees.acceptanceTotalIncludedSgd, 10900);
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-24T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + app.address().port;
// Migration checks can block this process beyond the server's idle keep-alive timeout.
const get = async path => { const r = await fetch(base + path, { headers: { Connection: 'close' } }); assert.equal(r.status, 200); return r.json(); };
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('detail/search/match APIs and saved exports keep NUS category and HKUST mode context with explicit old-option repair', async () => {
  const selections = [[hk, 1, undefined], [nu, 0, nu.offerings[0].id + '-INTERNATIONAL-ALUMNI'], [nu, 1, nu.offerings[1].id + '-SC-PR-ELIGIBLE']];
  const details = [];
  for (const [p, i, category] of selections) {
    const o = p.offerings[i], query = new URLSearchParams({ offering: o.id }); if (category) query.set('applicant', category);
    const detail = await get('/api/programmes/' + p.id + '?' + query); details.push(detail);
    assert.equal(detail.offerings[0].tuition, p === hk ? 290000 : i ? 29866 : 47088);
    const filters = { school: p.universityId }, selectedOfferings = { [p.id]: o.id }, selectedApplicants = category ? { [p.id]: category } : {};
    const list = await get('/api/catalogue?' + new URLSearchParams({ ...filters, limit: '100', offerings: JSON.stringify(selectedOfferings), applicants: JSON.stringify(selectedApplicants) }));
    assert.equal(list.items.find(item => item.id === p.id).offerings[0].tuition, detail.offerings[0].tuition);
    const response = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, filters, selectedOfferings, selectedApplicants }) });
    assert.equal(response.status, 200); const item = (await response.json()).items.find(item => item.id === p.id);
    assert.equal(item.match.status, 'needs_confirmation'); assert.equal(item.match.tier, null);
  }
  const saved = details.map(p => optionSnapshot(p));
  const response = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [...saved.slice(0, 2), { programmeId: hk.id, offeringId: hk.id + '-catalogue' }, { programmeId: nu.id, offeringId: nu.id + '-seed' }] }) });
  const items = (await response.json()).items; assert.deepEqual(items.map(i => i.status), ['resolved', 'resolved', 'needs_attention', 'needs_attention']);
  const exported = shortlistExport(items.slice(0, 2).map(i => i.programme), Object.fromEntries(saved.slice(0, 2).map(c => [c.programmeId, c]))).programmes;
  assert.deepEqual(exported.map(p => p.offerings[0].tuition), [290000, 47088]); assert.ok(exported.every(p => p.profile === undefined && p.match === undefined && p.evidence.lastChecked === obs.checkedOn));
});

test('existing file-backed catalogues migrate first data-science checks while preserving directory/earlier evidence and restart state', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-ds-source-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    const before = { ...batch, programmes: batch.programmes.filter(p => ![hk.id, nu.id].includes(p.id)) };
    writeFileSync(checkedPath, JSON.stringify(before)); db = new CatalogueStore(path, { ...options, checkedPath });
    const directory = [hk, nu].map(p => db.get(p.id).directoryListing), prior = db.get('HK-HKUST-P015');
    for (const p of [hk, nu]) assert.equal(db.get(p.id).verification, 'catalogue_seed');
    db.close(); db = null; writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) {
      db = new CatalogueStore(path, { ...options, checkedPath });
      for (const [i, p] of [hk, nu].entries()) { assert.equal(db.get(p.id).verification, 'programme_page_checked'); assert.deepEqual(db.get(p.id).directoryListing, directory[i]); }
      assert.deepEqual(db.get('HK-HKUST-P015'), prior); assert.deepEqual(db.quality().sourceRefreshConflicts, []); assert.equal(db.quality().checked, 328);
      const ri = loadRoutes(routePath, db.all()); assert.deepEqual(applicantSummary(loadApplicantContexts(contextPath, db.all(), ri)), { studyOptions: 218, categories: 437, peerReviewed: 0 });
      db.close(); db = null;
    }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

test('data-science browsing, matching and export remain read-only with no inflated record/route or review totals', async () => {
  const before = JSON.stringify(store.all()); resolve(hk, 0); resolve(nu, 0, nu.offerings[0].id + '-INTERNATIONAL-STANDARD'); matchProgramme(nu, profile);
  const meta = await get('/api/meta'); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 866); assert.equal(meta.quality.checked, 328);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0); assert.deepEqual(meta.quality.sourceRefreshConflicts, []);
  assert.deepEqual(meta.applicantEvidence, { studyOptions: 218, categories: 437, peerReviewed: 0 }); assert.equal(meta.routeEvidence.routes, 39);
  assert.equal(JSON.stringify(store.all()), before);
});
