import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CatalogueStore } from '../server/database.mjs';
import { createApp, filterProgrammes } from '../server/app.mjs';
import { loadRoutes, resolveProgramme, routeSummary } from '../server/routes.mjs';
import { loadApplicantContexts, applicantSummary, offeringFingerprint } from '../server/applicants.mjs';
import { matchProgramme } from '../server/matching.mjs';
import { programmeTimeline } from '../server/application-dates.mjs';
import { optionSnapshot, shortlistExport } from '../public/saved-options.js';
import { loadRepositoryReviewQueue } from '../scripts/source-review-queue.mjs';
import { loadSchoolBacklog, buildSchoolBacklog, formatSchoolBacklog } from '../scripts/school-data-backlog.mjs';

const root = new URL('../', import.meta.url), read = f => JSON.parse(readFileSync(new URL(f, root), 'utf8'));
const batch = read('data/checked-programmes.json'), obs = read('data/research/sutd-school-observation-2026-11-03.json');
const paths = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const store = new CatalogueStore(':memory:', paths), routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
const p = n => store.get(`SG-SUTD-P${String(n).padStart(3, '0')}`), records = obs.programmeIds.map(id => store.get(id));
const profile = { major: 'Computer Science', degreeStatus: 'graduated', classification: 'first', gpa: 4, gpaScale: 4, experienceYears: 0, language: { type: 'ielts', total: 7, testDate: '2026-05-01' } };
const resolve = (n, mode = 'FT', cat) => { const o = p(n).offerings.find(o => o.mode === (mode === 'FT' ? 'Full-time' : 'Part-time')); assert.ok(o); return resolveProgramme(p(n), routes, undefined, o.id, cat ? o.id + '-' + cat : undefined, contexts); };
const note = (n, label) => p(n).rules.find(r => r.labelEn === label)?.noteEn;
const academic = n => note(n, 'Programme-specific academic conditions and alternatives'), docs = n => note(n, 'Programme documents and personal timing');
const lang = (n, evidence) => matchProgramme(resolve(n), { ...profile, language: evidence }).checks.find(c => c.kind === 'language');
const choices = () => records.flatMap(x => x.offerings.flatMap(o => { const c = obs.applicantContextPlan.find(c => c.offeringId === o.id); return (c ? c.options : [undefined]).map(cat => resolveProgramme(x, routes, undefined, o.id, cat?.id, contexts)); }));

test('SUTD first pass closes sixteen existing leads without adding duplicate degrees or complete review claims', () => {
  assert.equal(records.length, 16); assert.equal(records.flatMap(p => p.offerings).length, 21); assert.equal(choices().length, 34);
  const q = store.quality(); assert.equal(q.total, 873); assert.equal(q.browsable, 865); assert.equal(q.checked, 345); assert.equal(q.outOfScope, 7); assert.equal(q.transferOnly, 1); assert.equal(q.complete, 0); assert.equal(q.peerReviewed, 0);
  assert.deepEqual(routeSummary(routes), { groups: 17, routes: 41, pageChecked: 41, peerReviewed: 0, complete: 0 }); assert.deepEqual(applicantSummary(contexts), { studyOptions: 228, categories: 457, peerReviewed: 0 });
  for (const x of records) { assert.equal(x.lastChecked, '2026-11-03'); assert.equal(x.reviewer, null); assert.equal(x.requirementsCoverage, 'partial'); assert.equal(routes.has(x.id), false); assert.equal(x.rules.some(r => r.kind === 'gpa'), false); assert.equal(/\p{Script=Han}/u.test(JSON.stringify(batch.programmes.find(p => p.id === x.id))), false); }
  assert.notEqual(p(4).officialUrl, p(10).officialUrl); assert.notEqual(p(6).officialUrl, p(11).officialUrl); assert.notEqual(p(14).officialUrl, p(2).officialUrl); assert.notEqual(p(18).officialUrl, p(19).officialUrl);
});

test('required China delivery excludes only the three evidenced degrees independently of applicant strength', () => {
  for (const n of [5, 8, 15]) { const x = resolve(n), result = matchProgramme(x, profile); assert.equal(x.scope.status, 'out_of_scope'); assert.equal(result.status, 'out_of_scope'); assert.equal(result.tier, null); assert.equal(result.counts.fail, 0); assert.equal(programmeTimeline(x, '2026-11-03').state, 'excluded'); assert.ok(x.offerings.every(o => o.tuition === null)); assert.equal(obs.applicantContextPlan.some(c => c.programmeId === x.id), false); }
  assert.match(p(5).scope.reasonEn, /Term 1.*China/); assert.match(p(8).scope.reasonEn, /Term 1.*China/); assert.match(p(15).scope.reasonEn, /two-month.*Suzhou/);
  for (const n of [6, 7, 13]) assert.notEqual(p(n).scope?.status, 'out_of_scope');
  assert.match(academic(7), /does not inherit.*Suzhou/); assert.match(academic(13), /LOCAL/); assert.match(academic(15), /12 credit points.*not credit-bearing/);
  const normal = filterProgrammes(store.all(), { school: 'SG-SUTD' }); assert.equal(normal.length, 15); assert.ok([5, 8, 15].every(n => !normal.some(x => x.id === p(n).id)));
});

