import { editReferences, loadCandidateReferences, saveCandidateReferences, forgetCandidateReferences, programmeReferencesExport } from './collections.js';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const state = { meta: null, items: [], matches: null, profile: null, q: '', region: '', school: '', load: 0, all: [], comparison: [], candidates: [], remembered: false, savedWarning: '' };
const status = { pass: 'Recorded condition met', fail: 'Recorded gap', unknown: 'Needs confirmation', has_gap: 'Recorded gap', needs_confirmation: 'Needs confirmation', meets_checked: 'Recorded conditions met' };
const officialDomains = ['cityu.edu.hk', 'hkbu.edu.hk', 'ln.edu.hk', 'cuhk.edu.hk', 'eduhk.hk', 'polyu.edu.hk', 'hkust.edu.hk', 'ust.hk', 'hku.hk', 'nus.edu.sg', 'ntu.edu.sg', 'smu.edu.sg', 'sutd.edu.sg', 'singaporetech.edu.sg', 'suss.edu.sg'];
function source(url, label = 'Official source') { try { const u = new URL(url); if (u.protocol === 'https:' && !u.username && !u.password && officialDomains.some(d => u.hostname === d || u.hostname.endsWith(`.${d}`))) return `<a class="source" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`; } catch {} return '<span class="quiet">Source needs confirmation</span>'; }
async function api(path, options) { const r = await fetch(path, options); const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Request failed.'); return d; }
const title = (small, large, intro) => `<p class="eyebrow">${small}</p><h1>${large}</h1><p class="intro">${intro}</p>`;
const notice = '<div class="notice">Week 8 pilot integration: 20 direct-entry programmes across 14 schools. Five existing records were consolidated from source observations dated 20–30 October; other source dates remain unchanged. Prepared on 10 November, this is not a new source check or confirmation of live availability. All records remain partial and independently unreviewed.</div>';
const stats = () => `<div class="stats">${[[14, 'Target universities'], [20, 'Direct-entry pilot records'], [0, 'Independent reviews'], [0, 'Complete requirements']].map(([n, l]) => `<div class="stat"><strong>${n}</strong><span>${l}</span></div>`).join('')}</div>`;
const money = o => o.tuition === null || o.tuition === undefined ? 'Not confirmed' : `${o.currency} ${new Intl.NumberFormat('en-SG').format(o.tuition)}`;
function card(p) {
  return `<article class="card"><span class="school">${esc(p.university.name)} · ${p.university.region === 'HK' ? 'Hong Kong' : 'Singapore'}</span><h3>${esc(p.name)}</h3><span class="tag">Partial page check · review pending</span><dl><div><dt>ACADEMIC YEAR</dt><dd>${esc(p.academicYear)}</dd></div><div><dt>SUBJECT AREA</dt><dd>${esc(p.area)}</dd></div><div><dt>STUDY OPTIONS</dt><dd>${esc([...new Set(p.offerings.map(o => o.mode).filter(Boolean))].join(' / ') || 'Not confirmed')}</dd></div><div><dt>TUITION</dt><dd>${p.offerings.length === 1 ? esc(money(p.offerings[0])) : 'Choose a study option in details or comparison'}</dd></div></dl><div class="card-actions"><button data-detail="${esc(p.id)}">View programme →</button>${collectionButtons(p)}</div>${p.match ? `<div class="outcome"><strong>${status[p.match.status]}</strong><br>${p.match.counts.pass} met · ${p.match.counts.fail} gaps · ${p.match.counts.unknown} unresolved</div>` : ''}</article>`;
}
async function results() {
  const sequence = ++state.load;
  $('#results').innerHTML = '<p role="status">Loading programmes…</p>';
  try {
    let items;
    if (state.matches) items = state.matches.filter(p => (!state.q || `${p.name} ${p.area} ${p.university.name}`.toLowerCase().includes(state.q.toLowerCase())) && (!state.region || p.university.region === state.region) && (!state.school || p.universityId === state.school));
    else items = (await api('/api/catalogue?' + new URLSearchParams({ q: state.q, region: state.region, school: state.school }))).items;
    if (sequence !== state.load || !$('#results')) return;
    state.items = items;
    $('#results').innerHTML = `<div class="results-top"><h2>${items.length} pilot programme${items.length === 1 ? '' : 's'}</h2><span class="quiet">${state.profile ? 'Temporary background checks active' : 'Browse first, then add your background'}</span></div><div class="cards">${items.length ? items.map(card).join('') : '<div class="empty"><h3>No pilot records found</h3><p>Try another search or reset the filters. This small pilot does not represent the full university catalogue.</p><button data-action="reset" class="secondary">Reset filters</button></div>'}</div>`;
  } catch (e) { if (sequence === state.load && $('#results')) $('#results').innerHTML = `<p role="alert" class="error">${esc(e.message)}</p>`; }
}
function explore() {
  $('#page').innerHTML = `<section class="hero"><div>${title('A CLEARER PATH FORWARD', 'Find your next chapter.', 'Explore taught master’s programmes in Hong Kong and Singapore, with official sources and honest explanations of what still needs checking.')}</div><div class="stamp"><strong>HKG</strong><small>HONG KONG</small><strong>SGP</strong><small>SINGAPORE</small></div></section>${stats()}${notice}<form class="filters" id="filters"><label>Search the pilot<input name="q" type="search" maxlength="200" placeholder="Programme, subject or university" value="${esc(state.q)}"></label><label>Region<select name="region"><option value="">Both regions</option><option value="HK" ${state.region === 'HK' ? 'selected' : ''}>Hong Kong</option><option value="SG" ${state.region === 'SG' ? 'selected' : ''}>Singapore</option></select></label><label>University<select name="school"><option value="">All universities</option>${state.meta.universities.map(u => `<option value="${esc(u.id)}" ${state.school === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></label><button>Search</button></form><div class="actions"><a class="button secondary" href="#background">${state.profile ? 'Edit temporary background' : 'Add your background'}</a><button class="secondary" data-action="reset">Reset filters</button></div><div id="results" aria-live="polite"></div>`;
  results();
}
const selected = (actual, value) => actual === value ? 'selected' : '';
function background() {
  const p = state.profile || {}; const l = p.language || {};
  const field = (label, name, value, max, step = 'any') => `<label>${label}<input name="${name}" type="number" min="0" max="${max}" step="${step}" value="${value ?? ''}"></label>`;
  $('#page').innerHTML = `${title('BACKGROUND / TEMPORARY INPUT', 'Your background, explained.', 'Compare self-reported information with the conditions recorded in this pilot. Missing or incomparable information stays unresolved.')}${notice}<div class="notice">Privacy: no account or upload is needed. Background is processed by this local service, kept only in page memory, and cleared on reload. Do not enter identity documents or contact details.</div><form id="background-form" class="form-panel"><div class="form-grid"><label>Undergraduate major<input name="major" required maxlength="120" value="${esc(p.major || '')}" placeholder="e.g. Computer Science"></label><label>Degree status<select name="degreeStatus"><option value="unconfirmed">Not completed / not confirmed</option><option value="final_year" ${selected(p.degreeStatus, 'final_year')}>Final year · degree not yet completed</option><option value="graduated" ${selected(p.degreeStatus, 'graduated')}>Bachelor’s degree completed</option></select></label>${field('GPA (optional)', 'gpa', p.gpa, 100)}${field('Original scale maximum (optional)', 'gpaScale', p.gpaScale, 100)}<label>Degree classification<select name="classification">${[['unknown', 'Not provided / not comparable'], ['ordinary', 'Ordinary'], ['third', 'Third class'], ['second_lower', 'Second class lower'], ['second_upper', 'Second class upper'], ['first', 'First class']].map(([v, t]) => `<option value="${v}" ${selected(p.classification, v)}>${t}</option>`).join('')}</select></label>${field('Work experience in years (optional)', 'experienceYears', p.experienceYears, 60)}<label>Language test<select name="type">${[['none', 'Not provided'], ['ielts', 'IELTS Academic'], ['toefl_120', 'TOEFL iBT · 0–120 scale'], ['toefl_6', 'TOEFL iBT · 1–6 scale'], ['waiver', 'Waiver request · needs confirmation']].map(([v, t]) => `<option value="${v}" ${selected(l.type || 'none', v)}>${t}</option>`).join('')}</select></label>${field('Total score (test scale applies)', 'total', l.total, 120, '.5')}<label>Test date (optional)<input name="testDate" type="date" value="${esc(l.testDate || '')}"></label></div><p class="quiet">IELTS component scores only. Leave these blank for TOEFL. Test-version dates and any programme-specific validity conditions still apply.</p><div class="components">${['listening', 'reading', 'writing', 'speaking'].map(k => field(k[0].toUpperCase() + k.slice(1), k, l.components?.[k], 9, '.5')).join('')}</div><div class="checks-row"><label class="check-label"><input name="singleAttempt" type="checkbox" ${l.singleAttempt ? 'checked' : ''}>Scores from one attempt</label><label class="check-label"><input name="atHome" type="checkbox" ${l.atHome ? 'checked' : ''}>At-home test option</label></div><p id="form-error" class="error" role="alert"></p><div class="actions"><button>Check recorded conditions</button><button type="button" class="secondary" data-action="clear">Clear background</button></div></form>`;
}
const storage = { getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value), removeItem: key => localStorage.removeItem(key) };
const announce = text => { $('#collection-status').textContent = text; };
function collectionButtons(p, offeringId = null) {
  const button = (kind, label, list) => `<button class="secondary" data-action="${kind}-add" data-id="${esc(p.id)}" data-offering="${esc(offeringId || '')}" ${list.some(c => c.programmeId === p.id) ? 'disabled' : ''}>${list.some(c => c.programmeId === p.id) ? (kind === 'compare' ? 'In comparison' : 'On candidate list') : label}</button>`;
  return button('compare', 'Add to comparison', state.comparison) + button('candidate', 'Add to candidate list', state.candidates);
}
function offeringSelect(p, ref, list) {
  return `<label>Intake and study mode for ${esc(p.name)}<select aria-label="Intake and study mode for ${esc(p.name)}" data-list="${list}" data-programme="${esc(p.id)}"><option value="">Not selected — do not assume a fee</option>${p.offerings.map(o => `<option value="${esc(o.id)}" ${ref.offeringId === o.id ? 'selected' : ''}>${esc([o.intake || 'Intake unconfirmed', o.academicYear || p.academicYear, o.mode || 'Mode unconfirmed', o.duration || 'Duration unconfirmed'].join(' · '))}</option>`).join('')}</select></label>`;
}
function comparisonCell(p, ref, key) {
  const o = p.offerings.find(o => o.id === ref.offeringId);
  if (key === 'source') return `${source(p.officialUrl)}<br>Source read: ${esc(p.lastChecked)}<br>Partial · independent review pending`;
  if (key === 'requirements') return p.rules.map(r => `<p><strong>${esc(r.labelEn)}${r.mandatory === false ? ' (preference)' : ''}</strong><br>${esc(ruleText(r))}<br>${source(r.sourceUrl)}</p>`).join('');
  if (key === 'notes') return esc(p.notesEn || 'No additional note recorded.');
  if (key === 'background') { const m = state.matches?.find(x => x.id === p.id)?.match; return m ? `${status[m.status]}: ${m.counts.pass} met · ${m.counts.fail} gaps · ${m.counts.unknown} unresolved. No admission tier.` : 'No background check active.'; }
  if (!o) return '<span class="quiet">Select an intake and study mode above.</span>';
  if (key === 'offering') return esc([o.intake || 'Intake unconfirmed', o.academicYear || p.academicYear, o.mode || 'Mode unconfirmed', o.duration || 'Duration unconfirmed'].join(' · '));
  if (key === 'tuition') return esc(money(o));
  if (key === 'feeBasis') return esc(o.feeBasis || 'Fee basis not confirmed.');
  if (key === 'applicationFee') return esc(o.applicationFee == null ? 'Not confirmed' : `${o.currency} ${new Intl.NumberFormat('en-SG').format(o.applicationFee)}`);
  return recordedDates(o);
}
function collections(kind) {
  const compare = kind === 'comparison', refs = compare ? state.comparison : state.candidates;
  $('#page').innerHTML = `${title(compare ? 'COMPARE / EXACT STUDY OPTIONS' : 'CANDIDATES / YOUR REFERENCE LIST', compare ? 'Compare on equal terms.' : 'Keep a considered shortlist.', compare ? 'Choose 2–4 programmes, then select one intake and study mode for each. Fees stay in their original currencies; no exchange-rate or admission ranking is applied.' : 'Keep programme references, choose study options and export a list without your background. The list stays temporary unless you choose to save it in this browser.')}${notice}${!compare && state.savedWarning ? `<p class="notice">${esc(state.savedWarning)}</p>` : ''}<div class="actions"><a class="button secondary" href="#explore">Browse programmes</a>${!compare ? `<button data-action="candidate-save" ${!refs.length ? 'disabled' : ''}>${state.remembered ? 'Update browser copy' : 'Save list in this browser'}</button><button class="secondary" data-action="candidate-forget" ${!state.remembered ? 'disabled' : ''}>Forget browser copy</button><button class="secondary" data-action="candidate-export" ${!refs.length ? 'disabled' : ''}>Export programme references</button>` : ''}<button class="secondary" data-action="${compare ? 'compare' : 'candidate'}-clear" ${!refs.length && !state.savedWarning ? 'disabled' : ''}>Clear ${compare ? 'comparison' : 'candidate list'}</button></div>${!compare ? `<p class="quiet">${state.remembered ? 'A browser copy is enabled. Only programme and study-option IDs are saved; changes update this copy.' : 'Temporary list: reloading clears it unless you save a browser copy.'} No GPA, test score, personal background or old fee is stored. Saving may be unavailable in private or restricted browsers.</p>` : ''}<div id="collection-content"></div>`;
  const target = $('#collection-content');
  if (!refs.length) { target.innerHTML = `<div class="empty"><h2>${compare ? 'Add at least two programmes to compare' : 'Your candidate list is empty'}</h2><p>Use the buttons on programme cards or in their details. Unknown information remains unconfirmed.</p></div>`; return; }
  if (compare) {
    const rows = [['offering', 'Selected intake / study mode'], ['tuition', 'Recorded tuition · original currency'], ['applicationFee', 'Separate application fee'], ['feeBasis', 'Fee basis and exclusions'], ['dates', 'Recorded application dates'], ['requirements', 'Academic, language and manual conditions'], ['notes', 'Programme-specific limits'], ['background', 'Temporary background comparison'], ['source', 'Official source and review']];
    target.innerHTML = `${refs.length < 2 ? '<p class="notice">Add one more programme for a side-by-side comparison.</p>' : ''}<div class="comparison-choices">${refs.map(ref => { const p = state.all.find(p => p.id === ref.programmeId); return `<div class="panel"><h2>${esc(p.name)}</h2>${offeringSelect(p, ref, 'comparison')}<div class="actions"><button class="secondary" data-action="compare-remove" data-id="${esc(p.id)}">Remove from comparison</button><button class="secondary" data-action="candidate-add" data-id="${esc(p.id)}" data-offering="${esc(ref.offeringId || '')}">Add to candidate list</button></div></div>`; }).join('')}</div><div class="table-scroll"><table class="details-table comparison-table"><caption>Recorded programme facts — partial sources, no admission ranking</caption><thead><tr><th scope="col">Compare</th>${refs.map(ref => `<th scope="col">${esc(state.all.find(p => p.id === ref.programmeId).name)}</th>`).join('')}</tr></thead><tbody>${rows.map(([key, label]) => `<tr><th scope="row">${label}</th>${refs.map(ref => `<td>${comparisonCell(state.all.find(p => p.id === ref.programmeId), ref, key)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  } else target.innerHTML = `<div class="cards candidate-cards">${refs.map(ref => { const p = state.all.find(p => p.id === ref.programmeId), o = p.offerings.find(o => o.id === ref.offeringId); return `<article class="card"><span class="school">${esc(p.university.name)}</span><h2>${esc(p.name)}</h2><p class="quiet">Source read ${esc(p.lastChecked)} · partial · independent review pending</p>${offeringSelect(p, ref, 'candidates')}<p>${o ? esc(money(o)) : 'No study option selected; no default fee assigned.'}</p><div class="actions"><button data-detail="${esc(p.id)}">View programme</button><button class="secondary" data-action="compare-add" data-id="${esc(p.id)}" data-offering="${esc(ref.offeringId || '')}">Add to comparison</button><button class="secondary" data-action="candidate-remove" data-id="${esc(p.id)}">Remove from candidate list</button></div>${source(p.officialUrl)}</article>`; }).join('')}</div>`;
}
function refreshCollections() {
  const view = location.hash.slice(1);
  if (view === 'comparison' || view === 'candidates') collections(view);
  else if (view !== 'background' && view !== 'data') results();
}
function rememberChanges() {
  state.savedWarning = '';
  if (state.remembered && !saveCandidateReferences(storage, state.candidates, state.all)) { state.remembered = false; return ' The browser copy could not be updated. This session still has the current list; an older stored copy may remain.'; }
  return '';
}
function collectionAction(action, element) {
  if (action === 'candidate-save') { state.remembered = saveCandidateReferences(storage, state.candidates, state.all); state.savedWarning = ''; announce(state.remembered ? 'Candidate references saved in this browser. Your background was not saved.' : 'The browser copy could not be saved. Your current list remains available in this session.'); }
  else if (action === 'candidate-forget') { const removed = forgetCandidateReferences(storage); if (removed) state.remembered = false; announce(removed ? 'Browser copy removed. Your temporary list remains until reload.' : 'The browser copy could not be removed. Clear this site’s browser data if needed.'); }
  else if (action === 'candidate-export') {
    const file = programmeReferencesExport(state.candidates, state.all), url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })), a = document.createElement('a');
    a.href = url; a.download = 'gradpath-candidate-references.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); announce('Programme-reference export prepared. It contains no personal background or match result.');
  } else if (action === 'candidate-clear' || action === 'compare-clear') {
    if (action === 'compare-clear') { state.comparison = []; announce('Comparison cleared.'); }
    else { state.candidates = []; state.savedWarning = ''; const removed = forgetCandidateReferences(storage); state.remembered = !removed && state.remembered; announce(removed ? 'Candidate list and saved browser copy cleared.' : 'This session’s list is cleared, but the saved browser copy could not be removed.'); }
  } else {
    const compare = action.startsWith('compare-'), list = compare ? 'comparison' : 'candidates', verb = action.endsWith('-remove') ? 'remove' : 'add';
    const result = editReferences(state[list], verb, element.dataset.id, element.dataset.offering || null, state.all, compare ? 4 : 20);
    state[list] = result.choices; announce(result.message + (compare ? '' : rememberChanges()));
  }
  refreshCollections();
}

function data() {
  $('#page').innerHTML = `${title('PROVENANCE / BEFORE CONFIDENCE', 'Know what the data says.', 'Source discovery, reading a programme page and independent review are different steps. The interface must keep them separate.')}${stats()}${notice}<div class="panel"><h2>What this version can and cannot do</h2><ul><li>Search 20 direct-entry pilot records spanning the 14 target universities.</li><li>Read recorded offerings, fees, conditions and official source links.</li><li>Check self-reported background against the recorded conditions.</li><li>No final eligibility or recommendation tiers: every pilot record remains partial and unreviewed.</li><li>Compare 2–4 exact study options, keep a candidate list and export public references. Browser storage is optional; administrative imports and public deployment remain outside this checkpoint.</li></ul><p>The transfer-only reference is retained in the research JSON but excluded from direct-entry browsing. Historical source dates are not changed to today.</p><h2>Missing does not mean zero</h2><p>“Not published in consulted sources” is different from “not yet collected”. Blank tuition is not free. An unknown GPA cutoff is not a zero cutoff. Meeting a recorded minimum does not establish admission eligibility.</p><h2>Next evidence gates</h2><p>Reconcile current intakes and routes, collect missing conditions, obtain independent review and perform real user testing. No participant results or other members’ contributions have been inferred.</p></div>`;
}
async function detail(id) {
  try {
    const p = state.items.find(x => x.id === id) || await api('/api/programmes/' + encodeURIComponent(id));
    $('#detail-content').innerHTML = `<div class="actions">${collectionButtons(p)}</div><h2 id="detail-title">${esc(p.name)}</h2><p>${esc(p.university.name)}</p><span class="tag">Partial page check · ${esc(p.lastChecked)} · independent review pending</span><p class="quiet">${esc(p.notesEn)}</p>${source(p.officialUrl, 'Open official programme page')}<h3>Recorded study options</h3><div class="table-scroll"><table class="details-table"><thead><tr><th>Mode / duration</th><th>Intake / year</th><th>Tuition / fee basis</th><th>Application dates</th></tr></thead><tbody>${p.offerings.map(o => `<tr><td>${esc(o.mode)}<br>${esc(o.duration || 'Not confirmed')}</td><td>${esc(o.intake || 'Not confirmed')}<br>${esc(o.academicYear || p.academicYear)}</td><td>${esc(money(o))}<br>${esc(o.feeBasis || '')}</td><td>${recordedDates(o)}</td></tr>`).join('')}</tbody></table></div><h3>${p.match ? 'Background-check reasons' : 'Recorded requirements'}</h3>${p.match ? p.match.checks.map(c => `<div class="rule"><strong class="${c.status}">${status[c.status]} · ${esc(c.label)}${c.mandatory ? '' : ' (preference)'}</strong><p>${esc(c.reason)}</p>${source(c.sourceUrl)}</div>`).join('') : p.rules.map(r => `<div class="rule"><strong>${esc(r.labelEn)}${r.mandatory === false ? ' (preference)' : ''}</strong><p>${esc(ruleText(r))}</p>${source(r.sourceUrl)}</div>`).join('')}<h3>Field coverage</h3>${Object.entries(p.fieldStatus || {}).map(([k, f]) => `<p class="field-status"><strong>${esc(k)} · ${esc(f.status.replaceAll('_', ' '))}</strong><br>${esc(f.noteEn)}<br>${source(f.sourceUrl)}</p>`).join('')}<div class="notice">${esc(p.match?.disclaimer || 'Only the recorded conditions are shown. Full requirements, current application availability and independent review remain unresolved.')}</div>`;
    $('#detail').showModal();
  } catch (e) { const error = document.createElement('p'); error.className = 'error'; error.setAttribute('role', 'alert'); error.textContent = e.message; $('#page').prepend(error); }
}
function recordedDates(o) {
  const rounds = (o.applicationRounds || []).map(r => `${esc(r.label || r.id)}: ${esc(r.deadlineAt || r.deadline || 'Not confirmed')}${r.applicationOpen ? `; opens ${esc(r.applicationOpen)}` : ''}`).join('<br>');
  return `Opening: ${esc(o.applicationOpen || 'Not confirmed')}<br>Recorded deadline: ${esc(o.deadlineAt || o.deadline || 'Not confirmed')}${rounds ? '<br>' + rounds : ''}<br>${esc(o.deadlineNote || '')}<br>Recorded dates do not confirm live availability.`;
}
function ruleText(r) {
  if (r.noteEn) return r.noteEn;
  if (r.kind === 'major') return r.any ? 'Any undergraduate discipline is included in the recorded rule.' : `${r.accepted.join(', ')}${r.relatedAllowed ? '; related fields need confirmation.' : '.'}`;
  if (r.kind === 'language') return Object.entries(r.tests).map(([k, v]) => `${{ ielts: 'IELTS', toefl_120: 'TOEFL 0–120', toefl_6: 'TOEFL 1–6' }[k]}: ${v.exclusiveMinimum ? '>' : '≥'} ${v.total}${v.componentMin !== undefined ? `; each component ${v.componentMin}` : ''}${v.validFrom ? `; test on/after ${v.validFrom}` : ''}${v.validBefore ? `; test before ${v.validBefore}` : ''}`).join(' / ') + (r.singleAttempt ? '. Single attempt required.' : '') + (r.atHomeAccepted === false ? ' At-home option not accepted.' : '') + (r.testDateNotBefore ? ` Test date must be on or after ${r.testDateNotBefore}; missing dates remain unresolved.` : '');
  if (r.kind === 'gpa') return `Minimum ${r.min}/${r.scale} on the original scale.`;
  if (r.kind === 'experience') return `At least ${r.min} years; see the official context.`;
  if (r.kind === 'classification') return `Recorded minimum: ${r.min.replaceAll('_', ' ')}. Equivalence needs confirmation.`;
  return 'See the official source and any additional conditions below.';
}
function route() {
  state.load++;
  const view = location.hash.slice(1) || 'explore';
  if (view === 'main') { $('#main').focus(); return; }
  if ($('#detail').open) $('#detail').close();
  for (const a of document.querySelectorAll('nav a')) a.getAttribute('href') === '#' + view ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  if (view === 'background') background(); else if (['comparison', 'candidates'].includes(view)) collections(view); else if (view === 'data') data(); else explore();
  window.scrollTo(0, 0);
}
document.addEventListener('click', e => {
  const d = e.target.closest('[data-detail]'); if (d) detail(d.dataset.detail);
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action?.startsWith('compare-') || action?.startsWith('candidate-')) { collectionAction(action, e.target.closest('[data-action]')); return; }
  if (action === 'reset') { state.q = state.region = state.school = ''; explore(); }
  if (action === 'clear') { state.profile = state.matches = null; background(); $('#form-error').textContent = 'Background cleared. Nothing was saved.'; }
});
$('#close-detail').addEventListener('click', () => $('#detail').close());
document.addEventListener('submit', async e => {
  e.preventDefault(); const form = e.target; const f = new FormData(form);
  if (form.id === 'filters') { state.q = f.get('q').trim(); state.region = f.get('region'); state.school = f.get('school'); results(); return; }
  if (form.id !== 'background-form') return;
  const number = k => f.get(k) === '' ? null : Number(f.get(k));
  const profile = { major: f.get('major'), degreeStatus: f.get('degreeStatus'), gpa: number('gpa'), gpaScale: number('gpaScale'), classification: f.get('classification'), experienceYears: number('experienceYears'), language: { type: f.get('type'), total: number('total'), testDate: f.get('testDate') || null, components: Object.fromEntries(['listening', 'reading', 'writing', 'speaking'].map(k => [k, number(k)])), singleAttempt: f.has('singleAttempt'), atHome: f.has('atHome') } };
  const button = form.querySelector('button:not([type])'); button.disabled = true;
  try { const result = await api('/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile }) }); state.profile = profile; state.matches = result.items; if (form.isConnected) location.hash = 'explore'; }
  catch (error) { if (form.isConnected) $('#form-error').textContent = error.message; }
  finally { button.disabled = false; }
});
document.addEventListener('change', e => { const select = e.target.closest('select[data-list]'); if (!select) return; const list = select.dataset.list, result = editReferences(state[list], 'select', select.dataset.programme, select.value || null, state.all, list === 'comparison' ? 4 : 20); state[list] = result.choices; announce(result.message + (list === 'candidates' ? rememberChanges() : '')); refreshCollections(); });
window.addEventListener('hashchange', route);
try { state.meta = await api('/api/meta'); state.all = (await api('/api/catalogue')).items; const restored = loadCandidateReferences(storage, state.all); state.candidates = restored.choices; state.remembered = restored.remembered; state.savedWarning = restored.unresolved.length ? 'Some saved references could not be restored against this pilot. No different intake or programme was substituted; the saved copy was not changed automatically.' : ''; route(); } catch (e) { $('#page').textContent = `Unable to load the pilot: ${e.message}`; }
