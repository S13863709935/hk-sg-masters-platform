import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { copy } from '../public/copy.js';

// Execute the actual catalogue loader, debounce and result renderer against a
// minimal replaceable DOM and controlled replies. No real browser data is used.
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const loader = app.slice(app.indexOf('const catalogueContext ='), app.indexOf('function card('));
const renderer = app.slice(app.indexOf('function renderResults('), app.indexOf('function updateTray('));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const record = id => ({ id, name: `Synthetic ${id}` });

function harness() {
  const state = { view: 'discover', q: '', region: '', school: '', area: '', mode: '', verification: '', sort: 'quality', matchFilter: '', page: 1, limit: 2, profile: null, matches: null, items: [], total: 0 };
  const nodes = new Map(), requests = [], timers = new Map(), focus = [], scrolls = [];
  const document = { body: {}, activeElement: null }; document.activeElement = document.body;
  let timerId = 0, urlChanges = 0;
  const element = id => ({ id, isConnected: true, attributes: {}, textContent: '',
    focus(options) { document.activeElement = this; focus.push({ id, options }); },
    scrollIntoView(options) { scrolls.push({ id, options }); },
    setAttribute(name, value) { this.attributes[name] = value; }
  });
  const detachChildren = () => {
    for (const id of ['sort', 'results-summary', 'retry', 'pagination-next']) {
      const child = nodes.get('#' + id); if (!child) continue;
      child.isConnected = false; if (document.activeElement === child) document.activeElement = document.body;
      nodes.delete('#' + id);
    }
  };
  const newTarget = () => {
    const previous = nodes.get('#results'); if (previous) previous.isConnected = false;
    detachChildren();
    const target = element('results'); let html = '';
    Object.defineProperty(target, 'innerHTML', {
      get: () => html,
      set: value => {
        html = value; detachChildren();
        for (const id of ['sort', 'results-summary']) if (value.includes(`id="${id}"`)) nodes.set('#' + id, element(id));
        if (value.includes('data-action="retry"')) nodes.set('#retry', element('retry'));
      }
    });
    target.querySelector = selector => { assert.equal(selector, '[data-action=retry]'); return nodes.get('#retry'); };
    nodes.set('#results', target); nodes.set('#catalogue-status', element('catalogue-status'));
    return target;
  };
  newTarget(); nodes.set('#detail-dialog', { open: false });
  const sandbox = {
    state, document, URLSearchParams, $: selector => nodes.get(selector) || null,
    routeChoices: {}, offeringChoices: {}, applicantChoices: {}, t: key => copy[key] || key,
    filterMatches: items => [...items], card: p => `<article>${p.name}</article>`,
    options: () => '', icon: () => '',
    syncUrl: () => { urlChanges++; },
    setTimeout: (fn, delay) => { assert.equal(delay, 220); const id = ++timerId; timers.set(id, fn); return id; },
    clearTimeout: id => timers.delete(id),
    api: path => { const request = { path, ...deferred() }; requests.push(request); return request.promise; }
  };
  const context = vm.createContext(sandbox);
  vm.runInContext('let requestSequence = 0, searchTimer;\n' + loader + '\n' + renderer, context);
  return { state, nodes, requests, timers, focus, scrolls, document,
    routeChoices: sandbox.routeChoices, offeringChoices: sandbox.offeringChoices, applicantChoices: sandbox.applicantChoices,
    load: options => context.loadCatalogue(options), search: value => context.scheduleCatalogueSearch(value),
    target: () => nodes.get('#results'), status: () => nodes.get('#catalogue-status').textContent,
    redraw: newTarget, activate: id => { const node = nodes.get('#' + id) || element(id); nodes.set('#' + id, node); document.activeElement = node; return node; },
    tick: () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn()); },
    modal: () => { nodes.get('#detail-dialog').open = true; }, urlChanges: () => urlChanges,
    settle: async () => { await Promise.resolve(); await Promise.resolve(); }
  };
}

