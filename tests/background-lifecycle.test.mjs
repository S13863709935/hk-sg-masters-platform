import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { copy } from '../public/copy.js';

// Run the actual browser lifecycle with synthetic form data and controlled replies.
// No user grades or profiles are written to a browser, server, log or test artifact.
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const lifecycle = app.slice(app.indexOf('function changeBackground('), app.indexOf('function ruleText('));
const feedback = app.slice(app.indexOf('function profileFieldIssue('), app.indexOf('function validateForm('));
const contextMatch = app.match(/const contextMatch = [^\r\n]+/)[0];
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const baseValues = major => [['major', major], ['degreeStatus', 'graduated'], ['classification', 'unknown'], ['gpa', ''], ['gpaScale', ''], ['experienceYears', ''], ['languageType', 'none']];

function harness() {
  const state = { view: 'profile', profile: null, matches: null, matchFilter: 'needs_confirmation', page: 7 };
  const requests = [], writes = [], toasts = [], navigation = [], issues = {};
  const nodes = new Map(); let storageWorks = true, profileRenders = 0;
  const form = (major = 'Synthetic Computing') => {
    const previous = nodes.get('#profile-form'); if (previous) previous.isConnected = false;
    const button = { disabled: false }, error = { hidden: true, textContent: '', scrolls: 0, scrollIntoView() { this.scrolls++; } };
    const fields = new Map();
    const field = name => {
      if (!fields.has(name)) fields.set(name, { name, attributes: {}, focused: false, scrolls: 0,
        setAttribute(key, value) { this.attributes[key] = value; }, removeAttribute(key) { delete this.attributes[key]; }, getAttribute(key) { return this.attributes[key] ?? null; },
        focus() { this.focused = true; }, scrollIntoView(options) { assert.equal(options.behavior, 'auto'); this.scrolls++; }
      });
      return fields.get(name);
    };
    const result = { isConnected: true, values: new Map(baseValues(major)), button, invalid: false,
      querySelector: selector => { assert.equal(selector, 'button[type=submit]'); return button; },
      querySelectorAll: selector => { assert.equal(selector, '[data-profile-invalid]'); return [...fields.values()].filter(field => field.attributes['data-profile-invalid']); },
      elements: { namedItem: field }
    };
    nodes.set('#profile-form', result); nodes.set('#form-error', error); return result;
  };
  class SyntheticFormData {
    constructor(form) { this.values = new Map(form.values); }
    get(key) { return this.values.get(key) ?? null; }
    has(key) { return this.values.has(key); }
    entries() { return this.values.entries(); }
  }
  form();
  const sandbox = {
    state, FormData: SyntheticFormData, $: selector => nodes.get(selector) || null,
    keys: { profile: 'synthetic-profile-key' }, savedOptionIssues: issues,
    t: key => copy[key] || key, toast: value => toasts.push(value),
    writeStorage: (key, value) => { writes.push({ key, value }); return storageWorks; },
    renderProfile: () => { profileRenders++; form(''); },
    navigate: view => { navigation.push(view); state.view = view; },
    validateForm: form => { if (form.invalid) throw new Error('Synthetic invalid background'); },
    choices: { routes: {}, offerings: {}, applicants: {} },
    matchingPayload: profile => ({ profile, selectedRoutes: {}, selectedOfferings: {}, selectedApplicants: {} }),
    post: (path, payload) => { assert.equal(path, '/api/matches'); const request = { payload, ...deferred() }; requests.push(request); return request.promise; }
  };
  const context = vm.createContext(sandbox);
  vm.runInContext('let backgroundVersion = 0, matchRequestSequence = 0;\nconst choiceContext = () => JSON.stringify(choices);\n' + contextMatch + '\n' + feedback + '\n' + lifecycle, context);
  return {
    state, requests, writes, toasts, navigation, issues, choices: sandbox.choices,
    form: () => nodes.get('#profile-form'), error: () => nodes.get('#form-error'), replace: form,
    leave: view => { state.view = view; const current = nodes.get('#profile-form'); if (current) current.isConnected = false; nodes.clear(); },
    edit: (key, value) => value === null ? nodes.get('#profile-form').values.delete(key) : nodes.get('#profile-form').values.set(key, value),
    submit: target => context.submitProfile({ preventDefault() {}, target: target || nodes.get('#profile-form') }),
    clear: () => context.clearBackground(), change: profile => context.changeBackground(profile), refresh: () => context.refreshMatches(),
    match: p => vm.runInContext('contextMatch', context)(p), failStorage: () => { storageWorks = false; }, renders: () => profileRenders
  };
}

