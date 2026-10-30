import test from 'node:test';
import assert from 'node:assert/strict';
import {LeaseQueue} from '../queue-service/queue.mjs';
import {queueCapabilities} from '../shared/queue-protocol.js';
import {runWithQueue} from '../src/queue/cloud-queue.js';
import {sendPrepared} from '../src/generation/generation-lifecycle.js';
import {withGenerationTimeout} from '../src/generation/generation-timeout.js';
const hash='c'.repeat(64),who=id=>({key_hash:hash,user_id:'phase-user-'+id,task_id:'phase-task-'+id,protocol:2});
const dispatch=q=>async(url,{body}={})=>{
 switch(new URL(url).pathname){case '/ping':return {ready:true,capabilities:queueCapabilities};case '/join-queue':return q.join(body);case '/my-turn':return q.turn(body);case '/begin-generation':return q.begin(body);case '/finish':return q.finish(body);default:return q.release(body);}
};
const begin=(q,a,lease,timeout=30000)=>q.begin({...a,lock_token:lease.lock_token,generation_timeout_ms:timeout});

test('new preparing heartbeat never extends 20s; old heartbeat and old stored fields keep long leases',()=>{
 let now=0;const q=new LeaseQueue({now:()=>now}),a=who('A'),b=who('B');const lease=q.join(a);q.join(b);
 now=19000;q.turn(a);assert.equal(q.lanes.get(hash).active.expires,20000);
 now=20000;assert.equal(q.turn(b).your_turn,true);assert.throws(()=>begin(q,a,lease),/过期/);
 const old={...who('old')};delete old.protocol;const other=new LeaseQueue({now:()=>now});other.join(old);now+=60000;other.turn(old);assert.equal(other.lanes.get(hash).active.expires,now+240000);
});
test('new unclaimed handoff keeps 45s protection; pickup and idle grants both use 20s preparing',()=>{
 let now=0;const q=new LeaseQueue({now:()=>now}),a=who('A'),b=who('B'),c=who('C');const first=q.join(a);q.join(b);q.join(c);q.release({...a,lock_token:first.lock_token});
 assert.equal(q.lanes.get(hash).active.expires,45000);now=30000;q.turn(b);assert.equal(q.lanes.get(hash).active.expires,50000);
 now=50000;assert.equal(q.turn(c).phase,'preparing');assert.equal(q.lanes.get(hash).active.expires,70000);
});
test('begin is idempotent, requires holder proof, and hard deadline is fixed despite heartbeat/finish repeats',()=>{
 let now=0;const q=new LeaseQueue({now:()=>now}),a=who('A'),b=who('B'),lease=q.join(a);q.join(b);
 assert.throws(()=>begin(q,a,{lock_token:'wrong'}),/凭据/);assert.throws(()=>begin(q,a,lease,4999),/超时/);
 const first=begin(q,a,lease);assert.equal(first.send_window_ms,5000);assert.equal(first.generation_remaining_ms,30000);assert.equal(first.hard_remaining_ms,50000);
 now=1000;assert.equal(begin(q,a,lease,180000).generation_remaining_ms,29000);
 q.finish({...a,lock_token:lease.lock_token,outcome:'uncertain'});assert.throws(()=>begin(q,a,lease),/不确定/);
 for(now=5000;now<50000;now+=5000){q.turn(a);q.finish({...a,lock_token:lease.lock_token,outcome:'uncertain'});assert.equal(q.turn(b).your_turn,false);assert.equal(q.lanes.get(hash).active.expires,50000);}
 assert.equal(q.turn(b).your_turn,true);assert.deepEqual(q.finish({...a,lock_token:lease.lock_token,outcome:'success'}),{finished:false});
});
test('legacy complete/cancel cannot release an authorized new task; finish does not touch successors',()=>{
 const q=new LeaseQueue(),a=who('A'),b=who('B'),lease=q.join(a);q.join(b);begin(q,a,lease);
 assert.throws(()=>q.release({...a,lock_token:lease.lock_token}),/finish/);
 assert.equal(q.finish({...a,lock_token:lease.lock_token,outcome:'success'}).finished,true);
 const next=q.turn(b);assert.equal(next.your_turn,true);
 assert.equal(q.finish({...a,lock_token:lease.lock_token,outcome:'uncertain'}).finished,false);assert.equal(q.turn(b).lock_token,next.lock_token);
});
test('generation and send budgets shrink to actual max hold even near its boundary',()=>{
 let now=0;const q=new LeaseQueue({now:()=>now,maxHoldMs:21000}),a=who('A'),lease=q.join(a);now=19000;
 const state=begin(q,a,lease);assert.equal(state.generation_remaining_ms,2000);assert.equal(state.hard_remaining_ms,2000);assert.equal(state.send_window_ms,2000);
});
test('client rejects old Worker before joining; no fallback POST or generation',async()=>{
 let sent=0;const paths=[];
 await assert.rejects(runWithQueue({url:'https://fixture.invalid',keyHash:hash,requestJSON:async url=>{paths.push(new URL(url).pathname);return {ready:true,version:'99'};},generate:async()=>{sent++;}}),/先更新 Worker/);
 assert.equal(sent,0);assert.deepEqual(paths,['/ping']);
});
test('pause after beforeSend or a delayed begin acknowledgement never reaches fetch',async()=>{
 for(const pause of ['after-validation','response']){
  let now=0,sent=0;const q=new LeaseQueue({now:()=>now}),request=dispatch(q);
  await assert.rejects(runWithQueue({url:'https://fixture.invalid',keyHash:hash,now:()=>now,requestJSON:async(url,opts)=>{const result=await request(url,opts);if(pause==='response'&&url.endsWith('begin-generation'))now=6000;return result;},generate:controls=>sendPrepared({source:'nai-generation',send:async()=>{sent++;}}, {...controls,beforeSend:async()=>{const budget=await controls.beforeSend();if(pause==='after-validation')now=6000;return budget;}})}),/未发送/);
  assert.equal(sent,0);assert.equal(q.stats().active,0);
 }
});
test('lost begin/finish replies retry control operations without repeating the image POST',async()=>{
 let sent=0,begins=0,finishes=0;const q=new LeaseQueue(),request=dispatch(q);
 const result=await runWithQueue({url:'https://fixture.invalid',keyHash:hash,sleep:async()=>{},requestJSON:async(url,opts)=>{const result=await request(url,opts);if(url.endsWith('begin-generation')&&++begins===1||url.endsWith('/finish')&&++finishes===1)throw new TypeError('lost reply');return result;},generate:controls=>sendPrepared({source:'nai-generation',send:async()=>{sent++;return 'image';}},controls)});
 assert.equal(result,'image');assert.equal(sent,1);assert.equal(begins,2);assert.equal(finishes,2);assert.equal(q.stats().active,0);
});
test('all lost begin replies submit zero images and retain only bounded protection',async()=>{
 let now=0,sent=0;const q=new LeaseQueue({now:()=>now}),request=dispatch(q);
 await assert.rejects(runWithQueue({url:'https://fixture.invalid',keyHash:hash,now:()=>now,sleep:async()=>{},requestJSON:async(url,opts)=>{const result=await request(url,opts);if(url.endsWith('begin-generation'))throw new TypeError('lost');return result;},generate:controls=>sendPrepared({source:'nai-generation',send:async()=>{sent++;}},controls)}));
 assert.equal(sent,0);assert.equal(q.stats().active,1);now=80000;assert.equal(q.stats().active,0);
});
test('local timeout leaves bounded protection while mock upstream continues, and no automatic POST occurs',async()=>{
 let now=0,sent=0;const q=new LeaseQueue({now:()=>now});
 await assert.rejects(runWithQueue({url:'https://fixture.invalid',keyHash:hash,now:()=>now,requestJSON:dispatch(q),generate:async controls=>{
  await controls.beforeSend();controls.assertSend();sent++;return withGenerationTimeout(()=>new Promise(()=>{}),{timeoutMs:5});
 }}),e=>e.localGenerationTimeout===true);
 assert.equal(sent,1);now=30000;assert.equal(q.join(who('B')).your_turn,false);now=79999;assert.equal(q.turn(who('B')).your_turn,false);now=80000;assert.equal(q.turn(who('B')).your_turn,true);
});
test('success releases immediately and two send attempts from one grant are refused',async()=>{
 let sent=0;const q=new LeaseQueue();
 await runWithQueue({url:'https://fixture.invalid',keyHash:hash,requestJSON:dispatch(q),generate:async controls=>{
  const image=await sendPrepared({source:'nai-generation',send:async()=>{sent++;return 'image';}},controls);
  assert.equal(q.stats().active,0);assert.throws(()=>controls.assertSend(),/未发送/);return image;
 }});assert.equal(sent,1);
});

