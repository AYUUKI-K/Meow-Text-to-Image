import test from 'node:test';
import assert from 'node:assert/strict';
import {LeaseQueue} from '../queue-service/queue.mjs';
import {runWithQueue} from '../cloud-queue.js';
import {queueCapabilities} from '../queue-protocol.js';
import {sendPrepared} from '../generation-lifecycle.js';
import {httpRequestError} from '../request-errors.js';
const hash='6'.repeat(64),who=id=>({key_hash:hash,user_id:'retry-user-'+id,task_id:'retry-task-'+id,protocol:2,retry_protocol:1});
const dispatch=q=>async(url,{body}={})=>{
 try{switch(new URL(url).pathname){case '/ping':return {ready:true,capabilities:queueCapabilities};case '/join-queue':return q.join(body);case '/my-turn':return q.turn(body);case '/begin-generation':return q.begin(body);case '/retry-generation':return q.retry(body);case '/finish':return q.finish(body);default:return q.release(body);}}
 catch(e){throw Object.assign(e,{source:'queue',status:e.status??400});}
};
const begin=(q,a,lease,no=0,ms=30000)=>q.begin({...a,lock_token:lease.lock_token,attempt_no:no,generation_timeout_ms:ms});
const report=(a,lease,no,id,extra={})=>({...a,lock_token:lease.lock_token,attempt_no:no,attempt_id:id,rejection_status:429,...extra});
const refusal=(status=429,retryAfterMs=0)=>httpRequestError({source:'nai-generation',status,retryAfterMs});

test('R04/R05: one task and holder, four fresh attempts, no waiter can send in retry-wait',async()=>{
 for(const enabled of [false,true])for(const success of [false,true]){
  let now=0,identity;const q=new LeaseQueue({now:()=>now}),calls=[],posts=[],authorizations=[],ids=[];const b=who('B'),c=who('C');
  const rpc=dispatch(q);
  const job=runWithQueue({url:'https://queue.test',keyHash:hash,autoRetry:enabled,now:()=>now,
   requestJSON:async(url,opts)=>{const path=new URL(url).pathname;calls.push(path);const result=await rpc(url,opts);if(path==='/join-queue'){identity=opts.body;q.join(b);q.join(c);}if(path==='/begin-generation'){authorizations.push(now);ids.push(result.attempt_id);}return result;},
   sleep:async ms=>{now+=ms;assert.equal(q.turn(b).your_turn,false);assert.equal(q.turn(c).position,2);assert.equal(q.lanes.get(hash).active.task,identity.task_id);},
   generate:controls=>sendPrepared({source:'nai-generation',send:async()=>{posts.push(now);if(success&&posts.length===4)return 'png';throw refusal();}},{...controls})});
  if(enabled&&success)assert.equal(await job,'png');else await assert.rejects(job,/HTTP 429/);
  assert.deepEqual(posts,enabled?[0,10000,20000,30000]:[0]);assert.deepEqual(authorizations,posts);assert.equal(new Set(ids).size,posts.length);assert.equal(calls.filter(x=>x==='/join-queue').length,1);assert.equal(calls.filter(x=>x==='/retry-generation').length,enabled?3:0);
  assert.equal(q.lanes.get(hash).cooldownUntil,undefined);const next=q.turn(b);assert.equal(next.your_turn,true);assert.equal(q.turn(c).position,1);
  assert.equal(q.finish({...identity,lock_token:'expired',attempt_no:0,outcome:'rejected'}).finished,false);assert.equal(q.turn(b).lock_token,next.lock_token);
 }
});

test('R06/R17: retry-wait expiry, nonrenewable grace and maxHold; late RPC never releases B',()=>{
 let now=0;const q=new LeaseQueue({now:()=>now,maxHoldMs:25000}),a=who('A'),b=who('B'),first=q.join(a);q.join(b);
 const permit=begin(q,a,first);now=5000;const rejection=report(a,first,0,permit.attempt_id);const waiting=q.retry(rejection);assert.equal(waiting.retry_remaining_ms,10000);assert.equal(waiting.hard_remaining_ms,20000);
 now=14999;assert.throws(()=>begin(q,a,first,1),/尚未/);q.turn(a);assert.equal(q.lanes.get(hash).active.expires,25000);
 now=15000;const next=begin(q,a,first,1,180000);assert.equal(next.hard_remaining_ms,10000);assert.equal(next.generation_remaining_ms,10000);
 assert.throws(()=>q.retry(report(a,first,1,next.attempt_id)),/上限/);
 now=25000;const bPermit=q.turn(b);assert.equal(bPermit.your_turn,true);assert.throws(()=>begin(q,a,first,1),/过期/);assert.equal(q.finish({...rejection,outcome:'rejected'}).finished,false);assert.equal(q.turn(b).lock_token,bPermit.lock_token);
});

