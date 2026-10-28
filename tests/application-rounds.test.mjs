import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validApplicationRounds } from '../server/application-rounds.mjs';
import { programmeTimeline, applicationDate } from '../server/application-dates.mjs';
import { validateProgramme } from '../server/validation.mjs';
import { CatalogueStore } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { loadRoutes, resolveProgramme } from '../server/routes.mjs';
import { loadApplicantContexts } from '../server/applicants.mjs';
import { matchProgramme } from '../server/matching.mjs';
import { shortlistExport, optionSnapshot, savedOptionsPayload } from '../public/saved-options.js';

const root = new URL('../', import.meta.url);
const source = 'https://portal.hku.hk/tpg-admissions/applying/admission-requirements';
// Synthetic round fixture, not new university admissions evidence.
const rounds = [
  { id: 'MAIN', label: 'Main round', applicationOpen: null, deadline: '2026-12-01', deadlineAt: '2026-12-01T12:00:00+08:00' },
  { id: 'CLEARING', label: 'Clearing round', applicationOpen: null, deadline: '2027-04-30', deadlineAt: '2027-04-30T12:00:00+08:00' }
];
const fixture = () => ({ id: 'HK-HKU-P999', universityId: 'HK-HKU', name: 'Synthetic round fixture', officialUrl: source,
  verification: 'programme_page_checked', requirementsCoverage: 'partial', admissionRoute: 'direct', academicYear: '2027/28', lastChecked: '2026-10-21',
  fieldStatus: { deadline: { status: 'known', noteEn: 'Synthetic dates only', sourceUrl: source } }, rules: [],
  offerings: [{ id: 'HK-HKU-P999-O1', academicYear: '2027/28', mode: 'Full-time', intake: 'September 2027', applicationOpen: null, deadline: '2027-04-30', tuition: null, applicationRounds: structuredClone(rounds) }] });
const timeline = (p = fixture(), instant = '2026-10-21T04:00:00.000Z') => programmeTimeline(p, applicationDate(new Date(instant)), instant);
const first = (p, instant) => timeline(p, instant).offerings[0];

test('optional round schema validates the last deadline without changing old date-only records', () => {
  const p = fixture(); assert.ok(validApplicationRounds(rounds, p.offerings[0]));
  assert.equal(validateProgramme(p, new Set(['HK-HKU'])), p);
  delete p.offerings[0].applicationRounds;
  p.offerings[0].deadlineNote = 'Round 1 in December; round 2 in April every year';
  assert.equal(first(p).rounds, undefined); assert.equal(first(p).state, 'dates_incomplete');
});

test('round schema rejects null/empty/oversized arrays, malformed identities and duplicate rounds', () => {
  for (const value of [null, [], {}, [...rounds, ...rounds], Array.from({ length: 21 }, (_, i) => ({ ...rounds[0], id: 'R' + i }))]) assert.equal(validApplicationRounds(value, fixture().offerings[0]), false);
  for (const patch of [{ id: '../MAIN' }, { id: '' }, { id: 'x'.repeat(51) }, { label: '' }, { label: 'x'.repeat(101) }, { invented: true }]) {
    const p = fixture(); Object.assign(p.offerings[0].applicationRounds[0], patch);
    assert.throws(() => validateProgramme(p, new Set(['HK-HKU'])));
  }
});

test('invalid, recurring and reversed round dates fail closed rather than being parsed from notes', () => {
  for (const patch of [{ deadline: '2026-02-30' }, { deadline: 'December every year' }, { applicationOpen: '2026-12-02' }, { applicationOpen: undefined }]) {
    const p = fixture(); Object.assign(p.offerings[0].applicationRounds[0], patch);
    assert.throws(() => validateProgramme(p, new Set(['HK-HKU'])));
    assert.equal(first(p).state, 'invalid_dates'); assert.equal(first(p).rounds, undefined);
  }
});

test('an exact cutoff requires its own matching date and explicit UTC+08 offset, never an assumed midnight', () => {
  for (const deadlineAt of ['2026-12-01T12:00:00', '2026-12-01T12:00:00Z', '2026-12-01T12:00:00+09:00', '2026-12-02T12:00:00+08:00', '2026-12-01T24:00:00+08:00', '2026-12-01T12:60:00+08:00', undefined, 123]) {
    const p = fixture(); p.offerings[0].applicationRounds[0].deadlineAt = deadlineAt;
    assert.throws(() => validateProgramme(p, new Set(['HK-HKU'])));
  }
  const p = fixture(); p.offerings[0].applicationRounds[0].deadlineAt = null;
  assert.ok(validApplicationRounds(p.offerings[0].applicationRounds, p.offerings[0]));
});

