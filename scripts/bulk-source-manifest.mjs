// Research staging only. Does not promote fetched pages into checked admissions.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {isOfficialUrl} from '../server/validation.mjs';
import {identity} from './programme-identity.mjs';
import {loadSchoolBacklog} from './school-data-backlog.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const specific=url=>isOfficialUrl(url)&&!/(?:programme-filter|\/taught-postgraduate\/?$|\/graduate\/coursework\/?$|more-nus-master)/i.test(url);
export function buildBulkSourceManifest({backlog,listings=[],candidates=[],asOfDate}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)||new Date(asOfDate).toISOString().slice(0,10)!==asOfDate)throw new Error('Explicit valid as-of date required');
 const links=new Map(listings.map(x=>[x.programmeId,x]));const programmes=[];
 for(const school of backlog.schools)for(const p of school.unread){
  const listing=links.get(p.programmeId);let primary=listing?.programmeUrl||p.officialUrl;
  let evidence=listing?{kind:'existing_directory_link',checkedOn:listing.checkedOn,sourceUrl:listing.sourceUrl}:{kind:'existing_catalogue_link'};
  if(!specific(primary)){
   const found=candidates.filter(c=>identity(c.title)===identity(p.name)&&specific(c.url));const urls=[...new Set(found.map(c=>c.url))];
   if(urls.length===1){primary=urls[0];evidence={kind:'exact_identity_in_dated_official_inventory',sourceUrl:found[0].sourceUrl,checkedOn:found[0].checkedOn};}
  }
  const extra=[...new Set((listing?.variants||[]).map(v=>v.officialUrl))].filter(u=>u!==primary&&specific(u));
  if(!isOfficialUrl(primary)||extra.some(u=>!isOfficialUrl(u)))throw new Error('Non-official source in '+p.programmeId);
  programmes.push({programmeId:p.programmeId,schoolId:school.schoolId,name:p.name,primaryUrl:primary,additionalUrls:extra,needsIdentityReview:!specific(primary),resolutionEvidence:evidence});
 }
 if(new Set(programmes.map(p=>p.programmeId)).size!==programmes.length)throw new Error('Duplicate programme identities');
 const jobs=new Map();
 for(const p of programmes)for(const url of [p.primaryUrl,...p.additionalUrls]){
  if(!jobs.has(url))jobs.set(url,{url,programmeIds:[],schoolIds:[]});const j=jobs.get(url);j.programmeIds.push(p.programmeId);if(!j.schoolIds.includes(p.schoolId))j.schoolIds.push(p.schoolId);
 }
 return {schemaVersion:1,asOfDate,basis:'All existing unread leads; collection is unreviewed research staging and does not change catalogue or admissions status.',counts:{programmes:programmes.length,requests:jobs.size,schools:new Set(programmes.map(p=>p.schoolId)).size,unresolvedIdentities:programmes.filter(p=>p.needsIdentityReview).length},programmes,jobs:[...jobs.values()]};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2),flag=name=>args[args.indexOf(name)+1];if(args.length!==4||!args.includes('--as-of')||!args.includes('--output'))throw new Error('Usage: --as-of YYYY-MM-DD --output data/research/<new-name>.json');
 const target=resolve(root,flag('--output'));if(!target.startsWith(resolve(root,'data/research')+sep)||!target.endsWith('.json')||existsSync(target))throw new Error('Choose a new JSON research snapshot');
 const read=f=>JSON.parse(readFileSync(resolve(root,f),'utf8')),sources=read('data/research/cuhk-structure-2026-10-08.json').sources;
 const candidates=sources.flatMap(s=>s.candidates.map(c=>({...c,sourceUrl:s.requestedUrl,checkedOn:s.checkedOn})));
 const result=buildBulkSourceManifest({backlog:loadSchoolBacklog(flag('--as-of')),listings:read('data/directory-links.json').listings,candidates,asOfDate:flag('--as-of')});
 writeFileSync(target,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result.counts));
}
