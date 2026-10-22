import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { restoredOptionSelections } from '../public/saved-options.js';

// Synthetic contexts only. These are neither university requirements nor user data.
const a = 'SG-TEST-P001', b = 'HK-TEST-P002', unrelated = 'SG-TEST-P003';
const contextA = { programmeId: a, routeId: a + '-ROUTE-A', offeringId: a + '-A-PT', applicantId: a + '-A-PT-LOCAL' };
const contextB = { programmeId: b, offeringId: b + '-FT' };
const row = (context, index) => ({ index, programmeId: context.programmeId, status: 'resolved', programme: {
  id: context.programmeId,
  ...(context.routeId ? { selectedRoute: { id: context.routeId } } : {}),
  ...(context.offeringId ? { selectedOffering: { id: context.offeringId } } : {}),
  ...(context.applicantId ? { selectedApplicant: { id: context.applicantId } } : {})
} });
const attention = (context, index) => ({ index, programmeId: context.programmeId, status: 'needs_attention', message: 'Synthetic option is no longer available.' });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const restore = app.slice(app.indexOf('async function restoreRememberedOptions('), app.indexOf('function rememberPanel('));
const choiceContext = app.match(/^const choiceContext = .*/m)[0];

function harness(entries = { [a]: structuredClone(contextA), [b]: structuredClone(contextB) }) {
  const routeChoices = { [unrelated]: 'unrelated-route' }, offeringChoices = {}, applicantChoices = {}, savedOptionIssues = {};
  const remembered = { entries }, requests = [];
  const sandbox = { remembered, routeChoices, offeringChoices, applicantChoices, savedOptionIssues, restoredOptionSelections,
    post: (path, payload) => { assert.equal(path, '/api/saved-options/resolve'); const request = { payload, ...deferred() }; requests.push(request); return request.promise; },
    writeStorage: () => assert.fail('restoring choices must not write storage'),
    state: { profile: { major: 'Synthetic background' }, shortlist: [a, b], compare: [b] }
  };
  const vmContext = vm.createContext(sandbox); vm.runInContext(choiceContext + '\n' + restore, vmContext);
  return { ...sandbox, requests, restore: () => vmContext.restoreRememberedOptions(), snapshot: () => JSON.stringify([routeChoices, offeringChoices, applicantChoices, savedOptionIssues, remembered.entries, sandbox.state]) };
}

test('complete reordered replies restore only exact explicit choice IDs and scoped issues', () => {
  const plan = restoredOptionSelections([contextA, contextB], { items: [attention(contextB, 1), row(contextA, 0)] });
  assert.deepEqual(plan, { routes: { [a]: contextA.routeId }, offerings: { [a]: contextA.offeringId }, applicants: { [a]: contextA.applicantId }, issues: { [b]: 'Synthetic option is no longer available.' } });
});

test('missing, extra, repeated and invalid response indices are rejected rather than becoming baseline choices', () => {
  const valid = row(contextA, 0);
  for (const reply of [null, {}, { items: {} }, { items: [] }, { items: [valid, valid] },
    { items: [null] }, { items: [{ ...valid, index: -1 }] }, { items: [{ ...valid, index: 1 }] },
    { items: [{ ...valid, index: '0' }] }, { items: [{ ...valid, index: 0.5 }] }]) {
    assert.throws(() => restoredOptionSelections([contextA], reply), /could not be verified/);
  }
  assert.throws(() => restoredOptionSelections([contextA, contextB], { items: [valid, valid] }), /could not be verified/);
});

test('wrong programme, status, selected cohort, route or applicant cannot substitute another option', () => {
  const valid = row(contextA, 0);
  for (const patch of [
    { programmeId: b }, { status: 'unknown' }, { programme: null },
    { programme: { ...valid.programme, id: b } }, { programme: { id: a } },
    { programme: { ...valid.programme, selectedRoute: { id: a + '-ROUTE-B' } } },
    { programme: { ...valid.programme, selectedOffering: { id: a + '-A-FT' } } },
    { programme: { ...valid.programme, selectedApplicant: { id: a + '-A-PT-NONLOCAL' } } }
  ]) assert.throws(() => restoredOptionSelections([contextA], { items: [{ ...valid, ...patch }] }), /could not be verified/);
});

test('malformed or ambiguous requested contexts and missing attention reasons fail safely', () => {
  for (const contexts of [null, {}, [null], [contextA, contextA], [{ ...contextA, profile: { major: 'Synthetic private value' } }], Array(501).fill(contextA)]) {
    assert.throws(() => restoredOptionSelections(contexts, { items: [row(contextA, 0)] }), error => /could not be verified/.test(error.message) && !error.message.includes('Synthetic private value'));
  }
  for (const message of [undefined, '', '   ', {}, 'x'.repeat(2001)]) {
    assert.throws(() => restoredOptionSelections([contextA], { items: [{ ...attention(contextA, 0), message }] }), /could not be verified/);
  }
});

