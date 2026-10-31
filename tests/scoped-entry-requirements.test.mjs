import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,rmdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import vm from 'node:vm';
import {CatalogueStore} from '../server/database.mjs';
import {createApp} from '../server/app.mjs';
import {loadRoutes,resolveProgramme} from '../server/routes.mjs';
import {loadApplicantContexts} from '../server/applicants.mjs';
import {resolvedOfferingId} from '../server/offerings.mjs';
import {validateProfile,validateProgramme} from '../server/validation.mjs';
import {matchProgramme} from '../server/matching.mjs';
import {optionSnapshot,shortlistExport} from '../public/saved-options.js';
import {copy} from '../public/copy.js';

const root=new URL('../',import.meta.url),read=f=>JSON.parse(readFileSync(new URL(f,root),'utf8'));
const opts={seedPath:new URL('data/catalogue.json',root),expansionPath:new URL('data/catalogue-expansion.json',root),checkedPath:new URL('data/checked-programmes.json',root),directoryEvidencePath:new URL('data/directory-links.json',root),scopeAuditPath:new URL('data/programme-scope-audit.json',root)};
const store=new CatalogueStore(':memory:',opts),routePath=new URL('data/route-programmes.json',root),contextPath=new URL('data/applicant-contexts.json',root),routes=loadRoutes(routePath,store.all()),contexts=loadApplicantContexts(contextPath,store.all(),routes);
const profile={major:'Computer Science',degreeStatus:'graduated',experienceYears:0,language:{type:'ielts',total:7.5,components:{listening:6.5,reading:6.5,writing:6.5,speaking:6.5},singleAttempt:true,testDate:'2026-09-01'}};
const ile=tag=>resolveProgramme(store.get('HK-HKUST-P008'),routes,'HK-HKUST-P008-ROUTE-'+tag,'HK-HKUST-P008-'+tag+'-2027-FT',undefined,contexts);
const fin=tag=>resolveProgramme(store.get('HK-HKUST-P031'),routes,undefined,'HK-HKUST-P031-2027-'+tag,undefined,contexts);
const mba=(tag,cat)=>resolveProgramme(store.get('HK-HKUST-P010'),routes,'HK-HKUST-P010-ROUTE-REGULAR','HK-HKUST-P010-2027-'+tag,cat?'HK-HKUST-P010-2027-'+tag+'-'+cat:undefined,contexts);
const lang=(p,patch)=>matchProgramme(p,{...profile,language:{...profile.language,...patch}}).checks.find(c=>c.kind==='language');

test('TESL and TCSL stay one parent with two explicitly chosen independent language snapshots',()=>{
 assert.equal(store.quality().total,873);assert.equal(store.quality().checked,174);assert.equal(routes.size,7);assert.equal([...routes.values()].flat().length,17);assert.equal(contexts.size,78);
 const base=resolveProgramme(store.get('HK-HKUST-P008'),routes);assert.equal(base.routeOptions.length,2);assert.equal(matchProgramme(base,profile).checks.some(c=>c.kind==='language'&&c.status==='pass'),false);
 assert.throws(()=>resolveProgramme(store.get('HK-HKUST-P008'),routes,undefined,'HK-HKUST-P008-2027-FT'));
 assert.equal(lang(ile('TESL')).status,'fail');assert.match(lang(ile('TESL')).reasonEn,/writing/);assert.equal(lang(ile('TCSL')).status,'pass');
 for(const tag of ['TESL','TCSL']){const p=ile(tag);assert.equal(p.offerings[0].tuition,165000);assert.equal(p.offerings[0].applicationFee,260);assert.equal(p.offerings[0].deadline,'2027-04-01');assert.equal(p.requirementsCoverage,'partial');assert.equal(p.reviewer,null);assert.equal(matchProgramme(p,profile).tier,null);}
});

