import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CatalogueStore } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { loadRoutes, resolveProgramme } from '../server/routes.mjs';
import { loadApplicantContexts, applicantSummary, offeringFingerprint } from '../server/applicants.mjs';
import { programmeTimeline } from '../server/application-dates.mjs';
import { matchProgramme } from '../server/matching.mjs';
import { optionSnapshot, shortlistExport } from '../public/saved-options.js';

const root = new URL('../', import.meta.url);
const batch = JSON.parse(readFileSync(new URL('data/checked-programmes.json', root), 'utf8'));
const observations = JSON.parse(readFileSync(new URL('data/research/hkbu-observation-2026-10-23.json', root), 'utf8'));
const cu = observations.communication.programmeId, bu = observations.business.programmeId;
const routePath = new URL('data/route-programmes.json', root), applicantPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) });
const routes = loadRoutes(routePath, store.all()), applicants = loadApplicantContexts(applicantPath, store.all(), routes);
const resolve = (id, mode = 1, category) => resolveProgramme(store.get(id), routes, undefined, `${id}-O${mode}`, category && `${id}-O${mode}-${category}`, applicants);
const profile = { major: 'Synthetic HKBU Data QA', degreeStatus: 'graduated', classification: 'first', gpa: 3.8, gpaScale: 4, language: { type: 'ielts', total: 7, singleAttempt: true, testDate: '2026-05-01' } };
const manual = (p, label) => p.rules.find(r => r.kind === 'manual' && r.labelEn === label);

test('two HKBU records are dated separately without inventing review or changing prior observation dates', () => {
  const changed = batch.programmes.filter(p => p.researchBatch === 'hkbu-refresh-2026-10-23');
  assert.deepEqual(changed.map(p => p.id), [cu, bu]);
  for (const p of changed) {
    assert.equal(p.lastChecked, '2026-10-30'); assert.ok(p.sources.every(s => s.checkedOn >= observations.checkedOn && s.checkedOn <= p.lastChecked)); assert.ok(p.sources.some(s => s.checkedOn === observations.checkedOn));
    assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.reviewer, null);
    assert.equal(p.verification, 'programme_page_checked');
  }
  assert.equal(store.get('HK-EDUHK-P001').lastChecked, '2026-10-30');
  assert.equal(store.get('SG-NUS-P029').lastChecked, '2026-10-22');
  assert.deepEqual(applicantSummary(applicants), { studyOptions: 33, categories: 68, peerReviewed: 0 });
});

test('new context bindings cover only the two actual full-time options, never fabricated non-local part-time', () => {
  const contexts = [...applicants.values()].filter(c => [cu, bu].includes(c.programmeId));
  assert.deepEqual(contexts.map(c => c.offeringId), [cu + '-O1', bu + '-O1']);
  for (const c of contexts) {
    const p = store.get(c.programmeId), o = p.offerings.find(o => o.id === c.offeringId);
    assert.equal(c.mode, 'Full-time'); assert.equal(c.academicYear, '2027/28');
    assert.equal(c.offeringFingerprint, offeringFingerprint(o));
    assert.equal(c.reviewer, null); assert.equal(c.checkedOn, observations.checkedOn);
    assert.ok(c.options.every(o => o.applicationFee === null));
  }
  const pt = resolve(cu, 2);
  assert.equal(pt.selectedOffering.id, cu + '-O2'); assert.equal(pt.applicantOptions, undefined);
  assert.equal(pt.offerings[0].deadline, null); assert.equal(pt.offerings[0].tuition, null);
  assert.match(manual(pt, 'Part-time availability and concentration scope').noteEn, /local Hong Kong students only/);
  assert.equal(programmeTimeline(pt, '2026-10-23').state, 'dates_incomplete');
  assert.throws(() => resolve(cu, 2, 'NONLOCAL'), /Unknown or stale applicant category/);
});

test('unselected full-time categories withhold all default prices and deadlines', () => {
  for (const id of [cu, bu]) {
    const p = resolve(id);
    assert.equal(p.applicantOptions.length, 2);
    for (const key of ['tuition', 'deadline', 'applicationOpen', 'applicationFee']) assert.equal(p.offerings[0][key], null);
    assert.equal(programmeTimeline(p, '2026-10-23').state, 'applicant_required');
    assert.match(p.offerings[0].feeBasis, /no default fee/);
  }
  assert.equal(store.get(bu).offerings[0].tuition, null);
  assert.equal(store.get(cu).offerings[0].deadline, null);
});