test('current catalogue loads expose busy/status, then current count and page without taking search focus', async () => {
  const h = harness(), search = h.activate('search'), pending = h.load();
  assert.equal(h.target().attributes['aria-busy'], 'true'); assert.equal(h.status(), copy.loading);
  h.requests[0].resolve({ total: 5, items: [record('A'), record('B')] }); assert.equal(await pending, true);
  assert.equal(h.target().attributes['aria-busy'], 'false'); assert.equal(h.status(), '5 programmes · Page 1 of 3');
  assert.match(h.target().innerHTML, /id="results-summary" tabindex="-1" role="heading" aria-level="2"/);
  assert.equal(h.document.activeElement, search); assert.equal(h.focus.length, 0);
});

test('late success and failure cannot replace a newer search response', async () => {
  for (const fail of [false, true]) {
    const h = harness(), old = h.load(); h.state.q = 'new'; const current = h.load();
    h.requests[1].resolve({ total: 1, items: [record('NEW')] }); await current;
    const before = h.target().innerHTML, status = h.status();
    if (fail) h.requests[0].reject(new Error('Synthetic old error')); else h.requests[0].resolve({ total: 10, items: [record('OLD')] });
    assert.equal(await old, false); assert.equal(h.target().innerHTML, before); assert.equal(h.status(), status);
  }
});

test('a replaced result container rejects old success/error even if discovery and filters are unchanged', async () => {
  for (const fail of [false, true]) {
    const h = harness(), old = h.load({ focusResults: true }); h.redraw(); const target = h.target();
    if (fail) h.requests[0].reject(new Error('Synthetic old container')); else h.requests[0].resolve({ total: 1, items: [record('OLD')] });
    assert.equal(await old, false); assert.equal(target.innerHTML, ''); assert.equal(h.focus.length, 0); assert.equal(h.scrolls.length, 0);
  }
});

test('leaving discovery suppresses old errors and all pagination focus/scroll side effects', async () => {
  const h = harness(), old = h.load({ focusResults: true }); h.state.view = 'profile';
  const before = h.target().innerHTML; h.requests[0].reject(new Error('Synthetic obsolete page'));
  assert.equal(await old, false); assert.equal(h.target().innerHTML, before); assert.equal(h.focus.length, 0); assert.equal(h.scrolls.length, 0);
});

test('typing invalidates an in-flight response immediately, before the debounce starts the new request', async () => {
  const h = harness(), old = h.load(); h.search('new keyword');
  assert.equal(h.state.q, 'new keyword'); assert.equal(h.requests.length, 1);
  h.requests[0].resolve({ total: 1, items: [record('OLD')] }); assert.equal(await old, false);
  assert.equal(h.state.items.length, 0); assert.equal(h.target().attributes['aria-busy'], 'true');
  h.tick(); assert.equal(h.requests.length, 2); assert.match(h.requests[1].path, /q=new\+keyword/);
  h.requests[1].resolve({ total: 1, items: [record('NEW')] }); await h.settle();
  assert.match(h.target().innerHTML, /Synthetic NEW/); assert.equal(h.target().attributes['aria-busy'], 'false');
});

test('rapid typing keeps only the latest debounce request and resets pagination', async () => {
  const h = harness(); h.state.page = 5; h.search('a'); h.search('ab'); h.search('abc');
  assert.equal(h.timers.size, 1); assert.equal(h.state.page, 1); assert.equal(h.urlChanges(), 3);
  h.tick(); assert.equal(h.requests.length, 1); assert.match(h.requests[0].path, /q=abc/);
  h.requests[0].resolve({ total: 0, items: [] }); await h.settle();
});

test('queued search callbacks cannot start requests on another page or replacement discovery', () => {
  for (const replace of [false, true]) {
    const h = harness(); h.search('synthetic');
    if (replace) h.redraw(); else h.state.view = 'profile';
    h.tick(); assert.equal(h.requests.length, 0);
  }
});

test('an immediate filter refresh cancels a queued search rather than loading twice', async () => {
  const h = harness(); h.search('synthetic'); h.state.school = 'SG-NTU'; const current = h.load();
  h.tick(); assert.equal(h.requests.length, 1); assert.match(h.requests[0].path, /school=SG-NTU/);
  h.requests[0].resolve({ total: 0, items: [] }); await current;
});

