import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { copy } from '../public/copy.js';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const clickListener = app.slice(app.indexOf("document.addEventListener('click'"), app.indexOf("document.addEventListener('input'"));
const syncUrl = app.slice(app.indexOf('function syncUrl('), app.indexOf('function filterMatches('));
const emptyRenderer = app.slice(app.indexOf('function empty('), app.indexOf('function updateTray('));

function harness() {
  const profile = { major: 'Synthetic discipline', language: { type: 'none' } };
  const state = { view: 'discover', q: 'missing keyword', region: 'HK', school: 'HK-TEST', area: 'Synthetic area', mode: 'part-time', verification: 'peer_reviewed', matchFilter: 'meets_checked', page: 5, sort: 'az', profile, matches: [{ id: 'SYNTHETIC' }], shortlist: ['SYNTHETIC'], compare: ['SYNTHETIC'] };
  const routeChoices = { SYNTHETIC: 'route' }, offeringChoices = { SYNTHETIC: 'intake' }, applicantChoices = { SYNTHETIC: 'category' };
  const remembered = { entries: { SYNTHETIC: { programmeId: 'SYNTHETIC', routeId: 'route' } } };
  const location = { href: 'http://localhost/?q=missing&region=HK&school=HK-TEST&area=test&mode=part-time&verification=peer_reviewed&programme=SYNTHETIC&other=keep#discover' };
  const listeners = {}, events = [];
  const context = vm.createContext({
    state, routeChoices, offeringChoices, applicantChoices, remembered, location, URL,
    history: { replaceState: (_state, _title, url) => { location.href = String(url); events.push('url'); } },
    document: { addEventListener: (name, callback) => { listeners[name] = callback; } },
    $: selector => { assert.equal(selector, '#search'); return { focus: () => events.push('search-focus') }; },
    renderDiscover: () => events.push('render'),
    navigate: () => assert.fail('reset must not navigate away'),
    writeStorage: () => assert.fail('reset must not change browser storage'),
    toast: message => assert.fail(message),
    t: key => copy[key] || key, icon: () => ''
  });
  vm.runInContext(syncUrl + '\n' + emptyRenderer + '\n' + clickListener, context);
  return { state, events, location, remembered, routeChoices, offeringChoices, applicantChoices, empty: (...args) => context.empty(...args),
    reset: () => listeners.click({ target: { closest: () => ({ dataset: { action: 'reset' } }) } }) };
}

test('the real reset action clears all search/matching filters, pagination and URL filters, then focuses search', async () => {
  const h = harness(); await h.reset();
  for (const key of ['q', 'region', 'school', 'area', 'mode', 'verification', 'matchFilter']) assert.equal(h.state[key], '');
  assert.equal(h.state.page, 1); assert.equal(h.state.sort, 'az'); assert.equal(h.state.view, 'discover');
  const url = new URL(h.location.href);
  for (const key of ['q', 'region', 'school', 'area', 'mode', 'verification']) assert.equal(url.searchParams.has(key), false);
  assert.equal(url.searchParams.get('programme'), 'SYNTHETIC'); assert.equal(url.searchParams.get('other'), 'keep'); assert.equal(url.hash, '#discover');
  assert.deepEqual(h.events, ['url', 'render', 'search-focus']);
});

test('filter recovery preserves background, cached matches, saved lists and temporary/remembered programme choices', async () => {
  const h = harness();
  const preserved = { profile: h.state.profile, matches: h.state.matches, shortlist: h.state.shortlist, compare: h.state.compare };
  const choices = JSON.stringify([h.routeChoices, h.offeringChoices, h.applicantChoices, h.remembered]);
  await h.reset();
  for (const [key, value] of Object.entries(preserved)) assert.equal(h.state[key], value);
  assert.equal(JSON.stringify([h.routeChoices, h.offeringChoices, h.applicantChoices, h.remembered]), choices);
});

test('other empty pages retain their existing Explore navigation by default', () => {
  const h = harness(), html = h.empty('shortlist', 'noResultsHint');
  assert.match(html, /data-action="nav" data-view="discover"/);
  assert.ok(html.includes(copy.backExplore)); assert.doesNotMatch(html, /data-action="reset"|data-action="retry"/);
  assert.equal(/\p{Script=Han}/u.test(html), false);
});
