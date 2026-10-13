import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

export function createBaseline({ htmlPath, pilotPath, directoryPath }) {
  const html = readFileSync(htmlPath, 'utf8');
  const pilot = JSON.parse(readFileSync(pilotPath, 'utf8'));
  const directory = JSON.parse(readFileSync(directoryPath, 'utf8'));
  const checkpoint = {
    checkpoint: 'week-04', publicationPreparedOn: '2026-10-13',
    sourceSnapshotDate: pilot.checkedOn,
    targetUniversities: directory.universities.length,
    pilotProgrammes: pilot.pilotProgrammeIds.length,
    transferOnlyReferenceRecords: pilot.programmes.filter(p => p.admissionRoute === 'transfer_only').length,
    independentlyReviewed: pilot.programmes.filter(p => p.verification === 'peer_reviewed').length,
    completeRequirements: pilot.programmes.filter(p => p.requirementsCoverage === 'complete').length,
    implementedHere: ['local HTTP baseline', 'health endpoint', 'checkpoint metadata'],
    notIncludedHere: ['programme search', 'student profiles', 'requirement matching', 'programme comparison', 'shortlists', 'public deployment']
  };
  return createServer((request, response) => {
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'", 'Referrer-Policy': 'no-referrer' };
    const send = (status, body, type = 'application/json; charset=utf-8') => { response.writeHead(status, { ...headers, 'Content-Type': type }); response.end(type.startsWith('application/json') ? JSON.stringify(body) : body); };
    if (request.method !== 'GET' && request.method !== 'HEAD') return send(405, { error: 'This checkpoint is read-only.' });
    const path = new URL(request.url, 'http://127.0.0.1').pathname;
    if (path === '/') return send(200, html, 'text/html; charset=utf-8');
    if (path === '/api/health') return send(200, { ok: true, app: 'gradpath-foundations', checkpoint: 'week-04' });
    if (path === '/api/checkpoint') return send(200, checkpoint);
    return send(404, { error: 'Not part of the Week 4 checkpoint.' });
  });
}