test('R07: rejection/begin replay cannot mint another attempt; stale finish and uncertain never authorize retry',()=>{
 let now=0;const q=new LeaseQueue({now:()=>now}),a=who('A'),first=q.join(a),initial=begin(q,a,first);
 const rejection=report(a,first,0,initial.attempt_id);assert.equal(q.retry(rejection).retry_remaining_ms,10000);now=5000;assert.equal(q.retry(rejection).retry_remaining_ms,5000);assert.equal(q.lanes.get(hash).active.expires,20000);
 now=10000;const next=begin(q,a,first,1);assert.deepEqual(begin(q,a,first,1),next);assert.notEqual(next.attempt_id,initial.attempt_id);
 assert.throws(()=>q.retry(rejection),/失效/);assert.throws(()=>begin(q,a,first,0),/失效/);assert.throws(()=>q.finish({...rejection,outcome:'success'}),/失效/);
 q.finish({...report(a,first,1,next.attempt_id),outcome:'uncertain'});assert.throws(()=>q.retry(report(a,first,1,next.attempt_id)),/明确/);assert.throws(()=>begin(q,a,first,1),/不确定/);
});

test('R07: lost begin/rejection/finish responses repeat RPCs only; four POSTs remain four',async()=>{
 let now=0;const q=new LeaseQueue({now:()=>now}),rpc=dispatch(q),lost=new Set(),posts=[],begins=[];
 const result=await runWithQueue({url:'https://queue.test',keyHash:hash,autoRetry:true,retryDelays:[0],now:()=>now,sleep:async ms=>{now+=ms;},
  requestJSON:async(url,opts)=>{const result=await rpc(url,opts),path=new URL(url).pathname,key=path+':'+(opts?.body?.attempt_no??'');if(['/begin-generation','/retry-generation','/finish'].includes(path)&&!lost.has(key)){lost.add(key);throw Object.assign(Error('lost reply'),{name:'TypeError',source:'queue'});}if(path==='/begin-generation')begins.push(result.attempt_id);return result;},
  generate:controls=>sendPrepared({source:'nai-generation',send:async()=>{posts.push(now);if(posts.length<4)throw refusal();return 'image';}},{...controls})});
 assert.equal(result,'image');assert.deepEqual(posts,[0,10000,20000,30000]);assert.equal(new Set(begins).size,4);assert.equal(q.stats().active,0);
});

test('R08: second attempt ambiguous/transport failure stops POST and retains only bounded uncertainty',async()=>{
 for(const error of [refusal(500),refusal(502),refusal(503),refusal(408),refusal(504),Object.assign(Error('offline'),{name:'TypeError',source:'nai-generation'}),Object.assign(Error('timeout'),{name:'TimeoutError',source:'nai-generation'})]){
  let now=0,posts=0;const q=new LeaseQueue({now:()=>now});
  await assert.rejects(runWithQueue({url:'https://queue.test',keyHash:hash,autoRetry:true,requestJSON:dispatch(q),now:()=>now,sleep:async ms=>{now+=ms;},generate:controls=>sendPrepared({source:'nai-generation',send:async()=>{if(++posts===1)throw refusal();throw error;}},{...controls})}));
  assert.equal(posts,2);assert.equal(q.lanes.get(hash).active.phase,'uncertain');assert.equal(q.lanes.get(hash).active.expires,60000);now=60000;q.cleanup();assert.equal(q.stats().active,0);
 }
});

