import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {offeringFingerprint} from '../server/applicants.mjs';
const read=f=>JSON.parse(readFileSync(new URL('../'+f,import.meta.url),'utf8'));
const audit=read('data/research/final-local-use-observation-2026-11-10.json');
test('the final audit covers22 distinct programmes without upgrading source certainty',()=>{
 const ids=[...audit.hongKong.programmes.map(p=>p.id),...audit.singapore.programmes.map(p=>p.programmeId)];assert.equal(ids.length,22);assert.equal(new Set(ids).size,22);assert.equal(audit.counts.maintenanceUnits,25);
 for(const p of [...audit.hongKong.programmes,...audit.singapore.programmes])assert.equal(p.deadlineStatus,'corroborated');
 assert.equal(audit.counts.deadlineDateChanges,0);assert.equal(audit.counts.tuitionAmountChanges,0);assert.equal(audit.singapore.counts.tuitionUnavailable,3);
});
test('corroborated CUHK round-label repair changes only two labels and preserves all fees, dates and historical source metadata',()=>{
 const fix=audit.corrections[0],now=read('data/checked-programmes.json').programmes.find(p=>p.id===fix.programmeId);assert.equal(fix.programmeId,'HK-CUHK-P033');assert.equal(offeringFingerprint(fix.beforeRecord),fix.beforeFingerprint);assert.equal(offeringFingerprint(now),fix.afterFingerprint);
 const expected=structuredClone(fix.beforeRecord);
 for(const o of expected.offerings){const round=o.applicationRounds.find(r=>r.id==='ROUND-2');assert.equal(round.deadline,'2026-12-31');round.label='2nd round';}
 assert.deepEqual(now,expected);assert.equal(now.lastChecked,'2026-11-04');assert.equal(now.reviewer,null);assert.equal(now.requirementsCoverage,'partial');
});
