import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { shortlistExport, optionSnapshot } from '../public/saved-options.js';

// Execute the actual browser export/download functions with controlled requests
// and in-memory Blob/anchor adapters. No user data or real file is downloaded.
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const lifecycle = app.slice(app.indexOf('function downloadJson('), app.indexOf("document.addEventListener('click'"));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const a = 'SG-NTU-P018', b = 'SG-SMU-P001';
const record = id => ({ id, name: 'Synthetic ' + id, university: { nameEn: 'Synthetic University' }, officialUrl: 'https://example.invalid/programme', verification: 'catalogue_seed', offerings: [{ id: id + '-O1', tuition: null, deadline: null }], profile: { major: 'Synthetic private background', gpa: 3.2 }, match: { tier: 'invented' } });

function harness() {
  const state = { view: 'shortlist', shortlist: [a, b] }, remembered = { entries: {} };
  const routeChoices = {}, offeringChoices = {}, applicantChoices = {}, savedOptionIssues = {};
  const requests = [], blobs = [], clicks = [], revocations = [], timers = [], focus = [];
  const document = { body: {}, activeElement: null }; document.activeElement = document.body;
  const dialog = { open: false };
  let clickFails = false, button, status;
  const replace = () => {
    if (button) button.isConnected = false; if (status) status.isConnected = false;
    let disabled = false;
    button = { isConnected: true, textContent: 'Download shortlist JSON',
      get disabled() { return disabled; },
      set disabled(value) { disabled = value; if (value && document.activeElement === this) document.activeElement = document.body; },
      focus(options) { document.activeElement = this; focus.push(options); }
    };
    status = { isConnected: true, textContent: '' };
    return button;
  };
  replace();
  const context = vm.createContext({
    state, remembered, routeChoices, offeringChoices, applicantChoices, savedOptionIssues, shortlistExport, Blob,
    $: selector => { if (selector === '#detail-dialog') return dialog; if (selector === '#page [data-action=exportShortlist]') return button; assert.equal(selector, '#shortlist-export-status'); return status; },
    selectedProgrammes: ids => { const request = { ids, ...deferred() }; requests.push(request); return request.promise; },
    URL: { createObjectURL: blob => { blobs.push(blob); return 'blob:synthetic-' + blobs.length; }, revokeObjectURL: url => revocations.push(url) },
    document: Object.assign(document, { createElement: tag => { assert.equal(tag, 'a'); return { click() { clicks.push({ href: this.href, download: this.download }); if (clickFails) throw new Error('Synthetic download uncertainty'); } }; } }),
    setTimeout: (fn, delay) => { assert.equal(delay, 1000); timers.push(fn); }
  });
  vm.runInContext('let shortlistExportSequence = 0;\n' + lifecycle, context);
  return { state, remembered, routeChoices, offeringChoices, applicantChoices, savedOptionIssues, requests, blobs, clicks, timers, revocations, document, dialog, focus,
    button: () => button, status: () => status.textContent, replace,
    run: trigger => context.exportShortlist(trigger || button), download: (value, name) => context.downloadJson(value, name),
    failClick: () => { clickFails = true; }, payload: async () => JSON.parse(await blobs.at(-1).text())
  };
}

test('current export snapshots IDs, exposes preparing status, and requests one correctly named download', async () => {
  const h = harness(), button = h.button(), pending = h.run();
  assert.equal(button.disabled, true); assert.equal(button.textContent, 'Preparing download…'); assert.match(h.status(), /Preparing the current shortlist/);
  assert.notEqual(h.requests[0].ids, h.state.shortlist); assert.deepEqual([...h.requests[0].ids], [a, b]);
  h.requests[0].resolve([record(a), record(b)]); assert.equal(await pending, true);
  assert.equal(h.clicks.length, 1); assert.equal(h.clicks[0].download, 'gradpath-shortlist.json');
  assert.equal(button.disabled, false); assert.equal(button.textContent, 'Download shortlist JSON');
  assert.match(h.status(), /Download requested/); assert.match(h.status(), /Programme records: 2\. Unresolved selections: 0/);
  assert.equal((await h.payload()).programmes.length, 2);
});

test('repeat activation while preparing does not start another request or download', async () => {
  const h = harness(), pending = h.run(); assert.equal(await h.run(), false); assert.equal(h.requests.length, 1);
  h.requests[0].resolve([record(a), record(b)]); await pending; assert.equal(h.clicks.length, 1);
});

