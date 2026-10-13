import { fileURLToPath } from 'node:url';
import { CatalogueStore } from './database.mjs';
import { createApp } from './app.mjs';

const root = new URL('../', import.meta.url);
const port = Number(process.env.PORT || 3102);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const store = new CatalogueStore(process.env.DB_PATH || fileURLToPath(new URL('data/local/platform.sqlite', root)), { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryAuditPath: new URL('data/directory-audit.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root), directoryEvidencePath: new URL('data/directory-links.json', root) });
const app = createApp({ store, publicDir: new URL('public/', root), adminToken: process.env.ADMIN_TOKEN || '' });
app.listen(port, '127.0.0.1', () => console.log(`GradPath local preview: http://127.0.0.1:${port}\n${store.quality().total} catalogue records. Student profiles are not stored on the server.\nPress Ctrl+C to stop.`));
app.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Set PORT to another number.` : error.message); store.close(); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.close(() => { store.close(); process.exit(0); }));
