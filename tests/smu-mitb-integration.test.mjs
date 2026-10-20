import test from 'node:test';
import assert from 'node:assert/strict';
import { CatalogueStore } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { matchProgramme } from '../server/matching.mjs';

const root = new URL('../', import.meta.url);
const id = 'SG-SMU-P010';
const store = new CatalogueStore(':memory:', { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root) });
const server = createApp({ store, publicDir: new URL('public/', root), now: () => new Date('2026-10-20T04:00:00Z') });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
test.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); });

test('MITB catalogue and every selected intake retain unresolved dates despite known fee years', async () => {
  const before = JSON.stringify(store.get(id));
  const response = await fetch(url + '/api/catalogue?school=SG-SMU&q=IT%20in%20Business');
  assert.equal(response.status, 200);
  const list = await response.json();
  assert.equal(list.total, 1); assert.equal(list.items[0].applicationTimeline.state, 'dates_incomplete');
  for (const suffix of ['JAN2027-FT', 'JAN2027-PT', 'AUG2027-FT', 'AUG2027-PT']) {
    const res = await fetch(url + '/api/programmes/' + id + '?offering=' + id + '-' + suffix);
    assert.equal(res.status, 200);
    const p = await res.json();
    assert.equal(p.offerings.length, 1); assert.equal(p.offerings[0].id, id + '-' + suffix);
    assert.equal(p.applicationTimeline.state, 'dates_incomplete');
    assert.equal(p.applicationTimeline.livePortalChecked, false);
    assert.equal(p.applicationTimeline.offerings[0].sourceUrl, 'https://masters.smu.edu.sg/programme/MITB/Apply_Now');
    assert.equal(p.applicationTimeline.offerings[0].sourceCheckedOn, '2026-10-20');
  }
  assert.equal(JSON.stringify(store.get(id)), before);
});

test('no work experience is a preference gap, not an invented mandatory GPA or admission failure', () => {
  const result = matchProgramme(store.get(id), { major: 'History', degreeStatus: 'graduated', gpa: 2.5, gpaScale: 4, experienceYears: 0, language: { type: 'ielts', total: 7 } });
  assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
  assert.equal(result.checks.some(c => c.kind === 'gpa'), false);
  const experience = result.checks.find(c => c.kind === 'experience');
  assert.equal(experience.status, 'fail'); assert.equal(experience.mandatory, false);
  assert.ok(result.checks.some(c => c.kind === 'manual' && c.mandatory && c.status === 'unknown'));
});
