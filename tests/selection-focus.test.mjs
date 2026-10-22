import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const helper = source.slice(source.indexOf('function selectionFocus('), source.indexOf('function savedViewError('));
const listener = source.slice(source.indexOf("document.addEventListener('click'"), source.indexOf("document.addEventListener('input'"));

// Synthetic DOM with explicit detach/focus transitions; no browser storage or
// student background is read or written by these tests.
function harness(view = 'shortlist', inTray = false) {
  const focus = [], nodes = new Map(), listeners = {};
  const document = { body: {}, activeElement: null, addEventListener: (name, fn) => { listeners[name] = fn; }, querySelectorAll: () => [] };
  const state = { view, shortlist: ['A', 'B', 'C'], compare: ['A', 'B', 'C'] };
  const control = (id, action = inTray || view === 'compare' ? 'compare' : 'save') => ({ id, dataset: { id, action }, isConnected: true, disabled: false,
    focus() { document.activeElement = this; focus.push(id); }
  });
  const root = () => ({ isConnected: true, controls: [], fallback: null,
    contains(node) { return this.controls.includes(node); },
    querySelectorAll(selector) { return this.controls.filter(node => selector === `[data-action="${node.dataset.action}"]`); },
    querySelector(selector) { assert.equal(selector, '.empty-state [data-action]'); return this.fallback; }
  });
  const page = root(), tray = root(), main = control('main', 'main');
  nodes.set('#page', page); nodes.set('#tray-wrapper', tray); nodes.set('#main', main); nodes.set('#detail-dialog', { open: false });
  const activeRoot = inTray ? tray : page;
  activeRoot.controls = ['A', 'B', 'C'].map(id => control(id));
  document.activeElement = activeRoot.controls[0];
  const replace = (ids, fallback = null) => {
    for (const old of activeRoot.controls) { old.isConnected = false; if (document.activeElement === old) document.activeElement = document.body; }
    activeRoot.controls = ids.map(id => control(id)); activeRoot.fallback = fallback;
  };
  let storage = true, writes = 0;
  const context = vm.createContext({
    state, document, $: selector => nodes.get(selector) || null,
    keys: { shortlist: 'shortlist', compare: 'compare' },
    writeStorage: () => { writes++; return storage; },
    pruneRememberedOptions: () => {}, toast: () => {}, t: key => key,
    updateSavedButtons: () => {}, refreshRememberPanel: () => {},
    updateTray: () => { if (inTray) replace(state.compare); },
    renderShortlist: async ({ restoreFocus }) => { replace(state.shortlist, control('explore', 'nav')); restoreFocus(); },
    renderCompare: async ({ restoreFocus }) => { if (!inTray) replace(state.compare.length >= 2 ? state.compare : [], control('explore', 'nav')); restoreFocus(); }
  });
  vm.runInContext(helper + '\n' + listener, context);
  return { state, document, nodes, page, tray, main, root: activeRoot, focus, control, replace,
    capture: trigger => context.selectionFocus(trigger),
    click: trigger => listeners.click({ target: { closest: () => trigger } }),
    storageFailure: () => { storage = false; }, writes: () => writes
  };
}

test('removing first, middle or final saved/table control focuses the next position or previous final position', () => {
  for (const view of ['shortlist', 'compare']) for (const index of [0, 1, 2]) {
    const h = harness(view), trigger = h.root.controls[index]; h.document.activeElement = trigger;
    const restore = h.capture(trigger), ids = ['A', 'B', 'C'].filter(id => id !== trigger.id);
    h.replace(ids); restore();
    assert.equal(h.document.activeElement.id, index === 0 ? 'B' : index === 1 ? 'C' : 'B');
    assert.equal(h.focus.length, 1);
  }
});

test('empty saved pages focus their recovery action, including a failed-load retry', () => {
  for (const id of ['explore', 'retry']) {
    const h = harness(), restore = h.capture(h.root.controls[0]), fallback = h.control(id, id === 'retry' ? 'rerender' : 'nav');
    h.replace([], fallback); restore(); assert.equal(h.document.activeElement, fallback);
  }
});