test('alternative ICT employment and preferred preparation never become universal automated rejections', () => {
  for (const n of [6, 11]) { assert.match(academic(n), /OR.*TWO YEARS ICT/); assert.equal(p(n).rules.some(r => r.kind === 'experience'), false); }
  assert.match(academic(11), /Java.*Python.*required/); assert.match(academic(10), /SUBSTANTIAL COMPUTING ELEMENT/);
  assert.match(academic(12), /calculus.*EXPECTED.*Python\/R.*BENEFICIAL/); assert.match(academic(16), /ADVANTAGEOUS, NOT NECESSARY/);
  for (const n of [9, 17]) assert.match(academic(n), /portfolio.*REQUESTED/i);
  for (const n of [6, 10, 11, 12, 16]) { const m = matchProgramme(resolve(n), profile); assert.equal(m.tier, null); assert.equal(m.status, 'needs_confirmation'); assert.equal(m.checks.some(c => c.kind === 'experience' && c.status === 'fail'), false); }
});

test('published IELTS and old TOEFL scales remain programme-specific with no invented new-scale equivalence', () => {
  assert.equal(lang(4, { type: 'ielts', total: 6, testDate: '2026-05-01' }).status, 'fail'); assert.equal(lang(4, profile.language).status, 'pass');
  assert.equal(p(4).rules.find(r => r.kind === 'language').tests.toefl_120.total, 90);
  for (const n of [7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]) { const tests = p(n).rules.find(r => r.kind === 'language').tests; assert.equal(tests.ielts.total, 6); assert.equal(tests.toefl_120.total, 85); assert.equal(tests.toefl_6, undefined); if (n !== 15) assert.equal(lang(n, { type: 'ielts', total: 5.5, testDate: '2026-05-01' }).status, 'fail'); }
  for (const n of [5, 6, 8]) assert.equal(p(n).rules.some(r => r.kind === 'language'), false);
  for (const n of [5, 8]) assert.match(academic(n), /MANDARIN/);
});

test('ambiguous conjunctions, application-based validity and unlabelled MUSPP scores retain unresolved conditions', () => {
  for (const n of [7, 9, 13]) { assert.equal(p(n).fieldStatus.language.status, 'unknown'); assert.match(note(n, 'Language applicability, versions and unresolved evidence'), /AND/); assert.equal(matchProgramme(resolve(n), profile).status, 'needs_confirmation'); }
  assert.match(note(11, 'Language applicability, versions and unresolved evidence'), /at APPLICATION.*not at the platform observation date/);
  assert.equal(p(19).rules.find(r => r.kind === 'language').tests.toefl_120, undefined); assert.equal(p(19).rules.find(r => r.kind === 'language').tests.toefl_6, undefined);
  assert.match(note(19, 'Language applicability, versions and unresolved evidence'), /LAST DEGREE.*580\/92\/237/); assert.equal(p(19).fieldStatus.language.status, 'unknown');
});

test('three-referee MSc documents, two-referee MTD documents and statement minima retain their own clocks', () => {
  for (const n of [4, 6]) { assert.match(docs(n), /THREE recommenders.*1,000-word/); assert.match(docs(n), /ONE WEEK AFTER APPLICATION.*GRE.*NOT REQUIRED/); }
  assert.match(docs(12), /AT LEAST 500-word/); assert.match(docs(10), /approximately 500-word/);
  assert.match(docs(19), /TWO referees.*ONE WEEK AFTER APPLICATION.*1,000-word/); assert.match(docs(19), /TWO WEEKS AFTER THE APPLICATION DEADLINE.*not an application extension/);
  for (const n of [9, 17]) assert.match(docs(n), /portfolio.*REQUESTED/);
});

