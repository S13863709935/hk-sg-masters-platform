import test from 'node:test';
import assert from 'node:assert/strict';
import {includeInLocalPackage} from '../scripts/package-local.mjs';
test('source-only package retains the local entry point, public site and source datasets',()=>{for(const p of ['start-local.cmd','start-local.ps1','.env.example','server/app.mjs','public/index.html','data/checked-programmes.json','docs/local-development.md'])assert.equal(includeInLocalPackage(p),true,p);});
test('runtime student data, secrets, CVs, Git history, raw captures and path escapes never enter a handoff archive',()=>{for(const p of ['data/local/platform.sqlite','data/private/student.json','data/student-profiles/a.json','.env','.env.production','credentials.json','server/secrets.json','docs/assessments/final.docx','docs/Song_CV.pdf','docs/Transcript.pdf','tmp/raw.html','.git/config','../outside.txt','public/../../outside.txt','node_modules/a.js','key.pem'])assert.equal(includeInLocalPackage(p),false,p);});
