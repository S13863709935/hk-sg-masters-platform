import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { copy } from '../public/copy.js';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const navigation = app.slice(app.indexOf('function showView('), app.indexOf('function updateSavedButtons('));
const hashListener = app.slice(app.indexOf("window.addEventListener('hashchange'"), app.indexOf('async function boot('));
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };

function harness(hash = '#discover') {
  const state = { view: hash.slice(1) }, events = [], pending = [], listeners = {};
  let main = { focus: options => events.push({ type: 'focus', main: 0, options }) }, shells = 0;
  const location = { hash };
  const context = vm.createContext({
    state, location,
    window: { scrollTo: options => events.push({ type: 'scroll', options }), addEventListener: (name, fn) => { listeners[name] = fn; } },
    $: selector => { assert.equal(selector, '#main'); return main; },
    closeDetail: () => events.push({ type: 'closeDetail' }),
    shell: () => { const id = ++shells; main = { focus: options => events.push({ type: 'focus', main: id, options }) }; events.push({ type: 'shell', id }); },
    renderView: () => { const request = deferred(); pending.push(request); events.push({ type: 'render', view: state.view }); return request.promise; }
  });
  vm.runInContext(navigation + '\n' + hashListener, context);
  return { state, events, pending, location, show: () => context.showView(), navigate: view => context.navigate(view), hash: value => { location.hash = value; listeners.hashchange(); }, removeMain: () => { main = null; } };
}

test('navigation focuses the newly rendered main content once without waiting for network data', () => {
  const h = harness(); h.show();
  assert.deepEqual(h.events.map(e => e.type), ['shell', 'render', 'scroll', 'focus']);
  const focus = h.events.at(-1);
  assert.equal(focus.main, 1); assert.equal(focus.options.preventScroll, true); assert.equal(h.pending.length, 1);
});

test('selecting the current page closes details and uses the same focus transition', () => {
  const h = harness('#profile'); h.navigate('profile');
  assert.deepEqual(h.events.map(e => e.type), ['closeDetail', 'shell', 'render', 'scroll', 'focus']);
  assert.equal(h.state.view, 'profile');
});

test('a different page waits for its hash transition rather than rendering twice', () => {
  const h = harness(); h.navigate('profile');
  assert.equal(h.location.hash, 'profile'); assert.deepEqual(h.events.map(e => e.type), ['closeDetail']);
  h.hash('#profile'); assert.equal(h.state.view, 'profile');
  assert.equal(h.events.filter(e => e.type === 'shell').length, 1);
  assert.equal(h.events.at(-1).type, 'focus');
});

test('all supported hash destinations focus their new main content', () => {
  for (const view of ['discover', 'profile', 'shortlist', 'compare', 'data', 'guide']) {
    const h = harness(); h.hash('#' + view);
    assert.equal(h.state.view, view); assert.equal(h.events.at(-1).type, 'focus');
  }
});

test('Skip to content preserves the current page and unsaved form rather than rebuilding it', () => {
  const h = harness('#profile'); h.hash('#main');
  assert.equal(h.state.view, 'profile'); assert.equal(h.pending.length, 0);
  assert.deepEqual(h.events.map(e => e.type), ['focus']); assert.equal(h.events[0].main, 0);
});

test('unknown hashes fall back to discovery with a single content focus', () => {
  const h = harness('#profile'); h.hash('#unknown');
  assert.equal(h.state.view, 'discover'); assert.equal(h.events.filter(e => e.type === 'focus').length, 1);
});

test('late saved-page completions do not move focus again after a newer navigation', async () => {
  const h = harness(); h.hash('#shortlist'); h.hash('#profile');
  const before = h.events.length;
  h.pending[1].resolve(); await h.pending[1].promise;
  h.pending[0].resolve(); await h.pending[0].promise;
  assert.equal(h.events.length, before); assert.equal(h.events.at(-1).main, 2);
});

test('the skip-link handler tolerates absent main content during initial loading', () => {
  const h = harness(); h.removeMain(); assert.doesNotThrow(() => h.hash('#main'));
  assert.equal(h.pending.length, 0);
});

test('the actual comparison renderer provides a named keyboard-scroll region and table headers', async () => {
  const page = { innerHTML: '' }, result = { innerHTML: '', setAttribute() {} };
  const esc = value => String(value ?? '');
  const items = ['A', 'B'].map(id => ({ id, name: 'Synthetic ' + id, university: { abbreviation: 'TEST', nameEn: 'Synthetic university' }, offerings: [], rules: [] }));
  const context = vm.createContext({
    state: { compare: ['A', 'B'] }, $: selector => selector === '#page' ? page : result,
    heading: () => '', empty: () => '', t: key => copy[key] || key, esc,
    selectedProgrammes: async () => items, currentSavedView: () => true,
    unavailableCard: () => '', savedOptionWarning: () => '', savedOptionIssues: {},
    schoolName: u => u.nameEn, areaName: esc, known: esc, offeringLabel: () => '', offeringCaution: '',
    fees: () => '', deadlineText: () => '', applicationSummary: () => '', applicationFees: () => '',
    badge: esc, ruleText: () => '', contextMatch: () => null, sourceTarget: () => '', scopeWarning: () => '',
    savedViewError: () => assert.fail('comparison rendering unexpectedly failed')
  });
  vm.runInContext(app.slice(app.indexOf('async function renderCompare('), app.indexOf('function renderData(')), context);
  await context.renderCompare();
  assert.match(result.innerHTML, /role="region" aria-label="Programme comparison table" aria-describedby="compare-scroll-hint" tabindex="0"/);
  assert.match(result.innerHTML, /id="compare-scroll-hint"/); assert.match(result.innerHTML, /left\/right arrow keys/);
  assert.equal((result.innerHTML.match(/scope="col"/g) || []).length, 3);
  assert.ok((result.innerHTML.match(/scope="row"/g) || []).length > 10);
  assert.equal(/\p{Script=Han}/u.test(result.innerHTML), false);
});

test('text wrapping retains visible close controls and an explicit scroll-region focus indicator', () => {
  const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.table-wrap:focus-visible\{outline:3px solid #9bbca9;outline-offset:3px\}/);
  assert.match(css, /\.detail-head>\[data-action=closeDetail\],\.profile-strip>\.button\{flex-shrink:0\}/);
  assert.match(css, /\.profile-strip p\{min-width:0;overflow-wrap:anywhere\}/);
  assert.match(css, /\.check-row>div,\.detail-note\{overflow-wrap:anywhere\}/);
});
