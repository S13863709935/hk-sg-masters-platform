// Scope-specific reconciliation of frozen browser observations. No admissions extraction.
import { readFileSync, writeFileSync } from 'node:fs';
import { identity } from './programme-identity.mjs';
import { isOfficialUrl, validateProgramme, validateDirectoryListing } from '../server/validation.mjs';

const root = new URL('../', import.meta.url), date = '2026-10-13';
const read = file => JSON.parse(readFileSync(new URL(file, root), 'utf8'));
const save = (file, data) => writeFileSync(new URL(file, root), JSON.stringify(data, null, 2)+'\n');
const seed = read('data/catalogue.json'), previous = read('data/catalogue-expansion.json'), checked = read('data/checked-programmes.json');
if (previous.checkedOn > date) throw new Error('Refusing to replace a newer batch');
const schoolIds = new Set(seed.universities.map(u=>u.id));
const registry = new Map([...seed.programmes,...previous.programmes,...checked.programmes].map(p=>[p.id,p]));
const expansion = new Map(previous.programmes.map(p=>[p.id,p]));
const links = [], inventories = [];
const clean = title => title.replace(/\u200b/g,'').replace(/[\p{Script=Han}]+/gu,'').replace(/\s+/g,' ').trim().replace(/\s+\((?:MMC|MSAI|MSBBB|IS|MSIS|KM|HoPE|MSCMed|MCAAI|MSDS)\)$/,'');
const groupTitle = (school,title) => {
  if (school==='SG-NUS') {
    if (/^LLM \(|^Master of Laws/.test(title)) return 'Master of Laws';
    if (/^NUS MBA$|^NUS-HEC MBA$|^NUS-Peking University MBA$/.test(title)) return 'Master of Business Administration';
    if (/^MSc \(Management(?: \+ CEMS MIM)?\)$/.test(title)) return 'MSc Management';
    if (/^MSc \(Marketing Analytics and Insights(?: \+ CEMS MIM)?\)$/.test(title)) return 'MSc Marketing Analytics and Insights';
  } else {
    if (/^Master of Education \(/.test(title)) return 'Master of Education';
    if (/^Master of Science in Cybersecurity \(/.test(title)) return 'Master of Science in Cybersecurity';
    if (/^Master of Public Administration/.test(title)) return 'Master of Public Administration';
    if (/^Master of Science in Managerial Economics/.test(title)) return 'Master of Science in Managerial Economics';
    if (/^Master of Science Technopreneurship and Innovation Programme/.test(title)) return 'Master of Science Technopreneurship and Innovation Programme';
    if (/^Nanyang Executive MBA(?: \(Chinese\))?$/.test(title)) return 'Nanyang Executive MBA';
  }
  return clean(title);
};
for (const school of ['SG-NUS','SG-NTU']) {
  const observation = read(`data/research/${school==='SG-NUS'?'nus':'ntu'}-directory-observation-${date}.json`);
  const raw = observation.pages.flatMap(p=>p.entries), expected = school==='SG-NUS'?136:113;
  if (raw.length!==expected || observation.pages.length!==(school==='SG-NUS'?14:12)) throw new Error('Missing directory pages');
  if (observation.pages.some(p=> school==='SG-NUS' ? !p.filterLabel || !p.resultLabel.endsWith('136 Programmes') : !p.selectedCoursework || !p.resultLabel.includes('113'))) throw new Error('Invalid coursework filter evidence');
  const sourceUrl = school==='SG-NUS' ? observation.sourceUrl : observation.pages[0].sourceUrl;
  const groups = new Map(), entries=[];
  for (const e of raw) {
    let decision='include_directory_lead', reasonEn='Official coursework directory lead; admissions, applicable year and delivery still unreviewed.';
    if (school==='SG-NUS' && e.title==='Master of Computing') { decision='needs_identity_reconciliation'; reasonEn='Generic Computing card does not identify General Track versus specialisations. Do not replace or copy the General Track rules.'; }
    if (school==='SG-NUS' && e.title==='MSc (Accounting and Financial Analytics)') { decision='needs_identity_reconciliation'; reasonEn='Current title differs from the old Accounting seed. A formal alias/rename has not been established; do not create a duplicate or silently relabel it.'; }
    if ((school==='SG-NUS' && /Double Degree|NUS-SJTU|TUM-NUS|UCLA-NUS/.test(e.title)) || (school==='SG-NTU' && /Joint NTU-TUM|NTU-PKU|Nanyang-SJTU/.test(e.title))) { decision='needs_partner_reconciliation'; reasonEn='Joint/double-degree or partner-delivery route; awarding institutions, location and admission route need checking before a standalone lead is added.'; }
    if (!isOfficialUrl(e.officialUrl) && decision==='include_directory_lead') throw new Error('Unapproved source domain');
    const entry={ rawName:e.title, nameEn:clean(e.title), officialUrl:e.officialUrl, decision, reasonEn };
    if (e.tags) entry.directoryTags=e.tags;
    if (decision==='needs_identity_reconciliation') entry.relatedSeedId=e.title==='Master of Computing'?'SG-NUS-P029':'SG-NUS-P006';
    entries.push(entry);
    if (decision!=='include_directory_lead') continue;
    const name=groupTitle(school,e.title), key=identity(name);
    if (!groups.has(key)) groups.set(key,{name,entries:[]});
    groups.get(key).entries.push(entry);
  }
  const records=[...registry.values()].filter(p=>p.universityId===school);
  const byName=new Map(records.map(p=>[identity(p.name),p]));
  let nextId=Math.max(...records.map(p=>Number(p.id.split('-P')[1])))+1;
  const candidates=[];
  for (const g of [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name,'en'))) {
    let p=byName.get(identity(g.name));
    const variants=g.entries.length>1?g.entries.map(e=>({nameEn:e.nameEn,officialUrl:e.officialUrl})):[];
    const listing={nameEn:g.name,checkedOn:date,sourceUrl,programmeUrl:g.entries[0].officialUrl,variants,noteEn:variants.length?'Grouped directory specialisations/language or dual pathways, not interchangeable admissions rules. Select and verify a specific route before any eligibility conclusion.':'Official directory title and link only; intake year and all admission requirements still need checking.'};
    validateDirectoryListing(listing);
    if (!p) {
      const id=`${school}-P${String(nextId++).padStart(3,'0')}`;
      p={id,universityId:school,name:g.name,award:'Master',area:'Unclassified',faculty:null,officialUrl:listing.programmeUrl,verification:'catalogue_seed',sourceStatus:'Official coursework directory listing; programme admissions unreviewed',lastChecked:date,academicYear:null,admissionRoute:'unconfirmed',requirementsCoverage:'unreviewed',collector:'AI-assisted dynamic-directory enumeration',reviewer:null,notesZh:'',notesEn:listing.noteEn+' Directory presence does not prove applications are open.',offerings:[{id:id+'-catalogue',mode:null,duration:null,intake:null,deadline:null,currency:null,tuition:null,feeBasis:null,academicYear:null}],rules:[],sources:[{url:sourceUrl,purpose:'Official coursework directory listing only',checkedOn:date}],inventoryBatch:date,inventoryPass:'nus-ntu-dynamic'};
      validateProgramme(p,schoolIds); expansion.set(id,p); registry.set(id,p);byName.set(identity(g.name),p);
    }
    links.push({programmeId:p.id,...listing});
    for (const e of g.entries) e.programmeId=p.id;
    candidates.push({programmeId:p.id,name:g.name,directoryEntryCount:g.entries.length,variants});
  }
  inventories.push({universityId:school,sourceUrl,checkedOn:date,enumerationStatus:'entries_enumerated',rawEntryCount:expected,confirmedProgrammeCount:null,candidateGroupCount:candidates.length,heldEntryCount:entries.filter(e=>e.decision!=='include_directory_lead').length,entries,candidates});
}
save(`data/research/nus-ntu-programme-inventory-${date}.json`,{schemaVersion:1,checkedOn:date,verificationLevel:'AI-assisted directory reconciliation; not independent human review',countingUnit:'All filtered directory entries; obvious specialisations/language/dual variants grouped conservatively. Candidate groups are not a confirmed distinct-programme count.',inventories});
save('data/directory-links.json',{schemaVersion:1,checkedOn:date,description:'Non-admission directory evidence. Existing titles, rules, reviews and offering values remain untouched.',listings:links});
save('data/catalogue-expansion.json',{schemaVersion:1,checkedOn:date,description:'Unreviewed additions across frozen directory passes; immutable original seed retained.',programmes:[...expansion.values()].sort((a,b)=>a.id.localeCompare(b.id))});
const audit=read('data/directory-audit.json');
for (const i of inventories) {
  const u=audit.universities.find(u=>u.universityId===i.universityId);
  Object.assign(u,{checkedOn:date,entryStatus:'entry_checked',directoryUrl:i.sourceUrl,listingUrl:i.sourceUrl,enumerationStatus:'entries_enumerated',confirmedProgrammeCount:null,visibleDirectoryResultCount:i.rawEntryCount,directoryMasterEntryCount:i.rawEntryCount,inventoryFile:`data/research/nus-ntu-programme-inventory-${date}.json`,noteEn:`All ${i.rawEntryCount} coursework-filtered entries read across ${i.universityId==='SG-NUS'?14:12} browser pages. ${i.candidateGroupCount} candidate groups after conservative specialisation/pathway grouping; ${i.heldEntryCount} entries held for identity/partner reconciliation. These are not confirmed distinct-master totals or open admissions.`});
}
save('data/directory-audit.json',audit);
console.log(JSON.stringify({inventories:inventories.map(i=>({school:i.universityId,raw:i.rawEntryCount,groups:i.candidateGroupCount,held:i.heldEntryCount})),newDynamicLeads:[...expansion.values()].filter(p=>p.inventoryPass==='nus-ntu-dynamic').length,total:seed.programmes.length+expansion.size,listings:links.length},null,2));
