import { fileURLToPath } from 'node:url';
import { CatalogueStore } from './database.mjs';
import { createApp } from './app.mjs';
import { runtimeConfig } from './runtime-config.mjs';

const root = new URL('../', import.meta.url);
const config = runtimeConfig(), port = config.port;
const store = new CatalogueStore(config.dbPath || fileURLToPath(new URL('data/local/platform.sqlite', root)), { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryAuditPath: new URL('data/directory-audit.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root), directoryEvidencePath: new URL('data/directory-links.json', root) });
const app = createApp({ store, publicDir: new URL('public/', root), adminToken: config.adminToken, publicOrigin: config.publicOrigin, routeEvidencePath: new URL('data/route-programmes.json', root), applicantEvidencePath: new URL('data/applicant-contexts.json', root) });
app.listen(port, config.bindHost, () => console.log(`${config.hosted ? 'GradPath hosted demo: ' + config.publicOrigin : 'GradPath local preview: http://127.0.0.1:' + port}\n${store.quality().total} catalogue records. Student profiles are not stored on the server.\nPress Ctrl+C to stop.`));
app.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Set PORT to another number.` : error.message); store.close(); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.close(() => { store.close(); process.exit(0); }));