test('an unchanged current form applies results for this session without silently remembering data', async () => {
  const h = harness(), form = h.form(), pending = h.submit();
  assert.equal(form.button.disabled, true); assert.equal(h.writes.length, 0);
  h.requests[0].resolve({ items: [{ id: 'synthetic-result' }] }); await pending;
  assert.equal(h.state.profile.major, 'Synthetic Computing'); assert.equal(h.state.matches[0].id, 'synthetic-result');
  assert.equal(h.writes.length, 1); assert.equal(h.writes[0].value, null);
  assert.deepEqual(h.navigation, ['discover']); assert.equal(h.state.page, 1); assert.equal(form.button.disabled, false);
});

test('remembering requires an unchanged explicit checkbox and a successful response', async () => {
  const h = harness(); h.edit('remember', 'on'); const pending = h.submit();
  assert.equal(h.writes.length, 0); h.requests[0].resolve({ items: [] }); await pending;
  assert.equal(h.writes.length, 1); assert.equal(h.writes[0].value, h.state.profile);
});

test('clearing during a submission invalidates both late success and failure without restoring data', async () => {
  for (const fail of [false, true]) {
    const h = harness(); h.edit('remember', 'on'); const pending = h.submit(); h.clear();
    const currentError = h.error();
    if (fail) h.requests[0].reject(new Error('Synthetic old failure')); else h.requests[0].resolve({ items: [{ id: 'old-match' }] });
    await pending;
    assert.equal(h.state.profile, null); assert.equal(h.state.matches, null); assert.equal(h.state.matchFilter, '');
    assert.deepEqual(h.writes.map(w => w.value), [null]); assert.equal(h.navigation.length, 0);
    assert.equal(currentError.hidden, true); assert.equal(currentError.textContent, '');
  }
});

test('leaving the form suppresses pending result/error, persistence and forced navigation', async () => {
  for (const fail of [false, true]) {
    const h = harness(), pending = h.submit(); h.leave('data');
    if (fail) h.requests[0].reject(new Error('Synthetic obsolete error')); else h.requests[0].resolve({ items: [] });
    await pending;
    assert.equal(h.state.view, 'data'); assert.equal(h.state.profile, null); assert.equal(h.writes.length, 0);
    assert.equal(h.navigation.length, 0); assert.equal(h.toasts.length, 0);
  }
});

test('a newer form result wins over an older form success or error', async () => {
  for (const fail of [false, true]) {
    const h = harness(), first = h.submit(); h.replace('Synthetic New Discipline'); const newer = h.submit();
    h.requests[1].resolve({ items: [{ id: 'new-match' }] }); await newer;
    if (fail) h.requests[0].reject(new Error('Synthetic old form error')); else h.requests[0].resolve({ items: [{ id: 'old-match' }] });
    await first;
    assert.equal(h.state.profile.major, 'Synthetic New Discipline'); assert.equal(h.state.matches[0].id, 'new-match');
    assert.equal(h.writes.length, 1); assert.equal(h.navigation.length, 1);
  }
});

test('editing a pending form requires resubmission and cannot apply the previous values', async () => {
  const h = harness(), first = h.submit(); h.edit('major', 'Synthetic Edited Discipline');
  h.requests[0].resolve({ items: [{ id: 'old-match' }] }); await first;
  assert.equal(h.state.profile, null); assert.equal(h.writes.length, 0); assert.equal(h.navigation.length, 0);
  assert.match(h.error().textContent, /changed while loading/); assert.equal(h.form().button.disabled, false);
  const retry = h.submit(); h.requests[1].resolve({ items: [{ id: 'new-match' }] }); await retry;
  assert.equal(h.state.profile.major, 'Synthetic Edited Discipline'); assert.equal(h.state.matches[0].id, 'new-match');
});

test('changing the save preference while loading cannot persist the old checkbox decision', async () => {
  const h = harness(); h.edit('remember', 'on'); const first = h.submit(); h.edit('remember', null);
  h.requests[0].resolve({ items: [] }); await first;
  assert.equal(h.writes.length, 0); assert.match(h.error().textContent, /save preference or programme choices changed/);
  const retry = h.submit(); h.requests[1].resolve({ items: [] }); await retry;
  assert.equal(h.writes.length, 1); assert.equal(h.writes[0].value, null);
});

test('local validation errors do not send a request or change the active background', async () => {
  const h = harness(), original = { major: 'Synthetic Existing Background' }; h.change(original); h.form().invalid = true;
  await h.submit();
  assert.equal(h.requests.length, 0); assert.equal(h.state.profile, original); assert.equal(h.writes.length, 0);
  assert.equal(h.error().hidden, false); assert.equal(h.form().button.disabled, false);
});

