import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { copy } from '../public/copy.js';

// Run the actual browser detail lifecycle with a tiny DOM adapter and controlled
// request completion, rather than duplicating its concurrency rules in a fixture.
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const lifecycle = app.slice(app.indexOf('function detailStatus('), app.indexOf('async function renderCompare('));
assert.ok(lifecycle.includes('async function openDetail(id)'));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const fixture = id => ({ id, name: 'Synthetic programme ' + id, university: { abbreviation: 'TEST', region: 'SG', nameEn: 'Synthetic University' }, verification: 'programme_page_checked', rules: [], offerings: [], requirementsCoverage: 'partial', academicYear: '2027/28', notesEn: 'Synthetic notes' });

function harness() {
  const requests = [], listeners = {}, bodyClasses = new Set(), focus = [], replacements = [];
  const trigger = { isConnected: true, dataset: { action: 'detail', id: 'SG-TEST-P001' }, textContent: 'View details', focus: () => focus.push('trigger') };
  const node = selector => ({ focus: () => focus.push(selector), insertAdjacentHTML: (_, html) => { dialog.innerHTML += html; } });
  const dialog = { open: false, innerHTML: '', scrollTop: 10, contains: element => element?.insideDialog === true, showModal() { this.open = true; }, close() { this.open = false; listeners.close(); }, addEventListener(event, callback) { listeners[event] = callback; }, querySelector: node };
  const location = { href: 'http://127.0.0.1:3110/?q=synthetic#discover' };
  const sandbox = {
    URL, location, history: { replaceState: (_, __, url) => { location.href = String(url); } },
    document: { activeElement: trigger, querySelectorAll: () => replacements, body: { classList: { add: x => bodyClasses.add(x), remove: x => bodyClasses.delete(x) } } },
    $: selector => { if (selector === '#main') return { focus: () => focus.push('main') }; assert.equal(selector, '#detail-dialog'); return dialog; },
    esc: value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    t: key => copy[key] || key, icon: () => '', remembered: { entries: {} }, state: { shortlist: [] },
    programmePath: id => '/api/programmes/' + id,
    api: path => { const request = { path, ...deferred() }; requests.push(request); return request.promise; },
    badge: () => '', schoolName: u => u.nameEn, areaName: value => value, known: value => String(value ?? ''),
    requirementChecks: () => '', evidenceCoverage: () => '', directoryEvidence: () => '', sourceTarget: () => 'https://www.ntu.edu.sg/',
    routeSelector: () => '', scopeBadge: () => '', scopeWarning: () => '', offeringSelector: () => '', applicantSelector: () => '', rememberPanel: () => '', applicationPanel: () => ''
  };
  const context = vm.createContext(sandbox);
  vm.runInContext('let activeDetail = null, detailTrigger = null, detailSequence = 0;\n' + lifecycle, context);
  return { dialog, requests, bodyClasses, focus, trigger, location, remembered: sandbox.remembered, addReplacement: patch => replacements.push({ dataset: { action: 'detail', id: trigger.dataset.id }, textContent: trigger.textContent, focus: () => focus.push('replacement'), ...patch }), focusInside: () => { sandbox.document.activeElement = { insideDialog: true, isConnected: false }; }, open: id => context.openDetail(id), close: () => context.closeDetail(), active: () => vm.runInContext('activeDetail', context) };
}

test('loading clears prior active facts and exposes a named, closable status dialog', async () => {
  const h = harness();
  const first = h.open('SG-TEST-P001'); h.requests[0].resolve(fixture('SG-TEST-P001')); await first;
  const next = h.open('SG-TEST-P002');
  assert.equal(h.active(), null); assert.equal(h.dialog.open, true); assert.equal(h.dialog.scrollTop, 0);
  assert.match(h.dialog.innerHTML, /id="detail-title">Loading programme details/);
  assert.match(h.dialog.innerHTML, /data-action="closeDetail"/);
  assert.match(h.dialog.innerHTML, /role="status" aria-live="polite"/);
  assert.equal(h.dialog.innerHTML.includes('SG-TEST-P001'), false);
  assert.equal(new URL(h.location.href).searchParams.get('programme'), 'SG-TEST-P002');
  h.requests[1].resolve(fixture('SG-TEST-P002')); await next;
  assert.equal(h.active().id, 'SG-TEST-P002');
});

test('a late failure cannot overwrite a newer successful detail', async () => {
  const h = harness();
  const older = h.open('SG-TEST-P001'), newer = h.open('SG-TEST-P002');
  h.requests[1].resolve(fixture('SG-TEST-P002')); await newer;
  const before = h.dialog.innerHTML;
  h.requests[0].reject(new Error('Synthetic older failure')); await older;
  assert.equal(h.dialog.innerHTML, before); assert.equal(h.active().id, 'SG-TEST-P002');
  assert.equal(new URL(h.location.href).searchParams.get('programme'), 'SG-TEST-P002');
});

test('an older failure cannot replace the newer loading status or steal focus', async () => {
  const h = harness();
  const older = h.open('SG-TEST-P001'), newer = h.open('SG-TEST-P002');
  const before = h.dialog.innerHTML, focus = h.focus.length;
  h.requests[0].reject(new Error('Synthetic older failure')); await older;
  assert.equal(h.dialog.innerHTML, before); assert.equal(h.focus.length, focus); assert.equal(h.active(), null);
  h.requests[1].resolve(fixture('SG-TEST-P002')); await newer;
});

