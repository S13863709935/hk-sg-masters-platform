import { copy, areaLabels } from './copy.js';
import { normalizeSavedOptions, optionSnapshot, sameOptions, savedOptionsPayload, shortlistExport } from './saved-options.js';
import { filterMatchedProgrammes } from './catalogue-filters.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const paths = { explore: '<circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5z"/>', profile: '<circle cx="12" cy="8" r="3"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>', shortlist: '<path d="M6 4h12v17l-6-4-6 4z"/>', compare: '<rect x="3" y="5" width="7" height="15" rx="1"/><rect x="14" y="3" width="7" height="17" rx="1"/>', data: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 4 16 4 16 0V5M4 12v7c0 4 16 4 16 0v-7"/>', guide: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>', arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>', search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>', close: '<path d="m6 6 12 12M18 6 6 18"/>', school: '<path d="m2 9 10-6 10 6-10 6zM6 12v7c3 3 9 3 12 0v-7M22 9v8"/>', check: '<path d="m5 12 4 4L19 6"/>', external: '<path d="M13 4h7v7m0-7L10 14M9 4H4v16h16v-5"/>', globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>' };
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.guide}</svg>`;
const keys = { shortlist: 'gradpath.shortlist.v1', compare: 'gradpath.compare.v1', profile: 'gradpath.profile.v1', choices: 'gradpath.saved-options.v1' };
function readStorage(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function writeStorage(key, value) { try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(value)); return true; } catch { toast(t('storageError')); return false; } }
const savedIds = key => { const value = readStorage(key, []); return Array.isArray(value) ? [...new Set(value.filter(v => typeof v === 'string' && v.length <= 100 && /^(HK|SG)-[A-Z]+-P\d{3,}$/.test(v)))].slice(0, 500) : []; };
const params = new URLSearchParams(location.search);
const state = { view: 'discover', meta: null, profile: readStorage(keys.profile, null), matches: null, shortlist: savedIds(keys.shortlist), compare: savedIds(keys.compare).slice(0, 4), q: params.get('q') || '', region: params.get('region') || '', school: params.get('school') || '', area: params.get('area') || '', mode: params.get('mode') || '', verification: params.get('verification') || '', matchFilter: '', sort: 'quality', page: 1, limit: 12, items: [], total: 0 };
let requestSequence = 0;
let toastTimer;
let searchTimer;
let activeDetail = null;
let detailTrigger = null;
let detailSequence = 0;
let backgroundVersion = 0;
let matchRequestSequence = 0;
let shortlistExportSequence = 0;
const routeChoices = {};
const offeringChoices = {};
const applicantChoices = {};
let storedOptions;
try { const raw = localStorage.getItem(keys.choices); storedOptions = raw === null ? null : JSON.parse(raw); } catch { storedOptions = { schemaVersion: -1 }; }
const remembered = normalizeSavedOptions(storedOptions, [...state.shortlist, ...state.compare]);
const savedOptionIssues = Object.create(null);
const programmePath = id => { const query = new URLSearchParams(); if (routeChoices[id]) query.set('route', routeChoices[id]); if (offeringChoices[id]) query.set('offering', offeringChoices[id]); if (applicantChoices[id]) query.set('applicant', applicantChoices[id]); return `/api/programmes/${encodeURIComponent(id)}${query.size ? `?${query}` : ''}`; };
const matchingPayload = profile => ({ profile, filters: { includeTransfer: 'true' }, selectedRoutes: { ...routeChoices }, selectedOfferings: { ...offeringChoices }, selectedApplicants: { ...applicantChoices } });
const contextMatch = p => !state.profile || savedOptionIssues[p.id] ? null : state.matches?.find(item => item.id === p.id && (item.selectedRoute?.id || '') === (p.selectedRoute?.id || '') && (item.selectedOffering?.id || '') === (p.selectedOffering?.id || '') && (item.selectedApplicant?.id || '') === (p.selectedApplicant?.id || ''))?.match;
const t = key => copy[key] || key;
const areaName = area => areaLabels[area] || area;
const schoolName = school => school.nameEn;
function toast(message) { const node = $('#toast'); node.textContent = message; node.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { node.hidden = true; }, 3500); }
async function api(path, options = {}) { const response = await fetch(path, options); const body = await response.json(); if (!response.ok) throw Object.assign(new Error(body.error || response.statusText), { status: response.status }); return body; }
const post = (path, data, extraHeaders = {}) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...extraHeaders }, body: JSON.stringify(data) });
function badge(value) { const kind = ['programme_page_checked', 'peer_reviewed'].includes(value) ? 'checked' : value === 'has_gap' ? 'danger' : value === 'meets_checked' ? 'pass' : 'warning'; return `<span class="badge ${kind}">${esc(t(value))}</span>`; }
function money(o) {
  if (o.tuition === null || o.tuition === undefined || !o.currency) return `<span class="unknown-value">${t('unknown')}</span>`;
  const value = `${esc(o.currency)} ${new Intl.NumberFormat('en-SG', { minimumFractionDigits: Number.isInteger(o.tuition) ? 0 : 2, maximumFractionDigits: 2 }).format(o.tuition)}`;
  return value + (o.tuitionEstimate ? '<small>Minimum-credit tuition estimate · not a fixed quote</small>' : '');
}
function fees(p, detailed = false) { return p.offerings.map(o => `${money(o)}<small>${esc([o.mode, o.intake, o.applicantCategory?.label].filter(Boolean).join(' · '))}</small>${o.applicantCategoryRequired ? '<small class="warning">Applicant category required; no default fee assumed.</small>' : ''}${detailed && o.feeBasis ? `<small>${esc(o.feeBasis)}</small>` : ''}`).join('<br>') + (p.fieldStatus?.tuition?.status === 'unknown' && p.offerings.some(o => o.tuition !== null) ? `<small class="warning">${t('cohortUnconfirmed')}</small>` : ''); }
function known(value) { return value === null || value === undefined || value === '' ? `<span class="unknown-value">${t('unknown')}</span>` : esc(value); }
function shell() {
  document.documentElement.lang = 'en';
  document.title = `GradPath · ${t('brandSub')}`;
  const navigation = [['discover', 'explore'], ['profile', 'profile'], ['shortlist', 'shortlist'], ['compare', 'compare'], ['data', 'data'], ['guide', 'guide']];
  $('#app').innerHTML = `<aside class="sidebar"><a href="#discover" class="brand" aria-label="GradPath"><span class="brand-mark">g.</span><div><div class="brand-word">GradPath</div><div class="brand-sub">${t('brandSub')}</div></div></a><nav aria-label="${'Main navigation'}">${navigation.map(([view, key], i) => `${i === 4 ? '<div class="nav-divider"></div>' : ''}<button class="nav-button ${state.view === view ? 'active' : ''}" data-action="nav" data-view="${view}" ${state.view === view ? 'aria-current="page"' : ''}>${icon(view === 'discover' ? 'explore' : view)}<span>${t(key)}</span>${view === 'shortlist' ? `<span class="nav-count" id="shortlist-count">${state.shortlist.length}</span>` : ''}</button>`).join('')}</nav><div class="sidebar-bottom"><div class="source-mini"><small>${t('sourceChecked')} <strong>${state.meta.quality.checked}/${state.meta.quality.total}</strong></small><progress value="${state.meta.quality.checked}" max="${state.meta.quality.total}" aria-label="${t('sourceChecked')}"></progress></div><div class="sidebar-foot"><span class="status-dot"></span>${t('local')}</div></div></aside><div class="main-shell"><header class="topbar"><div class="breadcrumb">GradPath <span aria-hidden="true">/</span><strong id="breadcrumb-current">${t(navigation.find(([v]) => v === state.view)?.[1] || 'explore')}</strong></div><div class="top-actions"><span class="preview-label"><span class="status-dot"></span>${t('local')}</span></div></header><main id="main" class="content" tabindex="-1"><div id="page"></div><footer class="footer"><span>GradPath · ${t('footer')}</span><a href="#guide">${t('privacyLink')}</a></footer></main></div><div id="tray-wrapper"></div>`;
  updateTray();
}
function heading(key, intro) { return `<div class="page-heading"><div class="eyebrow">GRADPATH / ${esc(state.view.toUpperCase())}</div><h1>${t(key)}</h1><p>${t(intro)}</p></div>`; }
function metrics(items) { return `<div class="metrics">${items.map(([value, label, symbol]) => `<div class="metric"><span class="metric-icon">${icon(symbol)}</span><strong class="metric-value">${esc(value)}</strong><span class="metric-label">${t(label)}</span></div>`).join('')}</div>`; }
const options = (items, selected) => items.map(([value, label]) => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`).join('');
function filterField(id, label, items) { return `<div class="field"><label for="filter-${id}">${t(label)}</label><select id="filter-${id}" data-filter="${id}">${options(items, state[id])}</select></div>`; }
function notice() { return `<div class="data-notice">${icon('guide')}<span>${t('catalogueNote')}</span></div>`; }
function renderDiscover() {
  const q = state.meta.quality;
  $('#page').innerHTML = `<section class="hero"><div class="hero-copy"><div class="eyebrow">${t('heroEyebrow')}</div><h1>${t('heading')}</h1><p>${t('intro')}</p><p class="hero-note">${t('heroNote')}</p></div><div class="city-stamp" aria-hidden="true"><span class="stamp-code">HKG</span><span class="stamp-name">HONG KONG</span><div class="stamp-line"></div><span class="stamp-code">SGP</span><span class="stamp-name">SINGAPORE</span></div></section>${metrics([[q.universities, 'targetSchools', 'school'], [q.total, 'seedRecords', 'explore'], [q.checked, 'sourceChecked', 'check'], [q.peerReviewed, 'independentReview', 'data']])}<section class="search-panel" aria-label="${t('searchLabel')}"><div class="search-row"><div class="segmented" aria-label="${'Region'}">${[['', 'allRegions'], ['HK', 'hongKong'], ['SG', 'singapore']].map(([value, label]) => `<button data-action="region" data-value="${value}" class="${state.region === value ? 'active' : ''}" aria-pressed="${state.region === value}">${t(label)}</button>`).join('')}</div><div class="search-input">${icon('search')}<input type="search" id="search" value="${esc(state.q)}" placeholder="${t('searchPlaceholder')}" aria-label="${t('searchLabel')}" maxlength="200"></div></div><div class="filters">${filterField('school', 'university', [['', t('allUniversities')], ...state.meta.universities.filter(u => !state.region || u.region === state.region).map(u => [u.id, `${u.abbreviation} · ${schoolName(u)}`])])}${filterField('area', 'area', [['', t('allAreas')], ...state.meta.areas.map(a => [a, areaName(a)])])}${filterField('mode', 'mode', [['', t('allModes')], ['full-time', t('fullTime')], ['part-time', t('partTime')]])}${filterField('verification', 'verification', [['', t('allVerification')], ['catalogue_seed', t('catalogue_seed')], ['programme_page_checked', t('programme_page_checked')], ['peer_reviewed', t('peer_reviewed')]])}<button class="link-button" data-action="reset">${t('reset')}</button></div></section>${notice()}<div class="profile-strip"><p>${icon('profile')}${state.profile ? `${t('backgroundActive')} · ${esc(state.profile.major)}` : t('backgroundCta')}</p><button class="button secondary" data-action="nav" data-view="profile">${t(state.profile ? 'changeProfile' : 'profile')}${icon('arrow')}</button></div>${state.profile ? `<div class="field"><label for="match-filter">${t('matchingFilter')}</label><select id="match-filter" data-filter="matchFilter">${options([['', t('allMatches')], ['meets_checked', t('meets_checked')], ['has_gap', t('has_gap')], ['needs_confirmation', t('needs_confirmation')]], state.matchFilter)}</select></div>` : ''}<div id="results"></div>`;
  $('#results').insertAdjacentHTML('beforebegin', '<p id="catalogue-status" class="visually-hidden" role="status" aria-live="polite" aria-atomic="true"></p>');
  loadCatalogue();
}
function syncUrl() { const url = new URL(location.href); for (const key of ['q', 'region', 'school', 'area', 'mode', 'verification']) state[key] ? url.searchParams.set(key, state[key]) : url.searchParams.delete(key); history.replaceState(null, '', url); }
function filterMatches(items) {
  return filterMatchedProgrammes(items, state, savedOptionIssues);
}
const catalogueContext = () => JSON.stringify([...['q', 'region', 'school', 'area', 'mode', 'verification', 'page', 'limit', 'sort', 'matchFilter'].map(key => state[key]), routeChoices, offeringChoices, applicantChoices]);
const catalogueSummary = () => `${state.total} ${t(state.total === 1 ? 'result' : 'results')} · ${t('page')} ${state.page} ${t('of')} ${Math.max(1, Math.ceil(state.total / state.limit))}`;
function catalogueLoading(target) {
  target.setAttribute('aria-busy', 'true');
  target.innerHTML = `<div class="cards">${[1, 2, 3].map(() => '<div class="skeleton"></div>').join('')}</div>`;
  if ($('#catalogue-status')) $('#catalogue-status').textContent = t('loading');
}
function scheduleCatalogueSearch(value) {
  clearTimeout(searchTimer); requestSequence++;
  state.q = value; state.page = 1; syncUrl();
  const target = $('#results');
  if (state.view !== 'discover' || !target) return;
  catalogueLoading(target);
  searchTimer = setTimeout(() => {
    searchTimer = null;
    if (state.view === 'discover' && target.isConnected && $('#results') === target) loadCatalogue();
  }, 220);
}
async function loadCatalogue({ focusResults = false } = {}) {
  clearTimeout(searchTimer); searchTimer = null;
  const seq = ++requestSequence, target = $('#results');
  if (state.view !== 'discover' || !target) return false;
  const snapshot = catalogueContext(), profile = state.profile, matches = state.matches;
  const restoreSort = document.activeElement?.id === 'sort';
  const current = () => seq === requestSequence && state.view === 'discover' && target.isConnected && $('#results') === target && catalogueContext() === snapshot && state.profile === profile && state.matches === matches;
  const mayMoveFocus = () => !$('#detail-dialog')?.open && (!document.activeElement || document.activeElement === document.body);
  catalogueLoading(target);
  try {
    let response;
    if (state.profile && state.matches) { const filtered = filterMatches(state.matches); if (state.sort === 'az') filtered.sort((a, b) => a.name.localeCompare(b.name)); response = { total: filtered.length, items: filtered.slice((state.page - 1) * state.limit, state.page * state.limit) }; }
    else { const query = new URLSearchParams(Object.fromEntries(['q', 'region', 'school', 'area', 'mode', 'verification', 'page', 'limit', 'sort'].map(k => [k, state[k]]))); if (Object.keys(routeChoices).length) query.set('routes', JSON.stringify(routeChoices)); if (Object.keys(offeringChoices).length) query.set('offerings', JSON.stringify(offeringChoices)); if (Object.keys(applicantChoices).length) query.set('applicants', JSON.stringify(applicantChoices)); response = await api(`/api/catalogue?${query}`); }
    if (!current()) return false;
    state.items = response.items; state.total = response.total;
    renderResults();
    target.setAttribute('aria-busy', 'false');
    if ($('#catalogue-status')) $('#catalogue-status').textContent = catalogueSummary();
    if (mayMoveFocus()) {
      const focus = restoreSort ? $('#sort') : focusResults ? $('#results-summary') : null;
      focus?.focus({ preventScroll: true });
      if (focus && focusResults) focus.scrollIntoView({ block: 'start', behavior: 'auto' });
    }
    return true;
  } catch (error) {
    if (!current()) return false;
    target.innerHTML = empty('errorHeading', 'errorHint', 'data', { name: 'retry', label: 'retry' });
    target.setAttribute('aria-busy', 'false');
    if ($('#catalogue-status')) $('#catalogue-status').textContent = `${t('errorHeading')} ${t('errorHint')}`;
    if ((focusResults || restoreSort) && mayMoveFocus()) target.querySelector('[data-action=retry]')?.focus();
    return false;
  }
}
function card(p) {
  if (p.unavailable) return unavailableCard(p, state.view === 'compare' ? 'compare' : 'save');
  const saved = state.shortlist.includes(p.id);
  const match = savedOptionIssues[p.id] ? null : p.match || contextMatch(p);
  const mode = [...new Set(p.offerings.map(o => o.mode).filter(Boolean))].join(' / ');
  const duration = [...new Set(p.offerings.map(o => o.duration).filter(Boolean))].join(' / ');
  return `<article class="programme-card">
    <div class="card-top"><div class="school-tag"><span class="school-monogram">${esc(p.university.abbreviation)}</span><div>${esc(p.university.abbreviation)}<div class="region-code">${t(p.university.region === 'HK' ? 'hongKong' : 'singapore')}</div></div></div><button class="icon-button ${saved ? 'selected' : ''}" data-action="save" data-id="${p.id}" aria-label="${t(saved ? 'saved' : 'save')} · ${esc(p.name)}" aria-pressed="${saved}">${icon('shortlist')}</button></div>
    <h3><button class="card-title" data-action="detail" data-id="${p.id}">${esc(p.name)}</button></h3>
    <div class="badge-row"><span class="badge">${esc(areaName(p.area))}</span>${badge(p.verification)}${p.directoryListing?.variants.length && !p.selectedRoute ? badge('routeSelection') : ''}${scopeBadge(p)}${p.admissionRoute === 'transfer_only' ? badge('transferOnly') : ''}</div>
    ${savedOptionWarning(p.id)}${offeringSummary(p)}${applicationSummary(p)}
    <div class="card-facts"><div class="card-fact"><small>${t('mode')}</small><span>${known(mode)}</span></div><div class="card-fact"><small>${t('duration')}</small><span>${known(duration)}</span></div><div class="card-fact"><small>${t('tuition')}</small><span>${p.offerings.filter(o => o.tuition !== null && o.currency).length ? fees(p) : known(null)}</span></div><div class="card-fact"><small>${t('academicYear')}</small><span>${known(p.academicYear)}</span></div></div>
    ${match ? `<div class="card-match">${badge(match.tier || match.status)}<small>${`Checked: ${match.counts.pass} met · ${match.counts.fail} gaps · ${match.counts.unknown} unresolved`}</small></div>` : ''}
    <div class="card-bottom"><label class="compare-check"><input type="checkbox" data-action="compare" data-id="${p.id}" ${state.compare.includes(p.id) ? 'checked' : ''}>${t('addCompare')}</label><button class="details-button" data-action="detail" data-id="${p.id}">${t('details')}${icon('arrow')}</button></div>
  </article>`;
}
function renderResults() {
  const pages = Math.max(1, Math.ceil(state.total / state.limit));
  $('#results').innerHTML = `<div class="results-header"><div class="results-count" id="results-summary" tabindex="-1" role="heading" aria-level="2"><strong>${state.total}</strong> ${t(state.total === 1 ? 'result' : 'results')} · ${t('page')} ${state.page} ${t('of')} ${pages}</div><div class="sort-group"><label for="sort">${t('sort')}</label><select id="sort" data-filter="sort">${options([['quality', t(state.profile ? 'matchingFirst' : 'qualityFirst')], ['az', t('az')]], state.sort)}</select></div></div><section class="cards" aria-label="${t('searchResults')}">${state.items.length ? state.items.map(card).join('') : catalogueEmpty()}</section>${state.total > state.limit ? `<nav class="pagination" aria-label="${'Pagination'}"><button class="button" data-action="page" data-value="${state.page - 1}" ${state.page <= 1 ? 'disabled' : ''}>${t('previous')}</button><span>${t('page')} ${state.page} ${t('of')} ${pages}</span><button class="button" data-action="page" data-value="${state.page + 1}" ${state.page >= pages ? 'disabled' : ''}>${t('next')}</button></nav>` : ''}`;
}
function catalogueEmpty() {
  const filtered = ['q', 'region', 'school', 'area', 'mode', 'verification', 'matchFilter'].some(key => state[key]);
  return filtered ? empty('noResults', 'noResultsHint', 'search', { name: 'reset', label: 'reset' }) : empty('noProgrammes', 'noProgrammesHint', 'data', { name: 'retry', label: 'retry' });
}
function empty(title, intro, symbol = 'shortlist', action = { name: 'nav', view: 'discover', label: 'backExplore' }) { return `<div class="empty-state"><div class="empty-icon">${icon(symbol)}</div><h2>${t(title)}</h2><p>${t(intro)}</p><button class="button secondary" data-action="${action.name}"${action.view ? ` data-view="${action.view}"` : ''}>${t(action.label)}${icon('arrow')}</button></div>`; }
function updateTray() {
  if (!$('#tray-wrapper')) return;
  $('#tray-wrapper').innerHTML = state.compare.length ? `<aside class="compare-tray" aria-label="${t('compareSelection')}"><div><small>${t('compareSelection')} · ${state.compare.length}/4</small><div class="tray-chips">${state.compare.map(id => `<span class="tray-chip">${esc(state.meta.universities.find(u => id.startsWith(`${u.id}-`))?.abbreviation || id)}<button data-action="compare" data-id="${id}" aria-label="${t('remove')} ${id}">×</button></span>`).join('')}</div></div><div class="tray-actions"><button class="tray-clear" data-action="clearCompare">${t('clear')}</button><button class="button" data-action="nav" data-view="compare" ${state.compare.length < 2 ? 'disabled' : ''}>${t('compareNow')}${icon('arrow')}</button></div></aside>` : '';
  if ($('#shortlist-count')) $('#shortlist-count').textContent = state.shortlist.length;
}
async function selectedProgrammes(ids) { return Promise.all(ids.map(async id => { try { const p = await api(programmePath(id)); return { ...p, ...(savedOptionIssues[id] ? { savedOptionIssue: savedOptionIssues[id] } : {}) }; } catch (error) { if (![404, 422].includes(error.status)) throw error; return { id, unavailable: true, issue: error.message }; } })); }
function savedOptionWarning(id) { return savedOptionIssues[id] ? `<p class="saved-option-warning" role="status"><strong>Saved choices need review.</strong> ${esc(savedOptionIssues[id])} The current record below is unselected, not a substitute for your saved option. No saved-option match result is shown.<br><button class="button" data-action="detail" data-id="${esc(id)}">Review choices</button></p>` : ''; }
function unavailableCard(p, action) { return `<article class="programme-card"><h3>Programme needs attention</h3><p class="detail-note">${esc(p.id)} · ${esc(p.issue)}</p><p class="detail-note">No substitute programme or fee is assumed. Other saved programmes remain available.</p><button class="button" data-action="${action}" data-id="${esc(p.id)}">Remove from this list</button></article>`; }
async function restoreRememberedOptions() {
  const contexts = Object.values(remembered.entries);
  if (!contexts.length) return;
  const result = await post('/api/saved-options/resolve', { contexts });
  for (const item of result.items) {
    const saved = contexts[item.index];
    if (item.status !== 'resolved') { savedOptionIssues[saved.programmeId] = item.message; continue; }
    if (saved.routeId) routeChoices[saved.programmeId] = saved.routeId;
    if (saved.offeringId) offeringChoices[saved.programmeId] = saved.offeringId;
    if (saved.applicantId) applicantChoices[saved.programmeId] = saved.applicantId;
  }
}
function rememberPanel(p) {
  const saved = remembered.entries[p.id], attached = state.shortlist.includes(p.id) || state.compare.includes(p.id);
  const unchanged = sameOptions(p, saved) && !savedOptionIssues[p.id];
  const hasChoices = !!(p.selectedRoute || p.selectedOffering || p.selectedApplicant);
  return `<section id="remembered-options-panel" class="remember-panel"><h3>Remember programme choices</h3>${savedOptionWarning(p.id)}<p class="detail-note">Optional: save this programme's route, intake, mode and applicant-category choices in this browser. No grades, language scores, fees or deadlines are saved here. Use caution on shared devices.</p><p class="detail-note">${unchanged ? 'These choices are remembered. Current fees and dates are loaded again, not stored as a historical quote.' : saved ? 'The remembered choices differ from this view or need review. Update them explicitly; they are not overwritten automatically.' : 'These choices are temporary until you click Remember these choices.'}</p><div class="detail-actions"><button class="button secondary" data-action="rememberOptions" data-id="${esc(p.id)}" ${!attached || !hasChoices || unchanged ? 'disabled' : ''}>${saved ? 'Update remembered choices' : 'Remember these choices'}</button>${saved ? `<button class="button" data-action="forgetOptions" data-id="${esc(p.id)}">Forget remembered choices</button>` : ''}</div>${!attached ? '<p class="detail-note">Save or compare this programme first to enable remembering its choices.</p>' : ''}</section>`;
}
function refreshRememberPanel() { if (activeDetail && $('#remembered-options-panel')) $('#remembered-options-panel').outerHTML = rememberPanel(activeDetail); }
function pruneRememberedOptions() {
  const attached = new Set([...state.shortlist, ...state.compare]);
  const next = Object.fromEntries(Object.entries(remembered.entries).filter(([id]) => attached.has(id)));
  if (Object.keys(next).length !== Object.keys(remembered.entries).length && writeStorage(keys.choices, savedOptionsPayload(next))) { remembered.entries = next; for (const id of Object.keys(savedOptionIssues)) if (!attached.has(id)) delete savedOptionIssues[id]; }
}
function currentSavedView(view, selector, target) {
  return state.view === view && target?.isConnected && $(selector) === target;
}
function selectionFocus(trigger) {
  const view = state.view, page = $('#page'), tray = $('#tray-wrapper');
  const inTray = tray?.contains(trigger);
  if (document.activeElement !== trigger || (!inTray && (!['shortlist', 'compare'].includes(view) || !page?.contains(trigger)))) return () => {};
  const root = inTray ? tray : page, action = inTray || view === 'compare' ? 'compare' : 'save';
  const controls = () => [...root.querySelectorAll(`[data-action="${action}"]`)].filter(control => !control.disabled);
  const index = Math.max(0, controls().indexOf(trigger));
  let restored = false;
  return () => {
    if (restored || state.view !== view || $('#page') !== page || !root.isConnected || trigger.isConnected || document.activeElement !== document.body || $('#detail-dialog')?.open) return;
    const remaining = controls();
    const next = remaining[Math.min(index, remaining.length - 1)] || (!inTray && page.querySelector('.empty-state [data-action]')) || $('#main');
    if (next) { next.focus(); restored = true; }
  };
}
function savedViewError(target) {
  target.setAttribute('aria-busy', 'false');
  target.innerHTML = `<div class="empty-state"><h2>Saved programmes could not be loaded.</h2><p role="alert">Your saved selections have not been changed. Try again to reload the current list.</p><button class="button" data-action="rerender">${t('retry')}</button></div>`;
}
async function renderShortlist({ restoreFocus = () => {} } = {}) {
  const ids = [...state.shortlist];
  $('#page').innerHTML = `${heading('shortlistHeading', 'shortlistIntro')}${ids.length ? `<div class="results-header"><span class="results-count">${ids.length} ${t(ids.length === 1 ? 'result' : 'results')}</span><button class="button" data-action="exportShortlist">${t('downloadShortlist')}</button></div><small class="muted">${t('exportShortlistNote')}</small><p id="shortlist-export-status" class="detail-note" role="status" aria-live="polite" aria-atomic="true"></p><div id="saved-cards" class="cards" aria-busy="true"><p class="muted" role="status">${t('loading')}</p></div>` : empty('emptyShortlist', 'emptyShortlistHint')}`;
  if (!ids.length) { restoreFocus(); return; }
  const target = $('#saved-cards');
  try {
    const items = await selectedProgrammes(ids);
    if (!currentSavedView('shortlist', '#saved-cards', target)) return;
    target.innerHTML = items.map(card).join('');
    target.setAttribute('aria-busy', 'false');
    restoreFocus();
  } catch {
    if (currentSavedView('shortlist', '#saved-cards', target)) { savedViewError(target); restoreFocus(); }
  }
}
function field(name, label, type = 'text', attributes = '') { return `<div class="field"><label for="profile-${name}">${t(label)}</label><input id="profile-${name}" name="${name}" type="${type}" ${attributes}></div>`; }
function select(name, label, choices) { return `<div class="field"><label for="profile-${name}">${t(label)}</label><select id="profile-${name}" name="${name}">${options(choices.map(k => [k, t(k)]), '')}</select></div>`; }
function renderProfile() {
  $('#page').innerHTML = `${heading('profileHeading', 'profileIntro')}<div id="form-error" class="form-error" role="alert" hidden></div><form id="profile-form" novalidate><section class="form-panel"><h2>${t('academicInfo')}</h2><div class="form-grid">${field('major', 'major', 'text', `required maxlength="120" placeholder="${t('majorPlaceholder')}" autocomplete="off"`)}${select('degreeStatus', 'degreeStatus', ['graduated', 'final_year', 'otherDegree']).replace('value="otherDegree"', 'value="other"')}${field('gpa', 'gpa', 'number', 'min="0" max="100" step="0.01" placeholder="3.5"')}${field('gpaScale', 'gpaScale', 'number', 'min="1" max="100" step="0.01" placeholder="4.0"')}<p class="field-hint span-2">${t('gpaHint')}</p>${select('classification', 'classification', ['unknownClass', 'first', 'second_upper', 'second_lower', 'third', 'ordinary']).replace('value="unknownClass"', 'value="unknown"')}${field('experienceYears', 'experience', 'number', 'min="0" max="60" step="0.5"')}</div></section><section class="form-panel"><h2>${t('languageInfo')}</h2><div class="form-grid">${select('languageType', 'languageType', ['none', 'ielts', 'toefl_120', 'toefl_6', 'waiver'])}<div id="total-field">${field('total', 'total', 'number', 'min="0" max="9" step="0.5"')}</div><div id="date-field" class="span-2">${field('testDate', 'testDate', 'text', 'placeholder="YYYY-MM-DD" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" inputmode="text" autocomplete="off"')}</div><div id="component-fields" class="score-grid span-2">${['listening', 'reading', 'writing', 'speaking'].map(k => field(k, k, 'number', 'min="0" max="9" step="0.5"')).join('')}</div><div id="attempt-fields" class="span-2"><label class="checkbox-line"><input name="singleAttempt" type="checkbox">${t('singleAttempt')}</label><br><label class="checkbox-line"><input name="atHome" type="checkbox">${t('atHome')}</label></div><div id="waiver-fields" class="span-2">${select('waiverBasis', 'waiverBasis', ['none', 'first_language', 'english_degree'])}<p class="field-hint">${t('waiverHint')}</p></div></div></section><label class="checkbox-line"><input name="remember" type="checkbox" ${readStorage(keys.profile, null) ? 'checked' : ''}>${t('keepProfile')}</label><div class="form-actions"><button class="button primary" type="submit">${t('checkRequirements')}${icon('arrow')}</button><button class="button" type="button" data-action="sample">${t('sample')}</button>${state.profile ? `<button class="button ghost danger" type="button" data-action="clearProfile">${t('deleteProfile')}</button>` : ''}</div></form>`;
  if (state.profile) fillProfile(state.profile);
  languageFields();
}
function languageFields() {
  const type = $('#profile-languageType').value;
  const scored = !['none', 'waiver'].includes(type);
  $('#total-field').hidden = !scored; $('#date-field').hidden = !scored; $('#component-fields').hidden = type !== 'ielts'; $('#attempt-fields').hidden = !scored; $('#waiver-fields').hidden = type !== 'waiver';
  for (const id of ['total-field', 'date-field', 'component-fields', 'attempt-fields', 'waiver-fields']) $( `#${id}` ).querySelectorAll('input,select').forEach(input => { input.disabled = $(`#${id}`).hidden; });
  $('#profile-total').max = type === 'toefl_120' ? '120' : type === 'toefl_6' ? '6' : '9';
  $('#profile-total').step = type === 'toefl_120' ? '1' : '0.5';
}
function fillProfile(profile) {
  const form = $('#profile-form');
  for (const key of ['major', 'degreeStatus', 'gpa', 'gpaScale', 'classification', 'experienceYears']) form.elements.namedItem(key).value = profile[key] ?? '';
  form.elements.namedItem('languageType').value = profile.language.type;
  for (const key of ['total', 'testDate', 'waiverBasis']) form.elements.namedItem(key).value = profile.language[key] ?? '';
  for (const key of ['singleAttempt', 'atHome']) form.elements.namedItem(key).checked = !!profile.language[key];
  for (const key of ['listening', 'reading', 'writing', 'speaking']) form.elements.namedItem(key).value = profile.language.components?.[key] ?? '';
  languageFields();
}
function validateForm(form) {
  const field = form.querySelector(':invalid');
  if (!field) return;
  const label = field.labels?.[0]?.textContent.trim() || field.name || 'this field';
  if (field.type === 'file') form.querySelector('[data-action=chooseFile]')?.focus();
  else field.focus();
  if (field.validity.valueMissing) throw new Error(field.name === 'major' ? 'Please enter your undergraduate major.' : `Please complete this required field: ${label}.`);
  if (field.name === 'testDate') throw new Error('Please enter the test date in YYYY-MM-DD format.');
  if (field.validity.rangeOverflow || field.validity.rangeUnderflow) throw new Error(`${label} must be between ${field.min} and ${field.max}.`);
  if (field.validity.stepMismatch) throw new Error(`Use increments of ${field.step} for ${label}.`);
  throw new Error(`Please enter a valid value for ${label}.`);
}
function parseImportJson(value) {
  try { return JSON.parse(value); } catch { throw new Error('Please choose a valid JSON batch file.'); }
}