test('Communication local and non-local categories keep the same total fee but different explicit deadlines', () => {
  for (const [category, deadline] of [['LOCAL', '2027-07-23'], ['NONLOCAL', '2027-06-07']]) {
    const p = resolve(cu, 1, category), o = p.offerings[0];
    assert.equal(o.tuition, 180000); assert.equal(o.currency, 'HKD');
    assert.equal(o.applicationOpen, '2026-10-06'); assert.equal(o.deadline, deadline);
    assert.match(o.feeBasis, /total programme tuition, not an annual fee/);
    assert.match(o.feeBasis, /do not count it twice/);
    assert.equal(o.applicationFee, null); assert.equal(o.applicationRounds, undefined);
    assert.equal(p.applicantEvidence.checkedOn, observations.checkedOn);
    assert.equal(programmeTimeline(p, '2026-10-23').livePortalChecked, false);
  }
  assert.equal(programmeTimeline(resolve(cu, 1, 'NONLOCAL'), '2027-06-08').state, 'deadline_passed');
  assert.equal(programmeTimeline(resolve(cu, 1, 'LOCAL'), '2027-06-08').state, 'within_recorded_dates');
});

test('Business categories use distinct programme totals and the same confirmed 2027 application window', () => {
  for (const [category, amount] of [['LOCAL', 301000], ['NONLOCAL', 393000]]) {
    const p = resolve(bu, 1, category), o = p.offerings[0];
    assert.equal(o.tuition, amount); assert.equal(o.applicationOpen, '2026-09-01'); assert.equal(o.deadline, '2027-04-01');
    for (const phrase of [/two instalments, not two fees/, /Field-study travel\/visa\/living costs/, /textbooks\/course materials/, /no automatic scholarship deduction/]) assert.match(o.feeBasis, phrase);
    assert.equal(o.applicationFee, null);
  }
});

test('English conditions retain programme differences, offer-date validity and unlisted test versions as unknown', () => {
  const comm = store.get(cu), business = store.get(bu);
  assert.equal(comm.rules.find(r => r.kind === 'language').tests.ielts.total, 6.5);
  assert.equal(business.rules.find(r => r.kind === 'language').tests.ielts.total, 6);
  for (const p of [comm, business]) {
    const language = p.rules.find(r => r.kind === 'language');
    assert.equal(language.tests.toefl_6, undefined); assert.equal(language.validityMonths, undefined);
    assert.equal(language.atHomeAccepted, false); assert.equal(language.singleAttempt, true);
    assert.equal(matchProgramme(p, { ...profile, language: { ...profile.language, atHome: true } }).status, 'has_gap');
    const updated = matchProgramme(p, { ...profile, language: { type: 'toefl_6', total: 6, testDate: '2026-05-01' } });
    assert.equal(updated.checks.find(c => c.kind === 'language').status, 'unknown'); assert.equal(updated.tier, null);
  }
  assert.match(manual(business, 'English policy, alternatives and offer-date validity').noteEn, /IELTS 6.0, but the general page lists 6.5/);
  assert.match(manual(business, 'English policy, alternatives and offer-date validity').noteEn, /at admission-offer issuance/);
  const six = { ...profile, language: { ...profile.language, total: 6 } };
  assert.equal(matchProgramme(comm, six).status, 'has_gap');
  assert.equal(matchProgramme(business, six).status, 'needs_confirmation');
});

test('exit GPA, professional experience, CET and scholarship statements do not become fabricated automatic rules', () => {
  for (const id of [cu, bu]) {
    const p = resolve(id, 1, 'LOCAL');
    assert.equal(p.rules.some(r => ['gpa', 'classification', 'experience', 'major'].includes(r.kind)), false);
    const result = matchProgramme(p, profile); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.ok(result.checks.some(c => c.kind === 'applicant' && c.status === 'unknown'));
  }
  assert.match(store.get(cu).notesEn, /GPA 2.50 is an exit-award condition/);
  assert.match(manual(store.get(bu), 'Programme documents and admission interview').noteEn, /two referees/);
  assert.match(manual(store.get(bu), 'Programme documents and admission interview').noteEn, /not mandatory/);
});

