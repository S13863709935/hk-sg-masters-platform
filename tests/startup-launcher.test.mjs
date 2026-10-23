import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

test('launcher major-version probe survives Windows PowerShell native argument quoting', () => {
  const launcher = readFileSync(new URL('../start-local.ps1', import.meta.url), 'utf8');
  const probe = launcher.match(/\$taskVersion = & \$taskNodePath -p '([^'\r\n]+)'/)?.[1];
  assert.ok(probe, 'Use the actual launcher probe, not a copied implementation');
  const result = process.platform === 'win32'
    ? spawnSync(join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-Command', `& '${process.execPath.replaceAll("'", "''")}' -p '${probe}'`], { encoding: 'utf8', timeout: 15000 })
    : spawnSync(process.execPath, ['-p', probe], { encoding: 'utf8', timeout: 15000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr.trim(), '');
  assert.equal(result.stdout.trim(), process.versions.node.split('.')[0]);
});
