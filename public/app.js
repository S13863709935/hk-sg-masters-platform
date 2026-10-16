import { copy, areaLabels } from './copy.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const paths = { explore: '<circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5z"/>', profile: '<circle cx="12" cy="8" r="3"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>', shortlist: '<path d="M6 4h12v17l-6-4-6 4z"/>', compare: '<rect x="3" y="5" width="7" height="15" rx="1"/><rect x="14" y="3" width="7" height="17" rx="1"/>', data: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 4 16 4 16 0V5M4 12v7c0 4 16 4 16 0v-7"/>', guide: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>', arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>', search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>', close: '<path d="m6 6 12 12M18 6 6 18"/>', school: '<path d="m2 9 10-6 10 6-10 6zM6 12v7c3 3 9 3 12 0v-7M22 9v8"/>', check: '<path d="m5 12 4 4L19 6"/>', external: '<path d="M13 4h7v7m0-7L10 14M9 4H4v16h16v-5"/>', globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>' };
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.guide}</svg>`;
const keys = { shortlist: 'gradpath.shortlist.v1', compare: 'gradpath.compare.v1', profile: 'gradpath.profile.v1' };
function readStorage(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function writeStorage(key, value) { try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(value)); } catch { toast(t('storageError')); } }
const savedIds = key => { const value = readStorage(key, []); return Array.isArray(value) ? [...new Set(value.filter(v => typeof v === 'string'))].slice(0, 500) : []; };
const params = new URLSearchParams(location.search);
const state = { view: 'discover', meta: null, profile: readStorage(keys.profile, null), matches: null, shortlist: savedIds(keys.shortlist), compare: savedIds(keys.compare).slice(0, 4), q: params.get('q') || '', region: params.get('region') || '', school: params.get('school') || '', area: params.get('area') || '', mode: params.get('mode') || '', verification: params.get('verification') || '', matchFilter: '', sort: 'quality', page: 1, limit: 12, items: [], total: 0 };
let requestSequence = 0;
let toastTimer;
let searchTimer;
let activeDetail = null;
let detailTrigger = null;
let detailSequence = 0;
const routeChoices = {};
const programmePath = id => `/api/programmes/${encodeURIComponent(id)}${routeChoices[id] ? `?route=${encodeURIComponent(routeChoices[id])}` : ''}`;
const matchingPayload = profile => ({ profile, filters: { includeTransfer: 'true' }, selectedRoutes: { ...routeChoices } });
const t = key => copy[key] || key;
const areaName = area => areaLabels[area] || area;
const schoolName = school => school.nameEn;
function toast(message) { const node = $('#toast'); node.textContent = message; node.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { node.hidden = true; }, 3500); }
async function api(path, options = {}) { const response = await fetch(path, options); const body = await response.json(); if (!response.ok) throw new Error(body.error || response.statusText); return body; }
const post = (path, data, extraHeaders = {}) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...extraHeaders }, body: JSON.stringify(data) });
function badge(value) { const kind = ['programme_page_checked', 'peer_reviewed'].includes(value) ? 'checked' : value === 'has_gap' ? 'danger' : value === 'meets_checked' ? 'pass' : 'warning'; return `<span class="badge ${kind}">${esc(t(value))}</span>`; }
function money(o) { return o.tuition !== null && o.tuition !== undefined && o.currency ? `${esc(o.currency)} ${new Intl.NumberFormat('en-SG', { minimumFractionDigits: Number.isInteger(o.tuition) ? 0 : 2, maximumFractionDigits: 2 }).format(o.tuition)}` : `<span class="unknown-value">${t('unknown')}</span>`; }
function fees(p, detailed = false) { return p.offerings.map(o => `${money(o)}<small>${esc([o.mode, o.intake].filter(Boolean).join(' · '))}</small>${detailed && o.feeBasis ? `<small>${esc(o.feeBasis)}</small>` : ''}`).join('<br>') + (p.fieldStatus?.tuition?.status === 'unknown' && p.offerings.some(o => o.tuition !== null) ? `<small class="warning">${t('cohortUnconfirmed')}</small>` : ''); }
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
  loadCatalogue();
}
function syncUrl() { const url = new URL(location.href); for (const key of ['q', 'region', 'school', 'area', 'mode', 'verification']) state[key] ? url.searchParams.set(key, state[key]) : url.searchParams.delete(key); history.replaceState(null, '', url); }
function filterMatches(items) {
  const q = state.q.trim().toLowerCase();
  return items.filter(p => p.admissionRoute !== 'transfer_only' && p.scope?.status !== 'out_of_scope' && (!q || [p.name, p.area, p.university.nameZh, p.university.nameEn, p.university.abbreviation, p.directoryListing?.nameEn, ...(p.directoryListing?.variants || []).map(v=>v.nameEn)].join(' ').toLowerCase().includes(q)) && (!state.region || p.university.region === state.region) && (!state.school || p.universityId === state.school) && (!state.area || p.area === state.area) && (!state.mode || p.offerings.some(o => o.mode?.toLowerCase().includes(state.mode))) && (!state.verification || p.verification === state.verification) && (!state.matchFilter || p.match.status === state.matchFilter));
}
async function loadCatalogue() {
  const seq = ++requestSequence;
  if (!$('#results')) return;
  $('#results').innerHTML = `<div class="cards" aria-busy="true">${[1, 2, 3].map(() => '<div class="skeleton"></div>').join('')}</div>`;
  try {
    let response;
    if (state.profile && state.matches) { const filtered = filterMatches(state.matches); if (state.sort === 'az') filtered.sort((a, b) => a.name.localeCompare(b.name)); response = { total: filtered.length, items: filtered.slice((state.page - 1) * state.limit, state.page * state.limit) }; }
    else { const query = new URLSearchParams(Object.fromEntries(['q', 'region', 'school', 'area', 'mode', 'verification', 'page', 'limit', 'sort'].map(k => [k, state[k]]))); if (Object.keys(routeChoices).length) query.set('routes', JSON.stringify(routeChoices)); response = await api(`/api/catalogue?${query}`); }
    if (seq !== requestSequence || state.view !== 'discover') return;
    state.items = response.items; state.total = response.total;
    renderResults();
  } catch (error) { if (seq === requestSequence && $('#results')) $('#results').innerHTML = `${empty('errorHeading', 'errorHint', 'data')}<button class="button" data-action="retry">${t('retry')}</button>`; }
}
function card(p) {
  const saved = state.shortlist.includes(p.id);
  const match = p.match || state.matches?.find(x => x.id === p.id)?.match;
  const mode = [...new Set(p.offerings.map(o => o.mode).filter(Boolean))].join(' / ');
  const duration = [...new Set(p.offerings.map(o => o.duration).filter(Boolean))].join(' / ');
  return `<article class="programme-card">
    <div class="card-top"><div class="school-tag"><span class="school-monogram">${esc(p.university.abbreviation)}</span><div>${esc(p.university.abbreviation)}<div class="region-code">${t(p.university.region === 'HK' ? 'hongKong' : 'singapore')}</div></div></div><button class="icon-button ${saved ? 'selected' : ''}" data-action="save" data-id="${p.id}" aria-label="${t(saved ? 'saved' : 'save')} · ${esc(p.name)}" aria-pressed="${saved}">${icon('shortlist')}</button></div>
    <h3><button class="card-title" data-action="detail" data-id="${p.id}">${esc(p.name)}</button></h3>
    <div class="badge-row"><span class="badge">${esc(areaName(p.area))}</span>${badge(p.verification)}${p.directoryListing?.variants.length ? badge('routeSelection') : ''}${p.scope?.status === 'out_of_scope' ? badge('out_of_scope') : ''}${p.admissionRoute === 'transfer_only' ? badge('transferOnly') : ''}</div>
    ${applicationSummary(p)}
    <div class="card-facts"><div class="card-fact"><small>${t('mode')}</small><span>${known(mode)}</span></div><div class="card-fact"><small>${t('duration')}</small><span>${known(duration)}</span></div><div class="card-fact"><small>${t('tuition')}</small><span>${p.offerings.filter(o => o.tuition !== null && o.currency).length ? fees(p) : known(null)}</span></div><div class="card-fact"><small>${t('academicYear')}</small><span>${known(p.academicYear)}</span></div></div>
    ${match ? `<div class="card-match">${badge(match.tier || match.status)}<small>${`Checked: ${match.counts.pass} met · ${match.counts.fail} gaps · ${match.counts.unknown} unresolved`}</small></div>` : ''}
    <div class="card-bottom"><label class="compare-check"><input type="checkbox" data-action="compare" data-id="${p.id}" ${state.compare.includes(p.id) ? 'checked' : ''}>${t('addCompare')}</label><button class="details-button" data-action="detail" data-id="${p.id}">${t('details')}${icon('arrow')}</button></div>
  </article>`;
}
function renderResults() {
  const pages = Math.max(1, Math.ceil(state.total / state.limit));
  $('#results').innerHTML = `<div class="results-header"><div class="results-count"><strong>${state.total}</strong> ${t('results')}</div><div class="sort-group"><label for="sort">${t('sort')}</label><select id="sort" data-filter="sort">${options([['quality', t(state.profile ? 'matchingFirst' : 'qualityFirst')], ['az', t('az')]], state.sort)}</select></div></div><section class="cards" aria-label="${t('searchResults')}">${state.items.length ? state.items.map(card).join('') : empty('noResults', 'noResultsHint', 'search')}</section>${state.total > state.limit ? `<nav class="pagination" aria-label="${'Pagination'}"><button class="button" data-action="page" data-value="${state.page - 1}" ${state.page <= 1 ? 'disabled' : ''}>${t('previous')}</button><span>${t('page')} ${state.page} ${t('of')} ${pages}</span><button class="button" data-action="page" data-value="${state.page + 1}" ${state.page >= pages ? 'disabled' : ''}>${t('next')}</button></nav>` : ''}`;
}
function empty(title, intro, symbol = 'shortlist') { return `<div class="empty-state"><div class="empty-icon">${icon(symbol)}</div><h2>${t(title)}</h2><p>${t(intro)}</p><button class="button secondary" data-action="nav" data-view="discover">${t('backExplore')}${icon('arrow')}</button></div>`; }
function updateTray() {
  if (!$('#tray-wrapper')) return;
  $('#tray-wrapper').innerHTML = state.compare.length ? `<aside class="compare-tray" aria-label="${t('compareSelection')}"><div><small>${t('compareSelection')} · ${state.compare.length}/4</small><div class="tray-chips">${state.compare.map(id => `<span class="tray-chip">${esc(state.meta.universities.find(u => id.startsWith(`${u.id}-`))?.abbreviation || id)}<button data-action="compare" data-id="${id}" aria-label="${t('remove')} ${id}">×</button></span>`).join('')}</div></div><div class="tray-actions"><button class="tray-clear" data-action="clearCompare">${t('clear')}</button><button class="button" data-action="nav" data-view="compare" ${state.compare.length < 2 ? 'disabled' : ''}>${t('compareNow')}${icon('arrow')}</button></div></aside>` : '';
  if ($('#shortlist-count')) $('#shortlist-count').textContent = state.shortlist.length;
}
async function selectedProgrammes(ids) { return Promise.all(ids.map(id => api(programmePath(id)))); }
async function renderShortlist() {
  $('#page').innerHTML = `${heading('shortlistHeading', 'shortlistIntro')}${state.shortlist.length ? `<div class="results-header"><span class="results-count">${state.shortlist.length} ${t('results')}</span><button class="button" data-action="exportShortlist">${t('downloadShortlist')}</button></div><small class="muted">${t('exportShortlistNote')}</small><div id="saved-cards" class="cards"></div>` : empty('emptyShortlist', 'emptyShortlistHint')}`;
  if (state.shortlist.length) { const items = await selectedProgrammes(state.shortlist); if (state.view === 'shortlist' && $('#saved-cards')) $('#saved-cards').innerHTML = items.map(card).join(''); }
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

async function submitProfile(event) {
  event.preventDefault();
  const form = event.target; const values = new FormData(form);
  const number = key => values.get(key) === '' || values.get(key) === null ? null : Number(values.get(key));
  const type = values.get('languageType');
  const profile = { major: values.get('major').trim(), degreeStatus: values.get('degreeStatus'), classification: values.get('classification'), gpa: number('gpa'), gpaScale: number('gpaScale'), experienceYears: number('experienceYears'), language: { type, total: ['none', 'waiver'].includes(type) ? null : number('total'), testDate: ['none', 'waiver'].includes(type) ? null : values.get('testDate') || null, singleAttempt: values.has('singleAttempt'), atHome: values.has('atHome'), waiverBasis: values.get('waiverBasis'), components: Object.fromEntries(['listening', 'reading', 'writing', 'speaking'].map(k => [k, type === 'ielts' ? number(k) : null])) } };
  const button = form.querySelector('button[type=submit]'); button.disabled = true; $('#form-error').hidden = true;
  try { validateForm(form); const response = await post('/api/matches', matchingPayload(profile)); state.profile = profile; state.matches = response.items; state.page = 1; writeStorage(keys.profile, values.has('remember') ? profile : null); toast(t('profileSuccess')); navigate('discover'); }
  catch (error) { $('#form-error').textContent = error.message; $('#form-error').hidden = false; $('#form-error').scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  finally { button.disabled = false; }
}
function ruleText(r) { if (r.kind === 'language') return Object.entries(r.tests).map(([kind, test]) => `${esc(t(kind))}: ${test.total}${test.componentMin !== undefined ? ` · each component ≥ ${test.componentMin}` : ''}`).join('<br>'); if (r.kind === 'gpa') return `GPA ≥ ${r.min}/${r.scale}`; if (r.kind === 'classification') return t(r.min); if (r.kind === 'major') return r.any ? 'Any undergraduate discipline; all other criteria still apply.' : `${r.accepted.map(esc).join(', ')}${r.relatedAllowed ? '; related fields need confirmation' : ''}`; if (r.kind === 'experience') return `At least ${r.min} years${r.mandatory === false ? ' preferred (not mandatory)' : ' of relevant experience'}`; return esc(r.noteEn || r.labelEn); }
function deadlineText(o) { return `${known(o.deadline)}${o.applicationOpen ? `<small>Applications open: ${esc(o.applicationOpen)}</small>` : ''}${o.deadlineNote ? `<small>${esc(o.deadlineNote)}</small>` : ''}`; }
function applicationSummary(p) {
  const a = p.applicationTimeline;
  if (!a) return '';
  return `<div class="application-summary"><strong>Application dates</strong><span class="application-badge" data-state="${esc(a.state)}">${esc(a.label)}</span><small>Compared ${esc(a.asOfDate)} · UTC+08:00<br>Recorded dates only; not a live portal check.</small></div>`;
}
function applicationPanel(p) {
  const a = p.applicationTimeline;
  if (!a) return '';
  return `<section class="application-panel" aria-label="Application date comparison"><h3>Application date comparison</h3><p class="detail-note">Compared as of ${esc(a.asOfDate)} · UTC+08:00. This is separate from academic conditions and does not confirm that applications are currently accepted.</p><span class="application-badge" data-state="${esc(a.state)}">${esc(a.label)}</span><div class="application-offerings">${a.offerings.map(o => `<div><strong>${esc([o.mode, o.intake, o.academicYear].filter(Boolean).join(' · ') || 'Study option')}</strong><p>Opening: ${esc(o.openingDate || 'Not recorded')} · Deadline: ${esc(o.deadline || 'Not recorded')}</p><span class="application-badge" data-state="${esc(o.state)}">${esc(o.label)}</span><p>${esc(o.reason)}</p><a href="${esc(o.sourceUrl)}" target="_blank" rel="noopener noreferrer">Official date source ↗</a><small>Source read: ${esc(o.sourceCheckedOn || 'Not confirmed')}</small></div>`).join('')}</div><p class="detail-note">${esc(a.disclaimer)}</p><button class="button secondary" data-action="refreshApplicationDates">Refresh date comparison</button><p class="detail-note">Refresh recalculates from stored records. It does not recheck the university website.</p></section>`;
}
function evidenceCoverage(p) { if (!p.fieldStatus) return ''; const labels = { academicYear: 'academicYear', major: 'majorCoverage', gpa: 'gpa', language: 'languageInfo', tuition: 'tuition', deadline: 'deadline', independentReview: 'reviewCoverage' }; return `<h3>${t('dataCoverage')}</h3><div class="checks">${Object.entries(p.fieldStatus).map(([key, f]) => `<div class="check-row"><span class="check-symbol ${f.status === 'known' ? 'pass' : 'unknown'}">${f.status === 'known' ? 'i' : '?'}</span><div><strong>${esc(t(labels[key] || key))} · ${t(f.status)}</strong><p>${esc(f.noteEn)}</p><a href="${esc(f.sourceUrl)}" target="_blank" rel="noopener noreferrer">${t('sources')} ↗</a></div></div>`).join('')}</div>${p.sources?.length ? `<h3>${t('evidenceSources')}</h3><ul>${p.sources.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.purpose)} ↗</a> · ${esc(s.checkedOn)}</li>`).join('')}</ul>` : ''}`; }
function scopeWarning(p) { return p.scope?.status === 'out_of_scope' ? `<p class="detail-note warning">${badge('out_of_scope')} ${esc(p.scope.reasonEn)} <a href="${esc(p.scope.sourceUrl)}" target="_blank" rel="noopener noreferrer">${t('sources')} ↗</a> · ${esc(p.scope.checkedOn)}</p>` : ''; }
function directoryEvidence(p) {
  const d = p.directoryListing;
  if (!d) return '';
  return `<h3>${t('directoryEvidence')}</h3><p class="detail-note"><strong>${esc(d.nameEn)}</strong><br>${esc(d.noteEn)}<br><a href="${esc(d.sourceUrl)}" target="_blank" rel="noopener noreferrer">${t('openDirectory')} ↗</a> · ${esc(d.checkedOn)}</p>${d.variants.length ? `<details><summary>${t('directoryRoutes')} (${d.variants.length})</summary><ul>${d.variants.map(v=>`<li><a href="${esc(v.officialUrl)}" target="_blank" rel="noopener noreferrer">${esc(v.nameEn)} ↗</a></li>`).join('')}</ul></details>` : `<p><a href="${esc(d.programmeUrl)}" target="_blank" rel="noopener noreferrer">${t('officialPage')} ↗</a></p>`}`;
}
function sourceTarget(p) { return p.directoryListing && p.verification === 'catalogue_seed' ? (p.directoryListing.variants.length ? p.directoryListing.sourceUrl : p.directoryListing.programmeUrl) : p.officialUrl; }
function routeSelector(p) {
  if (!p.routeOptions?.length) return '';
  return `<section class="plain-panel"><div class="field"><label for="programme-route">Specific programme route</label><select id="programme-route" data-programme="${esc(p.id)}">${options([['', 'No route selected — keep group unresolved'], ...p.routeOptions.map(r => [r.id, r.name])], p.selectedRoute?.id || '')}</select></div><p class="detail-note">Each route uses its own sources, requirements and offering year. Route selection is temporary for this page session; it does not confirm eligibility or independent review. Changing it also updates background checks and comparisons.</p>${p.selectedRoute ? `<p class="detail-note"><strong>Selected route:</strong> ${esc(p.selectedRoute.name)} · ${esc(p.lastChecked)}<br>Partial requirements; independent review pending.</p>` : ''}</section>`;
}
function requirementChecks(p) {
  if (p.scope?.status === 'out_of_scope') return scopeWarning(p);
  const match = state.matches?.find(item => item.id === p.id && (item.selectedRoute?.id || '') === (p.selectedRoute?.id || ''))?.match;
  const checks = match?.checks;
  if (checks) return `<div class="badge-row">${badge(match.tier || match.status)}${!match.tier ? `<span class="badge">${t('noTier')}</span>` : ''}</div><div class="checks">${checks.map(c => `<div class="check-row"><span class="check-symbol ${c.status}">${c.status === 'pass' ? '✓' : c.status === 'fail' ? '!' : '?'}</span><div><strong>${esc(c.labelEn)} · ${t(c.status === 'unknown' ? 'unknownCheck' : c.status)}</strong><p>${esc(c.reasonEn)}</p><a href="${esc(c.sourceUrl)}" target="_blank" rel="noopener noreferrer">${t('sources')} ↗</a></div></div>`).join('')}</div><p class="detail-note">${esc(match.disclaimerEn)}</p>`;
  return `<p class="detail-note">${t('profileNeeded')}</p>${p.rules.length ? `<div class="checks">${p.rules.map(r => `<div class="check-row"><span class="check-symbol">i</span><div><strong>${esc(r.labelEn)}</strong><p>${ruleText(r)}</p><a href="${esc(r.sourceUrl)}" target="_blank" rel="noopener noreferrer">${t('sources')} ↗</a></div></div>`).join('')}</div>` : `<p class="detail-note warning">${t('emptyKnown')}</p>`}<button class="button secondary" data-action="nav" data-view="profile">${t('profile')}${icon('arrow')}</button>`;
}
async function openDetail(id) {
  const sequence = ++detailSequence;
  detailTrigger = document.activeElement;
  const dialog = $('#detail-dialog');
  dialog.innerHTML = `<div class="detail-body">${t('loading')}</div>`;
  if (!dialog.open) dialog.showModal(); document.body.classList.add('modal-open');
  try {
    const p = await api(programmePath(id));
    if (sequence !== detailSequence || !dialog.open) return;
    activeDetail = p;
    const url = new URL(location.href); url.searchParams.set('programme', id); history.replaceState(null, '', url);
    dialog.innerHTML = `<div class="detail-head"><div><span class="badge">${esc(p.university.abbreviation)} · ${t(p.university.region === 'HK' ? 'hongKong' : 'singapore')}</span><h2 id="detail-title">${esc(p.name)}</h2><div class="badge-row">${badge(p.verification)}${p.directoryListing?.variants.length ? badge('routeSelection') : ''}${p.scope?.status === 'out_of_scope' ? badge('out_of_scope') : ''}${p.admissionRoute === 'transfer_only' ? badge('transferOnly') : ''}</div></div><button class="icon-button" data-action="closeDetail" aria-label="${t('close')}">${icon('close')}</button></div>
      <div class="detail-body">
        <div class="detail-meta">${[['university', schoolName(p.university)], ['area', areaName(p.area)], ['academicYear', p.academicYear], ['lastChecked', p.lastChecked], ['completeStatus', t(p.requirementsCoverage)]].map(([key, value]) => `<div><small>${t(key)}</small><span>${known(value)}</span></div>`).join('')}</div>
        <h3>${t('offeringInfo')}</h3>
        <div class="detail-offerings">${p.offerings.map(o => `<div class="offering"><strong>${known(o.mode)}</strong> · ${known(o.duration)}<br>${money(o)}<small>${known(o.feeBasis)} · ${t('academicYear')}: ${known(o.academicYear || p.academicYear)}</small><small>${t('intake')}: ${known(o.intake)} · ${t('deadline')}: ${deadlineText(o)}</small></div>`).join('')}</div>
        <h3>${t('requirementChecks')}</h3>${requirementChecks(p)}${evidenceCoverage(p)}${directoryEvidence(p)}
        <h3>${t('notes')}</h3><p class="detail-note">${esc(p.notesEn)}</p>${p.legacyRequirements?.length ? `<p class="detail-note warning">${t('legacyWarning')}</p>` : ''}<p class="detail-note warning">${t('noProbability')}</p>
        <div class="detail-actions"><a class="button primary" href="${esc(sourceTarget(p))}" target="_blank" rel="noopener noreferrer">${t(p.selectedRoute || !p.directoryListing?.variants.length ? 'officialPage' : 'openDirectory')}${icon('external')}</a><button class="button" data-action="save" data-id="${p.id}">${icon('shortlist')}${t(state.shortlist.includes(p.id) ? 'saved' : 'save')}</button></div>
      </div>`;
    dialog.querySelector('.detail-body').insertAdjacentHTML('afterbegin', routeSelector(p));
    dialog.querySelector('.detail-meta').insertAdjacentHTML('afterend', applicationPanel(p));
    dialog.querySelector('[data-action=closeDetail]').focus();
  } catch (error) { dialog.innerHTML = `<div class="detail-body"><p>${esc(error.message)}</p><button class="button" data-action="closeDetail">${t('close')}</button></div>`; }
}
function closeDetail() { const dialog = $('#detail-dialog'); if (dialog.open) dialog.close(); }
$('#detail-dialog').addEventListener('close', () => { detailSequence++; document.body.classList.remove('modal-open'); activeDetail = null; const url = new URL(location.href); url.searchParams.delete('programme'); history.replaceState(null, '', url); if (detailTrigger?.isConnected) detailTrigger.focus(); });
async function renderCompare() {
  $('#page').innerHTML = `${heading('compareHeading', 'compareIntro')}${state.compare.length < 2 ? empty('emptyCompare', 'emptyCompareHint', 'compare') : `<p class="muted">${t('loading')}</p>`}`;
  if (state.compare.length < 2) return;
  const items = await selectedProgrammes(state.compare);
  if (state.view !== 'compare') return;
  const rows = [['university', p => esc(schoolName(p.university))], ['area', p => esc(areaName(p.area))], ['academicYear', p => known(p.academicYear)], ['mode', p => p.offerings.map(o => known(o.mode)).join('<br>')], ['duration', p => p.offerings.map(o => known(o.duration)).join('<br>')], ['tuition', p => fees(p, true)], ['deadline', p => p.offerings.map(o => deadlineText(o)).join('<br>')], ['applicationDates', p => applicationSummary(p)], ['verification', p => badge(p.verification)], ['lastChecked', p => known(p.lastChecked)], ['requirementChecks', p => p.rules.length ? p.rules.map(r => `${esc(r.labelEn)}<small>${ruleText(r)}</small>`).join('<br>') : known(null)], ['matchingFilter', p => { const m = state.matches?.find(x => x.id === p.id)?.match; return m ? badge(m.tier || m.status) : `<span class="muted">${t('profileNeeded')}</span>`; }], ['sources', p => `<a href="${esc(sourceTarget(p))}" target="_blank" rel="noopener noreferrer">${t('officialPage')} ↗</a>`]];
  $('#page').innerHTML = `${heading('compareHeading', 'compareIntro')}<div class="table-wrap"><table class="compare-table"><thead><tr><th>${t('compare')}</th>${items.map(p => `<th><span class="badge">${esc(p.university.abbreviation)}</span><h3>${esc(p.name)}</h3><button class="button" data-action="compare" data-id="${p.id}">${t('remove')}</button></th>`).join('')}</tr></thead><tbody>${rows.map(([label, get]) => `<tr><td>${t(label)}</td>${items.map(p => `<td>${get(p)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="detail-note warning">${t('noProbability')}</p>`;
}
function renderData() {
  const q = state.meta.quality;
  $('#page').innerHTML = `${heading('dataHeading', 'dataIntro')}${metrics([[q.total, 'totalRecords', 'explore'], [q.browsable, 'browsableRecords', 'school'], [q.peerReviewed, 'independentReview', 'check'], [q.complete, 'completeRequirements', 'data']])}${notice()}<div class="data-grid"><section><h2>${t('schoolCoverage')}</h2><div class="table-wrap"><table><thead><tr><th>${t('school')}</th><th>${t('records')}</th><th>${t('checked')}</th><th>${t('officialMasterCount')}</th><th>${t('review')}</th></tr></thead><tbody>${q.schools.map(u => `<tr><td><strong>${esc(u.abbreviation)}</strong><br><small class="muted">${esc(schoolName(u))}</small><br><a href="${esc(u.directoryUrl)}" target="_blank" rel="noopener noreferrer"><small>${t('openDirectory')} ↗</small></a>${u.directoryAudit ? `<br><small class="muted">${t(u.directoryAudit.entryStatus)} · ${esc(u.directoryAudit.checkedOn)}</small>` : ''}</td><td>${u.seeds}</td><td>${u.checked}</td><td>${u.directoryAudit?.confirmedProgrammeCount ?? (u.directoryAudit?.directoryMasterEntryCount ? `${u.directoryAudit.directoryMasterEntryCount}<br><small>${t('schemeReconciliation')}</small>` : `<small class="muted">${t('notEnumerated')}</small>`)}</td><td>${u.peerReviewed}</td></tr>`).join('')}</tbody></table></div><p class="detail-note">${t('directoryAuditNote')}</p></section><section><div class="plain-panel"><h2>${t('maintenance')}</h2><p>${t('maintenanceText')}</p><p>${t('transferExcluded')}: <strong>${q.transferOnly}</strong><br>${t('scopeExcluded')}: <strong>${q.outOfScope}</strong><br>${t('scopeAuditDate')}: ${known(q.scopeAuditDate)}<br>${'Original catalogue snapshot'}: ${q.snapshotDate}<br>${t('directoryAuditDate')}: ${known(q.directoryAuditDate)}</p>${q.sourceRefreshConflicts?.length ? `<p class="detail-note warning">${t('sourceRefreshPending')}: ${q.sourceRefreshConflicts.length}<br>${q.sourceRefreshConflicts.map(esc).join(', ')}</p>` : ''}<a class="button secondary" href="/api/export" download>${t('exportData')}${icon('data')}</a></div><div class="plain-panel"><p>${t(state.meta.adminEnabled ? 'adminEnabled' : 'adminDisabled')}</p>${state.meta.adminEnabled ? `<form id="import-form" class="admin-fields" novalidate><div class="field"><label for="admin-token">${t('token')}</label><input id="admin-token" type="password" required autocomplete="off" minlength="24"></div><div class="field"><label for="batch-file">${t('batchFile')}</label><input id="batch-file" class="visually-hidden" tabindex="-1" type="file" accept="application/json,.json" required><button type="button" class="button secondary" data-action="chooseFile">${t('chooseFile')}</button><small id="batch-file-name" class="muted">${t('noFile')}</small></div><button class="button primary" type="submit">${t('importBatch')}</button><div id="import-error" class="form-error" hidden></div></form>` : ''}</div></section></div>`;
}
function renderGuide() { $('#page').innerHTML = `${heading('guideHeading', 'matchingIntro')}<div class="guide-steps">${[1, 2, 3, 4].map(i => `<section class="guide-step"><div class="step-number">0${i}</div><h2>${t(`step${i}`)}</h2><p>${t(`step${i}Text`)}</p></section>`).join('')}</div>${[['categoriesTitle', 'categoriesText'], ['privacyTitle', 'privacyText'], ['riskTitle', 'riskText']].map(([title, body]) => `<section class="plain-panel"><h2>${t(title)}</h2><p>${t(body)}</p></section>`).join('')}`; }
async function renderView() {
  try { if (state.view === 'discover') renderDiscover(); else if (state.view === 'profile') renderProfile(); else if (state.view === 'shortlist') await renderShortlist(); else if (state.view === 'compare') await renderCompare(); else if (state.view === 'data') renderData(); else renderGuide(); }
  catch (error) { if ($('#page')) $('#page').innerHTML = `${empty('errorHeading', 'errorHint', 'data')}<button class="button" data-action="rerender">${t('retry')}</button>`; toast(error.message); }
  if (state.view === 'data' && state.meta.routeEvidence?.routes) { const r = state.meta.routeEvidence; $('#page').insertAdjacentHTML('beforeend', `<section class="plain-panel"><h2>Route-specific evidence</h2><p>${r.pageChecked} route page checks across ${r.groups} catalogue group; ${r.peerReviewed} independent reviews; ${r.complete} complete requirement sets. These are separate route snapshots, not additional catalogue records or completed group-level checks.</p><p>Choose a specific direction in its programme detail. Unselected groups remain unresolved, and route-specific sources never overwrite parent or sibling requirements.</p></section>`); }
}
function navigate(view) { closeDetail(); if (location.hash === `#${view}`) { state.view = view; shell(); renderView(); } else location.hash = view; }
function updateSavedButtons() { document.querySelectorAll('[data-action=save]').forEach(button => { const saved = state.shortlist.includes(button.dataset.id); button.setAttribute('aria-pressed', String(saved)); button.classList.toggle('selected', saved); if (button.classList.contains('icon-button')) { const title = button.closest('article')?.querySelector('h3')?.textContent || ''; button.setAttribute('aria-label', `${t(saved ? 'saved' : 'save')} · ${title}`); } else button.innerHTML = `${icon('shortlist')}${t(saved ? 'saved' : 'save')}`; }); updateTray(); }
function downloadJson(value, name) { const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
document.addEventListener('click', async event => {
  const trigger = event.target.closest('[data-action]'); if (!trigger || trigger.disabled) return;
  const { action, id, view, value } = trigger.dataset;
  try {
  if (action === 'nav') navigate(view);
  if (action === 'chooseFile') $('#batch-file').click();
  if (action === 'region') { state.region = value; state.school = ''; state.page = 1; syncUrl(); renderDiscover(); }
  if (action === 'reset') { for (const key of ['q', 'region', 'school', 'area', 'mode', 'verification', 'matchFilter']) state[key] = ''; state.page = 1; syncUrl(); renderDiscover(); }
  if (action === 'page') { state.page = Number(value); await loadCatalogue(); $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  if (action === 'detail') await openDetail(id);
  if (action === 'closeDetail') closeDetail();
  if (action === 'refreshApplicationDates') {
    const programmeId = activeDetail?.id; const originalTrigger = detailTrigger;
    trigger.disabled = true;
    try {
      if (state.profile) state.matches = (await post('/api/matches', matchingPayload(state.profile))).items;
      await renderView();
      if (programmeId && activeDetail?.id === programmeId && $('#detail-dialog').open) { await openDetail(programmeId); detailTrigger = originalTrigger; }
      toast('Date comparison refreshed from stored records; the official website was not rechecked.');
    } finally { trigger.disabled = false; }
  }
  if (action === 'save') { const exists = state.shortlist.includes(id); state.shortlist = exists ? state.shortlist.filter(x => x !== id) : [...state.shortlist, id]; writeStorage(keys.shortlist, state.shortlist); toast(t(exists ? 'removedToast' : 'savedToast')); updateSavedButtons(); if (state.view === 'shortlist') await renderShortlist(); }
  if (action === 'compare') { if (state.compare.includes(id)) state.compare = state.compare.filter(x => x !== id); else if (state.compare.length < 4) state.compare.push(id); else { if (trigger.type === 'checkbox') trigger.checked = false; toast(t('maxCompare')); return; } writeStorage(keys.compare, state.compare); document.querySelectorAll('input[data-action=compare]').forEach(input => { input.checked = state.compare.includes(input.dataset.id); }); updateTray(); if (state.view === 'compare') await renderCompare(); }
  if (action === 'clearCompare') { state.compare = []; writeStorage(keys.compare, []); updateTray(); document.querySelectorAll('input[data-action=compare]').forEach(input => { input.checked = false; }); if (state.view === 'compare') await renderCompare(); }
  if (action === 'sample') { fillProfile({ major: 'Civil Engineering', degreeStatus: 'graduated', classification: 'second_upper', gpa: null, gpaScale: null, experienceYears: null, language: { type: 'ielts', total: 7, components: { listening: 6.5, reading: 6.5, writing: 6.5, speaking: 6.5 }, testDate: '2026-09-01', singleAttempt: true, atHome: false, waiverBasis: null } }); toast('Synthetic background for functional checks only.'); }
  if (action === 'clearProfile') { state.profile = null; state.matches = null; state.matchFilter = ''; writeStorage(keys.profile, null); toast(t('profileCleared')); renderProfile(); }
  if (action === 'retry') await loadCatalogue();
  if (action === 'rerender') await renderView();
  if (action === 'exportShortlist') { const programmes = await selectedProgrammes(state.shortlist); downloadJson({ exportedAt: new Date().toISOString(), programmes: programmes.map(p => ({ id: p.id, selectedRoute: p.selectedRoute || null, name: p.name, university: p.university.nameEn, officialUrl: p.officialUrl, verification: p.verification, academicYear: p.academicYear, offerings: p.offerings, applicationTimeline: p.applicationTimeline })) }, 'gradpath-shortlist.json'); }
  } catch (error) { toast(error.message); }
});
document.addEventListener('input', event => { if (event.target.id === 'search') { clearTimeout(searchTimer); state.q = event.target.value; state.page = 1; syncUrl(); searchTimer = setTimeout(loadCatalogue, 220); } });
document.addEventListener('change', event => { if (event.target.dataset.filter) { state[event.target.dataset.filter] = event.target.value; state.page = 1; syncUrl(); loadCatalogue(); } if (event.target.id === 'profile-languageType') languageFields(); if (event.target.id === 'batch-file') $('#batch-file-name').textContent = event.target.files[0]?.name || t('noFile'); });
document.addEventListener('change', async event => {
  if (event.target.id !== 'programme-route') return;
  const control = event.target; const id = control.dataset.programme;
  const previous = routeChoices[id]; const previousMatches = state.matches; const trigger = detailTrigger;
  control.disabled = true;
  if (control.value) routeChoices[id] = control.value; else delete routeChoices[id];
  try {
    if (state.profile) state.matches = (await post('/api/matches', matchingPayload(state.profile))).items;
    await renderView();
    if (activeDetail?.id === id && $('#detail-dialog').open) { await openDetail(id); detailTrigger = trigger; }
  } catch (error) {
    if (previous) routeChoices[id] = previous; else delete routeChoices[id];
    state.matches = previousMatches;
    toast(error.message);
    if (activeDetail?.id === id && $('#detail-dialog').open) { await openDetail(id); detailTrigger = trigger; }
  } finally { control.disabled = false; }
});
document.addEventListener('submit', async event => {
  if (event.target.id === 'profile-form') return submitProfile(event);
  if (event.target.id === 'import-form') {
    event.preventDefault(); const button = event.target.querySelector('button'); button.disabled = true;
    try { validateForm(event.target); const file = $('#batch-file').files[0]; if (file.size > 1024 * 1024) throw new Error('JSON batch must be under 1 MB'); const batch = parseImportJson(await file.text()); await post('/api/admin/import', batch, { Authorization: `Bearer ${$('#admin-token').value}` }); $('#admin-token').value = ''; state.meta = await api('/api/meta'); if (state.profile) state.matches = (await post('/api/matches', matchingPayload(state.profile))).items; shell(); renderData(); toast(t('importSuccess')); }
    catch (error) { $('#import-error').hidden = false; $('#import-error').textContent = error.message; }
    finally { button.disabled = false; }
  }
});
window.addEventListener('hashchange', () => { const view = location.hash.slice(1); if (view === 'main') { $('#main')?.focus(); return; } state.view = ['discover', 'profile', 'shortlist', 'compare', 'data', 'guide'].includes(view) ? view : 'discover'; shell(); renderView(); window.scrollTo({ top: 0 }); });
async function boot() {
  try { state.meta = await api('/api/meta'); if (state.profile) { try { state.matches = (await post('/api/matches', matchingPayload(state.profile))).items; } catch { state.profile = null; writeStorage(keys.profile, null); } } state.view = ['discover', 'profile', 'shortlist', 'compare', 'data', 'guide'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'discover'; shell(); await renderView(); const id = params.get('programme'); if (id) await openDetail(id); }
  catch (error) { $('#app').innerHTML = `<main class="content"><div class="brand"><span class="brand-mark">g.</span><strong>GradPath</strong></div><br><h1>${t('errorHeading')}</h1><p>${t('errorHint')}</p><button class="button" id="boot-retry">${t('retry')}</button></main>`; $('#boot-retry').addEventListener('click', boot); }
}
boot();