test('R06: frozen client cannot obtain next permit or send after handoff',async()=>{
 let now=0,posts=0;const q=new LeaseQueue({now:()=>now}),rpc=dispatch(q),b=who('B');let next;
 await assert.rejects(runWithQueue({url:'https://queue.test',keyHash:hash,autoRetry:true,requestJSON:async(url,opts)=>{const result=await rpc(url,opts);if(new URL(url).pathname==='/join-queue')q.join(b);return result;},now:()=>now,sleep:async()=>{now=20000;next=q.turn(b);},generate:controls=>sendPrepared({source:'nai-generation',send:async()=>{posts++;throw refusal();}},{...controls})}),/过期/);
 assert.equal(posts,1);assert.equal(q.turn(b).lock_token,next.lock_token);
});

test('R09/R10/R18: disabled/cancelled/long Retry-After errors stop promptly; no new cooldown',async()=>{
 for(const mode of ['disabled','cancelled','long','20s']){
  let now=0,posts=0,valid=true;const q=new LeaseQueue({now:()=>now}),rpc=dispatch(q),calls=[];
  const job=runWithQueue({url:'https://queue.test',keyHash:hash,autoRetry:mode!=='disabled',canContinue:()=>valid,now:()=>now,sleep:async ms=>{now+=ms;if(mode==='cancelled')valid=false;},requestJSON:async(url,opts)=>{calls.push(new URL(url).pathname);return rpc(url,opts);},generate:controls=>sendPrepared({source:'nai-generation',send:async()=>{posts++;if(mode==='20s'&&posts===2)return 'ok';throw refusal(429,mode==='long'?120001:mode==='20s'?20000:0);}},{...controls})});
  if(mode==='20s'){assert.equal(await job,'ok');assert.equal(now,20000);assert.equal(posts,2);}else{await assert.rejects(job);assert.equal(posts,1);assert.ok(now<=1000);}
  assert.equal(q.stats().active,0);assert.equal(q.lanes.get(hash)?.cooldownUntil,undefined);
  if(['disabled','long'].includes(mode))assert.equal(calls.includes('/retry-generation'),false);
 }
 for(const status of [429,503]){let posts=0;await assert.rejects(runWithQueue({url:'https://queue.test',keyHash:hash,autoRetry:true,retryDelays:[],requestJSON:async()=>{throw httpRequestError({source:'queue',status});},generate:async()=>{posts++;}}));assert.equal(posts,0);}
});

test('R15: old cooldown persists across new join, new refusal does not extend it; missing capability fails closed',async()=>{
 let now=0;const q=new LeaseQueue({now:()=>now}),old={...who('old')};delete old.retry_protocol;const first=q.join(old);q.begin({...old,lock_token:first.lock_token,generation_timeout_ms:30000});q.finish({...old,lock_token:first.lock_token,outcome:'rate-limited'});
 const a=who('A');assert.equal(q.join(a).status,'cooldown');now=15000;const next=q.turn(a);assert.equal(next.your_turn,true);const permit=begin(q,a,next);q.finish({...report(a,next,0,permit.attempt_id),outcome:'rejected'});assert.equal(q.lanes.get(hash).cooldownUntil,15000);
 let posts=0;await assert.rejects(runWithQueue({url:'https://queue.test',keyHash:hash,autoRetry:true,requestJSON:async()=>({ready:true,capabilities:queueCapabilities.filter(x=>x!=='in-place-retry-v1')}),generate:async()=>{posts++;}}),/更新 Worker/);assert.equal(posts,0);
});

