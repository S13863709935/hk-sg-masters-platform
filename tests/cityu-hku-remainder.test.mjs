import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,rmdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {CatalogueStore} from '../server/database.mjs';
import {createApp,filterProgrammes} from '../server/app.mjs';
import {loadRoutes,resolveProgramme,routeSummary} from '../server/routes.mjs';
import {loadApplicantContexts,applicantSummary,offeringFingerprint} from '../server/applicants.mjs';
import {matchProgramme} from '../server/matching.mjs';
import {programmeTimeline} from '../server/application-dates.mjs';
import {optionSnapshot,shortlistExport} from '../public/saved-options.js';
import {loadSchoolBacklog,formatSchoolBacklog} from '../scripts/school-data-backlog.mjs';
const root=new URL('../',import.meta.url),read=f=>JSON.parse(readFileSync(new URL(f,root),'utf8'));
const batch=read('data/checked-programmes.json'),obs=read('data/research/cityu-hku-remainder-observation-2026-11-03.json');
const paths={seedPath:new URL('data/catalogue.json',root),expansionPath:new URL('data/catalogue-expansion.json',root),checkedPath:new URL('data/checked-programmes.json',root),directoryEvidencePath:new URL('data/directory-links.json',root),scopeAuditPath:new URL('data/programme-scope-audit.json',root)};
const store=new CatalogueStore(':memory:',paths),routePath=new URL('data/route-programmes.json',root),contextPath=new URL('data/applicant-contexts.json',root),routes=loadRoutes(routePath,store.all()),contexts=loadApplicantContexts(contextPath,store.all(),routes);
const civil=store.get('HK-CITYU-P009'),legacy=store.get('HK-HKU-P003'),emba=store.get('HK-CITYU-P003');
const profile={major:'Civil Engineering',degreeStatus:'graduated',classification:'second_lower',gpa:3.8,gpaScale:4,experienceYears:0,language:{type:'ielts',total:6.5,testDate:'2025-09-15'}};
const route=tag=>routes.get(emba.id).find(r=>r.routeId.endsWith('-'+tag));
const selected=(tag,mode='FT',cat)=>{const p=tag==='CIVIL'?civil:emba,rid=tag==='CIVIL'?undefined:route(tag).routeId,o=(tag==='CIVIL'?civil:route(tag)).offerings.find(o=>o.mode===(mode==='FT'?'Full-time':'Part-time'));return resolveProgramme(p,routes,rid,o.id,cat?o.id+'-'+cat:undefined,contexts);};
const choices=()=>obs.applicantContextPlan.flatMap(c=>c.options.map(cat=>resolveProgramme(store.get(c.programmeId),routes,c.routeId,c.offeringId,cat.id,contexts)));

test('two parent observations and two EMBA snapshots retain existing identities and separate review counts',()=>{
 assert.equal(obs.programmeIds.length,2);assert.equal(obs.routeRecords.length,2);assert.equal(choices().length,12);assert.equal(store.quality().total,873);assert.equal(store.quality().browsable,865);assert.equal(store.quality().checked,373);assert.equal(store.quality().outOfScope,7);assert.equal(store.quality().complete,0);assert.equal(store.quality().peerReviewed,0);
 assert.deepEqual(routeSummary(routes),{groups:18,routes:43,pageChecked:43,peerReviewed:0,complete:0});assert.deepEqual(applicantSummary(contexts),{studyOptions:239,categories:478,peerReviewed:0});
 assert.equal(emba.verification,'catalogue_seed');assert.equal(civil.name,'MSc Civil Infrastructure and Building Sustainability');assert.match(civil.notesEn,/P60 code continuity.*not a separately announced legal rename date/);
 for(const p of [civil,legacy,...routes.get(emba.id)]){assert.equal(p.lastChecked,'2026-11-03');assert.equal(p.requirementsCoverage,'partial');assert.equal(p.reviewer,null);assert.equal(p.rules.some(r=>r.kind==='gpa'),false);}
});

