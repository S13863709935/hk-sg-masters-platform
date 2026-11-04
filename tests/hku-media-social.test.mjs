import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,rmdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {CatalogueStore} from '../server/database.mjs';
import {createApp} from '../server/app.mjs';
import {loadRoutes,resolveProgramme,routeSummary} from '../server/routes.mjs';
import {loadApplicantContexts,applicantSummary} from '../server/applicants.mjs';
import {matchProgramme} from '../server/matching.mjs';
import {programmeTimeline} from '../server/application-dates.mjs';
import {loadRepositoryReviewQueue} from '../scripts/source-review-queue.mjs';
import {optionSnapshot,shortlistExport} from '../public/saved-options.js';
const root=new URL('../',import.meta.url),read=f=>JSON.parse(readFileSync(new URL(f,root),'utf8'));
const batch=read('data/checked-programmes.json'),obs=read('data/research/hku-media-social-observation-2026-11-01.json');
const options={seedPath:new URL('data/catalogue.json',root),expansionPath:new URL('data/catalogue-expansion.json',root),checkedPath:new URL('data/checked-programmes.json',root),directoryEvidencePath:new URL('data/directory-links.json',root),scopeAuditPath:new URL('data/programme-scope-audit.json',root)};
const store=new CatalogueStore(':memory:',options),routePath=new URL('data/route-programmes.json',root),contextPath=new URL('data/applicant-contexts.json',root);
const routes=loadRoutes(routePath,store.all()),contexts=loadApplicantContexts(contextPath,store.all(),routes);
const p=n=>store.get(`HK-HKU-P${String(n).padStart(3,'0')}`),direct=obs.programmeIds.map(id=>store.get(id)),snaps=()=>[...direct,...routes.get(p(21).id)];
const profile={major:'Computer Science',degreeStatus:'graduated',gpa:3,gpaScale:4,experienceYears:0,language:{type:'ielts',total:7,components:{listening:6,reading:6,writing:6,speaking:6},testDate:'2025-09-01'}};
const resolve=(n,mode='FT',route)=>resolveProgramme(p(n),routes,route?p(n).id+'-ROUTE-'+route:undefined,p(n).id+(route?'-'+route:'')+'-2027-'+mode,undefined,contexts);
const language=(x,l=profile.language)=>matchProgramme(x,{...profile,language:l}).checks.find(c=>c.kind==='language');
const academic=x=>x.rules.find(r=>r.labelEn==='Programme-specific academic and evidence conditions').noteEn;
const docs=x=>x.rules.find(r=>r.labelEn==='Exact supporting documents and relative timing').noteEn;

test('eleven existing parents and two exact journalism routes remain partial, English and separate from catalogue/category counts',()=>{
 assert.equal(direct.length,11);assert.equal(direct.flatMap(p=>p.offerings).length,19);assert.equal(routes.get(p(21).id).length,2);assert.equal(routes.get(p(21).id).flatMap(p=>p.offerings).length,3);
 assert.equal(store.quality().total,873);assert.equal(store.quality().browsable,865);assert.equal(store.quality().checked,401);assert.equal(store.quality().complete,0);assert.equal(store.quality().peerReviewed,0);
 assert.equal(store.all().filter(p=>p.universityId==='HK-HKU'&&p.verification==='programme_page_checked').length,93);
 assert.deepEqual(routeSummary(routes),{groups:27,routes:61,pageChecked:61,peerReviewed:0,complete:0});assert.deepEqual(applicantSummary(contexts),{studyOptions:288,categories:580,peerReviewed:0});
 for(const x of snaps()){assert.equal(x.requirementsCoverage,'partial');assert.equal(x.reviewer,null);assert.equal(x.lastChecked,'2026-11-01');assert.equal(x.rules.some(r=>['gpa','classification','experience'].includes(r.kind)),false);const raw=x.routeId?x:batch.programmes.find(p=>p.id===x.id);assert.equal(/\p{Script=Han}/u.test(JSON.stringify(raw)),false);}
});