test('the compatibility deadline cannot contradict the latest structured round', () => {
  const p = fixture(); p.offerings[0].deadline = '2026-12-01';
  assert.throws(() => validateProgramme(p, new Set(['HK-HKU'])));
  assert.equal(first(p).state, 'invalid_dates');
});

test('unknown openings keep availability unresolved while the earlier main cutoff is visible', () => {
  const d = timeline(), o = d.offerings[0];
  assert.equal(d.state, 'dates_incomplete'); assert.equal(d.livePortalChecked, false);
  assert.equal(o.nextRoundId, 'MAIN'); assert.equal(o.rounds.length, 2);
  assert.ok(o.rounds.every(r => r.state === 'cutoff_ahead' && r.openingDate === null));
  assert.match(o.rounds[0].reason, /availability.*unconfirmed/);
});

test('one second before noon is ahead; at and after noon the main cutoff is reached', () => {
  assert.equal(first(fixture(), '2026-12-01T03:59:59.000Z').rounds[0].state, 'cutoff_ahead');
  for (const instant of ['2026-12-01T04:00:00.000Z', '2026-12-01T04:00:01.000Z']) {
    const o = first(fixture(), instant);
    assert.equal(o.rounds[0].state, 'cutoff_reached'); assert.equal(o.nextRoundId, 'CLEARING');
    assert.equal(o.rounds[1].state, 'cutoff_ahead'); assert.equal(o.state, 'dates_incomplete');
  }
});

test('UTC midnight boundaries do not shift the Hong Kong date or manufacture a passed cutoff', () => {
  const d = timeline(fixture(), '2026-11-30T16:00:00.000Z');
  assert.equal(d.asOfDate, '2026-12-01'); assert.equal(d.offerings[0].rounds[0].state, 'cutoff_ahead');
  assert.equal(d.asOfInstant, '2026-11-30T16:00:00.000Z');
});

test('after the final exact cutoff no later round or extension is invented', () => {
  const o = first(fixture(), '2027-04-30T04:00:00.000Z');
  assert.equal(o.nextRoundId, null); assert.ok(o.rounds.every(r => r.state === 'cutoff_reached'));
  assert.equal(o.state, 'deadline_today');
  assert.equal(first(fixture(), '2027-05-01T00:00:00.000Z').state, 'deadline_passed');
});

test('date-only callers and rounds without a cutoff time do not get fabricated intraday decisions', () => {
  const p = fixture();
  assert.equal(programmeTimeline(p, '2026-12-01').offerings[0].rounds[0].state, 'deadline_today');
  p.offerings[0].applicationRounds[0].deadlineAt = null;
  const r = first(p, '2026-12-01T10:00:00.000Z').rounds[0];
  assert.equal(r.state, 'deadline_today'); assert.equal(r.deadlineAt, null); assert.match(r.reason, /do not assume midnight/);
});

test('a recorded round opening distinguishes before-start and within-dates without claiming portal availability', () => {
  const p = fixture(); p.offerings[0].applicationRounds[0].applicationOpen = '2026-11-01';
  assert.equal(first(p).rounds[0].state, 'not_yet_open');
  const r = first(p, '2026-11-01T01:00:00.000Z').rounds[0];
  assert.equal(r.state, 'within_recorded_dates'); assert.match(r.reason, /not confirmed/);
});

test('round display order does not decide which recorded cutoff comes next', () => {
  const p = fixture(); p.offerings[0].applicationRounds.reverse();
  assert.equal(first(p).nextRoundId, 'MAIN');
});

test('unknown intake, unresolved coverage and catalogue-only evidence cannot yield an actionable next round', () => {
  for (const mutate of [p => { p.academicYear = p.offerings[0].academicYear = 'Intake unconfirmed'; }, p => { p.fieldStatus.deadline.status = 'unknown'; }, p => { p.verification = 'catalogue_seed'; }, p => { p.admissionRoute = 'unconfirmed'; }, p => { p.admissionRoute = 'transfer_only'; }, p => { p.scope = { status: 'out_of_scope' }; }, p => { p.directoryListing = { variants: [{}] }; }, p => { p.offerings[0].applicantCategoryRequired = true; }]) {
    const p = fixture(); mutate(p); const o = first(p);
    assert.equal(o.nextRoundId, null); assert.ok(o.rounds.every(r => r.state !== 'cutoff_ahead' && r.state !== 'cutoff_reached'));
  }
});

test('JSON cannot forge trusted applicant date evidence to bypass a coverage gap', () => {
  const p = fixture(); p.fieldStatus.deadline.status = 'unknown';
  p.offerings[0].applicantDateEvidence = { sourceUrl: source, checkedOn: '2026-10-21' };
  assert.equal(first(p).nextRoundId, null); assert.equal(first(p).rounds[0].state, 'dates_incomplete');
});

