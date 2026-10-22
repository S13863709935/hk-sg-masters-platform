import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { copy } from '../public/copy.js';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const refresh = app.slice(app.indexOf('async function refreshMatches('), app.indexOf('async function retryMatching('));
const retry = app.slice(app.indexOf('async function retryMatching('), app.indexOf('function clearBackground('));
const renderer = app.slice(app.indexOf('function matchingRecovery('), app.indexOf('function syncUrl('));
const helpers = ['matchingPayload', 'choiceContext'].map(name => app.match(new RegExp(`^const ${name} = .*`, 'm'))[0]).join('\n');
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

// Runs the actual retry and matching guards against replaceable synthetic DOM.
// Network replies are controlled; no browser/student data is persisted.
function harness() {
  const profile = { major: 'Synthetic retry background', language: { type: 'none' } };
  const state = { view: 'discover', profile, matches: null, page: 4, q: 'Synthetic keyword', region: 'SG', school: 'SG-TEST', area: 'Computing', mode: 'part-time', verification: 'programme_page_checked', matchFilter: 'meets_checked', sort: 'az', shortlist: ['TEST'], compare: ['TEST'] };
  const nodes = new Map(), requests = [], loads = [], toasts = [], focus = [];
  const document = { body: {}, activeElement: null };
  const element = id => ({ id, isConnected: true, disabled: false, textContent: '', attributes: {},
    setAttribute(key, value) { this.attributes[key] = value; }, focus() { document.activeElement = this; focus.push(id); }
  });
  nodes.set('#page', element('page')); nodes.set('#results-summary', element('results-summary'));
  const replacePanel = () => {
    const old = nodes.get('#matching-recovery');
    if (old) { old.isConnected = false; old.trigger.isConnected = false; if (document.activeElement === old.trigger) document.activeElement = document.body; }
    const panel = element('matching-recovery'), trigger = element('retry-button'), status = element('matching-recovery-status');
    trigger.textContent = copy.retryChecks; panel.trigger = trigger; panel.status = status;
    panel.contains = node => node === trigger;
    panel.querySelector = selector => { assert.equal(selector, '#matching-recovery-status'); return status; };
    panel.remove = () => { panel.isConnected = false; trigger.isConnected = false; if (document.activeElement === trigger) document.activeElement = document.body; nodes.delete('#matching-recovery'); };
    nodes.set('#matching-recovery', panel); document.activeElement = trigger; return panel;
  };
  replacePanel(); let loadSuccess = true;
  const sandbox = {
    state, document, matchingRetry: null, backgroundVersion: 0, matchRequestSequence: 0,
    routeChoices: { TEST: 'route' }, offeringChoices: { TEST: 'intake' }, applicantChoices: { TEST: 'category' },
    $: selector => nodes.get(selector) || null, t: key => copy[key] || key,
    post: (path, payload) => { assert.equal(path, '/api/matches'); const request = { payload, ...deferred() }; requests.push(request); return request.promise; },
    loadCatalogue: async options => { loads.push({ options, q: state.q, matchFilter: state.matchFilter, sort: state.sort }); if (options.focusResults && document.activeElement === document.body) nodes.get('#results-summary').focus(); return loadSuccess; },
    toast: message => toasts.push(message), writeStorage: () => assert.fail('retry must not write browser storage')
  };
  const context = vm.createContext(sandbox); vm.runInContext(helpers + '\n' + refresh + '\n' + retry + '\n' + renderer, context);
  return { state, profile, document, nodes, requests, loads, toasts, focus, sandbox,
    panel: () => nodes.get('#matching-recovery'), retry: trigger => context.retryMatching(trigger || nodes.get('#matching-recovery')?.trigger),
    replacePanel, replacePage: () => { nodes.get('#page').isConnected = false; nodes.set('#page', element('replacement-page')); replacePanel(); },
    loadFailure: () => { loadSuccess = false; }, markup: () => context.matchingRecovery()
  };
}