test('a late success cannot overwrite a newer successful detail', async () => {
  const h = harness();
  const older = h.open('SG-TEST-P001'), newer = h.open('SG-TEST-P002');
  h.requests[1].resolve(fixture('SG-TEST-P002')); await newer;
  const before = h.dialog.innerHTML;
  h.requests[0].resolve(fixture('SG-TEST-P001')); await older;
  assert.equal(h.dialog.innerHTML, before); assert.equal(h.active().id, 'SG-TEST-P002');
});

test('closing a loading dialog invalidates both pending failure and success responses', async () => {
  for (const fail of [false, true]) {
    const h = harness(), pending = h.open('SG-TEST-P001');
    h.close(); const before = h.dialog.innerHTML, focus = h.focus.length;
    if (fail) h.requests[0].reject(new Error('Synthetic closed request')); else h.requests[0].resolve(fixture('SG-TEST-P001'));
    await pending;
    assert.equal(h.dialog.open, false); assert.equal(h.dialog.innerHTML, before); assert.equal(h.active(), null);
    assert.equal(h.bodyClasses.has('modal-open'), false); assert.equal(h.focus.length, focus);
    assert.equal(new URL(h.location.href).searchParams.has('programme'), false);
    assert.equal(h.focus.at(-1), 'trigger');
  }
});

test('closing and reopening the same ID still isolates the old request', async () => {
  const h = harness(), older = h.open('SG-TEST-P001');
  h.close(); const newer = h.open('SG-TEST-P001');
  h.requests[1].resolve(fixture('SG-TEST-P001')); await newer;
  const before = h.dialog.innerHTML;
  h.requests[0].reject(new Error('Synthetic first attempt')); await older;
  assert.equal(h.dialog.innerHTML, before); assert.equal(h.active().id, 'SG-TEST-P001');
});

test('current errors clear active facts and offer retry for exactly the requested programme', async () => {
  const h = harness(), pending = h.open('SG-TEST-P001');
  h.requests[0].reject(new Error('Synthetic network failure')); await pending;
  assert.equal(h.active(), null); assert.equal(h.dialog.open, true);
  assert.match(h.dialog.innerHTML, /Programme details unavailable/);
  assert.match(h.dialog.innerHTML, /role="alert"/);
  assert.match(h.dialog.innerHTML, /No previous programme details are shown/);
  assert.match(h.dialog.innerHTML, /data-action="detail" data-id="SG-TEST-P001">Try again/);
  assert.equal(h.focus.at(-1), '[data-action=detail]');
  const retry = h.open('SG-TEST-P001');
  assert.deepEqual(h.requests.map(r => r.path), ['/api/programmes/SG-TEST-P001', '/api/programmes/SG-TEST-P001']);
  h.requests[1].resolve(fixture('SG-TEST-P001')); await retry;
  assert.equal(h.active().id, 'SG-TEST-P001'); assert.equal(h.dialog.innerHTML.includes('role="alert"'), false);
});

test('error messages and retry identifiers are escaped, and saved-choice repair stays scoped', async () => {
  const h = harness(), id = 'SG-TEST-P001';
  h.remembered.entries[id] = { programmeId: id };
  const pending = h.open(id); h.requests[0].reject(new Error('<img src=x onerror=alert(1)>')); await pending;
  assert.equal(h.dialog.innerHTML.includes('<img'), false); assert.match(h.dialog.innerHTML, /&lt;img/);
  assert.match(h.dialog.innerHTML, /data-action="forgetOptions" data-id="SG-TEST-P001"/);
  assert.equal(/\p{Script=Han}/u.test(h.dialog.innerHTML), false);
});

test('a rendering failure also clears active facts rather than retaining a partial programme', async () => {
  const h = harness(), pending = h.open('SG-TEST-P001');
  h.requests[0].resolve({ ...fixture('SG-TEST-P001'), university: null }); await pending;
  assert.equal(h.active(), null); assert.match(h.dialog.innerHTML, /Programme details unavailable/);
});

test('retry from inside the dialog preserves the original external return-focus target', async () => {
  const h = harness(), first = h.open('SG-TEST-P001');
  h.requests[0].reject(new Error('Synthetic retryable failure')); await first;
  h.focusInside();
  const retry = h.open('SG-TEST-P001');
  h.requests[1].resolve(fixture('SG-TEST-P001')); await retry;
  h.close();
  assert.equal(h.focus.at(-1), 'trigger');
});

test('a detached return button is replaced by the same programme/action after a list redraw', async () => {
  const h = harness(), first = h.open('SG-TEST-P001');
  h.requests[0].resolve(fixture('SG-TEST-P001')); await first;
  h.focusInside(); h.trigger.isConnected = false;
  h.addReplacement({ dataset: { action: 'detail', id: 'SG-TEST-P002' } });
  h.addReplacement({ textContent: 'Different action label' });
  h.addReplacement({ insideDialog: true });
  h.addReplacement({ focus: () => h.focus.push('correct-replacement') });
  const refreshed = h.open('SG-TEST-P001'); h.requests[1].resolve(fixture('SG-TEST-P001')); await refreshed;
  h.close(); assert.equal(h.focus.at(-1), 'correct-replacement');
});

test('focus falls back to main content when the original programme button is gone', async () => {
  const h = harness(), pending = h.open('SG-TEST-P001');
  h.requests[0].resolve(fixture('SG-TEST-P001')); await pending;
  h.trigger.isConnected = false; h.addReplacement({ insideDialog: true });
  h.close(); assert.equal(h.focus.at(-1), 'main');
});
