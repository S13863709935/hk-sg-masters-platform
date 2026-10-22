import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { copy } from '../public/copy.js';

// Actual startup and matching guards with synthetic data and controlled replies.
// No remembered student profile, browser storage or external network is used.
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const startup = app.slice(app.indexOf('async function boot()'), app.lastIndexOf('boot();'));
const matching = app.slice(app.indexOf('function changeBackground('), app.indexOf('async function retryMatching('));
const helpers = ['matchingPayload', 'choiceContext'].map(name => app.match(new RegExp(`^const ${name} = .*`, 'm'))[0]).join('\n');
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = () => new Promise(resolve => setImmediate(resolve));

function harness({ profile = { major: 'Synthetic remembered background', language: { type: 'none' } }, hash = '#discover', search = '', metaFailure, optionsFailure, storedRejected = false, storageWorks = true } = {}) {
  const state = { profile, matches: null, view: 'discover', q: 'Synthetic keyword', shortlist: ['SG-TEST-P001'], compare: ['SG-TEST-P001'] };
  const events = [], requests = [], writes = [], toasts = [], views = [], details = [];
  const root = { innerHTML: '' }, listeners = {}, options = deferred(); let holdOptions = false;
  const sandbox = {
    state, backgroundVersion: 0, matchRequestSequence: 0, routeChoices: {}, offeringChoices: {}, applicantChoices: {},
    location: { hash }, params: new URLSearchParams(search), remembered: { rejected: storedRejected }, keys: { profile: 'synthetic-profile' },
    $: selector => selector === '#app' ? root : selector === '#boot-retry' ? { addEventListener: (name, handler) => { listeners[name] = handler; } } : null,
    t: key => copy[key] || key, toast: message => toasts.push(message),
    api: async path => { assert.equal(path, '/api/meta'); events.push('meta'); if (metaFailure) throw metaFailure; return { synthetic: true }; },
    restoreRememberedOptions: async () => { events.push('restore-options'); if (holdOptions) await options.promise; if (optionsFailure) throw optionsFailure; },
    post: (path, payload) => { assert.equal(path, '/api/matches'); events.push('matches'); const request = { payload, ...deferred() }; requests.push(request); return request.promise; },
    changeBackground: undefined,
    writeStorage: (key, value) => { writes.push({ key, value }); return storageWorks; },
    shell: () => { events.push('shell'); }, renderView: async () => { views.push({ view: state.view, profile: state.profile, matches: state.matches }); },
    openDetail: async id => { details.push(id); }
  };
  const context = vm.createContext(sandbox); vm.runInContext(helpers + '\n' + matching + '\n' + startup, context);
  return { state, profile, requests, events, writes, toasts, views, details, root, listeners, sandbox,
    boot: () => context.boot(), change: value => context.changeBackground(value), holdOptions: () => { holdOptions = true; }, releaseOptions: () => options.resolve()
  };
}

test('a transient startup matching failure retains the background and opens the requested view without a fatal screen', async () => {
  for (const status of [undefined, 500, 503]) {
    const h = harness({ hash: '#profile' }), pending = h.boot(); await flush();
    h.requests[0].reject(Object.assign(new Error('Synthetic temporary failure'), { status })); await pending;
    assert.equal(h.root.innerHTML, ''); assert.deepEqual(h.events, ['meta', 'restore-options', 'matches', 'shell']);
    assert.equal(h.state.profile, h.profile); assert.equal(h.state.matches, null); assert.equal(h.state.view, 'profile');
    assert.equal(h.views.length, 1); assert.equal(h.writes.length, 0); assert.ok(h.toasts.includes(copy.startupChecksUnavailable));
  }
});

test('a failed startup refresh discards any stale match cache without changing saved lists or choices', async () => {
  const h = harness(), old = [{ id: 'obsolete-check' }], shortlist = h.state.shortlist, compare = h.state.compare;
  h.state.matches = old; h.sandbox.routeChoices.TEST = 'synthetic-route';
  const pending = h.boot(); await flush(); h.requests[0].reject(new Error('Synthetic failure')); await pending;
  assert.equal(h.state.matches, null); assert.equal(h.views[0].matches, null); assert.equal(h.state.shortlist, shortlist); assert.equal(h.state.compare, compare);
  assert.equal(h.sandbox.routeChoices.TEST, 'synthetic-route'); assert.equal(h.writes.length, 0);
});