test('a baseline is permitted only when no specific selection was actually remembered', () => {
  const baseline = { programmeId: a }, unselected = row(baseline, 0);
  assert.deepEqual(restoredOptionSelections([baseline], { items: [unselected] }), { routes: {}, offerings: {}, applicants: {}, issues: {} });
  assert.throws(() => restoredOptionSelections([contextA], { items: [unselected] }), /could not be verified/);
  assert.throws(() => restoredOptionSelections([baseline], { items: [row(contextA, 0)] }), /could not be verified/);
});

test('restoration plans do not copy report prices, background data or matching claims', () => {
  const result = row(contextA, 0); Object.assign(result.programme, { tuition: 999, profile: { major: 'Synthetic private value' }, match: { tier: 'invented' } });
  const before = JSON.stringify([contextA, result]), plan = restoredOptionSelections([contextA], { items: [result] });
  assert.equal(JSON.stringify([contextA, result]), before); assert.equal(/tuition|profile|match|Synthetic private/.test(JSON.stringify(plan)), false);
});

test('the actual restore function applies a complete reply without changing storage, background or saved membership', async () => {
  const h = harness(), entries = h.remembered.entries, profile = h.state.profile, shortlist = h.state.shortlist;
  const pending = h.restore(); assert.equal(h.requests.length, 1); assert.notEqual(h.requests[0].payload.contexts[0], entries[a]);
  h.requests[0].resolve({ items: [row(contextB, 1), row(contextA, 0)] }); await pending;
  assert.equal(h.routeChoices[a], contextA.routeId); assert.equal(h.offeringChoices[b], contextB.offeringId); assert.equal(h.applicantChoices[a], contextA.applicantId);
  assert.equal(h.routeChoices[unrelated], 'unrelated-route'); assert.equal(h.state.profile, profile); assert.equal(h.state.shortlist, shortlist); assert.equal(h.remembered.entries, entries);
});

test('an incomplete reply or network failure cannot partially overwrite previously active choices', async () => {
  for (const fail of [false, true]) {
    const h = harness(); h.routeChoices[a] = 'previous-route'; h.savedOptionIssues[b] = 'previous-issue'; const before = h.snapshot(), pending = h.restore();
    if (fail) h.requests[0].reject(new Error('Synthetic network failure'));
    else h.requests[0].resolve({ items: [row(contextA, 0), { ...row(contextB, 1), index: 0 }] });
    await assert.rejects(pending, error => error.code === 'SAVED_CHOICES_UNVERIFIED'); assert.equal(h.snapshot(), before);
  }
});

test('a repeated restore clears expired selectors and removes old issue markers only for restored IDs', async () => {
  const h = harness(); let pending = h.restore(); h.requests[0].resolve({ items: [row(contextA, 0), attention(contextB, 1)] }); await pending;
  h.savedOptionIssues[unrelated] = 'Keep unrelated issue'; h.routeChoices[b] = 'obsolete-route'; h.applicantChoices[b] = 'obsolete-category';
  pending = h.restore(); h.requests[1].resolve({ items: [attention(contextA, 0), row(contextB, 1)] }); await pending;
  assert.equal(h.routeChoices[a], undefined); assert.equal(h.offeringChoices[a], undefined); assert.equal(h.applicantChoices[a], undefined);
  assert.ok(h.savedOptionIssues[a]); assert.equal(h.savedOptionIssues[b], undefined);
  assert.equal(h.routeChoices[b], undefined); assert.equal(h.applicantChoices[b], undefined); assert.equal(h.offeringChoices[b], contextB.offeringId);
  assert.equal(h.routeChoices[unrelated], 'unrelated-route'); assert.equal(h.savedOptionIssues[unrelated], 'Keep unrelated issue');
});

test('changed saved entries or live choices discard an in-flight restore rather than undoing the user change', async () => {
  for (const change of [
    h => { h.remembered.entries = { ...h.remembered.entries }; },
    h => { h.remembered.entries[a].routeId = a + '-ROUTE-B'; },
    h => { delete h.remembered.entries[b]; },
    h => { h.routeChoices[a] = a + '-ROUTE-B'; },
    h => { h.offeringChoices[b] = b + '-PT'; },
    h => { h.applicantChoices[a] = a + '-A-PT-NONLOCAL'; }
  ]) {
    const h = harness(), pending = h.restore(); change(h); const before = h.snapshot();
    h.requests[0].resolve({ items: [row(contextA, 0), row(contextB, 1)] });
    await assert.rejects(pending, /changed while loading/); assert.equal(h.snapshot(), before);
  }
});

test('no remembered contexts means no request and no change to unrelated temporary choices', async () => {
  const h = harness({}), before = h.snapshot(); await h.restore();
  assert.equal(h.requests.length, 0); assert.equal(h.snapshot(), before);
  assert.deepEqual(restoredOptionSelections([], { items: [] }), { routes: {}, offerings: {}, applicants: {}, issues: {} });
});