test('an unselected journalism parent cannot inherit route eligibility or resolve a stale bare-mode choice',()=>{
 const bare=resolveProgramme(p(21),routes,undefined,undefined,undefined,contexts);assert.equal(bare.routeOptions.length,2);assert.equal(matchProgramme(bare,profile).status,'needs_confirmation');assert.throws(()=>resolveProgramme(p(21),routes,undefined,'HK-HKU-P021-2027-FT',undefined,contexts));
 const poison={...p(21),rules:[{kind:'gpa',minimum:4.3,scale:4.3}],offerings:[{id:'POISON',tuition:1}]};
 const r=routes.get(p(21).id)[0],exact=resolveProgramme(poison,routes,r.routeId,r.offerings[0].id,undefined,contexts);assert.equal(exact.rules.some(r=>r.kind==='gpa'),false);assert.equal(exact.offerings[0].tuition,267000);
 assert.throws(()=>resolve(21,'PT','DOCUMENTARY'));assert.throws(()=>resolveProgramme(p(21),routes,'HK-HKU-P021-ROUTE-GENERAL','HK-HKU-P021-DOCUMENTARY-2027-FT',undefined,contexts));
});

test('journalism, documentary, creative AI and nonprofit English thresholds differ at real boundary scores',()=>{
 const mj=resolve(21,'FT','GENERAL'),doc=resolve(21,'FT','DOCUMENTARY'),ai=resolve(33),npm=resolve(94);
 const ielts=(total,min)=>({...profile.language,total,components:{listening:min,reading:min,writing:min,speaking:min}});
 assert.equal(language(mj,ielts(6.5,6)).status,'fail');assert.equal(language(mj,ielts(7,6)).status,'pass');assert.equal(language(doc,ielts(6,5.5)).status,'pass');assert.equal(language(ai,ielts(6,6)).status,'fail');assert.equal(language(ai,ielts(6.5,6)).status,'pass');assert.equal(language(npm,ielts(6.5,5.5)).status,'pass');
 for(const [x,old,newer] of [[mj,95,5],[doc,80,4.5],[ai,90,4.5],[npm,85,4.5]]){assert.equal(language(x,{type:'toefl_120',total:old-1,testDate:'2026-01-20'}).status,'fail');assert.equal(language(x,{type:'toefl_120',total:old,testDate:'2026-01-20'}).status,'pass');assert.throws(()=>language(x,{type:'toefl_120',total:old,testDate:'2026-01-21'}),/scale conflicts/);assert.equal(language(x,{type:'toefl_6',total:newer,testDate:'2026-01-21'}).status,'pass');}
});

test('Documentary pending renaming and fee revamp never create an approved MADF degree or numeric fee',()=>{
 const x=resolve(21,'FT','DOCUMENTARY'),o=x.offerings[0];assert.equal(x.name,'Master of Journalism - Documentary Filmmaking Specialisation');assert.equal(o.tuition,null);assert.match(o.feeBasis,/72credits x4,450=320,400.*pending revamp/);assert.match(o.duration,/1 year.*1.5 years pending/);assert.equal(x.fieldStatus.tuition.status,'unknown');assert.match(academic(x),/PENDING final University approval/);assert.equal(o.applicationFee,780);
 assert.equal(store.all().filter(p=>p.id==='HK-HKU-P021').length,1);assert.equal(resolve(33).offerings[0].tuition,348000);assert.match(resolve(33).offerings[0].feeBasis,/60credits x HKD5,800/);assert.match(resolve(33).name,/Creative Artificial Intelligence Film and Media/);
});

test('Buddhist prerequisites, assessed exceptions and Arts English exception are preserved without automatic pass or rejection',()=>{
 const c=resolve(45),s=resolve(46);assert.match(academic(c),/BSTC6079.*BSTC6002.*BSFC/);assert.equal(c.rules.some(r=>r.kind==='major'),false);assert.equal(matchProgramme(c,{...profile,degreeStatus:'other'}).status,'needs_confirmation');assert.match(academic(c),/NOT professional training/);
 assert.equal(matchProgramme(s,profile).checks.find(c=>c.kind==='major').status,'pass');
 for(const x of [c,s]){assert.equal(language(x,{...profile.language,total:6,components:{listening:5.5,reading:5.5,writing:5.5,speaking:5.5}}).status,'pass');const r=x.rules.find(r=>r.kind==='language');assert.equal(r.tests.toefl_120.componentMins,undefined);assert.equal(r.tests.toefl_6.componentMins,undefined);assert.equal(language(x,{type:'toefl_120',total:80,testDate:'2026-01-20',atHome:true}).status,'fail');assert.equal(r.tests.ielts.atHomeAccepted,undefined);assert.match(x.rules.find(r=>r.labelEn==='English applicability, format and date evidence').noteEn,/One Skill Retake/);}
});