test('successful remembered-background startup restores choices first and uses only fresh checks', async () => {
  const h = harness(); h.holdOptions(); const pending = h.boot(); await flush();
  assert.equal(h.requests.length, 0); h.sandbox.offeringChoices.TEST = 'synthetic-intake'; h.releaseOptions(); await flush();
  assert.equal(h.requests[0].payload.selectedOfferings.TEST, 'synthetic-intake');
  h.requests[0].resolve({ items: [{ id: 'fresh-check' }] }); await pending;
  assert.equal(h.views[0].matches[0].id, 'fresh-check'); assert.equal(h.views[0].profile, h.profile);
  assert.equal(h.writes.length, 0); assert.deepEqual(h.toasts, []);
});

test('no remembered background means no automatic matching request or background write', async () => {
  const h = harness({ profile: null }); await h.boot();
  assert.equal(h.requests.length, 0); assert.equal(h.views.length, 1); assert.equal(h.writes.length, 0); assert.deepEqual(h.toasts, []);
});

test('a 422 profile rejection still follows the existing reset path rather than retrying invalid input', async () => {
  const h = harness(), pending = h.boot(); await flush();
  h.requests[0].reject(Object.assign(new Error('Synthetic invalid background'), { status: 422 })); await pending;
  assert.equal(h.state.profile, null); assert.equal(h.state.matches, null); assert.equal(h.views.length, 1);
  assert.deepEqual(h.writes, [{ key: 'synthetic-profile', value: null }]); assert.equal(h.toasts.includes(copy.startupChecksUnavailable), false);
});

test('essential metadata and choice-restoration failures remain fatal rather than assuming baseline choices', async () => {
  for (const failure of [{ metaFailure: new Error('Synthetic metadata failure') }, { optionsFailure: new Error('Synthetic choice service failure') }]) {
    const h = harness(failure); await h.boot();
    assert.match(h.root.innerHTML, /boot-retry/); assert.equal(typeof h.listeners.click, 'function');
    assert.equal(h.views.length, 0); assert.equal(h.requests.length, 0); assert.equal(h.writes.length, 0); assert.equal(h.state.profile, h.profile);
  }
});

test('unverified saved choices get a specific safe retry prompt without exposing backend details', async () => {
  const h = harness({ optionsFailure: Object.assign(new Error('<script>Synthetic private backend message</script>'), { code: 'SAVED_CHOICES_UNVERIFIED' }) });
  await h.boot();
  assert.ok(h.root.innerHTML.includes(copy.savedChoicesRecoveryHeading)); assert.ok(h.root.innerHTML.includes(copy.savedChoicesRecoveryHint));
  assert.equal(h.root.innerHTML.includes('Synthetic private'), false); assert.equal(h.requests.length, 0); assert.equal(h.writes.length, 0); assert.equal(h.state.profile, h.profile);
  assert.equal(typeof h.listeners.click, 'function');
});

test('deep links and valid startup views remain available after a temporary matching failure', async () => {
  for (const hash of ['#discover', '#shortlist', '#compare', '#data', '#guide', '#unrecognised']) {
    const h = harness({ hash, search: 'programme=SG-TEST-P001' }), pending = h.boot(); await flush();
    h.requests[0].reject(new Error('Synthetic matching outage')); await pending;
    assert.equal(h.views[0].view, hash === '#unrecognised' ? 'discover' : hash.slice(1));
    assert.deepEqual(h.details, ['SG-TEST-P001']); assert.equal(h.root.innerHTML, '');
  }
});

test('a superseded startup matching failure does not erase a newer background or its checks', async () => {
  const h = harness(), pending = h.boot(); await flush();
  const newer = { major: 'Synthetic new background' }; h.change(newer); const fresh = [{ id: 'new-background-check' }]; h.state.matches = fresh;
  h.requests[0].reject(new Error('Synthetic obsolete failure')); await pending;
  assert.equal(h.state.profile, newer); assert.equal(h.state.matches, fresh); assert.equal(h.views[0].matches, fresh); assert.deepEqual(h.toasts, []);
});

test('a soft startup failure preserves the separate stored-choice warning', async () => {
  const h = harness({ storedRejected: true }), pending = h.boot(); await flush();
  h.requests[0].reject(new Error('Synthetic matching outage')); await pending;
  assert.equal(h.root.innerHTML, ''); assert.equal(h.toasts.some(message => /stored programme choices/.test(message)), true);
  assert.equal(h.toasts.length, 1); assert.equal(h.toasts[0].includes(copy.startupChecksUnavailable), true);
});