for (const { major, gpa, scale, field } of [
  { major: '   ', gpa: '', scale: '', field: 'major' },
  { major: 'Synthetic Computing', gpa: '3.5', scale: '', field: 'gpaScale' },
  { major: 'Synthetic Computing', gpa: '', scale: '4', field: 'gpa' },
  { major: 'Synthetic Computing', gpa: '4.1', scale: '4', field: 'gpa' }
]) test(`profile preflight targets ${field} for synthetic values ${JSON.stringify([major, gpa, scale])} without applying them`, async () => {
  const h = harness(), original = { major: 'Synthetic Existing Background' }, matches = [{ id: 'existing-match' }];
  h.change(original); h.state.matches = matches; h.edit('major', major); h.edit('gpa', gpa); h.edit('gpaScale', scale); h.edit('remember', 'on');
  await h.submit();
  assert.equal(h.requests.length, 0); assert.equal(h.writes.length, 0); assert.equal(h.navigation.length, 0);
  assert.equal(h.state.profile, original); assert.equal(h.state.matches, matches); assert.equal(h.form().button.disabled, false);
  const input = h.form().elements.namedItem(field);
  assert.equal(input.getAttribute('aria-invalid'), 'true'); assert.equal(input.getAttribute('aria-describedby'), 'form-error');
  assert.equal(input.focused, true); assert.equal(input.scrolls, 1); assert.equal(h.error().scrolls, 0);
  assert.equal(h.error().hidden, false); assert.match(h.error().textContent, /[A-Za-z]/);
});

test('correcting GPA fields clears old feedback but preserves hints before a fresh request', async () => {
  const h = harness(), scale = h.form().elements.namedItem('gpaScale'); scale.setAttribute('aria-describedby', 'scale-hint');
  h.edit('gpa', '3.5'); await h.submit();
  assert.equal(scale.getAttribute('aria-describedby'), 'scale-hint form-error');
  h.edit('gpaScale', '4'); const pending = h.submit();
  assert.equal(h.requests.length, 1); assert.equal(h.error().hidden, true); assert.equal(h.error().textContent, '');
  assert.equal(scale.getAttribute('aria-invalid'), null); assert.equal(scale.getAttribute('data-profile-invalid'), null);
  assert.equal(scale.getAttribute('aria-describedby'), 'scale-hint'); assert.equal(h.state.profile, null); assert.equal(h.writes.length, 0);
  assert.equal(h.requests[0].payload.profile.gpa, 3.5); assert.equal(h.requests[0].payload.profile.gpaScale, 4);
  h.requests[0].resolve({ items: [] }); await pending;
  assert.equal(h.state.profile.gpa, 3.5); assert.deepEqual(h.navigation, ['discover']);
});

test('zero GPA is submitted unchanged rather than treated as missing', async () => {
  const h = harness(); h.edit('gpa', '0'); h.edit('gpaScale', '4'); const pending = h.submit();
  assert.equal(h.requests.length, 1); assert.equal(h.requests[0].payload.profile.gpa, 0);
  h.requests[0].resolve({ items: [] }); await pending;
  assert.equal(h.state.profile.gpa, 0); assert.equal(h.error().hidden, true);
});

test('a current server error stays on its form without replacing an already active background', async () => {
  const h = harness(), original = { major: 'Synthetic Existing Background' }; h.change(original); h.state.matches = [{ id: 'existing-match' }];
  const pending = h.submit(); h.requests[0].reject(new Error('Synthetic current validation error')); await pending;
  assert.equal(h.state.profile, original); assert.equal(h.state.matches[0].id, 'existing-match'); assert.equal(h.writes.length, 0);
  assert.equal(h.error().textContent, 'Synthetic current validation error'); assert.equal(h.error().scrolls, 1);
});

test('clearing also invalidates pending background refresh success and failure', async () => {
  for (const fail of [false, true]) {
    const h = harness(); h.change({ major: 'Synthetic Existing Background' }); const pending = h.refresh(); h.clear();
    if (fail) h.requests[0].reject(new Error('Synthetic old refresh error')); else h.requests[0].resolve({ items: [{ id: 'old-match' }] });
    assert.equal(await pending, false); assert.equal(h.state.profile, null); assert.equal(h.state.matches, null);
  }
});

