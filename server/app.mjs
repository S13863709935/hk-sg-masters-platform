import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { InputError, validateProfile } from './profile.mjs';
import { checkProgramme } from './checks.mjs';

export function createCheckpoint({ publicDir, pilotPath, directoryPath }) {
  const pilot = JSON.parse(readFileSync(pilotPath, 'utf8'));
  const directory = JSON.parse(readFileSync(directoryPath, 'utf8'));
  const universities = directory.universities.map(u => ({ id: u.universityId, name: u.nameEn, region: u.region, directoryUrl: u.directoryUrl }));
  const programmes = pilot.programmes.filter(p => p.admissionRoute === 'direct').map(p => ({ ...p, university: universities.find(u => u.id === p.universityId) }));
  const checkpoint = {
    checkpoint: 'week-05', publicationPreparedOn: '2026-10-16', sourceSnapshotDate: pilot.checkedOn,
    targetUniversities: universities.length, pilotProgrammes: programmes.length,
    transferOnlyReferenceRecords: pilot.programmes.filter(p => p.admissionRoute === 'transfer_only').length,
    independentlyReviewed: pilot.programmes.filter(p => p.verification === 'peer_reviewed').length,
    completeRequirements: pilot.programmes.filter(p => p.requirementsCoverage === 'complete').length,
    implementedHere: ['pilot search', 'programme details', 'temporary background input', 'source-linked condition-check proof of concept'],
    designOnly: ['programme comparison', 'candidate lists'],
    notIncludedHere: ['recommendation tiers', 'profile persistence', 'SQLite persistence', 'admin import', 'expanded catalogue', 'public deployment']
  };
  const assets = new Map([['/', ['index.html', 'text/html']], ['/app.js', ['app.js', 'text/javascript']], ['/styles.css', ['styles.css', 'text/css']]].map(([path, [file, type]]) => [path, { body: readFileSync(new URL(file, publicDir), 'utf8'), type }]));
  const filter = search => {
    const q = (search.get('q') || '').trim().slice(0, 200).toLowerCase();
    return programmes.filter(p => (!q || `${p.name} ${p.area} ${p.university.name}`.toLowerCase().includes(q)) && (!search.get('region') || p.university.region === search.get('region')) && (!search.get('school') || p.universityId === search.get('school')));
  };
  return createServer(async (req, res) => {
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" };
    const send = (status, body, type = 'application/json') => { res.writeHead(status, { ...headers, 'Content-Type': `${type}; charset=utf-8` }); res.end(req.method === 'HEAD' ? undefined : type === 'application/json' ? JSON.stringify(body) : body); };
    try {
      const expected = `http://${req.headers.host}`;
      const host = new URL(expected);
      if (!['127.0.0.1', 'localhost'].includes(host.hostname)) return send(403, { error: 'Loopback access only.' });
      const url = new URL(req.url, expected);
      if (req.method === 'POST' && url.pathname === '/api/matches') {
        if (req.headers.origin && req.headers.origin !== expected) return send(403, { error: 'Cross-origin background requests are not accepted.' });
        if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return send(415, { error: 'Use application/json.' });
        let bytes = 0; const chunks = [];
        for await (const chunk of req) { bytes += chunk.length; if (bytes > 16384) throw new InputError('Background request exceeds 16 KB.', 413); chunks.push(chunk); }
        let input;
        try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new InputError('Invalid JSON.', 400); }
        const profile = validateProfile(input?.profile);
        return send(200, { items: programmes.map(p => ({ ...p, match: checkProgramme(p, profile) })), checkpoint: 'week-05' });
      }
      if (!['GET', 'HEAD'].includes(req.method)) return send(405, { error: 'Method not available in this checkpoint.' });
      if (assets.has(url.pathname)) { const asset = assets.get(url.pathname); return send(200, asset.body, asset.type); }
      if (url.pathname === '/api/health') return send(200, { ok: true, app: 'gradpath', checkpoint: 'week-05' });
      if (url.pathname === '/api/checkpoint') return send(200, checkpoint);
      if (url.pathname === '/api/meta') return send(200, { universities, checkpoint });
      if (url.pathname === '/api/catalogue') { const items = filter(url.searchParams); return send(200, { items, total: items.length }); }
      if (url.pathname.startsWith('/api/programmes/')) {
        const p = programmes.find(p => p.id === decodeURIComponent(url.pathname.slice('/api/programmes/'.length)));
        return p ? send(200, p) : send(404, { error: 'Programme not in the direct-entry pilot.' });
      }
      return send(404, { error: 'Not part of the Week 5 checkpoint.' });
    } catch (error) { if (!res.headersSent) send(error instanceof InputError ? error.status : 500, { error: error instanceof InputError ? error.message : 'Unable to complete the request. No background was saved.' }); else res.end(); }
  });
}
