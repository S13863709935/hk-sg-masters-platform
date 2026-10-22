import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { copy } from '../public/copy.js';

// Exercise the actual saved-view renderers against controlled request ordering.
// The DOM adapter models container replacement; this is not a browser/network test.
const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const renderers = source.slice(source.indexOf('function currentSavedView('), source.indexOf('function field(')) +
  source.slice(source.indexOf('async function renderCompare('), source.indexOf('function renderData(')) +
  source.slice(source.indexOf('async function renderView('), source.indexOf('function navigate('));
assert.ok(renderers.includes('async function renderShortlist('));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const a = 'SG-TEST-P001', b = 'SG-TEST-P002', c = 'SG-TEST-P003';
const record = id => ({ id, name: 'Synthetic programme ' + id, university: { nameEn: 'Synthetic University', abbreviation: 'TEST' }, offerings: [], rules: [], academicYear: '2027/28', verification: 'programme_page_checked' });

function harness(view = 'shortlist') {
  const nodes = new Map(), requests = [], toasts = [];
  const state = { view, shortlist: [a, b], compare: [a, b], meta: { routeEvidence: { routes: 1, pageChecked: 1, groups: 1, peerReviewed: 0, complete: 0 }, applicantEvidence: { studyOptions: 1, categories: 2, peerReviewed: 0 } } };
  const detachChildren = () => { for (const key of ['#saved-cards', '#compare-results']) { const old = nodes.get(key); if (old) old.isConnected = false; nodes.delete(key); } };
  const element = (isPage = false) => ({
    isConnected: true, html: '', attributes: {},
    set innerHTML(value) {
      this.html = value;
      if (isPage) {
        detachChildren();
        for (const id of ['saved-cards', 'compare-results']) if (value.includes(`id="${id}"`)) {
          const child = element(); child.html = '<p role="status">Loading…</p>'; child.attributes['aria-busy'] = 'true'; nodes.set('#' + id, child);
        }
      }
    },
    get innerHTML() { return this.html; },
    setAttribute(name, value) { this.attributes[name] = value; },
    insertAdjacentHTML(_, value) { this.html += value; }
  });
  const newPage = () => { const old = nodes.get('#page'); if (old) old.isConnected = false; detachChildren(); const page = element(true); nodes.set('#page', page); return page; };
  newPage();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const sandbox = {
    state, $: selector => nodes.get(selector) || null, t: key => copy[key] || key, esc,
    heading: title => `<h1>${title}</h1>`, empty: title => `<div data-empty="${title}"></div>`,
    selectedProgrammes: ids => { const request = { ids, ...deferred() }; requests.push(request); return request.promise; },
    card: p => `<article data-id="${p.id}">${esc(p.name)}</article>`,
    unavailableCard: p => `<article data-unavailable="${p.id}">No substitute programme</article>`,
    savedOptionWarning: () => '', savedOptionIssues: {},
    schoolName: u => u.nameEn, areaName: value => value, known: esc, offeringLabel: () => '', offeringCaution: '',
    fees: () => 'Unconfirmed fee', deadlineText: () => '', applicationSummary: () => '', applicationFees: () => '',
    badge: esc, ruleText: () => '', contextMatch: () => null, sourceTarget: () => 'https://www.ntu.edu.sg/', scopeWarning: () => '',
    renderDiscover: () => { nodes.get('#page').innerHTML = 'Discover page'; },
    renderProfile: () => { nodes.get('#page').innerHTML = 'Profile page'; },
    renderData: () => { nodes.get('#page').innerHTML = 'Data page'; },
    renderGuide: () => { nodes.get('#page').innerHTML = 'Guide page'; },
    toast: message => toasts.push(message)
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(renderers, context);
  return { state, requests, toasts, node: selector => nodes.get(selector), enter: next => { state.view = next; return newPage(); }, render: () => context.renderView(), shortlist: options => context.renderShortlist(options), compare: options => context.renderCompare(options) };
}

test('shortlist loading has an explicit status and a snapshot of requested IDs', async () => {
  const h = harness(), pending = h.shortlist(), target = h.node('#saved-cards');
  assert.match(target.innerHTML, /role="status"/); assert.equal(target.attributes['aria-busy'], 'true');
  assert.notEqual(h.requests[0].ids, h.state.shortlist);
  h.state.shortlist.push(c); assert.deepEqual([...h.requests[0].ids], [a, b]);
  h.requests[0].resolve([record(a), record(b)]); await pending;
  assert.equal(target.attributes['aria-busy'], 'false'); assert.match(target.innerHTML, /data-id="SG-TEST-P001"/);
});

test('a superseded shortlist success cannot restore a removed programme', async () => {
  const h = harness(), old = h.shortlist(), oldTarget = h.node('#saved-cards');
  h.state.shortlist = [a]; const current = h.shortlist(), target = h.node('#saved-cards');
  h.requests[1].resolve([record(a)]); await current; const before = target.innerHTML;
  h.requests[0].resolve([record(a), record(b)]); await old;
  assert.equal(oldTarget.isConnected, false); assert.equal(target.innerHTML, before); assert.equal(target.innerHTML.includes(b), false);
});

test('a superseded shortlist error cannot replace the current list or show a stale toast', async () => {
  const h = harness(), old = h.shortlist();
  h.state.shortlist = [c]; const current = h.shortlist(), target = h.node('#saved-cards');
  h.requests[1].resolve([record(c)]); await current; const before = target.innerHTML;
  h.requests[0].reject(new Error('Synthetic older failure')); await old;
  assert.equal(target.innerHTML, before); assert.equal(h.toasts.length, 0);
});

test('clearing the shortlist invalidates pending success and error completions', async () => {
  for (const fail of [false, true]) {
    const h = harness(), old = h.shortlist(); h.state.shortlist = []; await h.shortlist();
    const page = h.node('#page'), before = page.innerHTML;
    if (fail) h.requests[0].reject(new Error('Synthetic cleared request')); else h.requests[0].resolve([record(a), record(b)]);
    await old;
    assert.equal(page.innerHTML, before); assert.match(page.innerHTML, /emptyShortlist/); assert.equal(h.node('#saved-cards'), undefined);
  }
});

test('navigating away prevents late saved-view errors and duplicate data evidence', async () => {
  const h = harness(), old = h.render();
  h.enter('data'); await h.render(); const page = h.node('#page'), before = page.innerHTML;
  assert.equal((before.match(/Route-specific evidence/g) || []).length, 1);
  h.requests[0].reject(new Error('Synthetic request from another page')); await old;
  assert.equal(page.innerHTML, before); assert.equal(h.toasts.length, 0);
});

test('leaving and returning to the same saved view does not revive an old request', async () => {
  for (const view of ['shortlist', 'compare']) {
    const h = harness(view), old = h.render();
    h.enter('profile'); await h.render(); h.enter(view);
    h.state[view === 'shortlist' ? 'shortlist' : 'compare'] = [a, c];
    const current = h.render(), selector = view === 'shortlist' ? '#saved-cards' : '#compare-results';
    const target = h.node(selector); h.requests[1].resolve([record(a), record(c)]); await current; const before = target.innerHTML;
    h.requests[0].resolve([record(a), record(b)]); await old;
    assert.equal(target.innerHTML, before); assert.equal(target.innerHTML.includes(b), false);
  }
});

test('a current shortlist error preserves selections and retry uses the current list', async () => {
  const h = harness(), pending = h.shortlist();
  h.requests[0].reject(new Error('<script>Synthetic failure</script>')); await pending;
  const error = h.node('#saved-cards');
  assert.match(error.innerHTML, /Your saved selections have not been changed/); assert.match(error.innerHTML, /data-action="rerender"/);
  assert.equal(error.attributes['aria-busy'], 'false'); assert.equal(error.innerHTML.includes('<script>'), false);
  assert.deepEqual(h.state.shortlist, [a, b]);
  h.state.shortlist = [c]; const retry = h.render();
  assert.deepEqual([...h.requests[1].ids], [c]); h.requests[1].resolve([record(c)]); await retry;
  assert.match(h.node('#saved-cards').innerHTML, /SG-TEST-P003/); assert.equal(h.node('#saved-cards').innerHTML.includes('role="alert"'), false);
});

test('compare loading keeps its own current container and ID snapshot', async () => {
  const h = harness('compare'), pending = h.compare(), target = h.node('#compare-results');
  assert.equal(target.attributes['aria-busy'], 'true'); assert.match(target.innerHTML, /role="status"/);
  assert.notEqual(h.requests[0].ids, h.state.compare);
  h.requests[0].resolve([record(a), record(b)]); await pending;
  assert.equal(target.attributes['aria-busy'], 'false'); assert.match(target.innerHTML, /compare-table/);
});

test('a superseded comparison cannot restore an old column after the newer result', async () => {
  const h = harness('compare'), old = h.compare();
  h.state.compare = [a, c]; const current = h.compare(), target = h.node('#compare-results');
  h.requests[1].resolve([record(a), record(c)]); await current; const before = target.innerHTML;
  h.requests[0].resolve([record(a), record(b)]); await old;
  assert.equal(target.innerHTML, before); assert.equal(target.innerHTML.includes(b), false);
});

test('an older comparison error does not replace the newer loading state', async () => {
  const h = harness('compare'), old = h.compare();
  h.state.compare = [a, c]; const current = h.compare(), target = h.node('#compare-results'), before = target.innerHTML;
  h.requests[0].reject(new Error('Synthetic older comparison failure')); await old;
  assert.equal(target.innerHTML, before); assert.equal(target.attributes['aria-busy'], 'true');
  h.requests[1].resolve([record(a), record(c)]); await current;
  assert.equal(target.attributes['aria-busy'], 'false');
});

test('removing below two comparison entries keeps the empty view after late completions', async () => {
  for (const fail of [false, true]) {
    const h = harness('compare'), old = h.compare(); h.state.compare = [a]; await h.compare();
    const page = h.node('#page'), before = page.innerHTML;
    if (fail) h.requests[0].reject(new Error('Synthetic removed comparison')); else h.requests[0].resolve([record(a), record(b)]);
    await old; assert.equal(page.innerHTML, before); assert.match(page.innerHTML, /emptyCompare/);
    assert.equal(h.node('#compare-results'), undefined);
  }
});

test('unavailable comparison entries remain explicit instead of substituting a different project', async () => {
  const h = harness('compare'), pending = h.compare();
  h.requests[0].resolve([record(a), { id: b, unavailable: true, issue: 'Synthetic missing choice' }]); await pending;
  const target = h.node('#compare-results');
  assert.match(target.innerHTML, /data-unavailable="SG-TEST-P002"/); assert.match(target.innerHTML, /emptyCompare/);
  assert.equal(target.innerHTML.includes('compare-table'), false); assert.equal(target.attributes['aria-busy'], 'false');
});

test('a current comparison failure can retry without clearing selection or retaining old prices', async () => {
  const h = harness('compare'), pending = h.compare(); h.requests[0].reject(new Error('Synthetic current failure')); await pending;
  assert.deepEqual(h.state.compare, [a, b]); assert.match(h.node('#compare-results').innerHTML, /role="alert"/);
  assert.equal(h.node('#compare-results').innerHTML.includes('Unconfirmed fee'), false);
  h.state.compare = [a, c]; const retry = h.render(); h.requests[1].resolve([record(a), record(c)]); await retry;
  assert.match(h.node('#compare-results').innerHTML, /compare-table/); assert.equal(h.node('#compare-results').innerHTML.includes(b), false);
});

test('a late compare render cannot append another copy of data-workspace evidence', async () => {
  const h = harness('compare'), old = h.render(); h.enter('data'); await h.render();
  const page = h.node('#page'), before = page.innerHTML;
  h.requests[0].resolve([record(a), record(b)]); await old;
  assert.equal(page.innerHTML, before); assert.equal((page.innerHTML.match(/Applicant-category fee\/date evidence/g) || []).length, 1);
});

test('current saved-view success and error invoke action-focus restoration only after the current DOM is ready', async () => {
  for (const view of ['shortlist', 'compare']) for (const fail of [false, true]) {
    const h = harness(view); let calls = 0;
    const pending = h[view]({ restoreFocus: () => {
      calls++; const target = h.node(view === 'shortlist' ? '#saved-cards' : '#compare-results');
      assert.equal(target.attributes['aria-busy'], 'false');
      assert.match(target.innerHTML, fail ? /data-action="rerender"/ : view === 'shortlist' ? /<article/ : /compare-table/);
    } });
    assert.equal(calls, 0);
    if (fail) h.requests[0].reject(new Error('Synthetic focus-recovery error')); else h.requests[0].resolve([record(a), record(b)]);
    await pending; assert.equal(calls, 1);
  }
});

test('superseded saved-view completions never invoke their old focus callback', async () => {
  for (const view of ['shortlist', 'compare']) for (const fail of [false, true]) {
    const h = harness(view); let calls = 0;
    const old = h[view]({ restoreFocus: () => calls++ });
    const current = h[view]();
    if (fail) h.requests[0].reject(new Error('Synthetic obsolete focus error')); else h.requests[0].resolve([record(a), record(b)]);
    await old; assert.equal(calls, 0);
    h.requests[1].resolve([record(a), record(b)]); await current; assert.equal(calls, 0);
  }
});

test('empty shortlist and below-two comparison restore action focus without waiting for a request', async () => {
  for (const view of ['shortlist', 'compare']) {
    const h = harness(view); h.state[view] = view === 'shortlist' ? [] : [a]; let calls = 0;
    await h[view]({ restoreFocus: () => { calls++; assert.match(h.node('#page').innerHTML, /data-empty=/); } });
    assert.equal(calls, 1); assert.equal(h.requests.length, 0);
  }
});

test('comparison with an unavailable record restores focus after rendering its attention and empty state', async () => {
  const h = harness('compare'); let calls = 0;
  const pending = h.compare({ restoreFocus: () => { calls++; assert.match(h.node('#compare-results').innerHTML, /data-unavailable/); } });
  h.requests[0].resolve([record(a), { id: b, unavailable: true }]); await pending; assert.equal(calls, 1);
});

test('shortlist counts use singular only for one saved programme', async () => {
  for (const ids of [[a], [a, b]]) {
    const h = harness(); h.state.shortlist = ids;
    const pending = h.shortlist();
    assert.ok(h.node('#page').innerHTML.includes(`>${ids.length} ${ids.length === 1 ? 'programme' : 'programmes'}</span>`));
    h.requests[0].resolve(ids.map(record)); await pending;
  }
});