test('TESL Writing minimum overrides only Writing while the other IELTS component floors remain enforced',()=>{
 assert.equal(lang(ile('TESL'),{components:{listening:5.5,reading:5.5,writing:7,speaking:5.5}}).status,'pass');
 assert.equal(lang(ile('TESL'),{components:{listening:5,reading:6,writing:7,speaking:6}}).status,'fail');
 const missing=lang(ile('TESL'),{components:{listening:6,reading:6,writing:null,speaking:6}});assert.equal(missing.status,'unknown');assert.match(missing.reasonEn,/writing/);
 assert.equal(lang(ile('TCSL'),{total:6.5,components:{listening:5.5,reading:5.5,writing:5.5,speaking:5.5}}).status,'pass');
});

test('both original TOEFL Writing scales compare directly without requiring unlisted section minima',()=>{
 for(const [type,total,date,low,minimum] of [['toefl_120',100,'2026-01-20',26,27],['toefl_6',5,'2026-01-21',5,5.5]]){
  assert.equal(lang(ile('TESL'),{type,total,testDate:date,components:{writing:low}}).status,'fail');
  assert.equal(lang(ile('TESL'),{type,total,testDate:date,components:{writing:minimum}}).status,'pass');
  assert.equal(lang(ile('TESL'),{type,total,testDate:date,components:{}}).status,'unknown');
  assert.equal(lang(ile('TCSL'),{type,total,testDate:date,components:{}}).status,'pass');
 }
 assert.equal(lang(ile('TESL'),{type:'toefl_6',total:5,testDate:'2026-02-01',components:{writing:5.5},atHome:true}).status,'fail');
 assert.equal(lang(ile('TESL'),{type:'waiver',total:null,components:{},testDate:null}).status,'unknown');
});

test('profile component inputs enforce their own score ranges and precision rather than reusing IELTS limits',()=>{
 for(const [type,ok,bad] of [['ielts',7,[9.5,6.7]],['toefl_120',27,[30.5,31,6.5]],['toefl_6',5.5,[0,6.5,5.2]]]){
  const language={type,total:type==='toefl_120'?100:7,testDate:type==='toefl_120'?'2026-01-20':'2026-02-01'};
  if(type==='toefl_6')language.total=5;
  assert.equal(validateProfile({...profile,language:{...language,components:{writing:ok}}}).language.components.writing,ok);
  for(const writing of bad)assert.throws(()=>validateProfile({...profile,language:{...language,components:{writing}}}));
 }
});

test('TCSL Chinese proof never becomes satisfied by a passing English comparison or Chinese background assumption',()=>{
 const p=ile('TCSL'),m=matchProgramme(p,profile),check=m.checks.find(c=>c.labelEn==='TCSL Chinese language evidence');
 assert.equal(check.status,'unknown');assert.match(check.reasonEn,/HSK Level 5.*PSC Grade 2B/);assert.match(check.reasonEn,/not an automatic exemption/);assert.equal(m.status,'needs_confirmation');assert.equal(m.tier,null);
 assert.equal(ile('TESL').rules.some(r=>r.labelEn==='TCSL Chinese language evidence'),false);
});

test('Finance work-duration comparison activates only for the selected PT option and still requires work-type evidence',()=>{
 const raw=matchProgramme(store.get('HK-HKUST-P031'),profile);assert.equal(raw.checks.find(c=>c.kind==='experience').status,'unknown');
 assert.equal(matchProgramme(fin('FT'),profile).checks.some(c=>c.kind==='experience'),false);
 assert.equal(matchProgramme(fin('PT'),profile).checks.find(c=>c.kind==='experience').status,'fail');
 const m=matchProgramme(fin('PT'),{...profile,experienceYears:1});assert.equal(m.checks.find(c=>c.kind==='experience').status,'pass');assert.equal(m.status,'needs_confirmation');assert.ok(m.checks.some(c=>c.kind==='manual'&&/post-qualification timing/.test(c.reasonEn)));
});

