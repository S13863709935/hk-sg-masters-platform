import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildBulkSourceManifest} from '../scripts/bulk-source-manifest.mjs';
const source='https://www.gs.cuhk.edu.hk/programme-filter',specific='https://www.gs.cuhk.edu.hk/programmes/science/msc-mathematics';
const row=(id,name,url=source)=>({programmeId:id,name,officialUrl:url});
const backlog=rows=>({schools:[{schoolId:'HK-CUHK',unread:rows}]});
const make=(rows,extra={})=>buildBulkSourceManifest({backlog:backlog(rows),asOfDate:'2026-11-04',...extra});
test('batch manifest resolves observed unique programme identity without rewriting source dates or inventing URLs',()=>{
 const input={title:'MSc in Mathematics',url:specific,checkedOn:'2026-10-08',sourceUrl:source};const result=make([row('HK-CUHK-P104','MSc Mathematics')],{candidates:[input]});assert.equal(result.programmes[0].primaryUrl,specific);assert.equal(result.programmes[0].resolutionEvidence.checkedOn,'2026-10-08');assert.equal(result.counts.unresolvedIdentities,0);assert.equal(result.programmes[0].verification,undefined);assert.equal(input.checkedOn,'2026-10-08');
});
test('ambiguous programme identities stay directory leads instead of choosing a convenient URL',()=>{
 const result=make([row('HK-CUHK-P104','MSc Mathematics')],{candidates:[{title:'MSc Mathematics',url:specific},{title:'MSc Mathematics',url:specific+'-alternate'}]});assert.equal(result.programmes[0].primaryUrl,source);assert.equal(result.programmes[0].needsIdentityReview,true);
});
test('shared official URLs are requested once while each programme and explicit language variant remain traceable',()=>{
 const result=make([row('HK-CUHK-P104','MSc Mathematics',specific),row('HK-CUHK-P999','Synthetic other identity',specific)],{listings:[{programmeId:'HK-CUHK-P104',programmeUrl:specific,variants:[{officialUrl:specific},{officialUrl:specific+'-cmi'}]}]});assert.equal(result.counts.programmes,2);assert.equal(result.counts.requests,2);assert.equal(result.jobs.find(j=>j.url===specific).programmeIds.length,2);
});
test('unsafe URLs, duplicate programme IDs and invalid snapshot dates fail before collection',()=>{
 assert.throws(()=>make([row('X','Bad','https://example.com')]));assert.throws(()=>make([row('X','A',specific),row('X','B',specific)]));assert.throws(()=>make([],{asOfDate:'2026-02-30'}));
});
test('collector transport, redirect boundary, blocked-content classification and resume are exercised without external requests',{skip:!process.env.GRADPATH_RESEARCH_PYTHON},()=>{
 const python=process.env.GRADPATH_RESEARCH_PYTHON;assert.ok(python,'Set GRADPATH_RESEARCH_PYTHON to the research Python runtime');const result=spawnSync(python,['-X','utf8',fileURLToPath(new URL('test_bulk_source_collector.py',import.meta.url))],{encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stdout+result.stderr);
});
