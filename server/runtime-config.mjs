export function publicOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('A valid HTTPS public origin is required for the hosted demo'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Use an HTTPS origin without a path, credentials, query or fragment');
  return url.origin;
}

export function runtimeConfig(env = process.env) {
  const hosted = env.GRADPATH_HOSTED_DEMO === '1';
  const port = Number(env.PORT || (hosted ? 10000 : 3102));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  return {
    hosted, port, bindHost: hosted ? '0.0.0.0' : '127.0.0.1',
    publicOrigin: hosted ? publicOrigin(env.PUBLIC_ORIGIN || (env.RENDER === 'true' ? env.RENDER_EXTERNAL_URL : '')) : '',
    dbPath: hosted ? ':memory:' : env.DB_PATH || null,
    adminToken: hosted ? '' : env.ADMIN_TOKEN || ''
  };
}
