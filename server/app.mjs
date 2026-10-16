import http from 'node:http';
import { readFileSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { matchProgramme } from './matching.mjs';
import { validateProfile, InputError } from './validation.mjs';
import { loadRoutes, resolveRoute, validateSelections, routeSummary } from './routes.mjs';

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
const searchText = p => [p.name, p.area, p.faculty, p.university.nameEn, p.university.nameZh, p.university.abbreviation, p.directoryListing?.nameEn, ...(p.directoryListing?.variants || []).map(v=>v.nameEn)].filter(Boolean).join(' ').toLowerCase();
export function filterProgrammes(all, filters = {}) {
  const q = String(filters.q || '').slice(0, 200).trim().toLowerCase();
  return all.filter(p => (filters.includeTransfer === 'true' || p.admissionRoute !== 'transfer_only') && (filters.includeOutOfScope === 'true' || p.scope?.status !== 'out_of_scope') && (!q || searchText(p).includes(q)) && (!filters.region || p.university.region === filters.region) && (!filters.school || p.universityId === filters.school) && (!filters.area || p.area === filters.area) && (!filters.mode || p.offerings.some(o => o.mode?.toLowerCase().includes(filters.mode))) && (!filters.verification || p.verification === filters.verification));
}
export function createApp({ store, publicDir, adminToken = '', routeEvidencePath }) {
  const routeIndex = loadRoutes(routeEvidencePath, store.all());
  const assets = new Map([['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']], ['/styles.css', ['styles.css', 'text/css']], ['/app.js', ['app.js', 'text/javascript']], ['/copy.js', ['copy.js', 'text/javascript']], ['/favicon.svg', ['favicon.svg', 'image/svg+xml']]]);
  return http.createServer(async (req, res) => {
    try {
      const host = req.headers.host || '';
      if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) throw new InputError('Local host required', 403);
      const url = new URL(req.url, `http://${host}`);
      if (req.method === 'POST') {
        const origin = req.headers.origin;
        if (origin && origin !== `http://${host}`) throw new InputError('Cross-origin writes are not allowed', 403);
      }
      if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true, app: 'gradpath', version: '0.1.0' });
      if (req.method === 'GET' && url.pathname === '/api/meta') return send(res, 200, { universities: store.universities(), areas: [...new Set(store.all().map(p => p.area))].sort(), quality: store.quality(), routeEvidence: routeSummary(routeIndex), adminEnabled: adminToken.length >= 24 });
      if (req.method === 'GET' && url.pathname === '/api/quality') return send(res, 200, store.quality());
      if (req.method === 'GET' && url.pathname === '/api/catalogue') {
        const filters = Object.fromEntries(url.searchParams);
        const result = filterProgrammes(store.all(), filters);
        const direction = filters.sort === 'az' ? 0 : 1;
        result.sort((a, b) => direction * (Number(['programme_page_checked', 'peer_reviewed'].includes(b.verification)) - Number(['programme_page_checked', 'peer_reviewed'].includes(a.verification))) || a.name.localeCompare(b.name));
        const page = Math.max(1, Math.min(1000, Number(filters.page) || 1));
        const limit = Math.max(1, Math.min(100, Number(filters.limit) || 12));
        return send(res, 200, { items: result.slice((page - 1) * limit, page * limit).map(p => resolveRoute(p, routeIndex)), total: result.length, page, limit });
      }
      if (req.method === 'GET' && url.pathname.startsWith('/api/programmes/')) {
        const p = store.get(decodeURIComponent(url.pathname.slice('/api/programmes/'.length)));
        if (!p) throw new InputError('Programme not found', 404);
        return send(res, 200, resolveRoute(p, routeIndex, url.searchParams.get('route')));
      }
      if (req.method === 'POST' && url.pathname === '/api/matches') {
        const input = await body(req);
        const profile = validateProfile(input?.profile);
        const all = store.all();
        const selected = validateSelections(input.selectedRoutes, all, routeIndex);
        const items = filterProgrammes(all.map(p => resolveRoute(p, routeIndex, selected[p.id])), input.filters).map(p => ({ ...p, match: matchProgramme(p, profile) }));
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
