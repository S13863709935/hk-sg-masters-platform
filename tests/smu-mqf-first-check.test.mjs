import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CatalogueStore } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { loadRoutes, resolveProgramme, routeSummary } from '../server/routes.mjs';
import { loadApplicantContexts } from '../server/applicants.mjs';
import { matchProgramme } from '../server/matching.mjs';
import { programmeTimeline } from '../server/application-dates.mjs';
import { optionSnapshot, shortlistExport, parseSavedOption } from '../public/saved-options.js';
import { loadRepositoryReviewQueue } from '../scripts/source-review-queue.mjs';
import { buildCityuInventory } from '../scripts/build-cityu-directory-inventory.mjs';
import { buildEduhkInventory } from '../scripts/build-eduhk-directory-inventory.mjs';
import { buildHkustInventory } from '../scripts/build-hkust-directory-inventory.mjs';
import { buildHkuInventory } from '../scripts/build-hku-directory-inventory.mjs';
import { buildPolyuInventory } from '../scripts/build-polyu-directory-inventory.mjs';

const root = new URL('../', import.meta.url), read = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const obs = read('data/research/smu-mqf-observation-2026-10-28.json'), batch = read('data/checked-programmes.json');
const pid = obs.programmeId, sgId = pid + '-ROUTE-SINGAPORE', intlId = pid + '-ROUTE-INTERNATIONAL';
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
const p = store.get(pid), sg = resolveProgramme(p, routes, sgId), intl = resolveProgramme(p, routes, intlId);
const select = (route, offering) => resolveProgramme(p, routes, route, offering, undefined, contexts);
// Synthetic profiles verify unresolved conditions, not real applicants or outcomes.
const profile = { major: 'History', degreeStatus: 'graduated', classification: 'ordinary', gpa: 2.5, gpaScale: 4, experienceYears: 0, language: { type: 'none' } };
const rule = (record, label) => record.rules.find(r => r.labelEn === label);

test('MQF exposes two explicit delivery routes without creating degrees for career themes or treating local as residency', () => {
  assert.deepEqual(obs.offeringCountsByTrack, [2, 1]); assert.equal(p.routeOptions, undefined);
  const parent = resolveProgramme(p, routes); assert.equal(parent.routeOptions.length, 2);
  assert.equal(programmeTimeline(parent, '2026-10-28').state, 'route_required');
  assert.ok(matchProgramme(parent, profile).checks.some(c => c.kind === 'route' && c.status === 'unknown'));
  assert.deepEqual(sg.offerings.map(o => o.mode), ['Full-time', 'Part-time']); assert.deepEqual(intl.offerings.map(o => o.mode), ['Full-time']);
  assert.match(sg.notesEn, /not a nationality or residency/); assert.equal(intl.scope.status, 'unconfirmed');
  assert.ok(matchProgramme(intl, profile).checks.some(c => c.kind === 'scope' && c.status === 'unknown'));
});

test('track resolution cannot inherit poisoned parent rules or another route offering', () => {
  const poisoned = { ...p, rules: [{ kind: 'gpa', min: 100, scale: 100 }], notesEn: 'parent-only-marker' };
  const resolved = resolveProgramme(poisoned, routes, sgId); assert.equal(resolved.rules.some(r => r.kind === 'gpa'), false); assert.equal(resolved.notesEn.includes('parent-only-marker'), false);
  assert.throws(() => select(intlId, sg.offerings[1].id)); assert.throws(() => select(sgId, intl.offerings[0].id));
  assert.throws(() => select(undefined, sg.offerings[0].id));
  assert.equal(select(sgId, sg.offerings[1].id).offerings[0].duration, '24 months');
});