test('former Housing Management is an archive reference rather than a duplicate current candidate',()=>{
 assert.equal(legacy.scope.status,'out_of_scope');assert.match(legacy.notesEn,/FORMER NAME.*Urban Studies and Housing Management/);assert.equal(legacy.admissionRoute,'unconfirmed');assert.equal(legacy.offerings[0].tuition,null);assert.equal(legacy.offerings[0].deadline,null);
 assert.equal(filterProgrammes(store.all()).some(p=>p.id===legacy.id),false);assert.equal(filterProgrammes(store.all()).some(p=>p.id==='HK-HKU-P102'),true);
 const m=matchProgramme(legacy,profile);assert.equal(m.status,'out_of_scope');assert.equal(m.counts.fail,0);assert.equal(m.tier,null);assert.equal(programmeTimeline(legacy,'2026-11-03').state,'excluded');
 assert.equal(routes.get('HK-HKU-P102').length,2);assert.deepEqual(routes.get('HK-HKU-P102').flatMap(r=>r.offerings.map(o=>o.tuition)),[238000,238000,229000]);
});

test('EMBA grouping requires an exact path and never inherits sibling academic, language or fee conditions',()=>{
 const base=resolveProgramme(emba,routes,undefined,undefined,undefined,contexts);assert.equal(base.routeOptions.length,2);assert.equal(matchProgramme(base,profile).status,'needs_confirmation');assert.throws(()=>resolveProgramme(emba,routes,undefined,route('P01A').offerings[0].id,undefined,contexts));
 assert.equal(route('P01A').rules.some(r=>r.kind==='language'),false);assert.equal(route('P01A').rules.find(r=>r.kind==='classification').min,'second_lower');assert.match(route('P01A').notesEn,/SIX YEARS SIGNIFICANT MANAGERIAL/);assert.match(route('P12').notesEn,/TEN YEARS.*SEPTEMBER 2027.*Exceptionally/);
 assert.equal(route('P12').rules.some(r=>r.kind==='experience'),false);assert.equal(route('P12').rules.some(r=>r.kind==='classification'),false);
 assert.equal(matchProgramme(selected('P01A'),{...profile,classification:'third'}).checks.find(c=>c.kind==='classification').status,'fail');assert.equal(matchProgramme(selected('P12'),{...profile,experienceYears:30,gpa:4}).status,'needs_confirmation');
});

test('EMBA delivery remains unresolved where advertised tours and central minimum-credit requirements differ',()=>{
 for(const tag of ['P01A','P12']){const p=selected(tag);assert.equal(p.scope.status,'unconfirmed');assert.equal(matchProgramme(p,profile).tier,null);assert.notEqual(matchProgramme(p,profile).status,'out_of_scope');}
 assert.match(route('P12').rules.find(r=>r.labelEn==='Global EMBA overseas delivery needs confirmation').noteEn,/Cambridge and Hangzhou.*two Cambridge tours.*at least4.*UNCONFIRMED/i);
 assert.equal(route('P01A').rules.some(r=>r.kind==='manual'&&r.noteEn.includes('No Global EMBA Cambridge requirement is copied')),true);
});

test('P60 current language compares supported scores and versions while preserving interview and academic alternatives',()=>{
 const p=selected('CIVIL'),language=l=>matchProgramme(p,{...profile,language:l}).checks.find(c=>c.kind==='language');
 assert.equal(language({...profile.language,total:5.5}).status,'fail');assert.equal(language({...profile.language,testDate:'2024-09-14'}).status,'fail');assert.equal(language({...profile.language,testDate:'2024-09-15'}).status,'pass');
 assert.equal(language({type:'toefl_120',total:79,testDate:'2026-01-20'}).status,'pass');assert.equal(language({type:'toefl_6',total:4,testDate:'2026-01-21'}).status,'pass');assert.equal(language({type:'toefl_6',total:4,testDate:'2026-01-21',atHome:true}).status,'fail');
 assert.equal(matchProgramme(p,{...profile,major:'Architecture'}).checks.find(c=>c.kind==='major').status,'unknown');assert.match(civil.rules.find(r=>r.labelEn==='English applicability, formats and interview').noteEn,/6.0 or TOEFL 4 requires.*interview/);assert.equal(matchProgramme(p,profile).tier,null);
});

