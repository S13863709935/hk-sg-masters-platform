import { readFileSync } from 'node:fs';
import { CatalogueStore } from '../server/database.mjs';

const root = new URL('../', import.meta.url);
const seed = JSON.parse(readFileSync(new URL('data/catalogue.json', root), 'utf8'));
if (seed.universities.length !== 14 || seed.programmes.length !== 175) throw new Error('Source snapshot count changed unexpectedly');
const store = new CatalogueStore(':memory:', { seed, checkedPath: new URL('data/checked-programmes.json', root), directoryAuditPath: new URL('data/directory-audit.json', root) });
try { const q = store.quality(); console.log(JSON.stringify(q, null, 2)); if (q.peerReviewed > q.checked || q.total !== 175) throw new Error('Quality counts do not reconcile'); } finally { store.close(); }