test('a refresh from the previous background cannot overwrite the new background results', async () => {
  for (const fail of [false, true]) {
    const h = harness(); h.change({ major: 'Synthetic First Background' }); const first = h.refresh();
    const current = { major: 'Synthetic New Background' }; h.change(current); const newer = h.refresh();
    h.requests[1].resolve({ items: [{ id: 'new-match' }] }); assert.equal(await newer, true);
    if (fail) h.requests[0].reject(new Error('Synthetic previous background')); else h.requests[0].resolve({ items: [{ id: 'old-match' }] });
    assert.equal(await first, false); assert.equal(h.state.profile, current); assert.equal(h.state.matches[0].id, 'new-match');
  }
});

test('only the latest refresh for an unchanged background may replace its results', async () => {
  const h = harness(); h.change({ major: 'Synthetic Existing Background' });
  const first = h.refresh(), newer = h.refresh();
  h.requests[1].resolve({ items: [{ id: 'latest-match' }] }); await newer;
  h.requests[0].resolve({ items: [{ id: 'older-match' }] }); assert.equal(await first, false);
  assert.equal(h.state.matches[0].id, 'latest-match');
});

test('a current refresh failure still reports the error without deleting its background', async () => {
  const h = harness(), original = { major: 'Synthetic Existing Background' }; h.change(original);
  const pending = h.refresh(); h.requests[0].reject(new Error('Synthetic current refresh failure'));
  await assert.rejects(pending, /Synthetic current refresh failure/); assert.equal(h.state.profile, original);
});

test('failed browser-storage removal never claims persistent background data is gone', () => {
  const h = harness(); h.change({ major: 'Synthetic Existing Background' }); h.failStorage(); h.clear();
  assert.equal(h.state.profile, null); assert.equal(h.state.matches, null);
  assert.match(h.toasts.at(-1), /cleared for this session/); assert.match(h.toasts.at(-1), /previously saved background data may remain/);
  assert.notEqual(h.toasts.at(-1), copy.profileCleared); assert.equal(h.renders(), 1);
});

test('failed browser storage during apply is reported without pretending it was remembered', async () => {
  const h = harness(); h.edit('remember', 'on'); h.failStorage(); const pending = h.submit();
  h.requests[0].resolve({ items: [] }); await pending;
  assert.ok(h.state.profile); assert.match(h.toasts.at(-1), /applied for this session/);
  assert.match(h.toasts.at(-1), /previously saved background data may remain/); assert.equal(/\p{Script=Han}/u.test(h.toasts.at(-1)), false);
});

test('cached match checks are hidden whenever no background is active', () => {
  const h = harness(), p = { id: 'SG-TEST-P001' }, match = { status: 'needs_confirmation' };
  h.state.matches = [{ ...p, match }]; assert.equal(h.match(p), null);
  h.state.profile = { major: 'Synthetic Active Background' }; assert.equal(h.match(p), match);
  h.issues[p.id] = 'Synthetic stale programme choice'; assert.equal(h.match(p), null);
});

test('refresh without an active background sends no request', async () => {
  const h = harness(); assert.equal(await h.refresh(), false); assert.equal(h.requests.length, 0);
});

test('refresh call sites and option rollback keep the shared background guards', () => {
  assert.equal([...app.matchAll(/post\('\/api\/matches'/g)].length, 2);
  assert.equal([...app.matchAll(/await refreshMatches\(\)/g)].length, 5);
  assert.match(app, /if \(action === 'clearProfile'\) clearBackground\(\)/);
  assert.match(app, /state\.profile === profile && choiceContext\(\) === choices/);
  assert.doesNotMatch(app, /state\.matches = previousMatches/);
});

test('choice changes invalidate in-flight matching success and error even without a newer match request', async () => {
  for (const fail of [false, true]) for (const kind of ['routes', 'offerings', 'applicants']) {
    const h = harness(); h.change({ major: 'Synthetic Active Background' }); const pending = h.refresh();
    h.choices[kind].TEST = 'new-choice';
    if (fail) h.requests[0].reject(new Error('Synthetic obsolete choice error')); else h.requests[0].resolve({ items: [{ id: 'wrong-context' }] });
    assert.equal(await pending, false); assert.equal(h.state.matches, null);
  }
});

test('a programme-choice change during profile submission requires explicit resubmission and never persists the old check', async () => {
  const h = harness(); h.edit('remember', 'on'); const pending = h.submit();
  h.choices.offerings.TEST = 'new-intake'; h.requests[0].resolve({ items: [{ id: 'old-choice-match' }] }); await pending;
  assert.equal(h.state.profile, null); assert.equal(h.state.matches, null); assert.equal(h.writes.length, 0);
  assert.equal(h.navigation.length, 0); assert.match(h.error().textContent, /programme choices changed while loading/);
  assert.equal(h.form().button.disabled, false);
});
