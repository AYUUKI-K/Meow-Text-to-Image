import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateQueue} from './support/queue-performance-model.mjs';
import {distribution} from './support/queue-virtual-clock.mjs';
test('virtual full client matrix is deterministic and separates waiting, local timeout and server release',async()=>{
 const a=await simulateQueue({count:5,scenario:'40s'}),b=await simulateQueue({count:5,scenario:'40s'});
 assert.deepEqual(a,b);assert.equal(a.posts,5);assert.equal(a.duplicatePosts,0);assert.equal(a.rejected429,0);
 for(const job of a.jobs){assert.equal(job.clientEnd-job.sendAt,30000);assert.equal(job.releasedAt-job.sendAt,50000);assert.ok(job.permitAt<=job.sendAt);}
 assert.ok(a.final.mean>a.waiting.mean);assert.ok(a.preSendMs>a.requiredDelayMs);assert.equal(a.fifo,true);
});
test('new preparing I/O has no queue occupancy while lost acquired permits recover within fixed deadlines',async()=>{
 const before=await simulateQueue({count:5,scenario:'prep-hang'});assert.equal(before.posts,0);assert.equal(before.totalMs,20000);assert.equal(before.preSendMs,0);
 const after=await simulateQueue({count:5,scenario:'prep-lost'});assert.equal(after.posts,0);assert.equal(after.fifo,true);
 for(const job of after.jobs)assert.equal(job.releasedAt-job.permitAt,20000);
});
test('65 live waiters preserve FIFO over long waits and multiple keys reduce waiting',async()=>{
 const one=await simulateQueue({count:65,scenario:'none'});assert.equal(one.waiting.n,65);assert.equal(one.fifo,true);assert.equal(one.posts,65);assert.equal(one.rejected429,0);
 const many=await simulateQueue({count:50,keys:5,scenario:'15s'}),single=await simulateQueue({count:50,scenario:'15s'});assert.ok(many.waiting.mean<single.waiting.mean/4);
 const cooled=await simulateQueue({count:20,keys:2,durationFor:i=>i%2?15000:80000,scenario:'hot-cooldown'});assert.ok(cooled.rejected429>0);assert.ok(cooled.jobs.filter(j=>j.key===1).every(j=>j.accepted===1&&j.releasedAt-j.sendAt===15000));
});
test('percentiles use a documented nearest-rank definition',()=>{
 assert.deepEqual(distribution([0,1,2,3,4]),{n:5,mean:2,p50:2,p95:4,p99:4,max:4});
});

test('default and maximum budget extremes, old clients and cooldown have measured logical bounds',async()=>{
 const {simulateExtreme}=await import('./support/queue-extremes.mjs');
 for(const budgetMs of [30000,180000])for(const ahead of [1,5,10,20,50,64]){
  const r=simulateExtreme({ahead,budgetMs});assert.equal(r.theoreticalMs,ahead*(20000+budgetMs+20000));assert.equal(r.theoreticalMs-r.simulatedMs,ahead);
 }
 for(const kind of ['preparing-lost','unclaimed','rate-limit','handoff-delay']){const r=simulateExtreme({kind});assert.ok(r.simulatedMs<=r.theoreticalMs);}
 assert.equal(simulateExtreme({oldCount:64}).simulatedMs,38400000);
 assert.equal(simulateExtreme({oldCount:64,legacyHeartbeat:false}).simulatedMs,15360000);
 assert.equal(simulateExtreme({kind:'rate-limit',retryAfterMs:999999}).cooldowns.every(ms=>ms===120000),true);
});
test('background recovery and lost control replies never replay an image attempt',async()=>{
 const {runFaultSuite}=await import('../scripts/queue-phase5-faults.mjs'),results=await runFaultSuite();assert.equal(results.length,10);
 for(const result of results)assert.ok(result.rows.every(row=>row.posts<=1));
});
