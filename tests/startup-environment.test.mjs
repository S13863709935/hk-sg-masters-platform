import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtempSync,rmdirSync,mkdirSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const ps=join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
const launcher=fileURLToPath(new URL('../start-local.ps1',import.meta.url));
const run=env=>new Promise((resolve,reject)=>{const child=spawn(ps,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',launcher],{cwd:fileURLToPath(new URL('../../',import.meta.url)),env:{...process.env,...env},windowsHide:true,timeout:20000});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.on('error',reject);child.on('close',code=>resolve({code,output}));});
test('an occupied GradPath port reports a different running copy instead of silently claiming this copy started',{skip:process.platform!=='win32'},async()=>{
 let hits=0;const server=createServer((req,res)=>{hits++;res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true,app:'gradpath',version:'older-synthetic-copy'}));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const result=await run({PORT:String(server.address().port),DB_PATH:':memory:'});assert.notEqual(result.code,0);assert.match(result.output,/Another GradPath is already running/);assert.match(result.output,/existing service was left unchanged/);assert.doesNotMatch(result.output,/GradPath local preview:/);assert.ok(hits>0);assert.ok(server.listening);}finally{await new Promise(r=>server.close(r));}
});
test('a clean environment without Node gives a clear prerequisite and creates no runtime database',{skip:process.platform!=='win32'},async()=>{
 const tmp=join(root,'tmp');if(!existsSync(tmp))mkdirSync(tmp);const emptyProfile=mkdtempSync(join(tmp,'no-runtime-profile-'));const reservation=createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
 try{const result=await run({PORT:String(port),USERPROFILE:emptyProfile,PATH:join(process.env.SystemRoot||'C:/Windows','System32'),DB_PATH:join(emptyProfile,'should-not-exist.sqlite')});assert.notEqual(result.code,0);assert.match(result.output,/Node.js 24 or later is required/);assert.equal(existsSync(join(emptyProfile,'should-not-exist.sqlite')),false);assert.doesNotMatch(result.output,/GradPath local preview:/);}finally{try{rmdirSync(emptyProfile);}catch(error){if(error.code!=='ENOTEMPTY')throw error;}}
});
