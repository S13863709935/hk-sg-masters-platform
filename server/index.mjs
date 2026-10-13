import { createBaseline } from './app.mjs';
const root = new URL('../', import.meta.url);
const port = Number(process.env.PORT || 3103);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const server = createBaseline({ htmlPath: new URL('public/index.html', root), pilotPath: new URL('data/checked-programmes.json', root), directoryPath: new URL('data/directory-audit.json', root) });
server.listen(port, '127.0.0.1', () => console.log(`Week 4 foundations: http://127.0.0.1:${port}\nThis is a limited checkpoint, not the complete platform.`));
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
