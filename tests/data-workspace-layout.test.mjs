import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { copy } from '../public/copy.js';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');

// Guard the structure/minimum-size contract behind the browser-verified fix.
// This source test is not a substitute for viewport rendering or a phone test.
test('data workspace grid sections can shrink while the coverage table scrolls inside its wrapper', () => {
  const page = { innerHTML: '' }, context = vm.createContext({
    $: selector => { assert.equal(selector, '#page'); return page; }, t: key => copy[key] || key,
    heading: () => '', metrics: () => '', notice: () => '', icon: () => '', known: value => String(value ?? ''), esc: value => String(value ?? ''), schoolName: school => school.nameEn,
    state: { meta: { adminEnabled: false, quality: { total: 1, browsable: 1, peerReviewed: 0, complete: 0,
      schools: [{ abbreviation: 'TEST', nameEn: 'Synthetic long university name for a coverage row', directoryUrl: 'https://example.invalid/', seeds: 1, checked: 0, peerReviewed: 0 }] } } }
  });
  vm.runInContext(app.slice(app.indexOf('function renderData('), app.indexOf('function renderGuide(')), context); context.renderData();
  assert.match(page.innerHTML, /class="data-grid"><section>/);
  assert.match(page.innerHTML, /class="table-wrap"><table>/);
  assert.match(css, /\.data-grid\s*>\s*section\s*\{[^}]*min-width\s*:\s*0(?:[;}])/);
  assert.match(css, /\.table-wrap\s*\{[^}]*overflow\s*:\s*auto/);
  assert.equal(page.innerHTML.includes('id="import-form"'), false);
});
