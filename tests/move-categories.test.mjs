import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyPotentialMove,categorizeCandidate} from '../move-categories.mjs';
test('owner target bands',()=>{for(const [v,id] of [[0.02,0],[0.05,0],[0.07,1],[0.10,1],[0.11,2],[0.20,2],[0.25,3],[1.46,3]]) assert.equal(classifyPotentialMove(v).category,id)});
test('gaps are not silently mislabeled',()=>{for(const v of [0.06,0.105,0.22])assert.equal(classifyPotentialMove(v).category,null)});
test('missing targets and ZAD status fail closed',()=>{assert.equal(categorizeCandidate({entry:10,validatedTarget:null}).decision,'NO BUY');assert.equal(categorizeCandidate({entry:10,validatedTarget:13}).reason,'ZAD_NOT_CONFIRMED')});
test('classification never becomes automatic BUY',()=>assert.equal(categorizeCandidate({entry:10,validatedTarget:13,halalApproved:true,quoteFresh:true,spreadPct:0.01}).decision,'RESEARCH CANDIDATE'));

test('category gaps remain visible as research rather than silently blocked',()=>{
 for(const target of [10.6,11.05,12.2]) {const x=categorizeCandidate({entry:10,validatedTarget:target,halalApproved:true,quoteFresh:true,spreadPct:0.01});assert.equal(x.category,null);assert.equal(x.decision,'RESEARCH CANDIDATE');}
 assert.equal(categorizeCandidate({entry:10,validatedTarget:10.1,halalApproved:true,quoteFresh:true,spreadPct:0.01}).decision,'NO BUY');
});