test('retry uses the current background/choices without changing filters, saved lists or persistence', async () => {
  const h = harness(), shortlist = h.state.shortlist, compare = h.state.compare, panel = h.panel(), trigger = panel.trigger;
  const before = JSON.stringify([h.sandbox.routeChoices, h.sandbox.offeringChoices, h.sandbox.applicantChoices]);
  const pending = h.retry();
  assert.equal(trigger.disabled, true); assert.equal(panel.attributes['aria-busy'], 'true'); assert.equal(panel.status.textContent, copy.retryChecksPending);
  assert.equal(h.requests[0].payload.profile, h.profile); assert.equal(h.requests[0].payload.selectedOfferings.TEST, 'intake');
  h.requests[0].resolve({ items: [{ id: 'CURRENT' }] }); assert.equal(await pending, true);
  assert.equal(h.state.matches[0].id, 'CURRENT'); assert.equal(h.state.profile, h.profile); assert.equal(h.state.shortlist, shortlist); assert.equal(h.state.compare, compare);
  assert.equal(JSON.stringify([h.sandbox.routeChoices, h.sandbox.offeringChoices, h.sandbox.applicantChoices]), before);
  assert.deepEqual(h.loads.map(load => [load.matchFilter, load.sort, load.q]), [['meets_checked', 'az', 'Synthetic keyword']]);
  assert.equal(h.state.page, 1); assert.equal(panel.isConnected, false); assert.equal(trigger.disabled, false); assert.equal(h.sandbox.matchingRetry, null);
  assert.deepEqual(h.toasts, [copy.retryChecksSuccess]); assert.deepEqual(h.focus, ['results-summary']);
});

test('duplicate retry activation starts only one check for the current recovery panel', async () => {
  const h = harness(), pending = h.retry(); assert.equal(await h.retry(), false);
  h.panel().trigger.disabled = false; assert.equal(await h.retry(), false); assert.equal(h.requests.length, 1);
  h.requests[0].resolve({ items: [] }); await pending;
});

test('current failures preserve the panel and background, expose a safe error and allow a second attempt', async () => {
  const h = harness(), panel = h.panel(), first = h.retry();
  h.document.activeElement = h.document.body;
  h.requests[0].reject(new Error('<script>Synthetic network error</script>')); assert.equal(await first, false);
  assert.equal(h.panel(), panel); assert.equal(panel.status.textContent, copy.retryChecksFailed); assert.equal(panel.trigger.disabled, false);
  assert.equal(panel.attributes['aria-busy'], 'false'); assert.equal(h.state.matches, null); assert.equal(h.state.profile, h.profile); assert.equal(h.loads.length, 0);
  assert.equal(h.document.activeElement, panel.trigger); assert.deepEqual(h.focus, ['retry-button']);
  const second = h.retry(); h.requests[1].resolve({ items: [] }); assert.equal(await second, true);
});

test('leaving discovery discards late retry success/error, including cache writes and forced UI effects', async () => {
  for (const fail of [false, true]) {
    const h = harness(), panel = h.panel(), pending = h.retry(); h.state.view = 'shortlist';
    if (fail) h.requests[0].reject(new Error('Synthetic obsolete error')); else h.requests[0].resolve({ items: [{ id: 'OBSOLETE' }] });
    assert.equal(await pending, false); assert.equal(h.state.matches, null); assert.equal(h.loads.length, 0); assert.equal(h.focus.length, 0); assert.equal(h.toasts.length, 0);
    assert.equal(panel.status.textContent, copy.retryChecksPending); assert.equal(panel.trigger.disabled, false);
  }
});

test('leaving and returning to a replacement page cannot strand its catalogue with an old retry cache update', async () => {
  const h = harness(), old = h.retry(); h.replacePage();
  h.requests[0].resolve({ items: [{ id: 'OLD-PAGE' }] }); assert.equal(await old, false);
  assert.equal(h.state.matches, null); assert.equal(h.panel().isConnected, true); assert.equal(h.loads.length, 0);
  const current = h.retry(); h.requests[1].resolve({ items: [{ id: 'CURRENT-PAGE' }] }); assert.equal(await current, true);
  assert.equal(h.state.matches[0].id, 'CURRENT-PAGE');
});

test('new recovery panels own their retry while obsolete replies cannot clear that ownership', async () => {
  const h = harness(), old = h.retry(); h.replacePanel(); const current = h.retry(), ticket = h.sandbox.matchingRetry;
  h.requests[0].resolve({ items: [] }); assert.equal(await old, false); assert.equal(h.sandbox.matchingRetry, ticket); assert.equal(h.panel().trigger.disabled, true);
  h.requests[1].resolve({ items: [] }); assert.equal(await current, true);
});