test('R16: Node HTTP supports four attempts on the original holder without shared cooldown',async()=>{
 const {createQueueServer}=await import('../queue-service/service.mjs');let now=0,posts=0;
 const q=new LeaseQueue({now:()=>now}),server=createQueueServer({queue:q});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const result=await runWithQueue({url:'http://127.0.0.1:'+server.address().port,keyHash:hash,autoRetry:true,now:()=>now,sleep:async ms=>{now+=ms;},generate:controls=>sendPrepared({source:'nai-generation',send:async()=>{if(++posts<4)throw refusal();return 'image';}},controls)});
  assert.equal(result,'image');assert.equal(posts,4);assert.equal(now,30000);assert.equal(q.stats().active,0);assert.equal(q.lanes.get(hash)?.cooldownUntil,undefined);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('R12: active cloud task retains its enabled snapshot while next local task uses changed settings',async()=>{
 const {runGenerationTask,generationOptions}=await import('../generation-options.js');let now=0,posts=0,joins=0;const q=new LeaseQueue({now:()=>now}),rpc=dispatch(q);
 const settings={cloudQueue:true,autoRetryEnabled:true,queueUrl:'https://queue.test',keyHash:hash},scope=generationOptions(settings);
 const result=await runGenerationTask({scope,queueOptions:{now:()=>now,sleep:async ms=>{now+=ms;settings.cloudQueue=false;settings.autoRetryEnabled=false;},requestJSON:async(url,opts)=>{if(url.endsWith('/join-queue'))joins++;return rpc(url,opts);}},generate:controls=>sendPrepared({source:'nai-generation',send:async()=>{if(++posts<4)throw refusal();return 'image';}},controls)});
 assert.equal(result,'image');assert.equal(posts,4);assert.equal(joins,1);assert.equal(q.stats().active,0);
 let local=0;await assert.rejects(runGenerationTask({scope:generationOptions(settings),queueOptions:{requestJSON:()=>assert.fail('new local task cloud RPC')},generate:async()=>{local++;throw refusal();}}));assert.equal(local,1);
});

test('R07: all lost retry/begin/finish replies do not restart a task or repeat an image',async()=>{
 for(const lost of ['report','begin','finish']){
  let now=0,posts=0,joins=0;const q=new LeaseQueue({now:()=>now}),rpc=dispatch(q);
  const job=runWithQueue({url:'https://queue.test',keyHash:hash,autoRetry:true,now:()=>now,sleep:async ms=>{now+=ms;},requestJSON:async(url,opts)=>{
   if(url.endsWith('/join-queue'))joins++;const value=await rpc(url,opts);
   if(lost==='report'&&url.endsWith('/retry-generation')||lost==='begin'&&url.endsWith('/begin-generation')&&opts.body.attempt_no===1||lost==='finish'&&url.endsWith('/finish'))throw Object.assign(Error('lost reply'),{name:'TypeError',source:'queue'});
   return value;
  },generate:controls=>sendPrepared({source:'nai-generation',send:async()=>{if(++posts===1)throw refusal();return 'image';}},controls)});
  if(lost==='finish'){assert.equal(await job,'image');assert.equal(posts,2);}else{await assert.rejects(job);assert.equal(posts,1);}
  assert.equal(joins,1);assert.ok(q.lanes.get(hash)?.active?.expires<=60000||q.stats().active===0);now=60000;q.cleanup();assert.equal(q.stats().active,0);
 }
});

test('R17: retry authorization still has a 5s window; full response releases before retry ZIP/save',async()=>{
 for(const pause of [true,false]){
  let now=0,posts=0,decoded=0;const q=new LeaseQueue({now:()=>now});
  const job=runWithQueue({url:'https://queue.test',keyHash:hash,autoRetry:true,requestJSON:dispatch(q),now:()=>now,sleep:async ms=>{now+=ms;},generate:(controls,attempt)=>sendPrepared({source:'nai-generation',send:async()=>{if(++posts===1)throw refusal();return 'bytes';},postprocess:async()=>{decoded++;assert.equal(q.stats().active,0);throw httpRequestError({source:'image-save',status:503});}},{...controls,...(pause&&attempt===1?{beforeSend:async()=>{const budget=await controls.beforeSend();now+=5000;return budget;}}:{})})});
  await assert.rejects(job,pause?/失效/:/图片保存/);assert.equal(posts,pause?1:2);assert.equal(decoded,pause?0:1);assert.equal(q.stats().active,0);
 }
});

test('R18: explicit refusal is returned immediately even when finish acknowledgement hangs',async()=>{
 let now=0,posts=0,finishStarted=false;const q=new LeaseQueue({now:()=>now}),rpc=dispatch(q),error=refusal();
 await assert.rejects(runWithQueue({url:'https://queue.test',keyHash:hash,autoRetry:false,now:()=>now,requestJSON:async(url,opts)=>{if(url.endsWith('/finish')){finishStarted=true;return new Promise(()=>{});}return rpc(url,opts);},sleep:async()=>assert.fail('no hidden retry wait'),generate:controls=>sendPrepared({source:'nai-generation',send:async()=>{posts++;throw error;}},controls)}),actual=>actual===error);
 assert.equal(posts,1);assert.equal(finishStarted,true);assert.equal(q.lanes.get(hash).active.expires,50000);now=50000;q.cleanup();assert.equal(q.stats().active,0);
});