test('regular MBA two/three-year conditions follow the selected FT/weekly PT mode through applicant projection',()=>{
 assert.equal(matchProgramme(mba('FT'),{...profile,experienceYears:2}).checks.find(c=>c.kind==='experience').status,'pass');
 for(const category of [undefined,'INTERNATIONAL','LOCALHKVALIDVISA']){
  const p=mba('WEEKLY',category);assert.equal(resolvedOfferingId(p),'HK-HKUST-P010-2027-WEEKLY');
  assert.equal(matchProgramme(p,{...profile,experienceYears:2}).checks.find(c=>c.kind==='experience').status,'fail');assert.equal(matchProgramme(p,{...profile,experienceYears:3}).checks.find(c=>c.kind==='experience').status,'pass');
  assert.equal(matchProgramme(p,profile).checks.some(c=>c.labelEn==='Full-time MBA GMAT or GRE'),false);
 }
 assert.equal(matchProgramme(mba('FT'),profile).checks.find(c=>c.labelEn==='Full-time MBA GMAT or GRE').status,'unknown');
});

test('copied JSON and forged selectedOffering properties cannot select a conditional rule or bypass a route',()=>{
 const selected=fin('FT'),forged=JSON.parse(JSON.stringify(selected));assert.equal(resolvedOfferingId(forged),null);assert.equal(matchProgramme(forged,profile).checks.find(c=>c.kind==='experience').status,'unknown');
 const copy=JSON.parse(JSON.stringify(mba('WEEKLY','INTERNATIONAL'))),m=matchProgramme(copy,{...profile,experienceYears:9});assert.equal(m.checks.filter(c=>c.kind==='experience').every(c=>c.status==='unknown'),true);assert.ok(m.checks.some(c=>c.kind==='route'&&c.status==='unknown'));
});

test('import rejects foreign, wrong-year, duplicate, undated and unfounded rule scopes',()=>{
 const raw=read('data/checked-programmes.json').programmes.find(p=>p.id==='HK-HKUST-P031'),ids=new Set(['HK-HKUST']);
 for(const change of [a=>a.offeringIds=['HK-HKUST-P010-2027-FT'],a=>a.academicYear='2026/27',a=>a.offeringIds.push(a.offeringIds[0]),a=>a.checkedOn='2026-11-01',a=>a.checkedOn='2026-10-29',a=>delete a.labelEn]){
  const p=structuredClone(raw);change(p.rules.find(r=>r.appliesTo).appliesTo);assert.throws(()=>validateProgramme(p,ids));
 }
 const p=structuredClone(raw);p.rules.find(r=>r.appliesTo).sourceUrl='https://www.hku.hk/unrelated';assert.throws(()=>validateProgramme(p,ids));
});

test('invalid named component thresholds fail closed instead of being silently ignored',()=>{
 const raw=routes.get('HK-HKUST-P008')[0],ids=new Set(['HK-HKUST']);
 for(const componentMins of [{writing:31},{writing:-1},{writing:'7'},{privateValue:7},{writing:6.7},[],null,{}]){const p=structuredClone(raw);p.rules.find(r=>r.kind==='language').tests.ielts.componentMins=componentMins;assert.throws(()=>validateProgramme(p,ids));}
});

test('later scoped route readings preserve historical fee/date evidence and reject future or missing main-source reads',()=>{
 const route=routes.get('HK-HKUST-P010').find(r=>r.routeId.endsWith('-REGULAR'));assert.equal(route.lastChecked,'2026-10-31');assert.equal(route.offerings[0].feeEvidence.checkedOn,'2026-10-30');assert.ok(route.sources.some(s=>s.checkedOn==='2026-10-30'));
 const dir=mkdtempSync(join(tmpdir(),'gradpath-route-dates-')),file=join(dir,'routes.json');
 try{for(const mutate of [r=>r.sources[0].checkedOn='2026-11-01',r=>r.sources=r.sources.filter(s=>s.checkedOn!=='2026-10-31')]){const b=read('data/route-programmes.json'),r=b.programmes.find(g=>g.programmeId==='HK-HKUST-P010').routes[0];mutate(r);writeFileSync(file,JSON.stringify(b));assert.throws(()=>loadRoutes(file,store.all()));}}
 finally{rmSync(file,{force:true});rmdirSync(dir);}
});