test('minimum-credit civil baseline, proposed Global package and unknown Chinese fee stay distinct',()=>{
 for(const mode of ['FT','PT'])for(const cat of ['LOCAL','NONLOCAL']){const c=selected('CIVIL',mode,cat),ch=selected('P01A',mode,cat),g=selected('P12',mode,cat);assert.equal(c.offerings[0].tuition,246000);assert.equal(c.offerings[0].tuitionEstimate,true);assert.match(c.offerings[0].feeBasis,/CALCULATED BASELINE.*not an explicit guaranteed/);assert.equal(c.offerings[0].applicationFee,600);assert.equal(ch.offerings[0].tuition,null);assert.equal(ch.offerings[0].applicationFee,1000);assert.equal(g.offerings[0].tuition,936000);assert.match(g.offerings[0].feeBasis,/SUBJECT TO APPROVAL.*756,000.*180,000.*378,000.*not added again/);}
 for(const tag of ['CIVIL','P01A','P12']){const x=selected(tag);assert.equal(x.selectedApplicant,undefined);assert.equal(x.offerings[0].tuition,null);assert.equal(x.offerings[0].deadline,null);assert.equal(programmeTimeline(x,'2026-11-03').state,'applicant_required');}
});

test('category-specific dates bind the exact route, mode and HKT 23:59 without guessing intake month',()=>{
 for(const tag of ['CIVIL','P01A','P12'])for(const mode of ['FT','PT'])for(const cat of ['LOCAL','NONLOCAL']){const x=selected(tag,mode,cat),o=x.offerings[0];assert.equal(o.intake,'2027 entry');assert.equal(o.applicationOpen,'2026-09-15');const expected=tag==='CIVIL'?'2027-02-28':tag==='P12'?'2026-12-10':cat==='LOCAL'?'2027-08-20':'2027-07-14';assert.equal(o.deadline,expected);assert.equal(o.applicationRounds[0].deadlineAt,expected+'T23:59:00+08:00');assert.equal(programmeTimeline(x,'2026-11-03').state,'within_recorded_dates');assert.equal(programmeTimeline(x,'2026-11-03').livePortalChecked,false);const instant=expected+'T15:59:00.000Z';assert.equal(programmeTimeline(x,expected,instant).offerings[0].rounds[0].state,'cutoff_reached');}
 for(const plan of obs.applicantContextPlan){const source=plan.routeId?route(plan.routeId.endsWith('P01A')?'P01A':'P12'):civil,o=source.offerings.find(o=>o.id===plan.offeringId),c=[...contexts.values()].find(c=>c.offeringId===o.id);assert.equal(c.offeringFingerprint,offeringFingerprint(o));}
});

test('HTTP200 verification pages never count as readable official source evidence',()=>{
 assert.equal(obs.sourceRetrievals.length,16);assert.equal(obs.sourceRetrievals.filter(s=>s.contentReadable).length,10);assert.equal(obs.sourceRetrievals.filter(s=>s.status===200&&!s.contentReadable).length,6);assert.ok(obs.sourceRetrievals.every(s=>/^[a-f0-9]{64}$/.test(s.sha256)));assert.equal(obs.limits.livePortalChecked,false);assert.equal(obs.limits.pdfBrochuresUsed,false);assert.ok(obs.indexedSources.some(s=>s.url.endsWith('sf_p60.htm')));
});

test('backlog closes three unread identities without pretending grouped EMBA or ten HKU parents are fully reviewed',()=>{
 const b=loadSchoolBacklog('2026-11-04');assert.equal(b.counts.unreadLeads,485);assert.equal(b.counts.catalogueLeads,500);assert.equal(b.counts.routeCoveredLeads,12);assert.equal(b.counts.scopeHeldLeads,3);for(const id of ['HK-CITYU','HK-HKU'])assert.equal(b.schools.find(s=>s.schoolId===id).unreadLeads,0);
 assert.equal(b.schools.find(s=>s.schoolId==='HK-CITYU').pageCheckedRecords,61);assert.equal(b.schools.find(s=>s.schoolId==='HK-HKU').pageCheckedRecords,93);
 assert.deepEqual(b,read('data/research/school-backlog-2026-11-04-lingnan-gs-remainder.json'));assert.equal(formatSchoolBacklog(b),readFileSync(new URL('docs/research/school-data-backlog-2026-11-04-lingnan-gs-remainder.md',root),'utf8').replaceAll('\r\n','\n'));
});

