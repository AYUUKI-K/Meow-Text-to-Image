import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateRetries} from './support/retry-performance-model.mjs';
test('R13: 2/3/6 clients all429 and partial success retain FIFO, bounded attempts and measured tail cost',async()=>{
 for(const count of [2,3,6])for(const scenario of ['all429','partial'])for(const mixed of [false,true]){
  const result=await simulateRetries({count,scenario,mixed});assert.equal(result.fifo,true);assert.equal(result.permitViolations,0);assert.equal(result.duplicateAccepted,0);
  if(!mixed){for(const row of result.jobs)assert.equal(row.posts.length,scenario==='partial'&&row.i%2===0?1:4);}
  assert.equal(result.tailWaiting.n,count);assert.ok(result.tailWaiting.p99>=result.tailWaiting.p50);
 }
});
test('R14: independent Keys run concurrently; external occupancy exhausts only its own bounded local retries',async()=>{
 const result=await simulateRetries({count:6,keys:3,scenario:'external'});assert.equal(result.peakParallel,3);
 for(const row of result.jobs){assert.equal(row.posts.length,row.key===0?4:1);assert.equal(row.success,row.key!==0);}
});