test('navigation suppresses late export success and error without touching the new page', async () => {
  for (const fail of [false, true]) {
    const h = harness(), pending = h.run(); h.state.view = 'profile'; const before = h.status();
    if (fail) h.requests[0].reject(new Error('Synthetic old page failure')); else h.requests[0].resolve([record(a), record(b)]);
    assert.equal(await pending, false); assert.equal(h.clicks.length, 0); assert.equal(h.status(), before);
  }
});

test('redrawing the same shortlist invalidates its old export and preserves the new status', async () => {
  const h = harness(), pending = h.run(), oldButton = h.button(); h.replace();
  h.requests[0].resolve([record(a), record(b)]); assert.equal(await pending, false);
  assert.equal(h.status(), ''); assert.equal(h.clicks.length, 0); assert.equal(oldButton.disabled, false);
});

test('a newer export may complete before the obsolete export without duplicate downloads', async () => {
  const h = harness(), old = h.run(); h.replace(); const current = h.run();
  h.requests[1].resolve([record(a), record(b)]); assert.equal(await current, true); const before = h.status();
  h.requests[0].resolve([record(a), record(b)]); assert.equal(await old, false);
  assert.equal(h.clicks.length, 1); assert.equal(h.status(), before);
});

test('changed shortlist membership or order cancels a current request and asks for a fresh export', async () => {
  for (const ids of [[a], [], [b, a]]) {
    const h = harness(), pending = h.run(); h.state.shortlist = ids;
    h.requests[0].resolve([record(a), record(b)]); assert.equal(await pending, false);
    assert.equal(h.clicks.length, 0); assert.match(h.status(), /choices changed/); assert.match(h.status(), /Nothing was downloaded/);
    assert.equal(h.button().disabled, false);
  }
});

test('changed route, study option, applicant category, remembered choice or issue cancels the export', async () => {
  for (const change of [h => { h.routeChoices[a] = a + '-ROUTE-A'; }, h => { h.offeringChoices[a] = a + '-O1'; }, h => { h.applicantChoices[a] = a + '-O1-NONLOCAL'; }, h => { h.remembered.entries[a] = optionSnapshot(record(a)); }, h => { h.savedOptionIssues[a] = 'Synthetic changed evidence'; }]) {
    const h = harness(), pending = h.run(); change(h);
    h.requests[0].resolve([record(a), record(b)]); assert.equal(await pending, false); assert.equal(h.clicks.length, 0);
    assert.match(h.status(), /choices changed/);
  }
});

test('an old failure after context changes does not present a stale network error', async () => {
  const h = harness(), pending = h.run(); h.offeringChoices[a] = a + '-O2';
  h.requests[0].reject(new Error('Synthetic stale failure')); await pending;
  assert.match(h.status(), /choices changed/); assert.equal(h.status().includes('Could not prepare'), false);
});

test('unrelated programme choices do not cancel a matching shortlist export', async () => {
  const h = harness(), pending = h.run(); h.offeringChoices['HK-HKU-P999'] = 'HK-HKU-P999-O1';
  h.requests[0].resolve([record(a), record(b)]); assert.equal(await pending, true); assert.equal(h.clicks.length, 1);
});

test('current network failure enables retry without changing any saved choice', async () => {
  const h = harness(), before = JSON.stringify(h.state.shortlist), pending = h.run();
  h.requests[0].reject(new Error('Synthetic current failure')); assert.equal(await pending, false);
  assert.match(h.status(), /Could not prepare/); assert.match(h.status(), /shortlist is unchanged/);
  assert.equal(h.button().disabled, false); assert.equal(JSON.stringify(h.state.shortlist), before); assert.equal(h.blobs.length, 0);
  const retry = h.run(); h.requests[1].resolve([record(a), record(b)]); assert.equal(await retry, true);
});

test('missing or mismatched response IDs cannot silently export a different shortlist', async () => {
  for (const response of [[record(a)], [record(b), record(a)], [record(a), record('HK-HKU-P999')]]) {
    const h = harness(), pending = h.run(); h.requests[0].resolve(response);
    assert.equal(await pending, false); assert.equal(h.clicks.length, 0); assert.match(h.status(), /Nothing was downloaded/);
  }
});