test('changed filter or programme-choice context invalidates an unchanged request sequence', async () => {
  for (const mutate of [h => { h.state.mode = 'part-time'; }, h => { h.state.matchFilter = 'needs_confirmation'; }, h => { h.routeChoices.TEST = 'new-route'; }, h => { h.offeringChoices.TEST = 'new-option'; }, h => { h.applicantChoices.TEST = 'new-category'; }]) {
    const h = harness(), old = h.load(); mutate(h);
    h.requests[0].resolve({ total: 1, items: [record('OLD')] }); assert.equal(await old, false); assert.equal(h.state.items.length, 0);
  }
});

test('background replacement or refreshed matches cannot be overwritten by an old anonymous load', async () => {
  for (const mutate of [h => { h.state.profile = { major: 'Synthetic discipline' }; }, h => { h.state.matches = []; }]) {
    const h = harness(), old = h.load(); mutate(h);
    h.requests[0].resolve({ total: 1, items: [record('OLD')] }); assert.equal(await old, false); assert.equal(h.state.items.length, 0);
  }
});

test('pagination completion focuses the result summary and scrolls without animation', async () => {
  const h = harness(); h.state.page = 2; h.activate('pagination-next');
  const pending = h.load({ focusResults: true });
  h.requests[0].resolve({ total: 5, items: [record('C'), record('D')] }); await pending;
  assert.equal(h.status(), '5 programmes · Page 2 of 3'); assert.equal(h.focus.at(-1).id, 'results-summary');
  assert.equal(h.scrolls[0].options.behavior, 'auto'); assert.equal(h.scrolls[0].id, 'results-summary');
});

test('a replaced sort control regains focus without scrolling the result summary', async () => {
  const h = harness(); h.activate('sort'); const pending = h.load();
  h.requests[0].resolve({ total: 1, items: [record('A')] }); await pending;
  assert.equal(h.focus.at(-1).id, 'sort'); assert.equal(h.scrolls.length, 0);
});

test('completing a page does not steal focus from another control or an open dialog', async () => {
  for (const modal of [false, true]) {
    const h = harness(), pending = h.load({ focusResults: true });
    if (modal) h.modal(); else h.activate('search');
    h.requests[0].resolve({ total: 1, items: [record('A')] }); await pending;
    assert.equal(h.focus.length, 0); assert.equal(h.scrolls.length, 0);
  }
});

test('a current failure clears busy state and focuses its retry without deleting prior state', async () => {
  const h = harness(); h.state.items = [record('PREVIOUS')]; h.state.total = 9;
  const pending = h.load({ focusResults: true }); h.requests[0].reject(new Error('Synthetic current failure'));
  assert.equal(await pending, false); assert.equal(h.target().attributes['aria-busy'], 'false');
  assert.match(h.target().innerHTML, /data-action="retry"/); assert.equal(h.focus.at(-1).id, 'retry');
  assert.equal(h.state.total, 9); assert.equal(h.state.items[0].id, 'PREVIOUS'); assert.equal(h.status(), `${copy.errorHeading} ${copy.errorHint}`);
  assert.equal((h.target().innerHTML.match(/data-action="retry"/g) || []).length, 1);
  assert.doesNotMatch(h.target().innerHTML, /data-action="nav"|data-action="reset"/);
});

test('retry can recover the current results and focus the summary', async () => {
  const h = harness(), failed = h.load(); h.requests[0].reject(new Error('Synthetic retryable error')); await failed;
  h.activate('retry'); const retry = h.load({ focusResults: true });
  h.requests[1].resolve({ total: 1, items: [record('RECOVERED')] }); assert.equal(await retry, true);
  assert.match(h.target().innerHTML, /Synthetic RECOVERED/); assert.equal(h.focus.at(-1).id, 'results-summary');
});

test('background-filtered results retain their existing local sort and pagination path', async () => {
  const h = harness(); h.state.profile = { major: 'Synthetic discipline' };
  h.state.matches = [record('C'), record('A'), record('B')]; h.state.sort = 'az'; h.state.page = 2;
  assert.equal(await h.load(), true); assert.equal(h.requests.length, 0);
  assert.equal(h.state.items[0].id, 'C'); assert.equal(h.status(), '3 programmes · Page 2 of 2');
});