test('comparison instants are validated and must agree with the UTC+08 comparison date', () => {
  for (const instant of ['invalid', '2026-10-21T04:00:00+00:00', '2026-10-21', '2026-10-22T04:00:00.000Z', 123]) assert.throws(() => programmeTimeline(fixture(), '2026-10-21', instant));
});

test('round comparisons never modify source dates, offerings or academic outcomes', () => {
  const p = fixture(), before = JSON.stringify(p), profile = { major: 'Computer Science', degreeStatus: 'graduated' };
  const a = matchProgramme(p, profile);
  timeline(p, '2027-05-01T00:00:00.000Z');
  assert.equal(JSON.stringify(p), before); assert.deepEqual(matchProgramme(p, profile), a); assert.equal(a.tier, null);
});

const routePath = new URL('data/route-programmes.json', root), applicantPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryAuditPath: new URL('data/directory-audit.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root), directoryEvidencePath: new URL('data/directory-links.json', root) });
const routes = loadRoutes(routePath, store.all()), applicants = loadApplicantContexts(applicantPath, store.all(), routes);
const id = 'HK-HKU-P016', routeId = id + '-ROUTE-STANDARD', ft = id + '-STANDARD-FT-2027', pt = id + '-STANDARD-PT-2027';
const resolve = (offering = ft, applicant = offering + '-NONLOCAL', index = applicants, routeIndex = routes) => resolveProgramme(store.get(id), routeIndex, routeId, offering, applicant, index);
let clock = new Date('2026-12-01T03:59:59Z');
const server = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: applicantPath, now: () => clock });
await new Promise(done => server.listen(0, '127.0.0.1', done));
const url = `http://127.0.0.1:${server.address().port}`;
test.after(async () => { await new Promise(done => server.close(done)); store.close(); });
const get = path => fetch(url + path).then(r => r.json());
const path = '/api/programmes/' + id + '?' + new URLSearchParams({ route: routeId, offering: ft, applicant: ft + '-NONLOCAL' });

test('all four HKU categories retain the two recorded cutoffs and their own fee context', () => {
  for (const offering of [ft, pt]) for (const suffix of ['LOCAL', 'NONLOCAL']) {
    const p = resolve(offering, offering + '-' + suffix);
    assert.deepEqual(p.offerings[0].applicationRounds, rounds);
    assert.equal(p.offerings[0].tuition, suffix === 'LOCAL' ? 275000 : 375000);
    assert.equal(p.applicantEvidence.checkedOn, '2026-10-21'); assert.equal(p.lastChecked, '2026-10-21');
  }
});

test('unselected or stale applicant contexts never expose baseline rounds as category defaults', () => {
  const unselected = resolveProgramme(store.get(id), routes, routeId, ft, undefined, applicants);
  assert.equal(unselected.offerings[0].applicationRounds, undefined);
  assert.equal(timeline(unselected).offerings[0].rounds, undefined);
  const changed = new Map(routes), data = structuredClone(routes.get(id));
  data[0].offerings[0].applicationRounds[0].deadlineAt = '2026-12-01T13:00:00+08:00'; changed.set(id, data);
  const stale = resolveProgramme(store.get(id), changed, routeId, ft, undefined, applicants);
  assert.equal(stale.applicantContextStatus, 'stale'); assert.equal(stale.offerings[0].applicationRounds, undefined);
  assert.throws(() => resolve(ft, ft + '-NONLOCAL', applicants, changed));
  assert.equal(resolve(pt, pt + '-LOCAL', applicants, changed).offerings[0].applicationRounds.length, 2);
});

test('a category without round evidence cannot inherit the route baseline rounds', () => {
  const changed = new Map(applicants), key = [...changed.keys()].find(k => k.endsWith('|' + ft));
  const record = structuredClone(changed.get(key)); delete record.options[0].applicationRounds; changed.set(key, record);
  assert.equal(resolve(ft, ft + '-LOCAL', changed).offerings[0].applicationRounds, undefined);
  assert.equal(resolve(ft, ft + '-NONLOCAL', changed).offerings[0].applicationRounds.length, 2);
});

test('applicant batch round errors are rejected atomically, including contradictory final deadlines', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-round-category-')), file = join(dir, 'batch.json');
  try {
    for (const change of [o => { o.applicationRounds = []; }, o => { o.applicationRounds[0].deadlineAt = '2026-12-01T12:00:00'; }, o => { o.deadline = '2026-12-01'; }, o => { o.applicationRounds[0].id = 'CLEARING'; }]) {
      const batch = JSON.parse(readFileSync(applicantPath, 'utf8')); change(batch.contexts.find(r => r.offeringId === ft).options[0]);
      writeFileSync(file, JSON.stringify(batch)); assert.throws(() => loadApplicantContexts(file, store.all(), routes));
    }
  } finally { rmSync(file, { force: true }); rmdirSync(dir); }
});