test('export still omits private background, match results and prediction labels', async () => {
  const h = harness(), pending = h.run(); h.requests[0].resolve([record(a), record(b)]); await pending;
  const output = await h.payload(), json = JSON.stringify(output);
  assert.equal(json.includes('Synthetic private background'), false); assert.equal(json.includes('invented'), false);
  assert.equal(output.programmes[0].profile, undefined); assert.equal(output.programmes[0].match, undefined);
});

test('unavailable and stale saved choices remain explicit without substitute baseline fees', async () => {
  const h = harness(); h.remembered.entries[a] = optionSnapshot({ ...record(a), selectedOffering: { id: a + '-O1' } }, '2026-10-21T00:00:00.000Z');
  const pending = h.run(); h.requests[0].resolve([{ id: a, savedOptionIssue: 'Synthetic stale choice', offerings: [{ tuition: 999 }] }, { id: b, unavailable: true, issue: 'Synthetic missing programme' }]);
  assert.equal(await pending, true); const output = await h.payload();
  assert.equal(output.programmes.length, 0); assert.equal(output.unresolved.length, 2);
  assert.equal(output.unresolved[0].requestedOptions.offeringId, a + '-O1'); assert.equal(JSON.stringify(output).includes('tuition'), false);
  assert.match(h.status(), /Programme records: 0\. Unresolved selections: 2/);
});

test('detached controls, other pages and an empty shortlist cannot start an export', async () => {
  for (const change of [h => { h.button().isConnected = false; }, h => { h.state.view = 'compare'; }, h => { h.state.shortlist = []; }]) {
    const h = harness(); change(h); assert.equal(await h.run(), false); assert.equal(h.requests.length, 0);
  }
});

test('download object URLs are revoked after successful requests', async () => {
  const h = harness(), pending = h.run(); h.requests[0].resolve([record(a), record(b)]); await pending;
  assert.equal(h.timers.length, 1); h.timers[0](); assert.deepEqual(h.revocations, ['blob:synthetic-1']);
});

test('download initiation errors still clean up the object URL and do not claim a completed download', async () => {
  const h = harness(); h.failClick(); const pending = h.run(); h.requests[0].resolve([record(a), record(b)]);
  assert.equal(await pending, false); assert.match(h.status(), /could not be confirmed/);
  assert.equal(h.status().includes('Nothing was downloaded'), false); assert.equal(h.button().disabled, false);
  h.timers[0](); assert.deepEqual(h.revocations, ['blob:synthetic-1']);
});

test('serialization failure creates no object URL or anchor click', () => {
  const h = harness(), circular = {}; circular.self = circular;
  assert.throws(() => h.download(circular, 'synthetic.json')); assert.equal(h.blobs.length, 0); assert.equal(h.clicks.length, 0);
});

test('a focused export button regains keyboard focus after success or a retryable failure', async () => {
  for (const fail of [false, true]) {
    const h = harness(); h.document.activeElement = h.button(); const pending = h.run();
    assert.equal(h.document.activeElement, h.document.body);
    if (fail) h.requests[0].reject(new Error('Synthetic focus retry')); else h.requests[0].resolve([record(a), record(b)]);
    await pending; assert.equal(h.document.activeElement, h.button()); assert.equal(h.focus.length, 1);
    assert.equal(h.focus[0].preventScroll, true);
  }
});

test('export completion cannot steal focus from another control or an open detail dialog', async () => {
  for (const modal of [false, true]) {
    const h = harness(); h.document.activeElement = h.button(); const pending = h.run();
    if (modal) h.dialog.open = true; else h.document.activeElement = { id: 'other-control' };
    h.requests[0].resolve([record(a), record(b)]); await pending; assert.equal(h.focus.length, 0);
  }
});

test('the UI uses the guarded exporter and exposes a scoped English status without saving profile data', () => {
  assert.match(app, /if \(action === 'exportShortlist'\) await exportShortlist\(trigger\)/);
  assert.match(app, /id="shortlist-export-status" class="detail-note" role="status" aria-live="polite" aria-atomic="true"/);
  assert.equal(/writeStorage|localStorage|state\.profile|state\.matches/.test(lifecycle), false);
  assert.equal(/\p{Script=Han}/u.test(lifecycle), false);
});
