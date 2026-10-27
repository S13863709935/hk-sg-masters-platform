import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const pilot = read('data/checked-programmes.json');
const directory = read('data/directory-audit.json');
const manifest = read('data/publication-week-06.json');
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const hash = value => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const fileHash = path => createHash('sha256').update(readFileSync(new URL(path, root))).digest('hex');
assert.equal(pilot.schemaVersion, 1);
assert.equal(manifest.checkpoint, 'week-06');
assert.equal(manifest.preparedOn, '2026-10-27');
assert.equal(manifest.selectedProgrammeIds.length, 8);
assert.equal(directory.universities.length, 14);
assert.equal(pilot.pilotProgrammeIds.length, 20);
assert.equal(pilot.programmes.length, 21);
assert.equal(pilot.programmes.filter(p => p.admissionRoute === 'transfer_only').length, 1);
assert.equal(new Set(pilot.programmes.map(p => p.id)).size, 21);
assert.equal(new Set(pilot.programmes.map(p => p.universityId)).size, 14);
assert.deepEqual(new Set(pilot.pilotProgrammeIds), new Set(pilot.programmes.filter(p => p.admissionRoute === 'direct').map(p => p.id)));
assert.ok(pilot.programmes.every(p => p.verification === 'programme_page_checked' && p.requirementsCoverage === 'partial' && p.reviewer === null));
assert.equal(pilot.checkedOn, '2026-10-24');
const expected = [...manifest.selectedSources, ...manifest.retainedSources];
assert.equal(expected.length, 21);
assert.equal(new Set(expected.map(p => p.programmeId)).size, 21);
assert.deepEqual(new Set(manifest.selectedProgrammeIds), new Set(manifest.selectedSources.map(p => p.programmeId)));
for (const entry of expected) {
  const p = pilot.programmes.find(p => p.id === entry.programmeId);
  assert.ok(p, entry.programmeId);
  assert.equal(hash(p), entry.canonicalSha256, entry.programmeId);
  assert.equal(p.lastChecked, entry.checkedOn);
  assert.equal(new URL(p.officialUrl).protocol, 'https:');
  if (p.id === 'HK-HKUST-P003') {
    // The preserved historical transfer archive predates the sources array.
    // Its full object is pinned above; do not fabricate new source metadata.
    assert.equal(p.admissionRoute, 'transfer_only');
    assert.equal(p.lastChecked, '2026-10-06');
    assert.equal(p.sources, undefined);
  } else assert.ok(p.sources.length > 0 && p.sources.every(s => new URL(s.url).protocol === 'https:' && s.checkedOn === p.lastChecked));
  assert.ok(p.lastChecked <= manifest.preparedOn);
}
assert.equal(fileHash('data/raw/master-programme-seeds-2026-09-29.xlsx'), manifest.workbookSha256);
assert.equal(fileHash('data/directory-audit.json'), manifest.directorySha256);
console.log('Week 6 checkpoint: 14 schools, 20 direct-entry records, 1 transfer reference; 8 selected updates and 13 retained records. Latest actual source date: 24 October. Independent reviews: 0; complete requirement records: 0.');