test('preferred employment never substitutes for arts readiness or becomes a numeric hard floor',()=>{
 for(const n of [54,90,92,94]){const x=resolve(n,n===90?'PT':'FT'),m=matchProgramme(x,profile);assert.equal(x.rules.find(r=>r.labelEn==='Preferred relevant professional experience').mandatory,false);assert.equal(m.checks.some(c=>c.status==='fail'),false);assert.equal(m.status,'needs_confirmation');}
 const art=resolve(54);assert.match(art.rules.find(r=>r.labelEn==='Arts portfolio, essays and arts involvement').noteEn,/THREE years of arts involvement.*not necessarily three years of paid work/);assert.match(docs(art),/USB.*SEVEN WORKING DAYS.*3-10.*FOUR personal essays.*NO assigned word limit/);
 assert.throws(()=>resolve(90,'FT'));assert.throws(()=>resolve(92,'PT'));assert.throws(()=>resolve(33,'PT'));assert.match(academic(resolve(90,'PT')),/not an exclusive major/);
});

test('relative checklist conflicts and conditional documents survive without invented personal due dates',()=>{
 for(const n of [45,46])assert.match(docs(p(n)),/MONTH from APPLICATION.*MONTH from NOTIFICATION/);
 assert.match(docs(p(46)),/OPTIONAL.*TWO WEEKS.*FOUR WEEKS/);assert.match(docs(p(45)),/two ACADEMIC.*at least one/);
 assert.match(docs(p(90)),/800words.*COMPULSORY.*14DAYS/);assert.match(docs(p(92)),/IF APPROPRIATE.*SHORTLISTED/);assert.match(docs(p(94)),/1000words.*under1MB.*conditional/);
 for(const n of [91,93,97]){assert.match(docs(p(n)),/September2025/);assert.match(docs(p(n)),/applicability remains unconfirmed|applicability remains unconfirmed|applicability.*unconfirmed/);assert.equal(p(n).offerings[0].applicationFee,null);}
 for(const route of ['GENERAL','DOCUMENTARY'])assert.match(docs(resolve(21,'FT',route)),/English CV.*ONE MONTH/);
});

test('whole-programme, yearly and per-credit charges remain distinct for every offered mode',()=>{
 for(const [n,total] of [[23,388080],[45,186800],[46,180500],[54,378840],[91,216300],[93,216300],[94,262240],[97,216300]])for(const m of ['FT','PT'])assert.equal(resolve(n,m).offerings[0].tuition,total);
 assert.equal(resolve(90,'PT').offerings[0].tuition,257340);assert.equal(resolve(92).offerings[0].tuition,250000);
 for(const m of ['FT','PT']){const o=resolve(21,m,'GENERAL').offerings[0];assert.equal(o.tuition,267000);assert.match(o.feeBasis,/extra credits increase charges.*same rate for local\/non-local/);assert.equal(resolve(21,m,'GENERAL').applicantOptions,undefined);}
});

test('noon boundaries, fixed English-date anchor and separate scholarship/file clocks do not claim live-open admission',()=>{
 for(const x of snaps()){assert.equal(language(x,{...profile.language,testDate:'2025-08-31'}).status,'fail');assert.equal(language(x,{type:'waiver'}).status,'unknown');for(const o of x.offerings)for(const r of o.applicationRounds){const y=resolveProgramme(p(Number((x.id||'HK-HKU-P021').slice(-3))),routes,x.routeId,o.id,undefined,contexts),a=programmeTimeline(y,r.deadline,r.deadline+'T03:59:59.999Z'),b=programmeTimeline(y,r.deadline,r.deadline+'T04:00:00.000Z');assert.equal(r.deadlineAt,r.deadline+'T12:00:00+08:00');assert.equal(a.offerings[0].rounds.find(v=>v.id===r.id).state,r.applicationOpen?'within_recorded_dates':'cutoff_ahead');assert.equal(b.offerings[0].rounds.find(v=>v.id===r.id).state,'cutoff_reached');assert.equal(b.livePortalChecked,false);}}
 assert.match(resolve(23).offerings[0].deadlineNote,/remaining places.*12:01pm/);assert.equal(resolve(45).offerings[0].applicationRounds.some(r=>r.deadline==='2026-12-31'),false);assert.equal(resolve(46).offerings[0].applicationRounds.length,2);
 assert.equal(obs.pdfChecks.length,26);assert.equal(obs.pdfChecks.reduce((n,p)=>n+p.renderedPages.length,0),10);assert.equal(obs.pdfChecks.filter(p=>p.renderedPages.length).length,7);
 const q=loadRepositoryReviewQueue('2026-11-01');assert.equal(q.counts.reviewUnits,750);assert.equal(q.counts.nearCutoffUnits,7);assert.equal(q.counts.staleApplicantContexts,0);
});

