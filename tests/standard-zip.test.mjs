import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {standardZip} from '../scripts/standard-zip.mjs';

test('Windows built-in extraction preserves nested, Unicode, empty and binary files', {skip:process.platform !== 'win32'}, () => {
  const tmp=fileURLToPath(new URL('../tmp/',import.meta.url));mkdirSync(tmp,{recursive:true});
  const dir=mkdtempSync(join(tmp,'zip-compat-')),archive=join(dir,'standard.zip'),destination=join(dir,'extracted');
  const entries=[{name:'start-local.cmd',data:Buffer.from('@echo off\r\n')},{name:'.env.example',data:Buffer.from('PUBLIC=example\n')},
    {name:'docs/资料.txt',data:Buffer.from('Unicode filename round trip')},{name:'data/empty.txt',data:Buffer.alloc(0)},
    {name:'data/binary.dat',data:Buffer.from(Array.from({length:256},(_,i)=>i))}];
  writeFileSync(archive,standardZip(entries));
  execFileSync(join(process.env.SystemRoot || 'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),
    ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command','Expand-Archive -LiteralPath $env:GRADPATH_TEST_ZIP -DestinationPath $env:GRADPATH_TEST_DEST -ErrorAction Stop'],
    {env:{...process.env,GRADPATH_TEST_ZIP:archive,GRADPATH_TEST_DEST:destination},windowsHide:true,timeout:30000,stdio:'pipe'});
  for(const entry of entries)assert.deepEqual(readFileSync(join(destination,entry.name)),entry.data,entry.name);
  assert.equal(existsSync(join(dir,'escape.txt')),false);
});

test('noncanonical, duplicate and escaping paths cannot enter a delivery ZIP', () => {
  for(const name of ['./','./README.md','../escape.txt','/absolute.txt','C:/file.txt','nested\\file.txt','nested//file.txt','nul\0.txt'])
    assert.throws(()=>standardZip([{name,data:Buffer.alloc(0)}]),/canonical relative/);
  assert.throws(()=>standardZip([{name:'a.txt',data:''},{name:'a.txt',data:''}]),/unique/);
  assert.throws(()=>standardZip(Array(65536)),/65535/);
});