test('background clearing/replacement and changed programme choices suppress obsolete retry replies', async () => {
  for (const change of ['clear', 'profile', 'route', 'offering', 'applicant']) {
    const h = harness(), pending = h.retry();
    if (change === 'clear' || change === 'profile') { h.sandbox.backgroundVersion++; h.state.profile = change === 'clear' ? null : { major: 'Synthetic replacement' }; }
    else h.sandbox[{ route: 'routeChoices', offering: 'offeringChoices', applicant: 'applicantChoices' }[change]].TEST = 'changed';
    h.requests[0].resolve({ items: [{ id: 'WRONG-CONTEXT' }] }); assert.equal(await pending, false);
    assert.equal(h.state.matches, null); assert.equal(h.loads.length, 0); assert.equal(h.toasts.length, 0);
  }
});

test('search-filter edits during retry are preserved and the refreshed results use the newest filters', async () => {
  const h = harness(), pending = h.retry(); h.state.q = 'New synthetic keyword'; h.state.matchFilter = 'has_gap'; h.state.sort = 'quality';
  h.document.activeElement = { id: 'filter' };
  h.requests[0].resolve({ items: [] }); assert.equal(await pending, true);
  assert.deepEqual(h.loads.map(load => [load.q, load.matchFilter, load.sort]), [['New synthetic keyword', 'has_gap', 'quality']]);
  assert.equal(h.document.activeElement.id, 'filter'); assert.equal(h.focus.length, 0);
});

test('an unfocused retry does not request result-summary focus', async () => {
  const h = harness(); h.document.activeElement = h.document.body;
  const pending = h.retry(); h.requests[0].resolve({ items: [] }); await pending;
  assert.equal(h.loads[0].options.focusResults, false); assert.equal(h.focus.length, 0);
});

test('a failed retry does not take focus from another control or an open detail dialog', async () => {
  for (const dialog of [false, true]) {
    const h = harness(), pending = h.retry();
    if (dialog) { h.document.activeElement = h.document.body; h.nodes.set('#detail-dialog', { open: true }); }
    else h.document.activeElement = { id: 'another-control' };
    h.requests[0].reject(new Error('Synthetic retry failure')); assert.equal(await pending, false); assert.equal(h.focus.length, 0);
  }
});

test('a newer shared check prevents this retry from claiming success or rendering obsolete results', async () => {
  const h = harness(), pending = h.retry(); h.sandbox.matchRequestSequence++;
  h.requests[0].resolve({ items: [{ id: 'OLD-CHECK' }] }); assert.equal(await pending, false);
  assert.equal(h.state.matches, null); assert.equal(h.loads.length, 0); assert.equal(h.panel().status.textContent, copy.retryChecksFailed);
});

test('catalogue rendering failure does not misreport a successful matching retry as displayed results', async () => {
  const h = harness(); h.loadFailure(); const pending = h.retry();
  h.requests[0].resolve({ items: [{ id: 'FRESH-CHECK' }] }); assert.equal(await pending, false);
  assert.equal(h.state.matches[0].id, 'FRESH-CHECK'); assert.equal(h.toasts.length, 0); assert.equal(h.panel(), undefined);
});

test('retry requires the current recovery panel, active background and unavailable matches', async () => {
  for (const invalid of ['view', 'profile', 'matches', 'panel', 'disabled']) {
    const h = harness(), trigger = h.panel().trigger;
    if (invalid === 'view') h.state.view = 'profile';
    if (invalid === 'profile') h.state.profile = null;
    if (invalid === 'matches') h.state.matches = [];
    if (invalid === 'panel') h.nodes.delete('#matching-recovery');
    if (invalid === 'disabled') trigger.disabled = true;
    assert.equal(await h.retry(trigger), false); assert.equal(h.requests.length, 0);
  }
});

test('recovery markup has a named section, explicit retry action and polite status without persistence claims', () => {
  const h = harness(), html = h.markup();
  assert.match(html, /id="matching-recovery".*aria-labelledby="matching-recovery-heading" aria-busy="false"/);
  assert.match(html, /data-action="retryMatches"/); assert.match(html, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.ok(html.includes(copy.retryChecksNote)); assert.equal(/\p{Script=Han}/u.test(html), false);
  assert.match(app, /if \(action === 'retryMatches'\) await retryMatching\(trigger\)/);
});