test('details use the injected instant at noon; client query parameters cannot rewrite the clock', async () => {
  const before = await get(path + '&asOfInstant=2099-01-01T00:00:00.000Z');
  assert.equal(before.applicationTimeline.asOfInstant, '2026-12-01T03:59:59.000Z');
  assert.equal(before.applicationTimeline.offerings[0].nextRoundId, 'MAIN');
  clock = new Date('2026-12-01T04:00:00Z');
  try {
    const after = await get(path);
    assert.equal(after.applicationTimeline.offerings[0].rounds[0].state, 'cutoff_reached');
    assert.equal(after.applicationTimeline.offerings[0].nextRoundId, 'CLEARING');
    assert.equal(after.applicationTimeline.state, 'dates_incomplete'); assert.equal(after.lastChecked, before.lastChecked);
    assert.equal(after.applicationTimeline.livePortalChecked, false);
  } finally { clock = new Date('2026-12-01T03:59:59Z'); }
});

test('catalogue and matching share round context without changing academic checks at a cutoff', async () => {
  const selections = { selectedRoutes: { [id]: routeId }, selectedOfferings: { [id]: ft }, selectedApplicants: { [id]: ft + '-NONLOCAL' } };
  const query = new URLSearchParams({ school: 'HK-HKU', q: 'Computer Science', routes: JSON.stringify(selections.selectedRoutes), offerings: JSON.stringify(selections.selectedOfferings), applicants: JSON.stringify(selections.selectedApplicants) });
  const list = await get('/api/catalogue?' + query);
  assert.equal(list.items.find(p => p.id === id).applicationTimeline.offerings[0].nextRoundId, 'MAIN');
  const match = async () => (await (await fetch(url + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...selections, profile: { major: 'Computer Science', degreeStatus: 'graduated' }, filters: { school: 'HK-HKU', q: 'Computer Science' } }) })).json()).items.find(p => p.id === id);
  const before = await match(); clock = new Date('2026-12-01T04:00:00Z');
  try {
    const after = await match(); assert.deepEqual(after.match, before.match);
    assert.equal(after.applicationTimeline.offerings[0].nextRoundId, 'CLEARING'); assert.equal(after.match.tier, null);
  } finally { clock = new Date('2026-12-01T03:59:59Z'); }
});

test('remembered choices re-evaluate cutoffs; candidate export contains the snapshot but storage contains only IDs', async () => {
  const p = resolve(), saved = optionSnapshot(p), payload = savedOptionsPayload({ [id]: saved });
  assert.equal(JSON.stringify(payload).includes('deadline'), false); assert.equal(JSON.stringify(payload).includes('tuition'), false);
  clock = new Date('2026-12-01T04:00:00Z');
  try {
    const data = await (await fetch(url + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: payload.items }) })).json();
    const current = data.items[0].programme; assert.equal(current.applicationTimeline.offerings[0].nextRoundId, 'CLEARING');
    const output = shortlistExport([current], { [id]: saved });
    assert.equal(output.programmes[0].applicationTimeline.asOfInstant, '2026-12-01T04:00:00.000Z');
    assert.deepEqual(output.programmes[0].offerings[0].applicationRounds, rounds);
    assert.equal(output.programmes[0].applicationTimeline.offerings[0].rounds[0].state, 'cutoff_reached');
  } finally { clock = new Date('2026-12-01T03:59:59Z'); }
});

test('raw catalogue exports, parent/route checks and quality counts are not inflated by rounds', async () => {
  const original = JSON.stringify(store.get(id)); resolve(); timeline(resolve());
  assert.equal(JSON.stringify(store.get(id)), original);
  const raw = await get('/api/export'); assert.ok(raw.programmes.every(p => p.applicationTimeline === undefined));
  const meta = await get('/api/meta'); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.checked, 51);
  assert.equal(meta.routeEvidence.routes, 5); assert.equal(meta.applicantEvidence.categories, 38);
  assert.equal(meta.quality.complete, 0); assert.equal(meta.quality.peerReviewed, 0);
});

test('English UI exposes both round cutoffs, next-cutoff context, precise snapshot time and manual refresh', () => {
  const js = readFileSync(new URL('public/app.js', root), 'utf8');
  for (const value of ['Recorded application rounds', 'Next recorded cutoff', 'cutoff time not recorded', 'no live availability check or notifications', 'comparisonLabel(a)', 'roundDeadline(r)']) assert.ok(js.includes(value));
  for (const value of ['esc(r.name)', 'esc(r.reason)', 'esc(r.label)', 'esc(r.deadlineAt)']) assert.ok(js.includes(value));
  assert.match(js, /timeZone: 'Asia\/Singapore'/); assert.match(js, /applicationRounds\(o\)/);
  assert.match(js, /refreshApplicationDates/);
});