test('public rules and export preserve scope/Writing thresholds while excluding unknown nested keys and matching decisions',()=>{
 const source=readFileSync(new URL('public/app.js',root),'utf8'),ctx=vm.createContext({esc:v=>String(v).replaceAll('<','&lt;'),t:k=>copy[k]||k});vm.runInContext(source.slice(source.indexOf('function ruleText('),source.indexOf('function roundDeadline(')),ctx);
 const r=mba('WEEKLY').rules.find(r=>r.appliesTo&&r.min===3);assert.match(ctx.ruleText(r),/Only for 2027 weekly part-time MBA only/);assert.match(ctx.ruleText(ile('TESL').rules.find(r=>r.kind==='language')),/Writing ≥ 7/);
 const p=ile('TESL'),exp=shortlistExport([p]).programmes[0];assert.equal(exp.evidence.publishedRequirements.find(r=>r.kind==='language').tests.toefl_120.componentMins.writing,27);assert.equal(exp.profile,undefined);assert.equal(exp.match,undefined);
 const sourceRule=structuredClone(r);sourceRule.appliesTo.privateProfile={secret:'private-marker'};const p2={...mba('WEEKLY'),rules:[sourceRule]},out=shortlistExport([p2]).programmes[0].evidence.publishedRequirements[0];assert.deepEqual(out.appliesTo.offeringIds,['HK-HKUST-P010-2027-WEEKLY']);assert.equal(JSON.stringify(out).includes('private-marker'),false);
});

const app=createApp({store,publicDir:new URL('public/',root),routeEvidencePath:routePath,applicantEvidencePath:contextPath,now:()=>new Date('2026-10-31T08:00:00Z')});let base;
test.before(async()=>{await new Promise(r=>app.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.address().port}`;});test.after(async()=>{await new Promise(r=>app.close(r));store.close();});
const post=async(path,data)=>{const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});assert.equal(r.status,200);return r.json();};
test('real matching API chooses the same independent concentration and mode criteria as server-side comparisons',async()=>{
 for(const [id,route,offering,expected] of [['HK-HKUST-P008','TESL','HK-HKUST-P008-TESL-2027-FT','fail'],['HK-HKUST-P008','TCSL','HK-HKUST-P008-TCSL-2027-FT','pass'],['HK-HKUST-P010','REGULAR','HK-HKUST-P010-2027-WEEKLY','fail']]){
  const result=await post('/api/matches',{profile:{...profile,experienceYears:2},selectedRoutes:{[id]:id+'-ROUTE-'+route},selectedOfferings:{[id]:offering}}),p=result.items.find(p=>p.id===id);assert.equal(p.match.checks.find(c=>c.kind===(id.endsWith('008')?'language':'experience')).status,expected);assert.equal(p.match.tier,null);
 }
});
test('new concentration choices restore explicitly, while old route-free ILE choices need review without a silent substitute',async()=>{
 const p=ile('TESL'),saved=optionSnapshot(p,'2026-10-31T08:00:00.000Z'),good=await post('/api/saved-options/resolve',{contexts:[saved]});assert.equal(good.items[0].status,'resolved');
 const old={programmeId:p.id,routeId:null,offeringId:'HK-HKUST-P008-2027-FT',applicantId:null,savedAt:'2026-10-30T08:00:00.000Z'},bad=await post('/api/saved-options/resolve',{contexts:[old]});assert.notEqual(bad.items[0].status,'resolved');assert.equal(bad.items[0].programme,undefined);
 const exp=shortlistExport([p],{[p.id]:saved}).programmes[0];assert.equal(exp.selectedRoute.id,saved.routeId);assert.equal(exp.rememberedChoice,true);
});