test('temporary repeat imports preserve earlier parents and previous route/category source bindings',()=>{
 const ids=new Set(obs.programmeIds),before={...batch,programmes:batch.programmes.filter(p=>!ids.has(p.id))},dir=mkdtempSync(join(tmpdir(),'gradpath-cityu-hku-remainder-')),file=join(dir,'test.sqlite'),checkedPath=join(dir,'checked.json');let db;
 try{writeFileSync(checkedPath,JSON.stringify(before));db=new CatalogueStore(file,{...paths,checkedPath});const earlier=db.all().filter(p=>!ids.has(p.id));db.close();db=null;writeFileSync(checkedPath,JSON.stringify(batch));for(let i=0;i<2;i++){db=new CatalogueStore(file,{...paths,checkedPath});assert.equal(db.quality().checked,373);assert.deepEqual(db.all().filter(p=>!ids.has(p.id)),earlier);assert.deepEqual(db.quality().sourceRefreshConflicts,[]);assert.equal(loadApplicantContexts(contextPath,db.all(),loadRoutes(routePath,db.all())).size,239);db.close();db=null;}}
 finally{db?.close();rmSync(file,{force:true});rmSync(checkedPath,{force:true});rmdirSync(dir);}
});

const app=createApp({store,publicDir:new URL('public/',root),routeEvidencePath:routePath,applicantEvidencePath:contextPath,now:()=>new Date('2026-11-03T08:00:00Z')});let base;
test.before(async()=>{await new Promise(r=>app.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.address().port}`;});test.after(async()=>{await new Promise(r=>app.close(r));store.close();});
test('all twelve exact fee/date choices survive real APIs, saved restoration and privacy-safe exports',async()=>{
 for(const x of choices()){const id=x.id,o=x.offerings[0],cat=x.selectedApplicant.id,rid=x.selectedRoute?.id,q=new URLSearchParams({offering:o.id,applicant:cat,...(rid?{route:rid}:{})}),res=await fetch(`${base}/api/programmes/${id}?${q}`);assert.equal(res.status,200);const d=await res.json(),saved=optionSnapshot(d,'2026-11-03T08:00:00.000Z');const rr=await fetch(base+'/api/saved-options/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contexts:[saved]})});assert.equal(rr.status,200);const item=(await rr.json()).items[0];assert.equal(item.status,'resolved');assert.deepEqual(item.programme.offerings,d.offerings);assert.equal(item.programme.selectedRoute?.id,rid);const exp=shortlistExport([d],{[id]:saved}).programmes[0];assert.equal(exp.offerings[0].tuition,o.tuition);assert.equal(exp.offerings[0].tuitionEstimate,o.tuitionEstimate);assert.equal(exp.offerings[0].deadline,o.deadline);assert.equal(exp.profile,undefined);assert.equal(exp.match,undefined);
 const mr=await fetch(base+'/api/matches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile,selectedRoutes:rid?{[id]:rid}:{},selectedOfferings:{[id]:o.id},selectedApplicants:{[id]:cat}})});assert.equal(mr.status,200);const m=(await mr.json()).items.find(x=>x.id===id);assert.equal(m.match.tier,null);assert.equal(m.match.status,'needs_confirmation');}
});

test('API preserves legacy archive, rejects cross-path categories and flags obsolete saved seed options',async()=>{
 const d=await(await fetch(base+'/api/programmes/'+legacy.id)).json();assert.equal(d.scope.status,'out_of_scope');assert.equal(shortlistExport([d],{}).programmes[0].scope.status,'out_of_scope');const r=await fetch(`${base}/api/programmes/${emba.id}?route=${route('P01A').routeId}&offering=${route('P01A').offerings[0].id}&applicant=${route('P12').offerings[0].id}-LOCAL`);assert.equal(r.status,422);
 const old=optionSnapshot({...civil,selectedOffering:{id:'HK-CITYU-P009-seed'},offerings:[{...civil.offerings[0],id:'HK-CITYU-P009-seed'}]},'2026-10-01T08:00:00.000Z');const response=await fetch(base+'/api/saved-options/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contexts:[old]})});assert.equal(response.status,200);assert.equal((await response.json()).items[0].status,'needs_attention');
});
