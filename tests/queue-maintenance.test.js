import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{MiaoKeyQueue} from '../cloudflare/worker.js';
import {assessQueueDrain} from '../queue-service/drain-status.mjs';
const hash='e'.repeat(64),who=(id,modern=true)=>({key_hash:hash,user_id:'maintenance-user-'+id,task_id:'maintenance-task-'+id,...(modern?{protocol:2}:{})});
// Independent simulated transactional storage, including eviction and rollback.
export function memoryContext(data=new Map()){
 let pending=Promise.resolve(),alarm=null;const ctx={data,failPut:false,storage:{get:async key=>structuredClone(data.get(key)),getAlarm:async()=>alarm,
 put:async(key,value)=>{if(ctx.failPut)throw Error('fixture storage failure');data.set(key,structuredClone(value));},delete:async key=>data.delete(key),
 setAlarm:async value=>{alarm=value;},deleteAlarm:async()=>{alarm=null;},transaction:async fn=>{const snapshot=structuredClone(data),before=alarm;try{return await fn();}catch(error){data.clear();for(const [key,value] of snapshot)data.set(key,value);alarm=before;throw error;}}},
 blockConcurrencyWhile(fn){const result=pending.then(fn);pending=result.catch(()=>{});return result;}};return ctx;
}
const call=async(object,path,body)=>{const response=await object.fetch(new Request('https://fixture.invalid'+path,{method:'POST',body:JSON.stringify(body)}));return {http:response.status,...await response.json()};};
test('maintenance is deployment-only and denies all join ingress without creating objects',async()=>{
 const env={QUEUE_MAINTENANCE:'true',MIAO_KEY_QUEUE:{idFromName(){throw Error('must not touch namespace');}}};
 const ping=await (await worker.fetch(new Request('https://fixture.invalid/ping'),env)).json();assert.equal(ping.maintenance,true);assert.deepEqual(ping.capabilities,[]);
 for(const modern of [true,false]){
  assert.equal((await worker.fetch(new Request('https://fixture.invalid/join-queue',{method:'POST',body:JSON.stringify(who('new',modern))}),env)).status,503);
  const url=new URL('https://fixture.invalid/relay');url.searchParams.set('op','join-queue');url.searchParams.set('data',JSON.stringify(who('new',modern)));
  assert.equal((await (await worker.fetch(new Request(url),env)).json()).relay_status,503);
 }
 for(const path of ['/maintenance','/admin','/set-maintenance'])assert.equal((await worker.fetch(new Request('https://fixture.invalid'+path,{method:'POST',body:'{}'}),env)).status,404);
});
test('maintenance reload preserves active hard deadline and drains old/new FIFO with cooldown',async()=>{
 let now=0;const ctx=memoryContext();let object=new MiaoKeyQueue(ctx);object.queue.now=()=>now;
 const a=who('A'),b=who('B',false),c=who('C'),first=await call(object,'/join-queue',a);
 await call(object,'/join-queue',b);await call(object,'/join-queue',c);
 await call(object,'/begin-generation',{...a,lock_token:first.lock_token,generation_timeout_ms:30000});
 object=new MiaoKeyQueue(memoryContext(ctx.data),{QUEUE_MAINTENANCE:'true'});object.queue.now=()=>now;
 assert.equal((await call(object,'/join-queue',a)).http,503);assert.equal((await call(object,'/join-queue',who('D'))).http,503);
 now=30000;await object.alarm();assert.equal((await call(object,'/my-turn',b)).your_turn,false);assert.equal(object.queue.lanes.get(hash).active.expires,50000);
 await call(object,'/finish',{...a,lock_token:first.lock_token,outcome:'uncertain'});now=50000;await object.alarm();const second=await call(object,'/my-turn',b);assert.equal(second.your_turn,true);
 await call(object,'/complete',{...b,lock_token:second.lock_token});const third=await call(object,'/my-turn',c);
 assert.equal((await call(object,'/begin-generation',{...c,lock_token:third.lock_token,generation_timeout_ms:30000})).phase,'possibly-sent');
 await call(object,'/finish',{...c,lock_token:third.lock_token,outcome:'rate-limited'});
 let status=assessQueueDrain({maintenance:true,completeSnapshot:true,lanes:[...object.queue.lanes],now});assert.equal(status.newProtocol,0);assert.equal(status.rollbackEligible,false);assert.equal(status.cooling,1);
 now=65000;await object.alarm();status=assessQueueDrain({maintenance:true,completeSnapshot:true,lanes:[...object.queue.lanes],now});assert.equal(status.rollbackEligible,true);
 assert.equal(assessQueueDrain({maintenance:true,completeSnapshot:false,lanes:[],now}).rollbackEligible,false);
 assert.equal(assessQueueDrain({maintenance:false,completeSnapshot:true,lanes:[],now}).rollbackEligible,false);
});
test('maintenance also expires preparing and unclaimed tasks without altering their deadlines',async()=>{
 let now=0;const ctx=memoryContext();let object=new MiaoKeyQueue(ctx);object.queue.now=()=>now;
 const a=who('prep'),b=who('unclaimed');await call(object,'/join-queue',a);await call(object,'/join-queue',b);
 object=new MiaoKeyQueue(memoryContext(ctx.data),{QUEUE_MAINTENANCE:'true'});object.queue.now=()=>now;
 now=20000;await object.alarm();assert.equal(object.queue.lanes.get(hash).active.expires,65000);
 now=65000;await object.alarm();assert.equal(object.queue.lanes.size,0);
});

test('new clients report maintenance explicitly and never join or POST',async()=>{
 const {runWithQueue}=await import('../cloud-queue.js');let posts=0,joins=0;
 await assert.rejects(runWithQueue({url:'https://fixture.invalid',keyHash:hash,requestJSON:async url=>{if(!url.endsWith('/ping'))joins++;return {ready:true,maintenance:true,capabilities:[]};},generate:async()=>{posts++;}}),/队列维护中/);
 assert.equal(posts,0);assert.equal(joins,0);
});
test('Node maintenance denies both protocol joins while preserving existing begin/finish',async()=>{
 const {createQueueServer}=await import('../queue-service/service.mjs'),{LeaseQueue}=await import('../queue-service/queue.mjs');
 const queue=new LeaseQueue(),a=who('node'),held=queue.join(a),server=createQueueServer({queue,maintenance:true});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const root='http://127.0.0.1:'+server.address().port;
 const post=(path,body)=>fetch(root+path,{method:'POST',body:JSON.stringify(body)});
 try{
  assert.equal((await (await fetch(root+'/ping')).json()).maintenance,true);
  for(const protocol of [true,false])assert.equal((await post('/join-queue',who('denied',protocol))).status,503);
  assert.equal((await post('/begin-generation',{...a,lock_token:held.lock_token,generation_timeout_ms:30000})).status,200);
  assert.equal((await post('/finish',{...a,lock_token:held.lock_token,outcome:'success'})).status,200);
  assert.equal(queue.stats().active,0);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('offline drain requires the server snapshot clock and never substitutes an operator clock',()=>{
 assert.throws(()=>assessQueueDrain({maintenance:true,completeSnapshot:true,lanes:[]}));
 assert.equal(assessQueueDrain({maintenance:true,completeSnapshot:true,now:1000,lanes:[{active:null,waiting:[],cooldownUntil:2000}]}).rollbackEligible,false);
});
