import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { copy } from '../public/copy.js';

// Execute the real language-field workflow with synthetic controls, not student data.
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const fieldsSource = app.slice(app.indexOf('function languageFields('), app.indexOf('function fillProfile('));
const feedbackSource = app.slice(app.indexOf('function clearProfileFeedback('), app.indexOf('function validateForm('));
const groups = { 'total-field': ['total'], 'date-field': ['testDate'], 'component-fields': ['listening', 'reading', 'writing', 'speaking'], 'attempt-fields': ['singleAttempt', 'atHome'], 'waiver-fields': ['waiverBasis'] };
const input = name => ({ name, value: '', checked: false, disabled: false, attributes: {}, focused: 0,
  setAttribute(key, value) { this.attributes[key] = value; }, getAttribute(key) { return this.attributes[key] ?? null; },
  removeAttribute(key) { delete this.attributes[key]; }, focus() { this.focused++; }, scrollIntoView() {}
});

function harness() {
  const controls = Object.fromEntries(['major', 'languageType', ...Object.values(groups).flat()].map(name => [name, input(name)]));
  controls.languageType.value = 'none'; controls.total.setAttribute('aria-describedby', 'language-input-hint');
  controls.testDate.setAttribute('aria-describedby', 'language-date-hint');
  const languageControls = Object.values(controls).filter(control => control.name !== 'major');
  const invalid = list => list.filter(control => control.getAttribute('data-profile-invalid'));
  const panel = { dataset: {}, querySelector: () => invalid(languageControls)[0] || null, querySelectorAll: () => invalid(languageControls) };
  const form = { elements: { namedItem: name => controls[name] || null }, querySelectorAll: () => invalid(Object.values(controls)) };
  const box = { hidden: true, textContent: '', scrollIntoView() {} }, hint = {}, label = {};
  const nodes = { '#language-panel': panel, '#profile-form': form, '#form-error': box, '#language-input-hint': hint, '#total-field label': label };
  for (const control of Object.values(controls)) nodes[`#profile-${control.name}`] = control;
  for (const [id, names] of Object.entries(groups)) nodes[`#${id}`] = { hidden: false, querySelectorAll: selector => { assert.equal(selector, 'input,select'); return names.map(name => controls[name]); } };
  const context = vm.createContext({ $: selector => { assert.ok(nodes[selector], selector); return nodes[selector]; }, t: key => copy[key] || key });
  vm.runInContext(feedbackSource + fieldsSource, context);
  const update = type => { controls.languageType.value = type; context.languageFields(); };
  update('none');
  return { controls, panel, nodes, box, hint, label, update, mark: name => context.showProfileError(form, box, { field: name, message: 'Synthetic validation failure' }) };
}

for (const [type, visible, max, step, scale] of [
  ['none', [], '9', '0.5', '0–9'],
  ['ielts', ['total-field', 'date-field', 'component-fields', 'attempt-fields'], '9', '0.5', '0–9'],
  ['toefl_120', ['total-field', 'date-field', 'attempt-fields'], '120', '1', '0–120'],
  ['toefl_6', ['total-field', 'date-field', 'attempt-fields'], '6', '0.5', '1–6'],
  ['waiver', ['waiver-fields'], '9', '0.5', '0–9']
]) test(`${type} exposes only its relevant controls and score instructions`, () => {
  const h = harness(); h.update(type);
  for (const [id, names] of Object.entries(groups)) {
    assert.equal(h.nodes[`#${id}`].hidden, !visible.includes(id));
    for (const name of names) assert.equal(h.controls[name].disabled, !visible.includes(id));
  }
  assert.equal(h.controls.total.max, max); assert.equal(h.controls.total.step, step);
  assert.equal(h.controls.total.min, type === 'toefl_6' ? '1' : '0');
  assert.equal(h.hint.textContent, copy[`languageHint_${type}`]); assert.equal(h.label.textContent, `Overall score · ${scale}`);
  assert.equal(h.controls.languageType.getAttribute('aria-describedby'), 'language-input-hint');
});

test('changing a language route clears its obsolete field feedback, not its hint references', () => {
  for (const name of ['total', 'testDate', 'listening', 'singleAttempt', 'waiverBasis', 'languageType']) {
    const h = harness(); h.update(name === 'waiverBasis' ? 'waiver' : 'ielts'); h.mark(name);
    h.update('none');
    assert.equal(h.box.hidden, true); assert.equal(h.box.textContent, '');
    assert.equal(h.controls[name].getAttribute('aria-invalid'), null); assert.equal(h.controls[name].getAttribute('data-profile-invalid'), null);
    assert.equal(h.controls[name].getAttribute('aria-describedby'), name === 'total' || name === 'languageType' ? 'language-input-hint' : name === 'testDate' ? 'language-date-hint' : null);
  }
});

test('reapplying the same route does not silently dismiss a still-relevant error', () => {
  const h = harness(); h.update('ielts'); h.mark('total'); h.update('ielts');
  assert.equal(h.box.hidden, false); assert.equal(h.controls.total.getAttribute('aria-invalid'), 'true');
});

test('switching language route preserves academic errors and unassociated server/network failures', () => {
  const academic = harness(); academic.mark('major'); academic.update('toefl_120');
  assert.equal(academic.box.hidden, false); assert.equal(academic.controls.major.getAttribute('aria-invalid'), 'true');
  const generic = harness(); generic.mark(null); generic.update('ielts');
  assert.equal(generic.box.hidden, false); assert.equal(generic.box.textContent, 'Synthetic validation failure');
});

test('route changes do not convert scores, erase a draft or pre-confirm attempt/waiver claims', () => {
  const h = harness(); h.update('ielts');
  h.controls.total.value = '90'; h.controls.testDate.value = '2026-01-20'; h.controls.listening.value = '6.5';
  for (const type of ['toefl_120', 'toefl_6', 'waiver', 'none', 'ielts']) {
    h.update(type);
    assert.equal(h.controls.total.value, '90'); assert.equal(h.controls.testDate.value, '2026-01-20'); assert.equal(h.controls.listening.value, '6.5');
    assert.equal(h.controls.singleAttempt.checked, false); assert.equal(h.controls.atHome.checked, false); assert.equal(h.controls.waiverBasis.value, '');
  }
});

test('rendered language markup includes accessible live instructions and an associated date hint', () => {
  const context = vm.createContext({ t: key => copy[key] || key, options: choices => choices.map(([value, label]) => `<option value="${value}">${label}</option>`).join('') });
  vm.runInContext(app.slice(app.indexOf('function field('), app.indexOf('function renderProfile(')), context);
  const markup = context.languagePanel();
  assert.match(markup, /id="language-panel"/);
  assert.match(markup, /id="language-input-hint"[^>]+role="status"[^>]+aria-live="polite"/);
  assert.match(markup, /name="total"[^>]+aria-describedby="language-input-hint"/);
  assert.match(markup, /name="testDate"[^>]+aria-describedby="language-date-hint"/);
  assert.match(markup, /id="language-date-hint"/); assert.ok(markup.includes(copy.languageDateHint));
  const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length); assert.equal(/\p{Script=Han}/u.test(markup), false);
});
