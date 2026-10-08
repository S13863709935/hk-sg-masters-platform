// One bounded public request per supplied official directory. No crawling or bypasses.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { isOfficialUrl } from '../server/validation.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
const checkedOn = flag('--date');
const python = flag('--python');
const output = flag('--output');
if (!/^\d{4}-\d{2}-\d{2}$/.test(checkedOn || '') || !python || !output) throw new Error('Usage: --date YYYY-MM-DD --python <runtime> --output <new research JSON> [--schools ID,ID]');
const permittedRoot = resolve(root, 'data/research');
const target = resolve(root, output);
if (!target.startsWith(permittedRoot + sep) || !target.endsWith('.json')) throw new Error('Output must be a JSON file within data/research');
const audit = JSON.parse(readFileSync(new URL('../data/directory-audit.json', import.meta.url), 'utf8'));
const selection = flag('--schools')?.split(',');
const entries = audit.universities.filter(u => !selection || selection.includes(u.universityId)).map(u => ({ ...u, directoryUrl: flag('--url') || u.directoryUrl }));
if (flag('--url') && entries.length !== 1) throw new Error('A URL override requires exactly one selected school');
const results = [];
let next = 0;
async function worker() {
  while (next < entries.length) {
    const u = entries[next++];
    const record = { universityId: u.universityId, requestedUrl: u.directoryUrl, checkedOn, fetchedAt: new Date().toISOString() };
    try {
      if (!isOfficialUrl(u.directoryUrl)) throw new Error('Not an official university source');
      const response = await fetch(u.directoryUrl, { signal: AbortSignal.timeout(20000) });
      record.httpStatus = response.status;
      record.finalUrl = response.url;
      if (!response.ok) throw new Error(`HTTP ${response.status}; not retried or bypassed`);
      if (!isOfficialUrl(response.url)) throw new Error('Redirect left university domains; content not parsed');
      const text = await response.text();
      if (text.length > 5_000_000) throw new Error('Directory exceeds bounded collection limit');
      record.sourceSha256 = createHash('sha256').update(text).digest('hex');
      record.characters = text.length;
      const parsed = spawnSync(python, [fileURLToPath(new URL('./parse-directory.py', import.meta.url))], { input: JSON.stringify({ html: text, url: response.url }), encoding: 'utf8', maxBuffer: 8_000_000, timeout: 15000, windowsHide: true });
      if (parsed.status !== 0) throw new Error('Public directory HTML could not be parsed; runtime diagnostics not stored');
      Object.assign(record, JSON.parse(parsed.stdout));
      record.collectionStatus = record.candidates.length || record.headings.length ? 'parsed_candidates_unreviewed' : 'no_candidate_content';
    } catch (error) { record.collectionStatus = 'access_limited'; record.error = error.message; }
    results.push(record);
    console.log(`${record.universityId}: ${record.collectionStatus}; ${record.candidates?.length || 0} candidate anchors, ${record.headings?.length || 0} candidate headings`);
  }
}
await Promise.all([worker(), worker()]);
results.sort((a, b) => a.universityId.localeCompare(b.universityId));
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify({ schemaVersion: 1, checkedOn, warning: 'Candidate extraction is not verified enumeration and not admissions-rule verification. Review duplicates, programme types, delivery location and pending approval before importing.', sources: results }, null, 2) + '\n');
console.log(`Saved ${results.length} source observations to ${output}`);