test('empty results report page one of one and retain the explicit empty view', async () => {
  const h = harness(), pending = h.load(); h.requests[0].resolve({ total: 0, items: [] }); await pending;
  assert.equal(h.status(), '0 programmes · Page 1 of 1'); assert.ok(h.target().innerHTML.includes(copy.noProgrammes));
  assert.match(h.target().innerHTML, /data-action="retry"/);
  assert.doesNotMatch(h.target().innerHTML, /data-action="reset"|data-action="nav"/);
  assert.equal(h.focus.length, 0);
});

test('every active search or matching filter offers a real reset rather than same-page navigation', async () => {
  for (const [key, value] of Object.entries({ q: 'Synthetic missing keyword', region: 'HK', school: 'SG-NUS', area: 'Synthetic discipline', mode: 'part-time', verification: 'peer_reviewed', matchFilter: 'meets_checked' })) {
    const h = harness(); h.state[key] = value;
    if (key === 'matchFilter') { h.state.profile = { major: 'Synthetic discipline' }; h.state.matches = []; }
    const pending = h.load(); if (h.requests.length) h.requests[0].resolve({ total: 0, items: [] }); await pending;
    assert.ok(h.target().innerHTML.includes(copy.noResults));
    assert.match(h.target().innerHTML, /data-action="reset"/);
    assert.doesNotMatch(h.target().innerHTML, /data-action="nav"|data-action="retry"/);
    assert.ok(h.target().innerHTML.includes(copy.noResultsHint));
  }
});

test('one result is singular in both the visible count and polite status', async () => {
  for (const withBackground of [false, true]) {
    const h = harness();
    if (withBackground) { h.state.profile = { major: 'Synthetic discipline' }; h.state.matches = [record('A')]; }
    const pending = h.load();
    if (!withBackground) h.requests[0].resolve({ total: 1, items: [record('A')] });
    await pending;
    assert.equal(h.status(), '1 programme · Page 1 of 1');
    assert.match(h.target().innerHTML, /<strong>1<\/strong> programme · Page 1 of 1/);
  }
});

test('a requirement-check filter without current matches pauses instead of showing an unfiltered catalogue or count', async () => {
  for (const matchFilter of ['meets_checked', 'has_gap', 'needs_confirmation']) {
    const h = harness(); h.state.profile = { major: 'Synthetic background' }; h.state.matchFilter = matchFilter;
    h.state.items = [record('OLD')]; h.state.total = 500;
    assert.equal(await h.load(), false); assert.equal(h.requests.length, 0);
    assert.equal(h.state.items.length, 0); assert.equal(h.state.total, 0); assert.equal(h.state.matchFilter, matchFilter);
    assert.ok(h.target().innerHTML.includes(copy.checksFilterPaused)); assert.equal(h.status(), copy.checksFilterPaused);
    assert.doesNotMatch(h.target().innerHTML, /results-summary|OLD|data-action="reset"/); assert.equal(h.target().attributes['aria-busy'], 'false');
  }
});

test('without a requirement-check filter, missing matches still allow ordinary catalogue browsing', async () => {
  const h = harness(); h.state.profile = { major: 'Synthetic background' };
  const pending = h.load(); assert.equal(h.requests.length, 1);
  h.requests[0].resolve({ total: 1, items: [record('BROWSE')] }); assert.equal(await pending, true);
  assert.match(h.target().innerHTML, /Synthetic BROWSE/); assert.equal(h.state.matches, null);
});

test('UI wiring keeps a stable polite status, safe pagination, region/reset focus and the debounced handler', () => {
  assert.match(app, /id="catalogue-status" class="visually-hidden" role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(app, /if \(action === 'page'\).*await loadCatalogue\(\{ focusResults: true \}\)/);
  assert.equal(app.includes("$('#results').scrollIntoView"), false);
  assert.match(app, /if \(action === 'region'\).*button\.dataset\.value === value\)\?\.focus\(\)/);
  assert.match(app, /if \(action === 'reset'\).*\$\('#search'\)\?\.focus\(\)/);
  assert.match(app, /if \(event\.target\.id === 'search'\) scheduleCatalogueSearch\(event\.target\.value\)/);
  const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(css, /#results-summary\{scroll-margin-block-start:16px\}/);
});