function changeBackground(profile) {
  backgroundVersion++; matchRequestSequence++;
  state.profile = profile; state.matches = null;
}
async function refreshMatches() {
  const profile = state.profile;
  if (!profile) return false;
  const version = backgroundVersion, sequence = ++matchRequestSequence;
  const current = () => version === backgroundVersion && sequence === matchRequestSequence && state.profile === profile;
  try {
    const response = await post('/api/matches', matchingPayload(profile));
    if (!current()) return false;
    state.matches = response.items;
    return true;
  } catch (error) { if (!current()) return false; throw error; }
}
function clearBackground() {
  changeBackground(null); state.matchFilter = '';
  const removed = writeStorage(keys.profile, null);
  toast(removed ? t('profileCleared') : 'Background cleared for this session. Browser storage could not be updated; previously saved background data may remain.');
  renderProfile();
}
const profileFormSnapshot = form => JSON.stringify([...new FormData(form).entries()]);
async function submitProfile(event) {
  event.preventDefault();
  const form = event.target; const values = new FormData(form);
  const number = key => values.get(key) === '' || values.get(key) === null ? null : Number(values.get(key));
  const type = values.get('languageType');
  const profile = { major: values.get('major').trim(), degreeStatus: values.get('degreeStatus'), classification: values.get('classification'), gpa: number('gpa'), gpaScale: number('gpaScale'), experienceYears: number('experienceYears'), language: { type, total: ['none', 'waiver'].includes(type) ? null : number('total'), testDate: ['none', 'waiver'].includes(type) ? null : values.get('testDate') || null, singleAttempt: values.has('singleAttempt'), atHome: values.has('atHome'), waiverBasis: values.get('waiverBasis'), components: Object.fromEntries(['listening', 'reading', 'writing', 'speaking'].map(k => [k, type === 'ielts' ? number(k) : null])) } };
  const version = backgroundVersion, sequence = ++matchRequestSequence, snapshot = profileFormSnapshot(form);
  const current = () => version === backgroundVersion && sequence === matchRequestSequence && state.view === 'profile' && form.isConnected && $('#profile-form') === form;
  const button = form.querySelector('button[type=submit]'), errorBox = $('#form-error'); button.disabled = true; errorBox.hidden = true;
  try {
    validateForm(form);
    const response = await post('/api/matches', matchingPayload(profile));
    if (!current()) return;
    if (profileFormSnapshot(form) !== snapshot) {
      errorBox.textContent = 'Your background or save preference changed while loading. Submit again to check the current form.';
      errorBox.hidden = false;
      return;
    }
    changeBackground(profile); state.matches = response.items; state.page = 1;
    const stored = writeStorage(keys.profile, values.has('remember') ? profile : null);
    toast(stored ? t('profileSuccess') : 'Background applied for this session. Browser storage could not be updated; previously saved background data may remain.');
    navigate('discover');
  }
  catch (error) { if (!current()) return; errorBox.textContent = error.message; errorBox.hidden = false; errorBox.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  finally { button.disabled = false; }
}
function ruleText(r) {
  if (r.kind === 'language') return Object.entries(r.tests).map(([kind, test]) => `${esc(t(kind))}: ${test.total}${test.componentMin !== undefined ? ` · each component ≥ ${test.componentMin}` : ''}`).join('<br>') + (r.testDateNotBefore ? `<br><small>Accepted test date: on or after ${esc(r.testDateNotBefore)} (inclusive). Published intake-specific rule, not a rolling expiry from today. <a href="${esc(r.testDateSourceUrl)}" target="_blank" rel="noopener noreferrer">Official test-date source ↗</a></small>` : '');
  if (r.kind === 'gpa') return `GPA ≥ ${r.min}/${r.scale}`;
  if (r.kind === 'classification') return t(r.min);
  if (r.kind === 'major') return r.any ? 'Any undergraduate discipline; all other criteria still apply.' : `${r.accepted.map(esc).join(', ')}${r.relatedAllowed ? '; related fields need confirmation' : ''}`;
  if (r.kind === 'experience') return `At least ${r.min} years${r.mandatory === false ? ' preferred (not mandatory)' : ' of relevant experience'}`;
  return esc(r.noteEn || r.labelEn);
}
function roundDeadline(r) { return r.deadlineAt ? `<time datetime="${esc(r.deadlineAt)}">${esc(r.deadline)} · ${esc(r.deadlineAt.slice(11, 16))} UTC+08:00</time>` : `${esc(r.deadline)} · cutoff time not recorded`; }
function comparisonLabel(a) { return `${a.asOfDate}${a.asOfInstant ? ` · ${new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(a.asOfInstant))}` : ''}`; }
function deadlineText(o) { return `${known(o.deadline)}${o.applicationRounds?.length ? `<small>Final recorded deadline; review each round:</small>${o.applicationRounds.map(r => `<small><strong>${esc(r.label)}:</strong> ${roundDeadline(r)}</small>`).join('')}` : ''}${o.applicationOpen ? `<small>Recorded opening: ${esc(o.applicationOpen)}</small>` : ''}${o.deadlineNote ? `<small>${esc(o.deadlineNote)}</small>` : ''}`; }
const offeringLabel = o => [o.intake, o.academicYear, o.mode].filter(Boolean).join(' · ') || 'Study option';
const offeringCaution = 'Fees and dates only. Applicant-category notes still apply; intake-specific entry requirements need confirmation.';
function offeringSummary(p) { return p.selectedOffering ? `<p class="offering-context"><strong>Selected study option</strong><br>${esc(offeringLabel(p.selectedOffering))}${p.selectedApplicant ? `<br>${esc(p.selectedApplicant.label)}` : ''}<small>${p.offerings.some(o => o.applicantCategoryRequired) ? 'Applicant category required. ' : ''}Category-specific notes still apply. Change this choice in programme details.</small></p>` : ''; }
function applicantSelector(p) {
  if (p.applicantContextStatus === 'stale') return '<p class="detail-note warning">Applicant-category evidence no longer matches the stored study option. Recheck the sources before choosing a category.</p>';
  if (!p.applicantOptions?.length) return p.offerings.some(o => o.applicantCategoryRequired) ? '<p class="detail-note warning">Some fees and dates depend on applicant category. Choose a specific intake and study mode first.</p>' : '';
  const e = p.applicantEvidence;
  return `<section class="study-option-panel applicant-panel"><div class="field"><label for="programme-applicant">Applicant category for this university</label><select id="programme-applicant" data-programme="${esc(p.id)}" aria-describedby="applicant-selection-note">${options([['', 'Not confirmed — do not assume a category'], ...p.applicantOptions.map(o => [o.id, o.label])], p.selectedApplicant?.id || '')}</select></div><p id="applicant-selection-note" class="detail-note">Use the university's classification, not your current location. The university must confirm your status. Changing intake or route clears this choice.</p><p class="detail-note">Fees/date sources read ${esc(e.checkedOn)} · independent review pending. <a href="${esc(e.feeSourceUrl)}" target="_blank" rel="noopener noreferrer">Fee source ↗</a> · <a href="${esc(e.dateSourceUrl)}" target="_blank" rel="noopener noreferrer">Date source ↗</a></p></section>`;
}
function applicationFees(p) { return p.offerings.map(o => o.applicationFee === undefined || o.applicationFee === null ? known(null) : `${money({ tuition: o.applicationFee, currency: o.currency })}<small>Separate from tuition; not an amount to pay through this platform.</small>`).join('<br>'); }
function offeringSelector(p) {
  if (!p.offeringOptions?.length || (p.offeringOptions.length < 2 && !p.selectedOffering && !remembered.entries[p.id] && !p.offeringOptions.some(o => o.mode || o.intake || o.academicYear))) return '';
  return `<section class="study-option-panel"><div class="field"><label for="programme-offering">Intake and study mode</label><select id="programme-offering" data-programme="${esc(p.id)}" aria-describedby="offering-selection-note">${options([['', 'All recorded study options — no selection'], ...p.offeringOptions.map(o => [o.id, offeringLabel(o)])], p.selectedOffering?.id || '')}</select></div><p id="offering-selection-note" class="detail-note">Applies to cards, comparison and export. Only explicitly remembered choices survive reload. Changing route clears this choice.</p><p class="detail-note warning">${offeringCaution}</p></section>`;
}
function applicationSummary(p) {
  const a = p.applicationTimeline;
  if (!a) return '';
  const upcoming = a.offerings.map(o => o.rounds?.find(r => r.id === o.nextRoundId)).filter(Boolean);
  return `<div class="application-summary"><strong>Application dates</strong><span class="application-badge" data-state="${esc(a.state)}">${esc(a.label)}</span>${upcoming.map(r => `<small class="next-round">Next recorded cutoff: ${esc(r.name)}<br>${roundDeadline(r)}</small>`).join('')}<small>Compared ${esc(comparisonLabel(a))} · UTC+08:00<br>Recorded dates only; not a live portal check.</small></div>`;
}
function applicationRounds(o) {
  if (!o.rounds?.length) return '';
  return `<section class="rounds-panel" aria-label="Recorded application rounds"><h4>Recorded application rounds</h4><p>Cutoff snapshots only; no live availability check or notifications. Refresh to update.</p><ol class="application-rounds">${o.rounds.map(r => `<li data-next="${r.id === o.nextRoundId}"><strong>${esc(r.name)}</strong>${r.id === o.nextRoundId ? '<small class="next-round">Next recorded cutoff</small>' : ''}<p>${roundDeadline(r)}<br>Opening: ${esc(r.openingDate || 'Not recorded')}</p><span class="application-badge" data-state="${esc(r.state)}">${esc(r.label)}</span><p>${esc(r.reason)}</p></li>`).join('')}</ol></section>`;
}
function applicationPanel(p) {
  const a = p.applicationTimeline;
  if (!a) return '';
  return `<section class="application-panel" aria-label="Application date comparison"><h3>Application date comparison</h3><p class="detail-note">Compared as of ${esc(comparisonLabel(a))} · UTC+08:00. This is separate from academic conditions and does not confirm that applications are currently accepted.</p><span class="application-badge" data-state="${esc(a.state)}">${esc(a.label)}</span><div class="application-offerings">${a.offerings.map(o => `<div><strong>${esc([o.mode, o.intake, o.academicYear].filter(Boolean).join(' · ') || 'Study option')}</strong>${o.rounds?.length ? applicationRounds(o) : `<p>Opening: ${esc(o.openingDate || 'Not recorded')} · Deadline: ${esc(o.deadline || 'Not recorded')}</p>${p.offerings.find(option => option.id === o.offeringId)?.deadlineNote ? `<p class="warning">${esc(p.offerings.find(option => option.id === o.offeringId).deadlineNote)}</p>` : ''}`}<span class="application-badge" data-state="${esc(o.state)}">${esc(o.label)}</span><p>${esc(o.reason)}</p><a href="${esc(o.sourceUrl)}" target="_blank" rel="noopener noreferrer">Official date source ↗</a><small>Source read: ${esc(o.sourceCheckedOn || 'Not confirmed')}</small></div>`).join('')}</div><p class="detail-note">${esc(a.disclaimer)}</p><button class="button secondary" data-action="refreshApplicationDates">Refresh date comparison</button><p class="detail-note">Refresh recalculates from stored records. It does not recheck the university website.</p></section>`;
}
function evidenceCoverage(p) { if (!p.fieldStatus) return ''; const labels = { academicYear: 'academicYear', major: 'majorCoverage', gpa: 'gpa', language: 'languageInfo', tuition: 'tuition', deadline: 'deadline', independentReview: 'reviewCoverage' }; return `<h3>${t('dataCoverage')}</h3><div class="checks">${Object.entries(p.fieldStatus).map(([key, f]) => `<div class="check-row"><span class="check-symbol ${f.status === 'known' ? 'pass' : 'unknown'}">${f.status === 'known' ? 'i' : '?'}</span><div><strong>${esc(t(labels[key] || key))} · ${t(f.status)}</strong><p>${esc(f.noteEn)}</p><a href="${esc(f.sourceUrl)}" target="_blank" rel="noopener noreferrer">${t('sources')} ↗</a></div></div>`).join('')}</div>${p.sources?.length ? `<h3>${t('evidenceSources')}</h3><ul>${p.sources.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.purpose)} ↗</a> · ${esc(s.checkedOn)}</li>`).join('')}</ul>` : ''}`; }
function scopeBadge(p) { return p.scope?.status === 'out_of_scope' ? badge('out_of_scope') : p.scope?.status === 'unconfirmed' ? badge('scopeUnconfirmed') : ''; }
function scopeWarning(p) { return ['out_of_scope', 'unconfirmed'].includes(p.scope?.status) ? `<p class="detail-note warning">${scopeBadge(p)} ${esc(p.scope.reasonEn)} <a href="${esc(p.scope.sourceUrl)}" target="_blank" rel="noopener noreferrer">${t('sources')} ↗</a> · ${esc(p.scope.checkedOn)}</p>` : ''; }
function directoryEvidence(p) {
  const d = p.directoryListing;
  if (!d) return '';
  return `<h3>${t('directoryEvidence')}</h3><p class="detail-note"><strong>${esc(d.nameEn)}</strong><br>${esc(d.noteEn)}<br><a href="${esc(d.sourceUrl)}" target="_blank" rel="noopener noreferrer">${t('openDirectory')} ↗</a> · ${esc(d.checkedOn)}</p>${d.variants.length ? `<details><summary>${t('directoryRoutes')} (${d.variants.length})</summary><ul>${d.variants.map(v=>`<li><a href="${esc(v.officialUrl)}" target="_blank" rel="noopener noreferrer">${esc(v.nameEn)} ↗</a></li>`).join('')}</ul></details>` : `<p><a href="${esc(d.programmeUrl)}" target="_blank" rel="noopener noreferrer">${t('officialPage')} ↗</a></p>`}`;
}
function sourceTarget(p) { return p.directoryListing && p.verification === 'catalogue_seed' ? (p.directoryListing.variants.length ? p.directoryListing.sourceUrl : p.directoryListing.programmeUrl) : p.officialUrl; }
function routeSelector(p) {
  if (!p.routeOptions?.length) return '';
  return `<section class="plain-panel"><div class="field"><label for="programme-route">Specific programme route</label><select id="programme-route" data-programme="${esc(p.id)}">${options([['', 'No route selected — keep group unresolved'], ...p.routeOptions.map(r => [r.id, r.name + (r.scope?.status === 'unconfirmed' ? ' — cross-border scope unconfirmed' : '')])], p.selectedRoute?.id || '')}</select></div><p class="detail-note">Each route uses its own sources, requirements and offering year. Only explicitly remembered choices survive reload. Selection does not confirm eligibility or independent review. Changing it also updates background checks and comparisons.</p>${p.selectedRoute ? `<p class="detail-note"><strong>Selected route:</strong> ${esc(p.selectedRoute.name)} · ${esc(p.lastChecked)}<br>Partial requirements; independent review pending.</p>` : ''}</section>`;
}
function requirementChecks(p) {
  if (p.scope?.status === 'out_of_scope') return scopeWarning(p);
  if (savedOptionIssues[p.id]) return '<p class="detail-note warning">Saved-option eligibility checks are withheld until you review and update or forget the remembered choices above.</p>';
  const match = contextMatch(p);
  const checks = match?.checks;
  if (checks) return `<div class="badge-row">${badge(match.tier || match.status)}${!match.tier ? `<span class="badge">${t('noTier')}</span>` : ''}</div><div class="checks">${checks.map(c => `<div class="check-row"><span class="check-symbol ${c.status}">${c.status === 'pass' ? '✓' : c.status === 'fail' ? '!' : '?'}</span><div><strong>${esc(c.labelEn)} · ${t(c.status === 'unknown' ? 'unknownCheck' : c.status)}</strong><p>${esc(c.reasonEn)}</p><a href="${esc(c.sourceUrl)}" target="_blank" rel="noopener noreferrer">${t('sources')} ↗</a></div></div>`).join('')}</div><p class="detail-note">${esc(match.disclaimerEn)}</p>`;
  return `<p class="detail-note">${t('profileNeeded')}</p>${p.rules.length ? `<div class="checks">${p.rules.map(r => `<div class="check-row"><span class="check-symbol">i</span><div><strong>${esc(r.labelEn)}</strong><p>${ruleText(r)}</p><a href="${esc(r.sourceUrl)}" target="_blank" rel="noopener noreferrer">${t('sources')} ↗</a></div></div>`).join('')}</div>` : `<p class="detail-note warning">${t('emptyKnown')}</p>`}<button class="button secondary" data-action="nav" data-view="profile">${t('profile')}${icon('arrow')}</button>`;
}
function detailStatus(id, error = null) {
  const heading = error ? 'Programme details unavailable' : 'Loading programme details';
  return `<div class="detail-head"><div><h2 id="detail-title">${heading}</h2><small>${esc(id)}</small></div><button class="icon-button" data-action="closeDetail" aria-label="${t('close')}">${icon('close')}</button></div><div class="detail-body">${error ? `<p role="alert">${esc(error.message || 'Please try again.')}</p><p class="detail-note">No previous programme details are shown.</p><div class="detail-actions"><button class="button primary" data-action="detail" data-id="${esc(id)}">${t('retry')}</button>${remembered.entries[id] ? `<button class="button" data-action="forgetOptions" data-id="${esc(id)}">Forget remembered choices</button>` : ''}</div>` : `<p role="status" aria-live="polite">${t('loading')}</p>`}</div>`;
}
async function openDetail(id) {
  const sequence = ++detailSequence;
  const dialog = $('#detail-dialog');
  if (!dialog.contains(document.activeElement)) detailTrigger = document.activeElement;
  activeDetail = null;
  dialog.innerHTML = detailStatus(id);
  dialog.scrollTop = 0;
  if (!dialog.open) dialog.showModal(); document.body.classList.add('modal-open');
  const url = new URL(location.href); url.searchParams.set('programme', id); history.replaceState(null, '', url);
  dialog.querySelector('[data-action=closeDetail]').focus();
  try {
    const p = await api(programmePath(id));
    if (sequence !== detailSequence || !dialog.open) return;
    activeDetail = p;
    dialog.innerHTML = `<div class="detail-head"><div><span class="badge">${esc(p.university.abbreviation)} · ${t(p.university.region === 'HK' ? 'hongKong' : 'singapore')}</span><h2 id="detail-title">${esc(p.name)}</h2><div class="badge-row">${badge(p.verification)}${p.directoryListing?.variants.length && !p.selectedRoute ? badge('routeSelection') : ''}${scopeBadge(p)}${p.admissionRoute === 'transfer_only' ? badge('transferOnly') : ''}</div></div><button class="icon-button" data-action="closeDetail" aria-label="${t('close')}">${icon('close')}</button></div>
      <div class="detail-body">
        <div class="detail-meta">${[['university', schoolName(p.university)], ['area', areaName(p.area)], ['academicYear', p.academicYear], ['lastChecked', p.lastChecked], ['completeStatus', t(p.requirementsCoverage)]].map(([key, value]) => `<div><small>${t(key)}</small><span>${known(value)}</span></div>`).join('')}</div>
        <h3>${t('offeringInfo')}</h3>
        <div class="detail-offerings">${p.offerings.map(o => `<div class="offering"><strong>${known(o.mode)}</strong> · ${known(o.duration)}${o.applicantCategory ? `<small>${esc(o.applicantCategory.label)}</small>` : ''}<br>${money(o)}<small>${known(o.feeBasis)} · ${t('academicYear')}: ${known(o.academicYear || p.academicYear)}</small>${o.applicationFee !== undefined && o.applicationFee !== null ? `<small>Application fee: ${money({ tuition: o.applicationFee, currency: o.currency })} · separate from tuition</small>` : ''}${o.feeEvidence ? `<small>Fee source read: ${esc(o.feeEvidence.checkedOn)} · <a href="${esc(o.feeEvidence.sourceUrl)}" target="_blank" rel="noopener noreferrer">Official source ↗</a></small>` : ''}<small>${t('intake')}: ${known(o.intake)} · ${t('deadline')}: ${deadlineText(o)}</small></div>`).join('')}</div>
        <h3>${t('requirementChecks')}</h3>${requirementChecks(p)}${evidenceCoverage(p)}${directoryEvidence(p)}
        <h3>${t('notes')}</h3><p class="detail-note">${esc(p.notesEn)}</p>${p.legacyRequirements?.length ? `<p class="detail-note warning">${t('legacyWarning')}</p>` : ''}<p class="detail-note warning">${t('noProbability')}</p>
        <div class="detail-actions"><a class="button primary" href="${esc(sourceTarget(p))}" target="_blank" rel="noopener noreferrer">${t(p.selectedRoute || !p.directoryListing?.variants.length ? 'officialPage' : 'openDirectory')}${icon('external')}</a><button class="button" data-action="save" data-id="${p.id}">${icon('shortlist')}${t(state.shortlist.includes(p.id) ? 'saved' : 'save')}</button></div>
      </div>`;
    dialog.querySelector('.detail-body').insertAdjacentHTML('afterbegin', routeSelector(p) + scopeWarning(p) + offeringSelector(p) + applicantSelector(p) + rememberPanel(p));
    dialog.querySelector('.detail-meta').insertAdjacentHTML('afterend', applicationPanel(p));
    dialog.querySelector('[data-action=closeDetail]').focus();
  } catch (error) {
    if (sequence !== detailSequence || !dialog.open) return;
    activeDetail = null;
    dialog.innerHTML = detailStatus(id, error);
    dialog.scrollTop = 0;
    dialog.querySelector('[data-action=detail]').focus();
  }
}
function closeDetail() { const dialog = $('#detail-dialog'); if (dialog.open) dialog.close(); }
function restoreDetailFocus() {
  if (detailTrigger?.isConnected) { detailTrigger.focus(); return; }
  const dialog = $('#detail-dialog');
  const replacement = detailTrigger?.dataset?.action === 'detail' ? [...document.querySelectorAll('[data-action="detail"]')].find(button => !dialog.contains(button) && button.dataset.id === detailTrigger.dataset.id && button.textContent === detailTrigger.textContent) : null;
  (replacement || $('#main'))?.focus();
}
$('#detail-dialog').addEventListener('close', () => { detailSequence++; document.body.classList.remove('modal-open'); activeDetail = null; const url = new URL(location.href); url.searchParams.delete('programme'); history.replaceState(null, '', url); restoreDetailFocus(); });
async function renderCompare({ restoreFocus = () => {} } = {}) {
  const ids = [...state.compare];
  $('#page').innerHTML = `${heading('compareHeading', 'compareIntro')}${ids.length < 2 ? empty('emptyCompare', 'emptyCompareHint', 'compare') : `<div id="compare-results" aria-busy="true"><p class="muted" role="status">${t('loading')}</p></div>`}`;
  if (ids.length < 2) { restoreFocus(); return; }
  const target = $('#compare-results');
  try {
  const loaded = await selectedProgrammes(ids);
  if (!currentSavedView('compare', '#compare-results', target)) return;
  const items = loaded.filter(p => !p.unavailable);
  const attention = loaded.filter(p => p.unavailable).map(p => unavailableCard(p, 'compare')).join('') + items.map(p => savedOptionWarning(p.id)).join('');
  if (items.length < 2) { target.innerHTML = `${attention}${empty('emptyCompare', 'emptyCompareHint', 'compare')}`; target.setAttribute('aria-busy', 'false'); restoreFocus(); return; }
  const rows = [['university', p => esc(schoolName(p.university))], ['area', p => esc(areaName(p.area))], ['studyOption', p => `${p.selectedOffering ? esc(offeringLabel(p.selectedOffering)) : 'All recorded study options — no selection'}<small>${p.selectedOffering ? offeringCaution : 'Review each option separately; applicant-category notes still apply.'}</small><button class="button" data-action="detail" data-id="${esc(p.id)}">Change study option</button>`], ['academicYear', p => known(p.academicYear)], ['mode', p => p.offerings.map(o => known(o.mode)).join('<br>')], ['duration', p => p.offerings.map(o => known(o.duration)).join('<br>')], ['tuition', p => fees(p, true)], ['deadline', p => p.offerings.map(o => deadlineText(o)).join('<br>')], ['applicationDates', p => applicationSummary(p)], ['verification', p => badge(p.verification)], ['lastChecked', p => known(p.lastChecked)], ['requirementChecks', p => p.rules.length ? p.rules.map(r => `${esc(r.labelEn)}<small>${ruleText(r)}</small>`).join('<br>') : known(null)], ['matchingFilter', p => { const m = contextMatch(p); return m ? badge(m.tier || m.status) : `<span class="muted">${t('profileNeeded')}</span>`; }], ['sources', p => `<a href="${esc(sourceTarget(p))}" target="_blank" rel="noopener noreferrer">${t('officialPage')} ↗</a>`]];
  rows[rows.findIndex(([label]) => label === 'matchingFilter')][1] = p => savedOptionIssues[p.id] ? '<span class="warning">Saved choices need review</span>' : contextMatch(p) ? badge(contextMatch(p).tier || contextMatch(p).status) : `<span class="muted">${t('profileNeeded')}</span>`;
  rows.splice(3, 0, ['applicantCategory', p => `${esc(p.selectedApplicant?.label || (p.offerings.some(o => o.applicantCategoryRequired) ? 'Applicant category required' : 'No category selected; check the official rules'))}${p.applicantEvidence ? `<small>Fee/date sources read ${esc(p.applicantEvidence.checkedOn)} · not a status determination</small>` : ''}`]);
  rows.splice(rows.findIndex(([label]) => label === 'tuition') + 1, 0, ['applicationFee', applicationFees]);
  rows.splice(3, 0, ['deliveryScope', p => scopeWarning(p) || '<small>Study locations are not separately confirmed here; check the official route.</small>']);
  target.innerHTML = `${attention}<p id="compare-scroll-hint" class="detail-note">More columns? Scroll horizontally, or focus the table area and use the left/right arrow keys.</p><div class="table-wrap" role="region" aria-label="Programme comparison table" aria-describedby="compare-scroll-hint" tabindex="0"><table class="compare-table"><thead><tr><th scope="col">${t('compare')}</th>${items.map(p => `<th scope="col"><span class="badge">${esc(p.university.abbreviation)}</span><h3>${esc(p.name)}</h3><button class="button" data-action="compare" data-id="${p.id}" aria-label="Remove ${esc(p.name)} from comparison">${t('remove')}</button></th>`).join('')}</tr></thead><tbody>${rows.map(([label, get]) => `<tr><th scope="row">${t(label)}</th>${items.map(p => `<td>${get(p)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="detail-note warning">${t('noProbability')}</p>`;
  target.setAttribute('aria-busy', 'false');
  restoreFocus();
  } catch {
    if (currentSavedView('compare', '#compare-results', target)) { savedViewError(target); restoreFocus(); }
  }
}
function renderData() {
  const q = state.meta.quality;
  $('#page').innerHTML = `${heading('dataHeading', 'dataIntro')}${metrics([[q.total, 'totalRecords', 'explore'], [q.browsable, 'browsableRecords', 'school'], [q.peerReviewed, 'independentReview', 'check'], [q.complete, 'completeRequirements', 'data']])}${notice()}<div class="data-grid"><section><h2>${t('schoolCoverage')}</h2><div class="table-wrap"><table><thead><tr><th>${t('school')}</th><th>${t('records')}</th><th>${t('checked')}</th><th>${t('officialMasterCount')}</th><th>${t('review')}</th></tr></thead><tbody>${q.schools.map(u => `<tr><td><strong>${esc(u.abbreviation)}</strong><br><small class="muted">${esc(schoolName(u))}</small><br><a href="${esc(u.directoryUrl)}" target="_blank" rel="noopener noreferrer"><small>${t('openDirectory')} ↗</small></a>${u.directoryAudit ? `<br><small class="muted">${t(u.directoryAudit.entryStatus)} · ${esc(u.directoryAudit.checkedOn)}</small>` : ''}</td><td>${u.seeds}</td><td>${u.checked}</td><td>${u.directoryAudit?.confirmedProgrammeCount ?? (u.directoryAudit?.directoryMasterEntryCount ? `${u.directoryAudit.directoryMasterEntryCount}<br><small>${t('schemeReconciliation')}</small>` : `<small class="muted">${t('notEnumerated')}</small>`)}</td><td>${u.peerReviewed}</td></tr>`).join('')}</tbody></table></div><p class="detail-note">${t('directoryAuditNote')}</p></section><section><div class="plain-panel"><h2>${t('maintenance')}</h2><p>${t('maintenanceText')}</p><p>${t('transferExcluded')}: <strong>${q.transferOnly}</strong><br>${t('scopeExcluded')}: <strong>${q.outOfScope}</strong><br>${t('scopeAuditDate')}: ${known(q.scopeAuditDate)}<br>${'Original catalogue snapshot'}: ${q.snapshotDate}<br>${t('directoryAuditDate')}: ${known(q.directoryAuditDate)}</p>${q.sourceRefreshConflicts?.length ? `<p class="detail-note warning">${t('sourceRefreshPending')}: ${q.sourceRefreshConflicts.length}<br>${q.sourceRefreshConflicts.map(esc).join(', ')}</p>` : ''}<a class="button secondary" href="/api/export" download>${t('exportData')}${icon('data')}</a></div><div class="plain-panel"><p>${t(state.meta.adminEnabled ? 'adminEnabled' : 'adminDisabled')}</p>${state.meta.adminEnabled ? `<form id="import-form" class="admin-fields" novalidate><div class="field"><label for="admin-token">${t('token')}</label><input id="admin-token" type="password" required autocomplete="off" minlength="24"></div><div class="field"><label for="batch-file">${t('batchFile')}</label><input id="batch-file" class="visually-hidden" tabindex="-1" type="file" accept="application/json,.json" required><button type="button" class="button secondary" data-action="chooseFile">${t('chooseFile')}</button><small id="batch-file-name" class="muted">${t('noFile')}</small></div><button class="button primary" type="submit">${t('importBatch')}</button><div id="import-error" class="form-error" hidden></div></form>` : ''}</div></section></div>`;
}
function renderGuide() { $('#page').innerHTML = `${heading('guideHeading', 'matchingIntro')}<div class="guide-steps">${[1, 2, 3, 4].map(i => `<section class="guide-step"><div class="step-number">0${i}</div><h2>${t(`step${i}`)}</h2><p>${t(`step${i}Text`)}</p></section>`).join('')}</div>${[['categoriesTitle', 'categoriesText'], ['privacyTitle', 'privacyText'], ['riskTitle', 'riskText']].map(([title, body]) => `<section class="plain-panel"><h2>${t(title)}</h2><p>${t(body)}</p></section>`).join('')}`; }
async function renderView() {
  const view = state.view, page = $('#page');
  try { if (state.view === 'discover') renderDiscover(); else if (state.view === 'profile') renderProfile(); else if (state.view === 'shortlist') await renderShortlist(); else if (state.view === 'compare') await renderCompare(); else if (state.view === 'data') renderData(); else renderGuide(); }
  catch (error) { if (state.view !== view || !page?.isConnected || $('#page') !== page) return; page.innerHTML = `${empty('errorHeading', 'errorHint', 'data')}<button class="button" data-action="rerender">${t('retry')}</button>`; toast(error.message); }
  if (state.view !== view || !page?.isConnected || $('#page') !== page) return;
  if (state.view === 'data' && state.meta.routeEvidence?.routes) { const r = state.meta.routeEvidence; $('#page').insertAdjacentHTML('beforeend', `<section class="plain-panel"><h2>Route-specific evidence</h2><p>${r.pageChecked} route page checks across ${r.groups} catalogue group; ${r.peerReviewed} independent reviews; ${r.complete} complete requirement sets. These are separate route snapshots, not additional catalogue records or completed group-level checks.</p><p>Choose a specific direction in its programme detail. Unselected groups remain unresolved, and route-specific sources never overwrite parent or sibling requirements.</p></section>`); }
  if (state.view === 'data' && state.meta.applicantEvidence?.studyOptions) { const a = state.meta.applicantEvidence; $('#page').insertAdjacentHTML('beforeend', `<section class="plain-panel"><h2>Applicant-category fee/date evidence</h2><p>${a.categories} recorded categories for ${a.studyOptions} study option; ${a.peerReviewed} independent reviews. These are limited fee/date source checks, not additional programmes or complete admissions reviews. Categories are university-specific and are never inferred from residence, nationality or background.</p></section>`); }
}
function showView() {
  shell(); renderView();
  window.scrollTo({ top: 0 });
  $('#main')?.focus({ preventScroll: true });
}
function navigate(view) { closeDetail(); if (location.hash === `#${view}`) { state.view = view; showView(); } else location.hash = view; }
function updateSavedButtons() { document.querySelectorAll('[data-action=save]').forEach(button => { const saved = state.shortlist.includes(button.dataset.id); button.setAttribute('aria-pressed', String(saved)); button.classList.toggle('selected', saved); if (button.classList.contains('icon-button')) { const title = button.closest('article')?.querySelector('h3')?.textContent || ''; button.setAttribute('aria-label', `${t(saved ? 'saved' : 'save')} · ${title}`); } else button.innerHTML = `${icon('shortlist')}${t(saved ? 'saved' : 'save')}`; }); updateTray(); refreshRememberPanel(); }
function downloadJson(value, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  try { const a = document.createElement('a'); a.href = url; a.download = name; a.click(); }
  finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
const shortlistExportContext = ids => JSON.stringify(ids.map(id => [id, routeChoices[id] || null, offeringChoices[id] || null, applicantChoices[id] || null, remembered.entries[id] || null, savedOptionIssues[id] || null]));
async function exportShortlist(trigger) {
  if (!trigger || trigger.disabled || !trigger.isConnected || state.view !== 'shortlist' || !state.shortlist.length || $('#page [data-action=exportShortlist]') !== trigger) return false;
  const sequence = ++shortlistExportSequence, ids = [...state.shortlist], snapshot = shortlistExportContext(ids);
  const saved = Object.fromEntries(ids.filter(id => remembered.entries[id]).map(id => [id, { ...remembered.entries[id] }]));
  const status = $('#shortlist-export-status'), label = trigger.textContent, focused = document.activeElement === trigger;
  const current = () => sequence === shortlistExportSequence && state.view === 'shortlist' && trigger.isConnected && $('#page [data-action=exportShortlist]') === trigger;
  const unchanged = () => shortlistExportContext(state.shortlist) === snapshot;
  const note = message => { if (current() && status?.isConnected) status.textContent = message; };
  const changed = () => note('Your shortlist or programme choices changed while preparing the download. Nothing was downloaded; export again to use the current choices.');
  let requesting = false;
  trigger.disabled = true; trigger.textContent = 'Preparing download…';
  note('Preparing the current shortlist. Background information is not included.');
  try {
    const programmes = await selectedProgrammes(ids);
    if (!current()) return false;
    if (!unchanged()) { changed(); return false; }
    if (programmes.length !== ids.length || programmes.some((programme, index) => programme.id !== ids[index])) throw new Error('Unexpected shortlist response');
    const output = shortlistExport(programmes, saved);
    requesting = true;
    downloadJson(output, 'gradpath-shortlist.json');
    note(`Download requested. Check your browser's downloads. Programme records: ${output.programmes.length}. Unresolved selections: ${output.unresolved.length}. Published evidence and unresolved conditions are included, not a complete admissions assessment. Background information and matching results are not included.`);
    return true;
  } catch {
    if (!current()) return false;
    if (!unchanged()) { changed(); return false; }
    note(requesting ? "The download could not be confirmed. Check your browser's downloads before trying again. Your shortlist is unchanged." : 'Could not prepare the download. Nothing was downloaded; your shortlist is unchanged. Please try again.');
    return false;
  } finally {
    trigger.disabled = false; trigger.textContent = label;
    if (current() && focused && document.activeElement === document.body && !$('#detail-dialog')?.open) trigger.focus({ preventScroll: true });
  }
}
document.addEventListener('click', async event => {
  const trigger = event.target.closest('[data-action]'); if (!trigger || trigger.disabled) return;
  const { action, id, view, value } = trigger.dataset;
  try {
  if (action === 'nav') navigate(view);
  if (action === 'chooseFile') $('#batch-file').click();
  if (action === 'region') { state.region = value; state.school = ''; state.page = 1; syncUrl(); renderDiscover(); [...document.querySelectorAll('[data-action=region]')].find(button => button.dataset.value === value)?.focus(); }
  if (action === 'reset') { for (const key of ['q', 'region', 'school', 'area', 'mode', 'verification', 'matchFilter']) state[key] = ''; state.page = 1; syncUrl(); renderDiscover(); $('#search')?.focus(); }
  if (action === 'page') { state.page = Number(value); await loadCatalogue({ focusResults: true }); }
  if (action === 'detail') await openDetail(id);
  if (action === 'closeDetail') closeDetail();
  if (action === 'rememberOptions') {
    if (!state.shortlist.includes(id) && !state.compare.includes(id)) throw new Error('Save or compare this programme before remembering its choices.');
    if (!remembered.entries[id] && Object.keys(remembered.entries).length >= 500) throw new Error('You can remember choices for up to 500 programmes. Forget an existing choice first.');
    trigger.disabled = true;
    try {
      const p = await api(programmePath(id));
      if (!p.selectedRoute && !p.selectedOffering && !p.selectedApplicant) throw new Error('Choose a route, intake or study mode first.');
      const next = { ...remembered.entries, [id]: optionSnapshot(p) };
      if (writeStorage(keys.choices, savedOptionsPayload(next))) {
        remembered.entries = next; delete savedOptionIssues[id];
        refreshRememberPanel(); await renderView(); toast('Programme choices remembered in this browser. No background or prices were saved.');
      }
    } finally { trigger.disabled = false; }
  }
  if (action === 'forgetOptions') {
    const next = { ...remembered.entries }; delete next[id];
    if (writeStorage(keys.choices, savedOptionsPayload(next))) {
      remembered.entries = next; delete savedOptionIssues[id];
      refreshRememberPanel(); await renderView();
      toast('Remembered choices removed. The programme stays in your lists; current choices are temporary.');
    }
  }
  if (action === 'refreshApplicationDates') {
    const programmeId = activeDetail?.id; const originalTrigger = detailTrigger;
    trigger.disabled = true;
    try {
      if (state.profile) await refreshMatches();
      await renderView();
      if (programmeId && activeDetail?.id === programmeId && $('#detail-dialog').open) { await openDetail(programmeId); detailTrigger = originalTrigger; }
      toast('Date comparison refreshed from stored records; the official website was not rechecked.');
    } finally { trigger.disabled = false; }
  }
  if (action === 'save') { const restoreFocus = selectionFocus(trigger); const exists = state.shortlist.includes(id); if (!exists && state.shortlist.length >= 500) throw new Error('You can save up to 500 programmes.'); const next = exists ? state.shortlist.filter(x => x !== id) : [...state.shortlist, id]; if (!writeStorage(keys.shortlist, next)) return; state.shortlist = next; pruneRememberedOptions(); toast(t(exists ? 'removedToast' : 'savedToast')); updateSavedButtons(); if (state.view === 'shortlist') await renderShortlist({ restoreFocus }); }
  if (action === 'compare') { const restoreFocus = selectionFocus(trigger); let next; if (state.compare.includes(id)) next = state.compare.filter(x => x !== id); else if (state.compare.length < 4) next = [...state.compare, id]; else { if (trigger.type === 'checkbox') trigger.checked = false; toast(t('maxCompare')); return; } if (!writeStorage(keys.compare, next)) { if (trigger.type === 'checkbox') trigger.checked = state.compare.includes(id); return; } state.compare = next; pruneRememberedOptions(); document.querySelectorAll('input[data-action=compare]').forEach(input => { input.checked = state.compare.includes(input.dataset.id); }); updateTray(); refreshRememberPanel(); restoreFocus(); if (state.view === 'compare') await renderCompare({ restoreFocus }); }
  if (action === 'clearCompare') { const restoreFocus = selectionFocus(trigger); if (!writeStorage(keys.compare, [])) return; state.compare = []; pruneRememberedOptions(); updateTray(); refreshRememberPanel(); document.querySelectorAll('input[data-action=compare]').forEach(input => { input.checked = false; }); restoreFocus(); if (state.view === 'compare') await renderCompare({ restoreFocus }); }
  if (action === 'sample') { fillProfile({ major: 'Civil Engineering', degreeStatus: 'graduated', classification: 'second_upper', gpa: null, gpaScale: null, experienceYears: null, language: { type: 'ielts', total: 7, components: { listening: 6.5, reading: 6.5, writing: 6.5, speaking: 6.5 }, testDate: '2026-09-01', singleAttempt: true, atHome: false, waiverBasis: null } }); toast('Synthetic background for functional checks only.'); }
  if (action === 'clearProfile') clearBackground();
  if (action === 'retry') await loadCatalogue({ focusResults: true });
  if (action === 'rerender') await renderView();
  if (action === 'exportShortlist') await exportShortlist(trigger);
  } catch (error) { toast(error.message); }
});
document.addEventListener('input', event => { if (event.target.id === 'search') scheduleCatalogueSearch(event.target.value); });
document.addEventListener('change', event => { if (event.target.dataset.filter) { state[event.target.dataset.filter] = event.target.value; state.page = 1; syncUrl(); loadCatalogue(); } if (event.target.id === 'profile-languageType') languageFields(); if (event.target.id === 'batch-file') $('#batch-file-name').textContent = event.target.files[0]?.name || t('noFile'); });
document.addEventListener('change', async event => {
  if (!['programme-route', 'programme-offering', 'programme-applicant'].includes(event.target.id)) return;
  const control = event.target; const id = control.dataset.programme;
  const previousRoute = routeChoices[id]; const previousOffering = offeringChoices[id]; const previousMatches = state.matches; const trigger = detailTrigger;
  const previousProfile = state.profile, previousBackgroundVersion = backgroundVersion;
  const previousApplicant = applicantChoices[id];
  const dialog = $('#detail-dialog'); const scroll = dialog.scrollTop;
  dialog.querySelectorAll('select').forEach(select => { select.disabled = true; });
  if (control.id === 'programme-route') {
    if (control.value) routeChoices[id] = control.value; else delete routeChoices[id];
    delete offeringChoices[id];
    delete applicantChoices[id];
  } else if (control.id === 'programme-offering') {
    if (control.value) offeringChoices[id] = control.value; else delete offeringChoices[id];
    delete applicantChoices[id];
  } else if (control.value) applicantChoices[id] = control.value; else delete applicantChoices[id];
  try {
    await api(programmePath(id));
    if (state.profile) await refreshMatches();
    await renderView();
    if (activeDetail?.id === id && dialog.open) { await openDetail(id); detailTrigger = trigger; dialog.scrollTop = scroll; dialog.querySelector(`#${control.id}`)?.focus({ preventScroll: true }); }
  } catch (error) {
    if (previousRoute) routeChoices[id] = previousRoute; else delete routeChoices[id];
    if (previousOffering) offeringChoices[id] = previousOffering; else delete offeringChoices[id];
    if (previousApplicant) applicantChoices[id] = previousApplicant; else delete applicantChoices[id];
    if (state.profile === previousProfile && backgroundVersion === previousBackgroundVersion) state.matches = previousMatches;
    toast(error.message);
    if (activeDetail?.id === id && dialog.open) { await openDetail(id); detailTrigger = trigger; }
  } finally { dialog.querySelectorAll('select').forEach(select => { select.disabled = false; }); }
});
document.addEventListener('submit', async event => {
  if (event.target.id === 'profile-form') return submitProfile(event);
  if (event.target.id === 'import-form') {
    event.preventDefault(); const button = event.target.querySelector('button'); button.disabled = true;
    try { validateForm(event.target); const file = $('#batch-file').files[0]; if (file.size > 1024 * 1024) throw new Error('JSON batch must be under 1 MB'); const batch = parseImportJson(await file.text()); await post('/api/admin/import', batch, { Authorization: `Bearer ${$('#admin-token').value}` }); $('#admin-token').value = ''; state.meta = await api('/api/meta'); if (state.profile) await refreshMatches(); shell(); renderData(); toast(t('importSuccess')); }
    catch (error) { $('#import-error').hidden = false; $('#import-error').textContent = error.message; }
    finally { button.disabled = false; }
  }
});
window.addEventListener('hashchange', () => { const view = location.hash.slice(1); if (view === 'main') { $('#main')?.focus(); return; } state.view = ['discover', 'profile', 'shortlist', 'compare', 'data', 'guide'].includes(view) ? view : 'discover'; showView(); });
async function boot() {
  try { state.meta = await api('/api/meta'); await restoreRememberedOptions(); if (state.profile) { try { await refreshMatches(); } catch (error) { if (error.status !== 422) throw error; changeBackground(null); writeStorage(keys.profile, null); } } state.view = ['discover', 'profile', 'shortlist', 'compare', 'data', 'guide'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'discover'; shell(); await renderView(); if (remembered.rejected) toast('Some stored programme choices could not be read. Existing programme lists were preserved.'); const id = params.get('programme'); if (id) await openDetail(id); }
  catch (error) { $('#app').innerHTML = `<main class="content"><div class="brand"><span class="brand-mark">g.</span><strong>GradPath</strong></div><br><h1>${t('errorHeading')}</h1><p>${t('errorHint')}</p><button class="button" id="boot-retry">${t('retry')}</button></main>`; $('#boot-retry').addEventListener('click', boot); }
}
boot();