test('ten FT fee contexts expose exact citizen/PR and international prices only after explicit selection', () => {
  const plans = obs.applicantContextPlan.filter(c => c.offeringId.endsWith('-FT')); assert.equal(plans.length, 10);
  for (const plan of plans) { const n = Number(plan.programmeId.slice(-3)), unselected = resolve(n); assert.equal(unselected.selectedApplicant, undefined); assert.equal(unselected.offerings[0].tuition, null); assert.equal(unselected.offerings[0].deadline, null); assert.equal(programmeTimeline(unselected, '2026-11-03').state, 'applicant_required');
    for (const [cat, price] of [['SC-PR', 49050], ['INTERNATIONAL', 54500]]) { const x = resolve(n, 'FT', cat), o = x.offerings[0]; assert.equal(o.tuition, price); assert.equal(o.applicationFee, 21.8); assert.match(o.feeBasis, /inclusive of GST.*non-MOE-subsidised/); assert.match(o.feeBasis, /CREDITED TOWARDS tuition, not added again/); assert.equal(o.deadline, '2027-05-31'); }
  }
});

test('PT annual rates stay distinct from whole-course totals and pass restrictions apply only to PT', () => {
  for (const n of [11, 12, 14]) for (const cat of ['SC-PR', 'INTERNATIONAL']) { const pt = resolve(n, 'PT', cat), ft = resolve(n, 'FT', cat); assert.equal(pt.offerings[0].tuition, null); assert.match(pt.offerings[0].feeBasis, /24,525.*27,250.*annual/i);
    const checks = x => matchProgramme(x, profile).checks.filter(c => c.kind === 'manual' && c.labelEn === 'Part-time annual price and independent immigration permission');
    assert.equal(checks(pt).length, 1); assert.equal(checks(ft).length, 0); assert.match(checks(pt)[0].reasonEn, /NOT ELIGIBLE.*Student Pass/);
    const r = p(n).rules.find(r => r.labelEn === 'Part-time annual price and independent immigration permission'); assert.deepEqual(r.appliesTo.offeringIds, [pt.offerings[0].id]); assert.equal(pt.offerings[0].duration.includes('24'), true);
  }
});

test('MTD future cutoff does not invent an opening day, closing time or live availability', () => {
  for (const plan of obs.applicantContextPlan) { const x = store.get(plan.programmeId), o = x.offerings.find(o => o.id === plan.offeringId), c = [...contexts.values()].find(c => c.offeringId === o.id); assert.equal(c.offeringFingerprint, offeringFingerprint(o));
    for (const cat of c.options) { const selected = resolveProgramme(x, routes, undefined, o.id, cat.id, contexts), so = selected.offerings[0]; assert.equal(so.applicationOpen, null); assert.equal(so.applicationRounds[0].deadlineAt, null); const t = programmeTimeline(selected, '2026-11-03'); assert.equal(t.state, 'dates_incomplete'); assert.equal(t.livePortalChecked, false); }
  }
});

test('archived MSSD, unknown next DAI-E and not-yet-open MUSPP never borrow sibling intake dates or fees', () => {
  for (const mode of ['FT', 'PT']) { const d = resolve(4, mode), m = resolve(6, mode); assert.equal(d.offerings[0].deadline, null); assert.equal(d.offerings[0].tuition, null); assert.equal(programmeTimeline(d, '2026-11-03').state, 'dates_incomplete'); assert.equal(m.offerings[0].applicationOpen, '2025-12-10'); assert.equal(m.offerings[0].deadline, '2026-07-31'); assert.equal(m.offerings[0].tuition, null); assert.equal(programmeTimeline(m, '2026-11-03').state, 'deadline_passed'); }
  const m = resolve(19); assert.equal(m.offerings[0].applicationOpen, '2026-11-09'); assert.equal(m.offerings[0].deadline, '2027-03-31'); assert.equal(m.offerings[0].tuition, null); assert.equal(programmeTimeline(m, '2026-11-03').state, 'not_yet_open'); assert.match(m.offerings[0].deadlineNote, /24 January 2026.*without silently changing it to 2027/); assert.equal(m.offerings[0].applicationRounds, undefined);
});

test('school backlog reconciles every lead and separates unknown fields from no published universal GPA', () => {
  const r = loadSchoolBacklog('2026-11-03'); assert.deepEqual(r.counts, { schools: 14, catalogueRecords: 873, pageCheckedRecords: 345, partialRecords: 345, completeRecords: 0, catalogueLeads: 528, routeCoveredLeads: 12, scopeHeldLeads: 3, unreadLeads: 513 });
  for (const s of r.schools) { assert.equal(s.catalogueLeads, s.routeCoveredLeads + s.scopeHeldLeads + s.unreadLeads); assert.equal(s.unread.length, s.unreadLeads); assert.deepEqual(s.sourceAfterSnapshot, []); }
  const s = r.schools.find(s => s.schoolId === 'SG-SUTD'); assert.equal(s.pageCheckedRecords, 18); assert.equal(s.unreadLeads, 0); assert.equal(s.scopeHeldLeads, 1); assert.equal(s.activeParentUnknownFields.gpa, 0); assert.equal(s.activeParentNotPublishedFields.gpa, 15);
  assert.deepEqual(r, read('data/research/school-backlog-2026-11-03-lingnan-business-data.json')); assert.equal(formatSchoolBacklog(r), readFileSync(new URL('docs/research/school-data-backlog-2026-11-03-lingnan-business-data.md', root), 'utf8').replaceAll('\r\n', '\n'));
  assert.throws(() => buildSchoolBacklog([], new Map(), '2026-02-30')); assert.throws(() => loadSchoolBacklog());
});

