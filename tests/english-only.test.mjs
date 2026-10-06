import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { copy, areaLabels } from '../public/copy.js';
import { validateProfile, InputError } from '../server/validation.mjs';

const root = new URL('../', import.meta.url);
const han = /\p{Script=Han}/u;
test('all interface copy and curated area labels are English-only', () => {
  assert.ok(Object.keys(copy).length > 180);
  assert.equal(han.test(JSON.stringify({ copy, areaLabels })), false);
  assert.equal(copy.final_year, 'Final year / expected graduation');
});
test('bootstrap, loading and no-script text use English', () => {
  const html = readFileSync(new URL('public/index.html', root), 'utf8');
  assert.match(html, /<html lang="en">/);
  assert.equal(han.test(html), false);
  assert.match(html, /Skip to content/);
});
test('the app has no language selector, Chinese UI fragments or stored-language dependency', () => {
  const app = readFileSync(new URL('public/app.js', root), 'utf8');
  assert.equal(han.test(app), false);
  assert.equal(/state\.lang|storedLanguage|language-switch|gradpath\.language/.test(app), false);
  assert.match(app, /school\.nameEn/);
});
test('custom validation avoids browser-localized form prompts', () => {
  const app = readFileSync(new URL('public/app.js', root), 'utf8');
  assert.match(app, /profile-form" novalidate/);
  assert.match(app, /validateForm\(form\)/);
  assert.match(app, /YYYY-MM-DD/);
  assert.match(app, /parseImportJson/);
});
test('profile validation errors are English for all supported failure paths', () => {
  const base = { major: 'Computer Science', language: { type: 'none' } };
  const cases = [null, {}, { ...base, gpa: 3.5 }, { ...base, gpa: 5, gpaScale: 4 }, { ...base, language: { type: 'invalid' } }, { ...base, language: { type: 'ielts', total: 10 } }, { ...base, language: { type: 'ielts', testDate: '2026-13-01' } }, { ...base, language: { type: 'toefl_120', total: 90, testDate: '2026-02-01' } }];
  for (const value of cases) assert.throws(() => validateProfile(value), error => error instanceof InputError && !han.test(error.message) && /[A-Za-z]/.test(error.message));
});
