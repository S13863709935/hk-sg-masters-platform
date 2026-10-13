import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CatalogueStore } from '../server/database.mjs';

const file = process.argv[2];
if (!file) { console.error('Usage: node scripts/import-data.mjs <checked-batch.json>'); process.exit(1); }
const root = new URL('../', import.meta.url);
const store = new CatalogueStore(process.env.DB_PATH || fileURLToPath(new URL('data/local/platform.sqlite', root)), { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryAuditPath: new URL('data/directory-audit.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root), directoryEvidencePath: new URL('data/directory-links.json', root) });
try { console.log(JSON.stringify(store.importBatch(JSON.parse(readFileSync(file, 'utf8')), `CLI import: ${new Date().toISOString()}`))); } catch (error) { console.error(error.message); process.exitCode = 1; } finally { store.close(); }