test('tray removals focus the next chip immediately and do not restore a second time', () => {
  const h = harness('discover', true), restore = h.capture(h.root.controls[0]);
  h.replace(['B', 'C']); restore(); assert.equal(h.document.activeElement.id, 'B');
  h.document.activeElement = h.document.body; restore(); assert.equal(h.focus.length, 1);
});

test('clearing the tray or removing its last chip falls back to the stable main content', () => {
  for (const clear of [false, true]) {
    const h = harness('discover', true);
    const trigger = clear ? h.control('clear', 'clearCompare') : h.root.controls[0];
    if (clear) h.root.controls.push(trigger);
    h.document.activeElement = trigger;
    const restore = h.capture(trigger); h.replace([]); restore(); assert.equal(h.document.activeElement, h.main);
  }
});

test('focus recovery skips disabled controls', () => {
  const h = harness(), restore = h.capture(h.root.controls[0]);
  h.replace(['B', 'C']); h.root.controls[0].disabled = true; restore(); assert.equal(h.document.activeElement.id, 'C');
});

test('an unfocused or still-connected initiating control does not move focus', () => {
  for (const unfocused of [false, true]) {
    const h = harness(), trigger = h.root.controls[0];
    if (unfocused) h.document.activeElement = h.main;
    const restore = h.capture(trigger);
    if (unfocused) h.replace(['B']);
    restore(); assert.equal(h.focus.length, 0);
  }
});

test('user-selected focus and an open detail dialog suppress delayed restoration', () => {
  for (const dialog of [false, true]) {
    const h = harness(), restore = h.capture(h.root.controls[0]); h.replace(['B']);
    if (dialog) h.nodes.get('#detail-dialog').open = true; else h.document.activeElement = h.main;
    restore(); assert.equal(h.focus.length, 0);
  }
});

test('leaving the view, replacing its page or detaching its root suppresses old focus callbacks', () => {
  for (const change of ['view', 'page', 'root']) {
    const h = harness(), restore = h.capture(h.root.controls[0]); h.replace(['B']);
    if (change === 'view') h.state.view = 'profile';
    if (change === 'page') h.nodes.set('#page', {});
    if (change === 'root') h.root.isConnected = false;
    restore(); assert.equal(h.focus.length, 0);
  }
});

test('actual save and compare removal handlers pass focus recovery through their list redraws', async () => {
  for (const view of ['shortlist', 'compare']) {
    const h = harness(view); await h.click(h.root.controls[0]);
    assert.equal(h.document.activeElement.id, 'B'); assert.equal(h.state[view].includes('A'), false); assert.equal(h.writes(), 1);
  }
});

test('actual tray remove/clear handlers restore focus before comparison redraws', async () => {
  for (const clear of [false, true]) {
    const h = harness('compare', true);
    const trigger = clear ? h.control('clear', 'clearCompare') : h.root.controls[0];
    if (clear) h.root.controls.push(trigger);
    h.document.activeElement = trigger; await h.click(trigger);
    assert.equal(h.document.activeElement.id, clear ? 'main' : 'B'); assert.equal(h.focus.length, 1);
  }
});

test('storage failures keep lists, initiating focus and the existing DOM unchanged', async () => {
  for (const view of ['shortlist', 'compare']) {
    const h = harness(view), trigger = h.root.controls[0], before = h.state[view]; h.storageFailure();
    await h.click(trigger);
    assert.equal(h.state[view], before); assert.equal(h.document.activeElement, trigger); assert.equal(trigger.isConnected, true); assert.equal(h.focus.length, 0);
  }
});

test('comparison removal buttons have programme-specific accessible names', () => {
  assert.match(source, /aria-label="Remove \$\{esc\(p\.name\)\} from comparison"/);
});