test('contradictory English versions never become an automatic TOEFL substitute, waiver or all-component threshold', () => {
  assert.deepEqual(obs.englishConflict.headerInternationalIelts, { total: 7, writing: 6.5 });
  assert.equal(obs.englishConflict.faqInternationalIeltsMandatory, true);
  assert.match(rule(sg, 'Track-specific English evidence').noteEn, /strict TOEFL >90 and IELTS >6.5/);
  assert.match(rule(intl, 'Track-specific English evidence').noteEn, /7.0 overall and 6.5 Writing/);
  assert.match(rule(intl, 'Track-specific English evidence').noteEn, /conflicting published versions/);
  for (const route of [sg, intl]) {
    assert.equal(route.rules.some(r => r.kind === 'language'), false);
    for (const language of [{ type: 'none' }, { type: 'waiver', waiverBasis: 'english_degree' }, { type: 'ielts', total: 7, components: { writing: 6 } }, { type: 'ielts', total: 9 }, { type: 'toefl_120', total: 120 }]) {
      const result = matchProgramme(route, { ...profile, language }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
      assert.equal(result.checks.find(c => c.labelEn === 'Track-specific English evidence').status, 'unknown');
    }
  }
});

test('academic preparation, alumni-test alternatives and part-time work preference are not unconditional major/GPA/experience gates', () => {
  for (const route of [sg, intl]) {
    assert.equal(route.rules.some(r => ['major', 'classification', 'gpa', 'experience'].includes(r.kind)), false);
    assert.match(rule(route, 'Academic recognition and mathematical preparation').noteEn, /any field with mathematical rigour/);
    for (const changes of [{ gpa: 4 }, { gpa: 4.9, gpaScale: 5 }, { experienceYears: 20 }]) assert.equal(matchProgramme(route, { ...profile, ...changes }).status, 'needs_confirmation');
    assert.match(rule(route, 'Coursework and graduation conditions').noteEn, /2.5\/4.0 is not undergraduate entry GPA/);
  }
  assert.equal(rule(sg, 'Work experience by study mode').mandatory, false);
});

test('month windows and stale landing opening never become exact days or live-open availability', () => {
  assert.equal(obs.cycle.staleOpening, '2025-09-01');
  for (const route of [sg, intl]) for (const o of route.offerings) {
    assert.equal(o.applicationOpen, null); assert.equal(o.deadline, null); assert.equal(o.applicationRounds, undefined);
    for (const day of ['2026-10-28', '2027-05-31', '2027-06-01']) {
      const timeline = programmeTimeline(select(route.selectedRoute.id, o.id), day); assert.equal(timeline.state, 'dates_incomplete'); assert.equal(timeline.livePortalChecked, false);
    }
  }
});

test('indicative/duplicate fees, London costs and credited advance survive every option without invented personal totals', () => {
  assert.equal(obs.fees.indicative2027InclusiveGst, 63220); assert.equal(obs.fees.duplicateInclusiveGst, 59950);
  for (const route of [sg, intl]) for (const o of route.offerings) {
    assert.equal(o.tuition, null); assert.equal(o.applicationFee, 100); assert.match(o.feeBasis, /63,220.*59,950/);
    assert.match(o.feeBasis, /credited toward tuition/); assert.match(o.feeBasis, /London travel, accommodation and living costs/);
  }
  const newRawRecords = [batch.programmes.find(x => x.id === pid), ...read('data/route-programmes.json').programmes.find(x => x.programmeId === pid).routes];
  assert.equal(/\p{Script=Han}/u.test(JSON.stringify(newRawRecords)), false);
});

test('MQF migration appends partial evidence idempotently without altering other programmes or earlier snapshots', () => {
  for (const [file, hash] of Object.entries(obs.preservation.previousSnapshotHashes)) assert.equal(createHash('sha256').update(readFileSync(new URL(file, root), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hash);
  assert.equal(batch.pilotProgrammeIds.length, 20); assert.equal(batch.pilotProgrammeIds.includes(pid), false);
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-smu-mqf-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    writeFileSync(checkedPath, JSON.stringify({ ...batch, programmes: batch.programmes.filter(x => x.id !== pid) }));
    db = new CatalogueStore(path, { ...options, checkedPath }); const earlier = db.all().filter(x => x.id !== pid);
    assert.equal(db.get(pid).verification, 'catalogue_seed'); assert.equal(db.quality().checked, batch.programmes.length - 1); db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) {
      db = new CatalogueStore(path, { ...options, checkedPath }); assert.equal(db.get(pid).verification, 'programme_page_checked');
      assert.deepEqual(db.all().filter(x => x.id !== pid), earlier); assert.deepEqual(db.quality().sourceRefreshConflicts, []);
      assert.equal(db.quality().checked, 238); db.close(); db = null;
    }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

test('older school rebuilds preserve a newer unrelated MQF listing and batch date, but refuse newer target records and inconsistent metadata', () => {
  for (const [school, name, build] of [['HK-CITYU', 'cityu', buildCityuInventory], ['HK-EDUHK', 'eduhk', buildEduhkInventory], ['HK-HKUST', 'hkust', buildHkustInventory], ['HK-HKU', 'hku', buildHkuInventory], ['HK-POLYU', 'polyu', buildPolyuInventory]]) {
    const input = { observation: read(`data/research/${name}-directory-observation-2026-10-20.json`), seed: read('data/catalogue.json'), checked: batch, expansion: read('data/catalogue-expansion.json'), links: read('data/directory-links.json'), audit: read('data/directory-audit.json') };
    if (school === 'HK-HKUST') {
      assert.throws(() => build(input), /newer HKUST listings/);
      input.links.listings = input.links.listings.filter(l => !l.programmeId.startsWith(school + '-'));
      input.links.checkedOn = input.links.listings.map(l => l.checkedOn).sort().at(-1);
      input.links = build(input).links;
    }
    input.links.listings.find(l => l.programmeId === pid).checkedOn = '2026-10-29'; input.links.checkedOn = input.links.listings.map(l => l.checkedOn).sort().at(-1);
    const before = JSON.stringify(input), out = build(input); assert.equal(JSON.stringify(input), before);
    assert.deepEqual(out.links, input.links); assert.deepEqual(out.expansion, input.expansion); assert.deepEqual(out.audit, input.audit);
    const inconsistent = structuredClone(input); inconsistent.links.checkedOn = '2026-10-30'; assert.throws(() => build(inconsistent), /batch date/);
    const newerTarget = structuredClone(input); newerTarget.links.listings.find(l => l.programmeId.startsWith(school + '-')).checkedOn = '2026-11-01'; newerTarget.links.checkedOn = '2026-11-01';
    assert.throws(() => build(newerTarget), /newer/); assert.equal(JSON.stringify(input), before);
  }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-28T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.address().port}`, get = async path => (await fetch(base + path)).json();
const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('actual APIs retain selected track in matching, saved restoration and export, reject cross-track choices and omit student data', async () => {
  const before = JSON.stringify(store.all());
  for (const route of [sg, intl]) for (const o of route.offerings) {
    const detail = await get('/api/programmes/' + pid + '?route=' + route.selectedRoute.id + '&offering=' + o.id);
    assert.equal(detail.selectedRoute.id, route.selectedRoute.id); assert.equal(detail.selectedOffering.id, o.id);
    const response = await post('/api/matches', { profile, selectedRoutes: { [pid]: route.selectedRoute.id }, offerings: { [pid]: o.id } });
    assert.equal(response.status, 200); const matched = (await response.json()).items.find(x => x.id === pid); assert.equal(matched.match.status, 'needs_confirmation'); assert.equal(matched.match.tier, null);
    const saved = optionSnapshot(detail, '2026-10-28T04:00:00.000Z'); assert.equal(parseSavedOption(saved).routeId, route.selectedRoute.id);
    const restore = await post('/api/saved-options/resolve', { contexts: [saved, { programmeId: pid, offeringId: pid + '-catalogue' }, { programmeId: pid, routeId: route.selectedRoute.id === sgId ? intlId : sgId, offeringId: o.id }] });
    assert.equal(restore.status, 200); const items = (await restore.json()).items; assert.deepEqual(items.map(x => x.status), ['resolved', 'needs_attention', 'needs_attention']);
    const exported = shortlistExport([{ ...items[0].programme, profile, match: matched.match }], { [pid]: saved }).programmes[0];
    assert.equal(exported.selectedRoute.id, route.selectedRoute.id); assert.equal(exported.offerings.length, 1); assert.equal(exported.offerings[0].id, o.id);
    assert.equal(exported.offerings[0].tuition, null); assert.equal(exported.applicationTimeline.state, 'dates_incomplete'); assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined);
    assert.match(exported.evidence.publishedRequirements.find(r => r.labelEn === 'Track-specific English evidence').noteEn, /Singapore-based|All international-track/);
  }
  assert.equal((await fetch(base + '/api/programmes/' + pid + '?route=' + intlId + '&offering=' + sg.offerings[1].id)).status, 422);
  assert.equal((await fetch(base + '/api/programmes/' + pid + '?offering=' + sg.offerings[0].id)).status, 422);
  assert.equal(JSON.stringify(store.all()), before);
});

test('programme, route and maintenance-unit counts stay distinct with zero independent review', async () => {
  const meta = await get('/api/meta'), queue = loadRepositoryReviewQueue('2026-10-28');
  assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 869); assert.equal(meta.quality.checked, 238);
  assert.deepEqual(meta.routeEvidence, { groups: 10, routes: 26, pageChecked: 26, peerReviewed: 0, complete: 0 });
  assert.deepEqual(routeSummary(routes), meta.routeEvidence); assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0);
  assert.deepEqual(meta.quality.sourceRefreshConflicts, []); assert.equal(queue.counts.programmePageRecords, 238);
  assert.equal(queue.counts.routeRecords, 26); assert.equal(queue.counts.reviewUnits, 448); assert.equal(queue.counts.nearCutoffUnits, 2);
  assert.equal(queue.counts.reviewRecordedInSource, 0); assert.equal(queue.units.filter(u => u.programmeId === pid).length, 3);
});