test('one rate-limit report blocks C/D atomically, preserves FIFO and has bounded shared backoff',()=>{
 let now=0;const q=new LeaseQueue({now:()=>now}),a=who('A'),b=who('B'),c=who('C'),d=who('D'),first=q.join(a);begin(q,a,first);
 q.finish({...a,lock_token:first.lock_token,outcome:'uncertain'});q.join(b);q.join(c);q.join(d);
 now=50000;const second=q.turn(b);begin(q,b,second);
 const report={...b,lock_token:second.lock_token,outcome:'rate-limited'};
 assert.equal(q.finish(report).cooldown_remaining_ms,15000);assert.equal(q.stats().active,0);
 assert.equal(q.turn(c).status,'cooldown');assert.equal(q.turn(d).position,2);
 assert.equal(q.finish(report).finished,false);assert.equal(q.lanes.get(hash).cooldownUntil,65000);
 now=64999;assert.equal(q.turn(c).your_turn,false);now=65000;const third=q.turn(c);assert.equal(third.your_turn,true);begin(q,c,third);
 assert.equal(q.finish({...c,lock_token:third.lock_token,outcome:'rate-limited'}).cooldown_remaining_ms,30000);
 now=95000;const fourth=q.turn(d);begin(q,d,fourth);assert.equal(q.finish({...d,lock_token:fourth.lock_token,outcome:'rate-limited',retry_after_ms:999999}).cooldown_remaining_ms,120000);
 const newcomer=who('new');assert.equal(q.join(newcomer).status,'cooldown');
 now=175000;q.turn(newcomer);now=215000;const next=q.turn(newcomer);begin(q,newcomer,next);
 assert.equal(q.finish({...newcomer,lock_token:next.lock_token,outcome:'rate-limited'}).cooldown_remaining_ms,60000);
});
test('only current authorized holder can cool down; invalid reports and late finish cannot affect a successor',()=>{
 const q=new LeaseQueue(),a=who('A'),b=who('B'),lease=q.join(a);q.join(b);
 assert.throws(()=>q.finish({...a,lock_token:lease.lock_token,outcome:'rate-limited'}),/尚未/);
 begin(q,a,lease);
 assert.throws(()=>q.finish({...a,lock_token:'bad',outcome:'rate-limited'}),/凭据/);
 for(const value of [-1,NaN,1.5,null])assert.throws(()=>q.finish({...a,lock_token:lease.lock_token,outcome:'rate-limited',retry_after_ms:value}),/冷却/);
 q.finish({...a,lock_token:lease.lock_token,outcome:'success'});const next=q.turn(b);
 assert.equal(q.finish({...a,lock_token:lease.lock_token,outcome:'rate-limited'}).finished,false);assert.equal(q.turn(b).lock_token,next.lock_token);assert.equal(q.lanes.get(hash).cooldownUntil,undefined);
});
test('new client 429 releases without legacy cooldown; queue errors and ambiguous 5xx retain uncertainty',async()=>{
 const {httpRequestError}=await import('../src/platform/request-errors.js');
 for(const [source,status,outcome] of [['nai-generation',429,'released'],['tavern-generation',429,'released'],['nai-encode',429,'released'],['queue',429,'uncertain'],['nai-generation',500,'uncertain'],['tavern-generation',502,'uncertain'],['nai-generation',503,'uncertain']]){
  const q=new LeaseQueue();let sent=0;
  await assert.rejects(runWithQueue({url:'https://fixture.invalid',keyHash:hash,requestJSON:dispatch(q),generate:controls=>sendPrepared({source,send:async()=>{sent++;throw httpRequestError({source,status,retryAfterMs:20000});}},controls)}));
  assert.equal(sent,1);
  if(outcome==='released'){assert.equal(q.stats().active,0);assert.equal(q.lanes.get(hash)?.cooldownUntil,undefined);assert.equal(q.join(who('B')).your_turn,true);}
  else{assert.equal(q.lanes.get(hash).active.phase,'uncertain');assert.equal(q.lanes.get(hash).cooldownUntil,undefined);}
 }
});
test('new Node backup server negotiates capability and releases after a single response',async()=>{
 const {createQueueServer}=await import('../queue-service/service.mjs');
 const q=new LeaseQueue(),server=createQueueServer({queue:q});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  let sent=0;assert.equal(await runWithQueue({url:'http://127.0.0.1:'+server.address().port,keyHash:hash,generate:controls=>sendPrepared({source:'nai-generation',send:async()=>{sent++;return 'image';}},controls)}),'image');
  assert.equal(sent,1);assert.equal(q.stats().active,0);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('20s preparing boundary is inclusive; pickup starts a fresh fixed deadline and begin exits preparing',()=>{
 for(const offset of [19999,20000,20001]){
  let now=0;const q=new LeaseQueue({now:()=>now}),a=who('boundary'),lease=q.join(a);
  now=offset;if(offset<20000){assert.equal(begin(q,a,lease).phase,'possibly-sent');now=20001;assert.equal(q.turn(a).phase,'possibly-sent');assert.equal(q.lanes.get(hash).active.expires,69999);}
  else assert.throws(()=>begin(q,a,lease),/过期/);
 }
 let now=0;const q=new LeaseQueue({now:()=>now}),a=who('handoffA'),b=who('handoffB'),lease=q.join(a);q.join(b);q.release({...a,lock_token:lease.lock_token});
 now=44000;const picked=q.turn(b);assert.equal(q.lanes.get(hash).active.prepareDeadline,64000);now=63999;assert.equal(begin(q,b,picked).phase,'possibly-sent');
});
test('old timeout registration and complete cannot override new unknown-result protection or shared cooldown',()=>{
 let now=0;const q=new LeaseQueue({now:()=>now}),a=who('A'),b=who('B'),lease=q.join(a);q.join(b);begin(q,a,lease);
 now=5000;q.turn({...a,lock_token:lease.lock_token,generation_timeout_ms:5000});assert.equal(q.lanes.get(hash).active.expires,50000);
 now=30000;q.finish({...a,lock_token:lease.lock_token,outcome:'uncertain'});
 q.turn({...a,lock_token:lease.lock_token,generation_timeout_ms:5000});assert.equal(q.lanes.get(hash).active.expires,50000);
 assert.throws(()=>q.release({...a,lock_token:lease.lock_token}),/finish/);assert.equal(q.turn(b).your_turn,false);
 now=50000;const next=q.turn(b);begin(q,b,next);q.finish({...b,lock_token:next.lock_token,outcome:'rate-limited'});
 assert.equal(q.release({...a,lock_token:lease.lock_token}).released,false);assert.equal(q.release({...b,lock_token:next.lock_token}).released,false);
 assert.equal(q.join(who('C')).status,'cooldown');assert.equal(q.lanes.get(hash).cooldownUntil,65000);
});
test('local timeout value is independent of prepare hard deadline and never directly expires a new holder',()=>{
 for(const timeout of [5000,30000,90000,180000]){
  let now=0;const q=new LeaseQueue({now:()=>now}),a=who('A'),lease=q.join(a);assert.equal(q.lanes.get(hash).active.prepareDeadline,20000);
  begin(q,a,lease,timeout);now=timeout;assert.equal(q.turn(a).your_turn,true);assert.equal(q.lanes.get(hash).active.expires,timeout+20000);
 }
});

test('queue inputs whitelist excludes prompt, image, headers and raw key material',()=>{
 const q=new LeaseQueue();
 for(const field of ['key','prompt','image','Authorization','headers'])assert.throws(()=>q.join({...who('privacy'),[field]:'fixture-sensitive'}));
});
test('new same-key clients share cooldown status and send zero POSTs until the server deadline',async()=>{
 let now=0,sent=0;const q=new LeaseQueue({now:()=>now}),a=who('cooldown-A'),first=q.join(a);begin(q,a,first);
 q.finish({...a,lock_token:first.lock_token,outcome:'rate-limited'});const statuses=[];
 await runWithQueue({url:'https://fixture.invalid',keyHash:hash,now:()=>now,requestJSON:dispatch(q),pollMs:5000,sleep:async ms=>{assert.equal(sent,0);now+=ms;},onStatus:status=>statuses.push(status),generate:controls=>sendPrepared({source:'nai-generation',send:async()=>{assert.ok(now>=15000);sent++;return 'image';}},controls)});
 assert.equal(sent,1);assert.ok(statuses.some(status=>status.includes('上游限流冷却中')&&status.includes('本任务已等')));
});

test('48 new clients across 12 keys submit exactly once each with same-key exclusion and cross-key concurrency',async()=>{
 const q=new LeaseQueue(),active=new Map();let parallel=0,peak=0,posts=0;
 const jobs=Array.from({length:48},(_,i)=>{
  const key=(i%12).toString(16).repeat(64);
  return runWithQueue({url:'https://fixture.invalid',keyHash:key,requestJSON:dispatch(q),pollMs:1,generate:controls=>sendPrepared({source:'nai-generation',send:async()=>{
   assert.equal(active.get(key)||0,0);active.set(key,1);posts++;parallel++;peak=Math.max(peak,parallel);
   await new Promise(r=>setTimeout(r,3));parallel--;active.set(key,0);return i;
  }},controls)});
 });
 assert.equal((await Promise.all(jobs)).length,48);assert.equal(posts,48);assert.ok(peak>1);assert.deepEqual(q.stats(),{active:0,waiting:0});
});

test('browser resuming after its preparing deadline cannot POST after the next holder has acquired',async()=>{
 let now=0,posts=0;const q=new LeaseQueue({now:()=>now});const b=who('resume-next');let next;
 await assert.rejects(runWithQueue({url:'https://fixture.invalid',keyHash:hash,now:()=>now,requestJSON:dispatch(q),generate:controls=>{
  now=20001;next=q.join(b);assert.equal(next.your_turn,true);
  return sendPrepared({source:'nai-generation',send:async()=>{posts++;}},controls);
 }}),/过期/);
 assert.equal(posts,0);assert.equal(q.turn(b).lock_token,next.lock_token);
});
test('new direct-image response releases before an indefinitely blocked ZIP and cannot turn local decode failure into uncertain generation',async()=>{
 const {createDirectClient}=await import('../src/novelai/direct-client.js');
 let resume,entered;const ready=new Promise(r=>entered=r),q=new LeaseQueue();
 const direct=createDirectClient({settings:{},save(){},getHeaders:()=>({}),getKey:async()=>'fixture-only',fetchImpl:async()=>new Response(new Uint8Array([80,75,3,4])),unzipPNG:()=>{entered();return new Promise((_,reject)=>resume=reject);}});
 const prepared=await direct.prepareGenerate({vibes:[]});
 const pending=runWithQueue({url:'https://fixture.invalid',keyHash:hash,requestJSON:dispatch(q),generate:controls=>sendPrepared(prepared,controls)});
 await ready;assert.equal(q.stats().active,0);resume(new TypeError('local ZIP failure'));
 await assert.rejects(pending,/ZIP 损坏/);assert.equal(q.stats().active,0);
});

test('Vibe encoding keeps its 180s local budget and bounded protection when the host ignores abort',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const {createDirectClient}=await import('../src/novelai/direct-client.js');
 const id='12345678-1234-1234-1234-123456789abc',item={id,name:'fixture',image:'YQ==',encodings:{}};let entered,signal;
 const attempted=new Promise(r=>entered=r),q=new LeaseQueue({now:()=>0});
 const direct=createDirectClient({settings:{vibeLibrary:[{id}]},save(){},getHeaders:()=>({}),getKey:async()=>'fixture',unzipPNG:async()=>'',fetchImpl:async(url,opts)=>{
  if(url.startsWith('/user/files/'))return Response.json(item);signal=opts.signal;entered();return new Promise(()=>{});
 }});
 const prepared=await direct.prepareEncode({id,model:'nai-diffusion-4-5-full',information:1});
 const pending=runWithQueue({url:'https://fixture.invalid',keyHash:hash,generationTimeoutMs:180000,requestJSON:dispatch(q),generate:controls=>sendPrepared(prepared,{...controls,timeoutMs:180000})});
 const rejected=assert.rejects(pending,e=>e.localGenerationTimeout===true&&e.source==='nai-encode');
 await attempted;t.mock.timers.tick(30000);assert.equal(signal.aborted,false);t.mock.timers.tick(150000);await rejected;
 assert.equal(signal.aborted,true);assert.equal(q.lanes.get(hash).active.phase,'uncertain');assert.equal(q.lanes.get(hash).active.expires,200000);
});
test('Vibe encoding local upload failure happens after finish and cannot retain the cloud slot',async()=>{
 const {createDirectClient}=await import('../src/novelai/direct-client.js');
 const id='12345678-1234-1234-1234-123456789abc',item={id,name:'fixture',image:'YQ==',encodings:{}};
 let entered,fail;const writing=new Promise(r=>entered=r),q=new LeaseQueue();
 const direct=createDirectClient({settings:{vibeLibrary:[{id}]},save(){},getHeaders:()=>({}),getKey:async()=>'fixture',unzipPNG:async()=>'',fetchImpl:async url=>{
  if(url.startsWith('/user/files/'))return Response.json(item);
  if(url.endsWith('encode-vibe'))return new Response('encoding');entered();return new Promise((_,reject)=>fail=reject);
 }});
 const prepared=await direct.prepareEncode({id,model:'nai-diffusion-4-5-full',information:1});
 const pending=runWithQueue({url:'https://fixture.invalid',keyHash:hash,generationTimeoutMs:180000,requestJSON:dispatch(q),generate:controls=>sendPrepared(prepared,{...controls,timeoutMs:180000})});
 await writing;assert.equal(q.stats().active,0);fail(new TypeError('local upload failed'));await assert.rejects(pending);assert.equal(q.stats().active,0);
});
