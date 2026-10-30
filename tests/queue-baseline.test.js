// Phase 0 characterization of v2.4.3. These assertions record defects before
// changing the lifecycle; the report retains the measured baseline afterwards.
import test from 'node:test';
import assert from 'node:assert/strict';
import {LeaseQueue} from '../queue-service/queue.mjs';
import {runWithQueue} from '../src/queue/cloud-queue.js';
import {createDirectClient} from '../src/novelai/direct-client.js';
import {httpRequestError} from '../src/platform/request-errors.js';
const hash='a'.repeat(64),who=id=>({key_hash:hash,user_id:'fixture-user-'+id,task_id:'fixture-task-'+id});
const dispatch=q=>async(url,{body})=>url.endsWith('/join-queue')?q.join(body):url.endsWith('/my-turn')?q.turn(body):q.release(body);

test('baseline: preparation heartbeat can occupy the key for the entire 10 minute maximum',()=>{
 let now=0;const q=new LeaseQueue({now:()=>now}),a=who('A'),b=who('B');q.join(a);q.join(b);
 for(now=60000;now<600000;now+=60000){q.turn(a);assert.equal(q.turn(b).your_turn,false);}
 assert.equal(q.turn(b).your_turn,true);
});
test('baseline: no heartbeat recovers at 240 seconds, not a short preparation deadline',()=>{
 let now=0;const q=new LeaseQueue({now:()=>now});q.join(who('A'));q.join(who('B'));
 for(now=60000;now<240000;now+=60000)assert.equal(q.turn(who('B')).your_turn,false);
 assert.equal(q.turn(who('B')).your_turn,true);
});
test('baseline: pause AFTER beforeSend can send after a successor acquired the key',async()=>{
 let now=0,sent=0;const q=new LeaseQueue({now:()=>now});
 await runWithQueue({twoPhase:false,url:'https://fixture.invalid',keyHash:hash,generationTimeoutMs:30000,now:()=>now,requestJSON:dispatch(q),generate:async({beforeSend})=>{
  await beforeSend();now=30001;assert.equal(q.join(who('B')).your_turn,true);sent++;
 }});assert.equal(sent,1);
});
test('regression: generation budget respects the actual max-hold remainder',()=>{
 let now=0;const q=new LeaseQueue({now:()=>now,maxHoldMs:600000}),a=who('A');const lease=q.join(a);
 for(now=60000;now<=540000;now+=60000)q.turn(a);
 now=599000;const state=q.turn({...a,lock_token:lease.lock_token,generation_timeout_ms:30000});
 assert.equal(state.generation_remaining_ms,1000);assert.equal(q.lanes.get(hash).active.expires-now,1000);
});
test('baseline: timeout releases at 30s while mock upstream busy until 70s; B/C/D all get 429',async()=>{
 let now=0;const q=new LeaseQueue({now:()=>now}),upstreamUntil=70000,a=who('A');const lease=q.join(a);
 q.turn({...a,lock_token:lease.lock_token,generation_timeout_ms:30000});now=30000;q.release({...a,lock_token:lease.lock_token});
 let collisions=0;for(const id of ['B','C','D']){const job=who(id),next=q.join(job);assert.equal(next.your_turn,true);if(now<upstreamUntil)collisions++;q.release({...job,lock_token:next.lock_token});}
 assert.equal(collisions,3);
});
test('regression: ZIP processing releases the queue after receiving all bytes',async()=>{
 const q=new LeaseQueue();let unzip,entered;const ready=new Promise(r=>entered=r);
 const direct=createDirectClient({settings:{},save(){},getHeaders:()=>({}),getKey:async()=>'fixture',fetchImpl:async()=>new Response(new Uint8Array([80,75,3,4])),unzipPNG:()=>{entered();return new Promise(r=>unzip=r);}});
 const pending=runWithQueue({twoPhase:false,url:'https://fixture.invalid',keyHash:hash,requestJSON:dispatch(q),generate:scope=>direct.generate({vibes:[]},scope)});
 await ready;assert.equal(q.stats().active,0);unzip('image');await pending;assert.equal(q.stats().active,0);
});
test('regression: unknown 500/502/503 are not retryable; queue 429 is distinct from NAI 429',()=>{
 for(const status of [500,502,503])assert.equal(httpRequestError({source:'nai-generation',status}).retryableGeneration,false);
 assert.equal(httpRequestError({source:'queue',status:429}).retryableGeneration,false);
 assert.equal(httpRequestError({source:'nai-generation',status:429}).retryableGeneration,true);
});
