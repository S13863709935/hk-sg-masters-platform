import http from 'node:http';
import { readFileSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { matchProgramme } from './matching.mjs';
import { validateProfile, InputError } from './validation.mjs';
import { loadRoutes, resolveProgramme, validateSelections, routeSummary } from './routes.mjs';
import { validateOfferingSelections } from './offerings.mjs';
import { loadApplicantContexts, validateApplicantSelections, applicantSummary } from './applicants.mjs';
import { applicationDate, programmeTimeline } from './application-dates.mjs';
import { parseSavedOption } from '../public/saved-options.js';
import { filterProgrammes } from '../public/catalogue-filters.js';
export { filterProgrammes };

const headers = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
};
const send = (res, status, payload, extra = {}) => { res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra }); res.end(JSON.stringify(payload)); };
async function body(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) throw new InputError('Content-Type must be application/json', 415);
  let text = '';
  for await (const chunk of req) { text += chunk; if (Buffer.byteLength(text) > 1024 * 1024) throw new InputError('Request too large', 413); }
  try { return JSON.parse(text); } catch { throw new InputError('Invalid JSON', 400); }
}
export function createApp({ store, publicDir, adminToken = '', routeEvidencePath, applicantEvidencePath, now = () => new Date() }) {
  const routeIndex = loadRoutes(routeEvidencePath, store.all());
  const applicantIndex = loadApplicantContexts(applicantEvidencePath, store.all(), routeIndex);
  const assets = new Map([['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']], ['/styles.css', ['styles.css', 'text/css']], ['/app.js', ['app.js', 'text/javascript']], ['/copy.js', ['copy.js', 'text/javascript']], ['/saved-options.js', ['saved-options.js', 'text/javascript']], ['/catalogue-filters.js', ['catalogue-filters.js', 'text/javascript']], ['/favicon.svg', ['favicon.svg', 'image/svg+xml']]]);
  return http.createServer(async (req, res) => {
    try {
      const host = req.headers.host || '';
      if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) throw new InputError('Local host required', 403);
      const url = new URL(req.url, `http://${host}`);
      const instant = now();
      const asOfDate = applicationDate(instant);
      const present = p => ({ ...p, applicationTimeline: programmeTimeline(p, asOfDate, instant.toISOString()) });
      if (req.method === 'POST') {
        const origin = req.headers.origin;
        if (origin && origin !== `http://${host}`) throw new InputError('Cross-origin writes are not allowed', 403);
      }
      if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true, app: 'gradpath', version: '0.1.0' });
      if (req.method === 'GET' && url.pathname === '/api/meta') return send(res, 200, { universities: store.universities(), areas: [...new Set(store.all().map(p => p.area))].sort(), quality: store.quality(), routeEvidence: routeSummary(routeIndex), applicantEvidence: applicantSummary(applicantIndex), adminEnabled: adminToken.length >= 24 });
      if (req.method === 'GET' && url.pathname === '/api/quality') return send(res, 200, store.quality());
      if (req.method === 'POST' && url.pathname === '/api/saved-options/resolve') {
        const input = await body(req);
        if (!input || Object.keys(input).some(k => k !== 'contexts') || !Array.isArray(input.contexts) || input.contexts.length > 500) throw new InputError('Provide up to 500 saved programme choices');
        const items = input.contexts.map((entry, index) => {
          const context = parseSavedOption(entry);
          try {
            if (!context) throw new InputError('Saved choice format is invalid; choose the programme options again');
            const base = store.get(context.programmeId);
            if (!base) throw new InputError('The saved programme is no longer available', 404);
            const programme = resolveProgramme(base, routeIndex, context.routeId, context.offeringId, context.applicantId, applicantIndex);
            return { index, programmeId: base.id, status: 'resolved', programme: present(programme) };
          } catch (error) {
            if (!(error instanceof InputError)) throw error;
            return { index, programmeId: context?.programmeId || null, status: 'needs_attention', code: error.status, message: error.message };
          }
        });
        return send(res, 200, { items });
      }
      if (req.method === 'GET' && url.pathname === '/api/catalogue') {
        const filters = Object.fromEntries(url.searchParams);
        const all = store.all();
        let choices;
        if (url.searchParams.has('routes')) {
          const raw = url.searchParams.get('routes');
          if (raw.length > 8000) throw new InputError('Route query is too large', 413);
          try { choices = JSON.parse(raw); } catch { throw new InputError('Invalid route query JSON', 400); }
        }
        const selected = validateSelections(choices, all, routeIndex);
        let offeringChoices;
        if (url.searchParams.has('offerings')) {
          const raw = url.searchParams.get('offerings');
          if (raw.length > 8000) throw new InputError('Study-option query is too large', 413);
          try { offeringChoices = JSON.parse(raw); } catch { throw new InputError('Invalid study-option query JSON', 400); }
        }
        const offerings = validateOfferingSelections(offeringChoices, all);
        let applicantChoices;
        if (url.searchParams.has('applicants')) {
          const raw = url.searchParams.get('applicants');
          if (raw.length > 8000) throw new InputError('Applicant-category query is too large', 413);
          try { applicantChoices = JSON.parse(raw); } catch { throw new InputError('Invalid applicant-category query JSON', 400); }
        }
        const applicants = validateApplicantSelections(applicantChoices, all);
        const result = filterProgrammes(all.map(p => resolveProgramme(p, routeIndex, selected[p.id], offerings[p.id], applicants[p.id], applicantIndex)), filters);
        const direction = filters.sort === 'az' ? 0 : 1;
        result.sort((a, b) => direction * (Number(['programme_page_checked', 'peer_reviewed'].includes(b.verification)) - Number(['programme_page_checked', 'peer_reviewed'].includes(a.verification))) || a.name.localeCompare(b.name));
        const page = Math.max(1, Math.min(1000, Number(filters.page) || 1));
        const limit = Math.max(1, Math.min(100, Number(filters.limit) || 12));
        return send(res, 200, { items: result.slice((page - 1) * limit, page * limit).map(present), total: result.length, page, limit });
      }
      if (req.method === 'GET' && url.pathname.startsWith('/api/programmes/')) {
        const p = store.get(decodeURIComponent(url.pathname.slice('/api/programmes/'.length)));
        if (!p) throw new InputError('Programme not found', 404);
        if (url.searchParams.has('offering') && !url.searchParams.get('offering')) throw new InputError('Invalid study-option selection');
        if (url.searchParams.has('applicant') && !url.searchParams.get('applicant')) throw new InputError('Invalid applicant-category selection');
        return send(res, 200, present(resolveProgramme(p, routeIndex, url.searchParams.get('route'), url.searchParams.get('offering'), url.searchParams.get('applicant'), applicantIndex)));
      }
      if (req.method === 'POST' && url.pathname === '/api/matches') {
        const input = await body(req);
        const profile = validateProfile(input?.profile);
        const all = store.all();
        const selected = validateSelections(input.selectedRoutes, all, routeIndex);
        const offerings = validateOfferingSelections(input.selectedOfferings, all);
        const applicants = validateApplicantSelections(input.selectedApplicants, all);
        const items = filterProgrammes(all.map(p => resolveProgramme(p, routeIndex, selected[p.id], offerings[p.id], applicants[p.id], applicantIndex)), input.filters).map(p => ({ ...present(p), match: matchProgramme(p, profile) }));
        const order = { meets_checked: 0, needs_confirmation: 1, has_gap: 2, out_of_scope: 3 };
        items.sort((a, b) => order[a.match.status] - order[b.match.status] || b.match.counts.pass - a.match.counts.pass || a.name.localeCompare(b.name));
        return send(res, 200, { items, total: items.length });
      }
      if (req.method === 'GET' && url.pathname === '/api/export') return send(res, 200, store.export(), { 'Content-Disposition': 'attachment; filename="gradpath-catalogue.json"' });
      if (req.method === 'POST' && url.pathname === '/api/admin/import') {
        if (adminToken.length < 24) throw new InputError('Admin import is disabled; configure ADMIN_TOKEN first', 403);
        const supplied = Buffer.from((req.headers.authorization || '').replace(/^Bearer /, ''));
        const expected = Buffer.from(adminToken);
        if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new InputError('Invalid admin token', 401);
        const batch = await body(req);
        return send(res, 200, store.importBatch(batch, 'Authenticated local admin import'));
      }
      if (req.method === 'GET' && assets.has(url.pathname)) {
        const [name, mime] = assets.get(url.pathname);
        const content = readFileSync(new URL(name, publicDir));
        res.writeHead(200, { ...headers, 'Content-Type': `${mime}; charset=utf-8`, 'Cache-Control': 'no-cache' }); return res.end(content);
      }
      throw new InputError('Not found', 404);
    } catch (error) { if (res.headersSent) return res.end(); send(res, error instanceof InputError ? error.status : 500, { error: error instanceof InputError ? error.message : 'Internal error. No profile data has been saved.' }); }
  });
}
