import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {existsSync,mkdirSync,mkdtempSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {runtimeConfig,publicOrigin} from '../server/runtime-config.mjs';
import {CatalogueStore} from '../server/database.mjs';
import {createApp} from '../server/app.mjs';
const root=new URL('../',import.meta.url),origin='https://gradpath-example.onrender.com',host='gradpath-example.onrender.com';
const options={seedPath:new URL('data/catalogue.json',root),expansionPath:new URL('data/catalogue-expansion.json',root),checkedPath:new URL('data/checked-programmes.json',root),directoryAuditPath:new URL('data/directory-audit.json',root),scopeAuditPath:new URL('data/programme-scope-audit.json',root),directoryEvidencePath:new URL('data/directory-links.json',root)};
const store=new CatalogueStore(':memory:',options),server=createApp({store,publicDir:new URL('public/',root),routeEvidencePath:new URL('data/route-programmes.json',root),applicantEvidencePath:new URL('data/applicant-contexts.json',root),publicOrigin:origin,adminToken:'synthetic-admin-token-must-be-disabled'});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
test.after(async()=>{await new Promise(r=>server.close(r));store.close();});
const request=(port,path,{method='GET',hostHeader=host,headers={},data}={})=>new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port,path,method,headers:{host:hostHeader,...headers}},res=>{let text='';res.on('data',b=>text+=b);res.on('end',()=>resolve({status:res.statusCode,text,json:()=>JSON.parse(text)}));});req.on('error',reject);req.end(data===undefined?undefined:JSON.stringify(data));});
const profile={major:'Computer Science',language:{type:'none'}};
test('ordinary local launches retain loopback, local database and token configuration',()=>{assert.deepEqual(runtimeConfig({}),{hosted:false,port:3102,bindHost:'127.0.0.1',publicOrigin:'',dbPath:null,adminToken:''});assert.equal(runtimeConfig({DB_PATH:'local.sqlite',ADMIN_TOKEN:'synthetic'}).dbPath,'local.sqlite');});
test('hosted configuration requires a canonical HTTPS origin and uses memory with imports disabled',()=>{const c=runtimeConfig({GRADPATH_HOSTED_DEMO:'1',RENDER:'true',RENDER_EXTERNAL_URL:origin,PORT:'10000',DB_PATH:'must-not-use.sqlite',ADMIN_TOKEN:'must-not-use'});assert.equal(c.bindHost,'0.0.0.0');assert.equal(c.publicOrigin,origin);assert.equal(c.dbPath,':memory:');assert.equal(c.adminToken,'');for(const value of ['', 'http://example.com','https://user:pass@example.com','https://example.com/path','https://example.com?x=1','https://example.com#x'])assert.throws(()=>publicOrigin(value));assert.throws(()=>runtimeConfig({GRADPATH_HOSTED_DEMO:'1'}));assert.throws(()=>runtimeConfig({PORT:'0'}));});
test('configured public host can load the English site and full source catalogue',async()=>{const page=await request(port,'/');assert.equal(page.status,200);assert.match(page.text,/<html lang="en">/);const meta=(await request(port,'/api/meta')).json();assert.equal(meta.deployment,'hosted_demo');assert.equal(meta.adminEnabled,false);assert.equal(meta.quality.total,873);assert.equal((await request(port,'/api/catalogue')).json().total,865);});
test('HTTPS public-origin background requests work without reflecting or storing a profile',async()=>{const r=await request(port,'/api/matches',{method:'POST',headers:{origin,'content-type':'application/json'},data:{profile,filters:{school:'SG-NUS',q:'Finance'}}});assert.equal(r.status,200);const d=r.json();assert.ok(d.items.length);assert.equal(d.profile,undefined);assert.ok(d.items.every(p=>p.match.tier===null));assert.equal(store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%profile%' OR name LIKE '%student%')").all().length,0);});
test('host and origin spoofing cannot be enabled through forwarded request headers',async()=>{assert.equal((await request(port,'/',{hostHeader:'attacker.invalid',headers:{'x-forwarded-host':host,'x-forwarded-proto':'https'}})).status,403);for(const other of ['https://attacker.invalid','http://'+host,'null'])assert.equal((await request(port,'/api/matches',{method:'POST',headers:{origin:other,'content-type':'application/json'},data:{profile}})).status,403);});
test('even a configured token cannot enable imports on the public demo',async()=>{const r=await request(port,'/api/admin/import',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer synthetic-admin-token-must-be-disabled'},data:{}});assert.equal(r.status,403);assert.match(r.json().error,/Admin import is disabled/);});
test('actual hosted entry rebuilds the complete catalogue on each cold start without writing a runtime database',async()=>{
 const tmp=fileURLToPath(new URL('tmp/',root));mkdirSync(tmp,{recursive:true});const dir=mkdtempSync(join(tmp,'render-cold-start-')),db=join(dir,'not-used.sqlite');
 for(let i=0;i<2;i++){
  const reservation=http.createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const p=reservation.address().port;await new Promise(r=>reservation.close(r));
  const child=spawn(process.execPath,[fileURLToPath(new URL('server/hosted.mjs',root))],{cwd:dir,env:{...process.env,PORT:String(p),RENDER:'true',RENDER_EXTERNAL_URL:origin,PUBLIC_ORIGIN:'',DB_PATH:db,ADMIN_TOKEN:'synthetic-enabled-by-mistake'},windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
  try{for(let n=0;n<100&&!output.includes('GradPath hosted demo:');n++){if(child.exitCode!==null)throw new Error(output);await new Promise(r=>setTimeout(r,100));}assert.match(output,/GradPath hosted demo:/);const meta=(await request(p,'/api/meta')).json();assert.equal(meta.quality.total,873);assert.equal(meta.quality.checked,858);assert.equal(meta.adminEnabled,false);assert.equal(existsSync(db),false);}finally{if(child.exitCode===null){const ended=once(child,'exit');child.kill();await ended;}}
 }
});
