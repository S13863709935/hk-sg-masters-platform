import { createCheckpoint } from './app.mjs';
const root = new URL('../', import.meta.url);
const port = Number(process.env.PORT || 3110);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const server = createCheckpoint({ publicDir: new URL('public/', root), pilotPath: new URL('data/checked-programmes.json', root), directoryPath: new URL('data/directory-audit.json', root) });
server.listen(port, '127.0.0.1', () => console.log(`Week 6 data checkpoint: http://127.0.0.1:${port}\nLimited pilot; not the complete platform or confirmed admission eligibility.`));
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