test('source drift disables the new applicant contexts rather than falling back to another price or deadline', () => {
  for (const id of [cu, bu]) {
    const base = store.get(id), altered = { ...base, offerings: base.offerings.map(o => ({ ...o, feeBasis: o.feeBasis + ' Synthetic changed source.' })) };
    const p = resolveProgramme(altered, routes, undefined, id + '-O1', undefined, applicants);
    assert.equal(p.applicantContextStatus, 'stale'); assert.deepEqual(p.applicantOptions, []);
    assert.equal(p.offerings[0].tuition, null); assert.equal(p.offerings[0].deadline, null);
    assert.throws(() => resolveProgramme(altered, routes, undefined, id + '-O1', id + '-O1-LOCAL', applicants), /Unknown or stale/);
  }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: applicantPath, now: () => new Date('2026-10-23T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${app.address().port}`;
const get = async path => (await fetch(baseUrl + path)).json();
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('catalogue, detail, matching and export share the explicitly selected HKBU category', async () => {
  for (const [id, category, amount, deadline] of [[cu, 'LOCAL', 180000, '2027-07-23'], [cu, 'NONLOCAL', 180000, '2027-06-07'], [bu, 'LOCAL', 301000, '2027-04-01'], [bu, 'NONLOCAL', 393000, '2027-04-01']]) {
    const offering = id + '-O1', applicant = offering + '-' + category;
    const detail = await get(`/api/programmes/${id}?offering=${offering}&applicant=${applicant}`);
    assert.equal(detail.offerings[0].tuition, amount); assert.equal(detail.offerings[0].deadline, deadline);
    const qs = new URLSearchParams({ school: 'HK-HKBU', offerings: JSON.stringify({ [id]: offering }), applicants: JSON.stringify({ [id]: applicant }), limit: '100' });
    const catalogue = (await get('/api/catalogue?' + qs)).items.find(p => p.id === id);
    assert.equal(catalogue.offerings[0].tuition, amount); assert.equal(catalogue.offerings[0].deadline, deadline);
    const response = await fetch(baseUrl + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, filters: { school: 'HK-HKBU' }, selectedOfferings: { [id]: offering }, selectedApplicants: { [id]: applicant } }) });
    assert.equal(response.status, 200); const matched = (await response.json()).items.find(p => p.id === id);
    assert.equal(matched.offerings[0].tuition, amount); assert.equal(matched.match.status, 'needs_confirmation'); assert.equal(matched.match.tier, null);
    const exported = shortlistExport([detail], { [id]: optionSnapshot(detail) }, '2026-10-23T04:00:00.000Z').programmes[0];
    assert.equal(exported.offerings[0].tuition, amount); assert.equal(exported.offerings[0].deadline, deadline);
    assert.equal(exported.evidence.lastChecked, detail.lastChecked); assert.equal(exported.rememberedChoice, true);
    assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined);
  }
});

test('saved choice resolution restores the exact HKBU category and rejects unsupported part-time category requests', async () => {
  const detail = await get(`/api/programmes/${bu}?offering=${bu}-O1&applicant=${bu}-O1-LOCAL`);
  const response = await fetch(baseUrl + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [optionSnapshot(detail)] }) });
  assert.equal(response.status, 200); const item = (await response.json()).items[0];
  assert.equal(item.status, 'resolved'); assert.equal(item.programme.selectedApplicant.id, bu + '-O1-LOCAL'); assert.equal(item.programme.offerings[0].tuition, 301000);
  const invalid = await fetch(`${baseUrl}/api/programmes/${cu}?offering=${cu}-O2&applicant=${cu}-O1-NONLOCAL`);
  assert.equal(invalid.status, 422);
});

test('unselected API views and candidate exports never project a default non-local value', async () => {
  for (const id of [cu, bu]) {
    const p = await get(`/api/programmes/${id}`), exported = shortlistExport([p]).programmes[0];
    assert.ok(p.offerings.every(o => o.tuition === null && o.deadline === null));
    assert.ok(exported.offerings.every(o => o.tuition === null && o.deadline === null));
    assert.equal(exported.selectedApplicant, null);
  }
});

test('read-only category use does not alter raw records or increase programme review counters', async () => {
  const before = JSON.stringify([store.get(cu), store.get(bu)]);
  resolve(cu, 1, 'LOCAL'); resolve(bu, 1, 'NONLOCAL');
  const meta = await get('/api/meta'); assert.deepEqual(meta.applicantEvidence, { studyOptions: 33, categories: 68, peerReviewed: 0 });
  assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 870); assert.equal(meta.quality.checked, 95);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0);
  assert.equal(JSON.stringify([store.get(cu), store.get(bu)]), before);
});
