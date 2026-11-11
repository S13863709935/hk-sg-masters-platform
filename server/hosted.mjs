// Explicit public-demo entry point; ordinary local launchers stay loopback-only.
process.env.GRADPATH_HOSTED_DEMO = '1';
await import('./index.mjs');
