import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { copy } from '../public/copy.js';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const handler = app.slice(app.indexOf("document.addEventListener('change', async event"), app.indexOf("document.addEventListener('submit'"));
const refresh = app.slice(app.indexOf('async function refreshMatches('), app.indexOf('function clearBackground('));
const helpers = ['programmePath', 'matchingPayload', 'choiceContext'].map(name => app.match(new RegExp(`^const ${name} = .*`, 'm'))[0]).join('\n');
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

// Controlled replies exercise actual choice/matching code. Synthetic records do
// not represent a student's profile or any university's admissions conditions.
function harness(withProfile = true) {
  const profile = withProfile ? { major: 'Synthetic discipline', language: { type: 'none' } } : null;
  const state = { view: 'shortlist', profile, matches: [{ id: 'OLD-CACHE' }], shortlist: ['A', 'B'], compare: ['A', 'B'] };
  const routeChoices = { A: 'old-route', B: 'old-route-b' }, offeringChoices = { A: 'old-intake', B: 'old-intake-b' }, applicantChoices = { A: 'old-category', B: 'old-category-b' };
  const requests = [], matches = [], toasts = [], renders = [], opens = [], focus = [], listeners = {};
  let controls = [];
  const dialog = { open: true, scrollTop: 20,
    querySelectorAll: () => controls,
    querySelector: selector => controls.find(control => '#' + control.id === selector)
  };
  const newControls = id => ['programme-route', 'programme-offering', 'programme-applicant'].map(name => ({ id: name, dataset: { programme: id }, disabled: false, value: '', focus: () => focus.push({ id, name }) }));
  const sandbox = {
    state, routeChoices, offeringChoices, applicantChoices, URLSearchParams,
    programmeChoiceRequests: Object.create(null), backgroundVersion: 0, matchRequestSequence: 0, requestSequence: 0,
    activeDetail: null, detailTrigger: { id: 'original-trigger' }, detailSequence: 0,
    $: selector => { assert.equal(selector, '#detail-dialog'); return dialog; },
    document: { addEventListener: (name, fn) => { listeners[name] = fn; } },
    api: path => { const request = { path, ...deferred() }; requests.push(request); return request.promise; },
    post: (path, payload) => { assert.equal(path, '/api/matches'); const request = { payload, ...deferred() }; matches.push(request); return request.promise; },
    renderView: async () => { renders.push(state.view); },
    openDetail: async id => { opens.push(id); sandbox.detailSequence++; sandbox.activeDetail = { id }; controls = newControls(id); },
    toast: message => toasts.push(message),
    writeStorage: () => assert.fail('temporary choice changes must not write browser storage')
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(helpers + '\n' + refresh + '\n' + handler, context);
  const show = id => { dialog.open = true; sandbox.detailSequence++; sandbox.activeDetail = { id }; controls = newControls(id); return controls; };
  return { state, profile, routeChoices, offeringChoices, applicantChoices, requests, matches, toasts, renders, opens, focus, dialog, sandbox,
    controls: () => controls,
    show,
    select: (id, kind, value) => { const control = show(id).find(item => item.id === `programme-${kind}`); control.value = value; const pending = listeners.change({ target: control }); return { control, pending }; },
    close: () => { dialog.open = false; sandbox.activeDetail = null; sandbox.detailSequence++; },
    background: value => { sandbox.backgroundVersion++; sandbox.matchRequestSequence++; state.profile = value; state.matches = null; },
    settle: async () => { for (let index = 0; index < 8; index++) await Promise.resolve(); }
  };
}

test('choice changes immediately invalidate match/catalogue requests without changing saved lists or background', async () => {
  const h = harness(), shortlist = h.state.shortlist, compare = h.state.compare;
  const action = h.select('A', 'offering', 'new-intake');
  assert.equal(h.state.matches, null); assert.equal(h.sandbox.matchRequestSequence, 1); assert.equal(h.sandbox.requestSequence, 1);
  assert.equal(h.state.profile, h.profile); assert.equal(h.state.shortlist, shortlist); assert.equal(h.state.compare, compare);
  assert.equal(h.applicantChoices.A, undefined); assert.ok(h.controls().every(control => control.disabled));
  h.requests[0].resolve({}); await h.settle();
  assert.equal(h.matches[0].payload.selectedOfferings.A, 'new-intake');
  h.matches[0].resolve({ items: [{ id: 'CURRENT' }] }); await action.pending;
  assert.equal(h.state.matches[0].id, 'CURRENT'); assert.equal(Object.keys(h.sandbox.programmeChoiceRequests).length, 0);
});

test('successful route, study-option and applicant changes retain dependent-choice clearing and current detail focus', async () => {
  for (const kind of ['route', 'offering', 'applicant']) {
    const h = harness(false), action = h.select('A', kind, `new-${kind}`);
    h.requests[0].resolve({}); await action.pending;
    const query = new URL(h.requests[0].path, 'http://localhost').searchParams;
    assert.equal(query.get(kind), `new-${kind}`);
    if (kind === 'route') { assert.equal(h.offeringChoices.A, undefined); assert.equal(h.applicantChoices.A, undefined); }
    if (kind === 'offering') { assert.equal(h.routeChoices.A, 'old-route'); assert.equal(h.applicantChoices.A, undefined); }
    if (kind === 'applicant') { assert.equal(h.offeringChoices.A, 'old-intake'); assert.equal(h.routeChoices.A, 'old-route'); }
    assert.equal(h.matches.length, 0); assert.deepEqual(h.opens, ['A']); assert.equal(h.focus.at(-1).name, `programme-${kind}`);
    assert.ok(h.controls().every(control => !control.disabled));
  }
});

test('superseded changes to the same programme cannot roll back, toast, render or unlock its newer controls', async () => {
  for (const fail of [false, true]) {
    const h = harness(), old = h.select('A', 'offering', 'first-intake'), current = h.select('A', 'offering', 'latest-intake');
    if (fail) h.requests[0].reject(new Error('Synthetic obsolete failure')); else h.requests[0].resolve({});
    await old.pending;
    assert.equal(h.offeringChoices.A, 'latest-intake'); assert.equal(h.toasts.length, 0); assert.equal(h.renders.length, 0); assert.equal(h.matches.length, 0);
    assert.ok(h.controls().every(control => control.disabled));
    h.requests[1].resolve({}); await h.settle(); h.matches[0].resolve({ items: [{ id: 'LATEST' }] }); await current.pending;
    assert.equal(h.state.matches[0].id, 'LATEST'); assert.equal(h.offeringChoices.A, 'latest-intake');
  }
});

test('a failed newest overlapping change restores the last settled choices, not an older pending selection', async () => {
  const h = harness(), old = h.select('A', 'offering', 'unvalidated-intake'), current = h.select('A', 'offering', 'failing-intake');
  h.requests[1].reject(new Error('Synthetic current failure')); await h.settle();
  assert.equal(h.offeringChoices.A, 'old-intake'); assert.equal(h.applicantChoices.A, 'old-category');
  assert.equal(h.matches[0].payload.selectedOfferings.A, 'old-intake');
  h.matches[0].resolve({ items: [{ id: 'RESTORED' }] }); await current.pending;
  h.requests[0].resolve({}); await old.pending;
  assert.equal(h.offeringChoices.A, 'old-intake'); assert.equal(h.state.matches[0].id, 'RESTORED'); assert.equal(h.toasts.length, 1);
});

test('a late failure for A preserves B choices and recomputes B results instead of restoring a whole old cache', async () => {
  const h = harness(), first = h.select('A', 'offering', 'new-a'), second = h.select('B', 'offering', 'new-b');
  h.requests[1].resolve({}); await h.settle();
  h.matches[0].resolve({ items: [{ id: 'B-WITH-PENDING-A' }] }); await second.pending;
  h.requests[0].reject(new Error('Synthetic late A failure')); await h.settle();
  assert.equal(h.offeringChoices.A, 'old-intake'); assert.equal(h.offeringChoices.B, 'new-b'); assert.equal(h.state.matches, null);
  assert.equal(h.matches.length, 2); assert.equal(h.matches[1].payload.selectedOfferings.A, 'old-intake'); assert.equal(h.matches[1].payload.selectedOfferings.B, 'new-b');
  h.matches[1].resolve({ items: [{ id: 'B-RECHECKED' }] }); await first.pending;
  assert.equal(h.state.matches[0].id, 'B-RECHECKED'); assert.deepEqual(h.opens, ['B']);
});

test('an obsolete matching failure for A cannot undo its validated choice or the newer B results', async () => {
  const h = harness(), first = h.select('A', 'offering', 'new-a'); h.requests[0].resolve({}); await h.settle();
  const second = h.select('B', 'offering', 'new-b'); h.requests[1].resolve({}); await h.settle();
  h.matches[0].reject(new Error('Synthetic obsolete matching error')); await first.pending;
  assert.equal(h.offeringChoices.A, 'new-a'); assert.equal(h.toasts.length, 0);
  h.matches[1].resolve({ items: [{ id: 'CURRENT-BOTH' }] }); await second.pending;
  assert.equal(h.state.matches[0].id, 'CURRENT-BOTH'); assert.equal(h.offeringChoices.B, 'new-b');
});

test('a failed recovery refresh withholds checks and explains retry without restoring old background results', async () => {
  const h = harness(), action = h.select('A', 'offering', 'new-intake');
  h.requests[0].reject(new Error('Synthetic choice validation failure')); await h.settle();
  h.matches[0].reject(new Error('Synthetic recovery network failure')); await action.pending;
  assert.equal(h.state.matches, null); assert.equal(h.state.profile, h.profile); assert.equal(h.offeringChoices.A, 'old-intake');
  assert.match(h.toasts.at(-1), /Matching results are unavailable/); assert.match(h.toasts.at(-1), /submit My background again/);
  assert.equal(h.renders.length, 1);
});

test('clearing the background while a choice request is pending never restores or resubmits that background', async () => {
  for (const fail of [false, true]) {
    const h = harness(), action = h.select('A', 'offering', 'new-intake'); h.background(null);
    if (fail) h.requests[0].reject(new Error('Synthetic choice failure')); else h.requests[0].resolve({});
    await action.pending;
    assert.equal(h.state.profile, null); assert.equal(h.state.matches, null); assert.equal(h.matches.length, 0);
  }
});

test('choice recovery after background replacement checks only the new background', async () => {
  const h = harness(), action = h.select('A', 'offering', 'new-intake'), currentProfile = { major: 'Synthetic replacement' };
  h.background(currentProfile); h.requests[0].reject(new Error('Synthetic choice failure')); await h.settle();
  assert.equal(h.matches[0].payload.profile, currentProfile);
  h.matches[0].resolve({ items: [{ id: 'NEW-BACKGROUND' }] }); await action.pending;
  assert.equal(h.state.profile, currentProfile); assert.equal(h.state.matches[0].id, 'NEW-BACKGROUND');
});

test('closing or reopening the same detail view prevents old completion from reopening or moving focus', async () => {
  for (const reopen of [false, true]) {
    const h = harness(false), action = h.select('A', 'offering', 'new-intake');
    if (reopen) h.show('A'); else h.close();
    h.requests[0].resolve({}); await action.pending;
    assert.equal(h.opens.length, 0); assert.equal(h.focus.length, 0);
  }
});

test('another programme detail request keeps its controls disabled after the older programme completes', async () => {
  const h = harness(false), first = h.select('A', 'offering', 'new-a'), second = h.select('B', 'offering', 'new-b');
  h.requests[0].resolve({}); await first.pending;
  assert.ok(h.controls().every(control => control.disabled)); assert.equal(h.opens.length, 0);
  h.requests[1].resolve({}); await second.pending;
  assert.ok(h.controls().every(control => !control.disabled)); assert.deepEqual(h.opens, ['B']);
});

test('rollback rechecks routes, intakes and applicant categories together and never writes temporary choices to storage', async () => {
  const h = harness(), action = h.select('A', 'route', 'failing-route');
  h.requests[0].reject(new Error('Synthetic route failure')); await h.settle();
  assert.equal(h.routeChoices.A, 'old-route'); assert.equal(h.offeringChoices.A, 'old-intake'); assert.equal(h.applicantChoices.A, 'old-category');
  assert.equal(h.matches[0].payload.selectedRoutes.A, 'old-route'); assert.equal(h.matches[0].payload.selectedApplicants.A, 'old-category');
  h.matches[0].resolve({ items: [] }); await action.pending;
  assert.equal(h.sandbox.requestSequence, 2); assert.equal(Object.keys(h.sandbox.programmeChoiceRequests).length, 0);
});

test('details distinguish missing checks from a missing background and do not display a previous check', () => {
  const renderer = app.slice(app.indexOf('function requirementChecks('), app.indexOf('function detailStatus('));
  for (const profile of [null, { major: 'Synthetic active background' }]) {
    const context = vm.createContext({ state: { profile }, savedOptionIssues: {}, contextMatch: () => null,
      t: key => copy[key] || key, icon: () => '', scopeWarning: () => '' });
    vm.runInContext(renderer, context);
    const html = context.requirementChecks({ id: 'TEST', rules: [] });
    assert.ok(html.includes(profile ? copy.checksUnavailable : copy.profileNeeded));
    assert.equal(html.includes('No earlier matching result is substituted.'), !!profile);
    assert.match(html, /data-view="profile"/); assert.doesNotMatch(html, /Recorded criterion met/);
  }
});

test('discovery persistently explains withheld matching only when a background lacks current results', () => {
  const renderer = app.slice(app.indexOf('function renderDiscover('), app.indexOf('function syncUrl('));
  for (const [profile, matches] of [[null, null], [{ major: 'Synthetic active background' }, null], [{ major: 'Synthetic active background' }, []]]) {
    const inserts = [], page = { innerHTML: '' }, results = { insertAdjacentHTML: (_position, html) => inserts.push(html) };
    const context = vm.createContext({
      state: { meta: { quality: {}, universities: [], areas: [] }, profile, matches },
      $: selector => selector === '#page' ? page : results, t: key => copy[key] || key,
      metrics: () => '', options: () => '', filterField: () => '', notice: () => '', icon: () => '', esc: value => value || '', loadCatalogue: () => {}
    });
    vm.runInContext(renderer, context); context.renderDiscover();
    assert.equal(inserts.some(html => html.includes(copy.checksUnavailable)), !!profile && matches === null);
  }
});