test('temporary database upgrade preserves all unrelated parents, prior options and applicant fingerprints',()=>{
 const ids=new Set(obs.programmeIds),before={...batch,programmes:batch.programmes.filter(p=>!ids.has(p.id))},dir=mkdtempSync(join(tmpdir(),'gradpath-hku-media-social-')),file=join(dir,'test.sqlite'),checkedPath=join(dir,'checked.json');let db;
 try{writeFileSync(checkedPath,JSON.stringify(before));db=new CatalogueStore(file,{...options,checkedPath});assert.equal(db.quality().checked,before.programmes.length);const earlier=db.all().filter(p=>!ids.has(p.id));db.close();db=null;writeFileSync(checkedPath,JSON.stringify(batch));for(let i=0;i<2;i++){db=new CatalogueStore(file,{...options,checkedPath});assert.equal(db.quality().checked,401);assert.deepEqual(db.all().filter(p=>!ids.has(p.id)),earlier);assert.deepEqual(db.quality().sourceRefreshConflicts,[]);assert.equal(loadApplicantContexts(contextPath,db.all(),loadRoutes(routePath,db.all())).size,288);db.close();db=null;}}
 finally{db?.close();rmSync(file,{force:true});rmSync(checkedPath,{force:true});rmdirSync(dir);}
});

const app=createApp({store,publicDir:new URL('public/',root),routeEvidencePath:routePath,applicantEvidencePath:contextPath,now:()=>new Date('2026-11-01T08:00:00Z')});let base;
test.before(async()=>{await new Promise(r=>app.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.address().port}`;});test.after(async()=>{await new Promise(r=>app.close(r));store.close();});
test('all twenty-two direct/route/mode options survive real detail, matching, saved restore and export with exact identities',async()=>{
 let visits=0;for(const x of snaps())for(const o of x.offerings){const id=x.id||'HK-HKU-P021',rid=x.routeId,query=new URLSearchParams({offering:o.id,...(rid?{route:rid}:{})}),res=await fetch(`${base}/api/programmes/${id}?${query}`,{headers:{Connection:'close'}});assert.equal(res.status,200);const d=await res.json(),saved=optionSnapshot(d,'2026-11-01T08:00:00.000Z');
  const restore=await fetch(base+'/api/saved-options/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contexts:[saved]})});assert.equal(restore.status,200);const item=(await restore.json()).items[0];assert.equal(item.status,'resolved');assert.deepEqual(item.programme.offerings,d.offerings);assert.equal(item.programme.selectedRoute?.id,rid);
  const exp=shortlistExport([d],{[id]:saved}).programmes[0];assert.equal(exp.profile,undefined);assert.equal(exp.match,undefined);assert.equal(exp.selectedOffering.id,o.id);assert.equal(exp.selectedRoute?.id,rid);assert.equal(exp.offerings[0].tuition,o.tuition);assert.equal(exp.selectedApplicant,null);
  const matched=await fetch(base+'/api/matches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile,selectedRoutes:rid?{[id]:rid}:{},selectedOfferings:{[id]:o.id},filters:{school:'HK-HKU'}})});assert.equal(matched.status,200);const m=(await matched.json()).items.find(v=>v.id===id);assert.equal(m.match.tier,null);assert.equal(m.match.status,'needs_confirmation');visits++;
 }assert.equal(visits,22);
});
