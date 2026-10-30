import test from 'node:test';
import assert from 'node:assert/strict';
import {generationTimeoutSeconds,withGenerationTimeout} from '../src/generation/generation-timeout.js';
import {sendPrepared} from '../src/generation/generation-lifecycle.js';
import {migrateGenerationOptions,generationOptions} from '../src/generation/generation-options.js';
import {runWithQueue} from '../src/queue/cloud-queue.js';
import {LeaseQueue} from '../queue-service/queue.mjs';
import {queueCapabilities} from '../shared/queue-protocol.js';

test('60s migration is persisted once; custom budgets and independent switches survive',()=>{
 for(const value of [undefined,null,'invalid',0,181,30,'30',5,29,60,77,180])for(const enabled of [true,false]){
  const settings={generationTimeoutSeconds:value,cloudQueue:enabled,autoRetryEnabled:enabled};
  assert.equal(migrateGenerationOptions(settings),true);
  const expected=[5,29,60,77,180].includes(value)?value:60;
  assert.equal(settings.generationTimeoutSeconds,expected);assert.equal(settings.cloudQueue,enabled);assert.equal(settings.autoRetryEnabled,enabled);
  const saved=JSON.parse(JSON.stringify(settings));saved.generationTimeoutSeconds=30;
  assert.equal(migrateGenerationOptions(saved),false);assert.equal(saved.generationTimeoutSeconds,30);assert.equal(generationOptions(saved).generationTimeoutSeconds,30);
 }
 assert.equal(generationTimeoutSeconds(),60);assert.equal(generationTimeoutSeconds(30),30);
});

for(const entry of ['timeout','prepared'])test(`${entry}: local default stops at 60s even when transport ignores abort`,async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let start,settled=false,signal;
 const started=new Promise(r=>start=r),send=s=>{signal=s;start();return new Promise(()=>{});};
 const pending=entry==='timeout'?withGenerationTimeout(send):sendPrepared({source:'nai-generation',send});
 const rejected=assert.rejects(pending,e=>e.name==='TimeoutError'&&/60 秒/.test(e.message)).then(()=>{settled=true;});
 await started;t.mock.timers.tick(59999);await Promise.resolve();assert.equal(settled,false);assert.equal(signal.aborted,false);
 t.mock.timers.tick(1);await rejected;assert.equal(signal.aborted,true);
});

test('cloud default sends 60000ms, retains uncertainty until 80s; maxHold still truncates it',async t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval']});let now=0,start,identity,token,budget;
 const q=new LeaseQueue({now:()=>now}),hash='9'.repeat(64),started=new Promise(r=>start=r);
 const requestJSON=async(url,{body}={})=>{
  switch(new URL(url).pathname){
   case '/ping':return {ready:true,capabilities:queueCapabilities};
   case '/join-queue':identity=body;return q.join(body);
   case '/begin-generation':budget=body.generation_timeout_ms;const state=q.begin(body);token=state.lock_token;assert.equal(state.hard_remaining_ms,80000);return state;
   case '/finish':return q.finish(body);
   case '/my-turn':return q.turn(body);
   default:return q.release(body);
  }
 };
 const pending=runWithQueue({url:'https://queue.test',keyHash:hash,requestJSON,now:()=>now,generate:controls=>sendPrepared({source:'nai-generation',send:()=>{start();return new Promise(()=>{});}},controls)});
 const rejected=assert.rejects(pending,e=>e.name==='TimeoutError');await started;assert.equal(budget,60000);
 const waiter={key_hash:hash,user_id:'default-waiter',task_id:'default-wait-task',protocol:2};q.join(waiter);
 now=60000;t.mock.timers.tick(60000);await rejected;assert.equal(q.lanes.get(hash).active.phase,'uncertain');assert.equal(q.turn(waiter).your_turn,false);
 now=79999;assert.equal(q.turn(waiter).your_turn,false);now=80000;assert.equal(q.turn(waiter).your_turn,true);
 assert.equal(q.finish({...identity,lock_token:token,attempt_no:0,outcome:'rejected'}).finished,false);
 const capped=new LeaseQueue({now:()=>0,maxHoldMs:70000}),lease=capped.join(identity);
 const permit=capped.begin({...identity,lock_token:lease.lock_token,attempt_no:0,generation_timeout_ms:60000});assert.equal(permit.hard_remaining_ms,70000);
});

for(const budget of [undefined,30,77,180])test(`direct client keeps default/custom budget ${budget??60}s without queue access`,async t=>{
 const {createDirectClient}=await import('../src/novelai/direct-client.js');
 t.mock.timers.enable({apis:['setTimeout']});let start,signal;
 const started=new Promise(r=>start=r),client=createDirectClient({settings:{generationTimeoutSeconds:budget},save(){},getHeaders:()=>({}),getKey:async()=> 'fixture-only-key',unzipPNG:async()=>assert.fail('no completed body'),fetchImpl:async(url,opts)=>{
  assert.equal(url,'https://image.novelai.net/ai/generate-image');signal=opts.signal;start();return {ok:true,arrayBuffer:()=>new Promise(()=>{})};
 }});
 const pending=client.generate({vibes:[]}),rejected=assert.rejects(pending,e=>e.name==='TimeoutError');
 await started;t.mock.timers.tick((budget??60)*1000-1);assert.equal(signal.aborted,false);t.mock.timers.tick(1);await rejected;assert.equal(signal.aborted,true);
});