test('temporary repeated imports preserve previous parents and exact context bindings without using the daily database', () => {
  const ids = new Set(obs.programmeIds), before = { ...batch, programmes: batch.programmes.filter(p => !ids.has(p.id)) }, dir = mkdtempSync(join(tmpdir(), 'gradpath-sutd-school-')), file = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try { writeFileSync(checkedPath, JSON.stringify(before)); db = new CatalogueStore(file, { ...paths, checkedPath }); assert.equal(db.quality().checked, before.programmes.length); const earlier = db.all().filter(p => !ids.has(p.id)); db.close(); db = null; writeFileSync(checkedPath, JSON.stringify(batch));
    for (let i = 0; i < 2; i++) { db = new CatalogueStore(file, { ...paths, checkedPath }); assert.equal(db.quality().checked, 345); assert.deepEqual(db.all().filter(p => !ids.has(p.id)), earlier); assert.deepEqual(db.quality().sourceRefreshConflicts, []); assert.equal(loadApplicantContexts(contextPath, db.all(), loadRoutes(routePath, db.all())).size, 228); db.close(); db = null; }
  } finally { db?.close(); rmSync(file, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
  const q = loadRepositoryReviewQueue('2026-11-03'); assert.equal(q.counts.reviewUnits, 614); assert.equal(q.counts.nearCutoffUnits, 5); assert.equal(q.counts.staleApplicantContexts, 0);
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-11-03T08:00:00Z') }); let base;
test.before(async () => { await new Promise(r => app.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${app.address().port}`; });
test.after(async () => { await new Promise(r => app.close(r)); store.close(); });

test('all 34 study/category choices survive real API save, restore and export including scope archives', async () => {
  let visits = 0;
  for (const x of choices()) { const id = x.id, o = x.offerings[0], cat = x.selectedApplicant?.id, query = new URLSearchParams({ offering: o.id, ...(cat ? { applicant: cat } : {}) }); const response = await fetch(`${base}/api/programmes/${id}?${query}`); assert.equal(response.status, 200); const d = await response.json(), saved = optionSnapshot(d, '2026-11-03T08:00:00.000Z');
    const rr = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [saved] }) }); assert.equal(rr.status, 200); const item = (await rr.json()).items[0]; assert.equal(item.status, 'resolved'); assert.deepEqual(item.programme.offerings, d.offerings); assert.equal(item.programme.selectedApplicant?.id, cat);
    const ex = shortlistExport([d], { [id]: saved }).programmes[0]; assert.equal(ex.profile, undefined); assert.equal(ex.match, undefined); assert.equal(ex.offerings[0].tuition, o.tuition); assert.equal(ex.offerings[0].deadline, o.deadline); assert.equal(ex.selectedOffering.id, o.id);
    const excluded = x.scope?.status === 'out_of_scope', mr = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, selectedOfferings: { [id]: o.id }, selectedApplicants: cat ? { [id]: cat } : {}, filters: { school: 'SG-SUTD', includeOutOfScope: 'true' } }) }); assert.equal(mr.status, 200); const m = (await mr.json()).items.find(x => x.id === id); assert.ok(m); assert.equal(m.match.tier, null); assert.equal(m.match.status, excluded ? 'out_of_scope' : 'needs_confirmation'); if (excluded) assert.equal(ex.scope.status, 'out_of_scope'); visits++;
  } assert.equal(visits, 34);
});

test('API rejects applicant selections from a different mode and excludes China delivery from default search', async () => {
  const ft = p(11).offerings[0], pt = p(11).offerings[1]; const invalid = await fetch(`${base}/api/programmes/${p(11).id}?offering=${ft.id}&applicant=${pt.id}-INTERNATIONAL`); assert.equal(invalid.status, 422);
  const response = await fetch(base + '/api/catalogue?school=SG-SUTD&limit=100'); assert.equal(response.status, 200); const r = await response.json(); assert.equal(r.total, 15); assert.ok(r.items.every(x => x.scope?.status !== 'out_of_scope'));
});
