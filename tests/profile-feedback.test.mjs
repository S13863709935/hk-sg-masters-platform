import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { validateProfile, InputError } from '../server/validation.mjs';

// Actual client helpers with synthetic DOM fields only; not admissions evidence.
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const context = vm.createContext({});
vm.runInContext(app.slice(app.indexOf('function profileFieldIssue('), app.indexOf('function parseImportJson(')), context);
const { profileFieldIssue, clearProfileFeedback, showProfileError, validateForm } = context;
const field = (name, attributes = {}) => ({
  name, attributes: { ...attributes }, focused: 0, scrolls: [], validity: {},
  setAttribute(key, value) { this.attributes[key] = value; },
  getAttribute(key) { return this.attributes[key] ?? null; },
  removeAttribute(key) { delete this.attributes[key]; },
  focus() { this.focused++; }, scrollIntoView(options) { this.scrolls.push(options); }
});
const form = fields => ({
  elements: { namedItem: name => fields.find(f => f.name === name) || null },
  querySelectorAll: selector => { assert.equal(selector, '[data-profile-invalid]'); return fields.filter(f => f.getAttribute('data-profile-invalid')); }
});
const errorBox = () => ({ textContent: '', hidden: true, scrolls: 0, scrollIntoView() { this.scrolls++; } });

test('coupled-field preflight agrees with server rejection for missing major, missing scale and overflow', () => {
  for (const [major, gpa, gpaScale, expectedField] of [
    ['', null, null, 'major'], ['Synthetic Computing', 0, null, 'gpaScale'],
    ['Synthetic Computing', null, 4, 'gpa'], ['Synthetic Computing', 4.1, 4, 'gpa']
  ]) {
    const profile = { major, gpa, gpaScale, language: { type: 'none' } };
    const issue = profileFieldIssue(profile);
    assert.equal(issue.field, expectedField); assert.equal(/\p{Script=Han}/u.test(issue.message), false);
    assert.throws(() => validateProfile(profile), InputError);
  }
});

test('optional, zero, maximum and different original GPA scales remain unconverted', () => {
  for (const [gpa, gpaScale] of [[null, null], [0, 4], [4, 4], [3.5, 4.3], [85, 100]]) {
    const profile = { major: 'Synthetic Computing', gpa, gpaScale, language: { type: 'none' } };
    assert.equal(profileFieldIssue(profile), null);
    const checked = validateProfile(profile); assert.equal(checked.gpa, gpa); assert.equal(checked.gpaScale, gpaScale);
  }
});

test('updated TOEFL scores accept 1–6 half bands, not zero, while unknown scores stay optional', () => {
  const profile = { major: 'Synthetic Computing', language: { type: 'toefl_6', testDate: '2026-01-21' } };
  for (const total of [null, 1, 1.5, 5.5, 6]) assert.equal(validateProfile({ ...profile, language: { ...profile.language, total } }).language.total, total);
  for (const total of [-1, 0, 0.5, 1.2, 6.5, '5']) assert.throws(() => validateProfile({ ...profile, language: { ...profile.language, total } }), InputError);
});

test('zero IELTS and legacy TOEFL scores are still real values, not missing', () => {
  for (const type of ['ielts', 'toefl_120']) {
    const checked = validateProfile({ major: 'Synthetic Computing', language: { type, total: 0, testDate: '2026-01-20' } });
    assert.equal(checked.language.total, 0);
  }
});

test('field feedback uses plain text, preserves hints and does not duplicate error references', () => {
  const input = field('gpa', { 'aria-describedby': 'gpa-hint' }), box = errorBox(), current = form([input]);
  const error = { field: 'gpa', message: 'Synthetic <img src=x onerror=alert(1)> error' };
  Object.defineProperty(box, 'innerHTML', { set() { assert.fail('Errors must never be inserted as HTML'); } });
  showProfileError(current, box, error); showProfileError(current, box, error);
  assert.equal(box.textContent, error.message); assert.equal(box.hidden, false); assert.equal(box.scrolls, 0);
  assert.equal(input.getAttribute('aria-describedby'), 'gpa-hint form-error'); assert.equal(input.getAttribute('aria-invalid'), 'true');
  assert.equal(input.focused, 2); assert.equal(input.scrolls[0].block, 'center'); assert.equal(input.scrolls[0].behavior, 'auto');
  clearProfileFeedback(current);
  assert.equal(input.getAttribute('aria-invalid'), null); assert.equal(input.getAttribute('data-profile-invalid'), null);
  assert.equal(input.getAttribute('aria-describedby'), 'gpa-hint');
});

test('feedback cleanup removes empty descriptions but leaves unrelated validation untouched', () => {
  const input = field('gpa'), untouched = field('other', { 'aria-invalid': 'true', 'aria-describedby': 'unrelated-hint' });
  const current = form([input, untouched]); showProfileError(current, errorBox(), { field: 'gpa', message: 'Synthetic error' });
  clearProfileFeedback(current); clearProfileFeedback(current);
  assert.equal(input.getAttribute('aria-describedby'), null); assert.equal(input.getAttribute('aria-invalid'), null);
  assert.equal(untouched.getAttribute('aria-invalid'), 'true'); assert.equal(untouched.getAttribute('aria-describedby'), 'unrelated-hint');
});

test('server or network errors do not guess an input field; missing and disabled fields fall back to summary', () => {
  for (const name of [undefined, 'missing', 'disabled']) {
    const input = field('disabled'); input.disabled = true; const box = errorBox();
    showProfileError(form([input]), box, { field: name, message: 'Synthetic request error' });
    assert.equal(box.scrolls, 1); assert.equal(box.hidden, false); assert.equal(input.focused, 0);
    assert.equal(input.getAttribute('aria-invalid'), null);
  }
});

test('native validity failures retain English messages and identify the input for profile feedback', () => {
  const cases = [
    { name: 'major', validity: { valueMissing: true }, expected: 'Please enter your undergraduate major.' },
    { name: 'total', validity: { valueMissing: true }, expected: 'Please complete this required field: Synthetic label.' },
    { name: 'testDate', expected: 'Please enter the test date in YYYY-MM-DD format.' },
    { name: 'gpa', validity: { rangeOverflow: true }, min: '0', max: '100', expected: 'Synthetic label must be between 0 and 100.' },
    { name: 'gpa', validity: { rangeUnderflow: true }, min: '0', max: '100', expected: 'Synthetic label must be between 0 and 100.' },
    { name: 'total', validity: { stepMismatch: true }, step: '0.5', expected: 'Use increments of 0.5 for Synthetic label.' },
    { name: 'gpa', validity: { badInput: true }, expected: 'Please enter a valid value for Synthetic label.' }
  ];
  for (const entry of cases) {
    const input = Object.assign(field(entry.name), entry, { labels: [{ textContent: ' Synthetic label ' }] });
    assert.throws(() => validateForm({ querySelector: selector => { assert.equal(selector, ':invalid'); return input; } }),
      error => error.message === entry.expected && error.field === entry.name);
    assert.equal(input.focused, 1);
  }
  assert.equal(validateForm({ querySelector: () => null }), undefined);
});

test('native import-file validation still focuses the existing choose-file button', () => {
  const input = field('batchFile'), choose = field('chooseFile'); input.type = 'file'; input.validity = { valueMissing: true };
  assert.throws(() => validateForm({ querySelector: selector => selector === ':invalid' ? input : choose }),
    error => error.field === 'batchFile' && /required field/.test(error.message));
  assert.equal(input.focused, 0); assert.equal(choose.focused, 1);
});
