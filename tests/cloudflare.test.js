import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{MiaoKeyQueue} from '../cloudflare/worker.js';
import {createHash} from 'node:crypto';
const identity=(key,user)=>({key_hash:createHash('sha256').update(key).digest('hex'),user_id:'user-id-'+user,task_id:'task-id-'+user});
function context(data=new Map()){
 let pending=Promise.resolve();
 const ctx={data,alarmAt:null,writes:0,alarms:0,failAlarm:false,storage:{
  async get(k){return structuredClone(data.get(k));},async put(k,v){ctx.writes++;data.set(k,structuredClone(v));},async delete(k){ctx.writes++;data.delete(k);},
  async getAlarm(){return ctx.alarmAt;},async deleteAlarm(){ctx.alarms++;ctx.alarmAt=null;},async setAlarm(t){assert.ok(Number.isFinite(t));if(ctx.failAlarm)throw Error('storage unavailable');ctx.alarms++;ctx.alarmAt=t;},
  async transaction(fn){const before=structuredClone(data),alarm=ctx.alarmAt;try{return await fn();}catch(error){data.clear();for(const [k,v] of before)data.set(k,v);ctx.alarmAt=alarm;throw error;}}
 },blockConcurrencyWhile(fn){const result=pending.then(fn);pending=result.catch(()=>{});return result;}};return ctx;
}
const call=async(object,path,body)=>{const res=await object.fetch(new Request('https://queue.test'+path,{method:'POST',body:JSON.stringify(body)}));return {...await res.json(),status:res.status};};

test('generation deadline survives eviction and advances without a client completion',async()=>{
 let now=0;const ctx=context(),a=identity('deadline','A'),b=identity('deadline','B');let object=new MiaoKeyQueue(ctx);object.queue.now=()=>now;
 const first=await call(object,'/join-queue',a);await call(object,'/my-turn',{...a,lock_token:first.lock_token,generation_timeout_ms:30000});
 await call(object,'/join-queue',b);assert.equal(ctx.alarmAt,30000);
 object=new MiaoKeyQueue(context(ctx.data));object.queue.now=()=>now;
 now=30001;await object.alarm();assert.equal((await call(object,'/my-turn',b)).your_turn,true);
 assert.equal((await call(object,'/complete',{...a,lock_token:first.lock_token})).released,false);
});

test('unclaimed handoff survives eviction and expires without stealing a claimed lease',async()=>{
 let now=0;const ctx=context(),a=identity('one','A'),b=identity('one','B'),c=identity('one','C');let object=new MiaoKeyQueue(ctx);object.queue.now=()=>now;
 const first=await call(object,'/join-queue',a);await call(object,'/join-queue',b);await call(object,'/join-queue',c);
 await call(object,'/complete',{...a,lock_token:first.lock_token});assert.equal(ctx.alarmAt,45000);
 object=new MiaoKeyQueue(context(ctx.data));object.queue.now=()=>now;
 now=45001;await object.alarm();assert.equal((await call(object,'/my-turn',c)).your_turn,true);
 now=90002;assert.equal((await call(object,'/my-turn',c)).your_turn,true);assert.equal((await call(object,'/my-turn',b)).status,400);
});
test('durable queue survives eviction and retains per-key mutual exclusion',async()=>{
 const ctx=context(),a=identity('one','A'),b=identity('one','B');let object=new MiaoKeyQueue(ctx);
 const first=await call(object,'/join-queue',a);assert.equal(first.your_turn,true);assert.equal((await call(object,'/join-queue',b)).your_turn,false);
 object=new MiaoKeyQueue(context(ctx.data));assert.equal((await call(object,'/my-turn',b)).your_turn,false);
 assert.equal((await call(object,'/complete',{...a,lock_token:first.lock_token})).released,true);
 assert.equal((await call(object,'/my-turn',b)).your_turn,true);
});

test('frequent position checks do not rewrite durable state or alarms',async()=>{
 let now=0;const ctx=context(),object=new MiaoKeyQueue(ctx),a=identity('one','A'),b=identity('one','B');object.queue.now=()=>now;
 await call(object,'/join-queue',a);await call(object,'/join-queue',b);
 const writes=ctx.writes,alarms=ctx.alarms;
 for(now=5000;now<30000;now+=5000){assert.equal((await call(object,'/my-turn',b)).your_turn,false);await call(object,'/my-turn',a);}
 assert.equal(ctx.writes,writes);assert.equal(ctx.alarms,alarms);
 assert.equal((await call(object,'/my-turn',b)).position,1);assert.equal(ctx.writes,writes+1);assert.equal(ctx.alarms,alarms);
});

test('three minutes of legacy polling uses at least 80% fewer storage writes',async t=>{
 let now=0;const ctx=context(),object=new MiaoKeyQueue(ctx),a=identity('one','A'),b=identity('one','B');object.queue.now=()=>now;
 await call(object,'/join-queue',a);await call(object,'/join-queue',b);
 const initial=ctx.writes+ctx.alarms;let calls=0;
 for(now=5000;now<=180000;now+=5000){
  if(ctx.alarmAt!==null&&ctx.alarmAt<=now){ctx.alarmAt=null;await object.alarm();}
  assert.equal((await call(object,'/my-turn',b)).your_turn,false);calls++;
  if(now%15000===0){assert.equal((await call(object,'/my-turn',a)).your_turn,true);calls++;}
 }
 const actual=ctx.writes+ctx.alarms-initial,previous=calls*2;
 assert.ok(actual<=previous*.2);t.diagnostic(`${calls} queries: storage write calls ${previous} → ${actual} (including rescheduled alarms, excluding initial joins)`);
});

test('coalesced waiting renewals survive eviction with at least 90s grace and preserve FIFO',async()=>{
 let now=0;const ctx=context(),a=identity('one','A'),b=identity('one','B'),c=identity('one','C');let object=new MiaoKeyQueue(ctx);object.queue.now=()=>now;
 const first=await call(object,'/join-queue',a);await call(object,'/join-queue',b);await call(object,'/join-queue',c);
 now=29000;await call(object,'/my-turn',b); // deliberately below the write interval
 object=new MiaoKeyQueue(context(ctx.data));object.queue.now=()=>now;
 now=118000;assert.equal((await call(object,'/my-turn',b)).position,1);
 assert.equal((await call(object,'/complete',{...a,lock_token:first.lock_token})).released,true);
 const granted=await call(object,'/my-turn',b);assert.equal(granted.your_turn,true);
 assert.equal((await call(object,'/my-turn',c)).your_turn,false);
 object=new MiaoKeyQueue(context(ctx.data));object.queue.now=()=>now;
 assert.equal((await call(object,'/my-turn',b)).lock_token,granted.lock_token);
});

test('expiry alarms advance and persist the queue, then remove idle data',async()=>{
 let now=0;const ctx=context(),object=new MiaoKeyQueue(ctx),a=identity('one','A'),b=identity('one','B');object.queue.now=()=>now;
 const first=await call(object,'/join-queue',a);await call(object,'/join-queue',b);
 now=90000;await call(object,'/my-turn',b);now=180000;await call(object,'/my-turn',b);
 now=240000;ctx.alarmAt=null;await object.alarm();
 assert.equal((await call(object,'/my-turn',b)).your_turn,true);
 assert.equal((await call(object,'/complete',{...a,lock_token:first.lock_token})).released,false);
 now=480000;ctx.alarmAt=null;await object.alarm();assert.equal(ctx.data.size,0);assert.equal(ctx.alarmAt,null);
 const writes=ctx.writes;assert.equal((await call(object,'/leave-queue',b)).released,false);assert.equal(ctx.writes,writes);
});

test('failed storage transaction cannot expose a grant and retries reload durable state',async()=>{
 const ctx=context(),object=new MiaoKeyQueue(ctx),a=identity('one','A'),b=identity('one','B');ctx.failAlarm=true;
 assert.equal((await call(object,'/join-queue',a)).status,503);assert.equal(ctx.data.size,0);
 ctx.failAlarm=false;const granted=await call(object,'/join-queue',b);assert.equal(granted.your_turn,true);
 assert.equal((await call(object,'/join-queue',a)).your_turn,false);
 assert.equal((await call(object,'/my-turn',b)).lock_token,granted.lock_token);
});

test('legacy 0.4.2 lanes keep existing holders and tokens across the upgrade',async()=>{
 let now=0;const old=new (await import('../queue-service/queue.mjs')).LeaseQueue({now:()=>now}),a=identity('one','A'),b=identity('one','B');
 const first=old.join(a);old.join(b);const ctx=context(new Map([['lanes',[...old.lanes]]]));ctx.alarmAt=90000;
 const object=new MiaoKeyQueue(ctx);object.queue.now=()=>now;
 assert.equal((await call(object,'/join-queue',a)).lock_token,first.lock_token);assert.equal((await call(object,'/my-turn',b)).your_turn,false);
 assert.equal(ctx.writes,0);assert.equal((await call(object,'/complete',{...a,lock_token:first.lock_token})).released,true);
 assert.equal((await call(object,'/my-turn',b)).your_turn,true);
});

test('storage renewal never extends the maximum hold and expired callers still persist handoffs',async()=>{
 let now=0;const ctx=context(),object=new MiaoKeyQueue(ctx),a=identity('one','A'),b=identity('one','B');object.queue.now=()=>now;
 await call(object,'/join-queue',a);await call(object,'/join-queue',b);
 for(now=60000;now<600000;now+=60000){await call(object,'/my-turn',a);await call(object,'/my-turn',b);}
 assert.equal((await call(object,'/my-turn',a)).status,400);
 const persisted=new MiaoKeyQueue(context(ctx.data));persisted.queue.now=()=>now;
 assert.equal((await call(persisted,'/my-turn',b)).your_turn,true);
});

test('service failures return retriable 503 while bad input stays 400 and a full lane returns 429',async()=>{
 const request=body=>new Request('https://queue.test/join-queue',{method:'POST',body:JSON.stringify(body)}),a=identity('one','A');
 const env={MIAO_KEY_QUEUE:{idFromName(){throw Error('private details');}}};
 const failed=await worker.fetch(request(a),env);assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes('private details'));
 assert.equal((await worker.fetch(request({...a,key:'reject'}),env)).status,400);
 const object=new MiaoKeyQueue(context());await call(object,'/join-queue',a);
 for(let i=0;i<64;i++)assert.equal((await call(object,'/join-queue',identity('one','wait-'+i))).status,200);
 assert.equal((await call(object,'/join-queue',identity('one','overflow'))).status,429);
});
test('edge router directs same keys to one object, different keys independently',async()=>{
 const objects=new Map();const env={MIAO_KEY_QUEUE:{idFromName:name=>name,get(id){if(!objects.has(id))objects.set(id,new MiaoKeyQueue(context()));return objects.get(id);}}};
 const request=(path,body)=>worker.fetch(new Request('https://queue.test'+path,{method:'POST',body:JSON.stringify(body)}),env);
 const a=identity('one','A'),b=identity('one','B'),c=identity('two','C');
 assert.equal((await (await request('/join-queue',a)).json()).your_turn,true);
 assert.equal((await (await request('/join-queue',b)).json()).your_turn,false);
 assert.equal((await (await request('/join-queue',c)).json()).your_turn,true);
 assert.equal(objects.size,2);assert.equal((await request('/join-queue',{...a,key:'must-reject'})).status,400);assert.equal(objects.size,2);
 const ping=await worker.fetch(new Request('https://queue.test/ping'),env);assert.equal((await ping.json()).ready,true);assert.equal(ping.headers.get('Access-Control-Allow-Origin'),'*');
});

test('server relay shares direct locks, preserves error statuses and uses a scoped release proof',async()=>{
 const objects=new Map(),env={MIAO_KEY_QUEUE:{idFromName:name=>name,get(id){if(!objects.has(id))objects.set(id,new MiaoKeyQueue(context()));return objects.get(id);}}};
 const a=identity('relay','A'),b=identity('relay','B');
 const direct=async(op,input)=>{const result=await worker.fetch(new Request('https://queue.test/'+op,{method:'POST',body:JSON.stringify(input)}),env);return result.json();};
 const relay=async(op,input)=>{const url=new URL('https://queue.test/relay');url.searchParams.set('op',op);url.searchParams.set('data',JSON.stringify(input));const result=await worker.fetch(new Request(url),env);assert.equal(result.status,200);return result.json();};
 const first=await direct('join-queue',a);assert.equal((await relay('join-queue',b)).body.your_turn,false);
 assert.equal((await relay('join-queue',a)).body.lock_token,first.lock_token);
 assert.equal((await relay('complete',{...a,release_proof:'0'.repeat(64)})).relay_status,400);
 const proof=createHash('sha256').update(first.lock_token+'\0release').digest('hex');
 assert.equal((await relay('complete',{...a,release_proof:proof})).body.released,true);
 const next=await direct('my-turn',b);assert.equal(next.your_turn,true);
 assert.equal((await relay('complete',{...b,release_proof:proof})).relay_status,400);
 assert.equal((await relay('join-queue',{...b,key:'reject-me'})).relay_status,400);
 assert.equal((await relay('complete',{...b,lock_token:next.lock_token})).relay_status,400);
 assert.equal(objects.size,1);
});

test('160 concurrent users across 20 keys have one holder per key and independent handoffs',async()=>{
 const objects=new Map();const env={MIAO_KEY_QUEUE:{idFromName:name=>name,get(id){if(!objects.has(id))objects.set(id,new MiaoKeyQueue(context()));return objects.get(id);}}};
 const request=async(path,body)=>{const r=await worker.fetch(new Request('https://queue.test'+path,{method:'POST',body:JSON.stringify(body)}),env);assert.equal(r.status,200);return r.json();};
 const groups=Array.from({length:20},(_,k)=>Array.from({length:8},(_,u)=>{const who=identity('release-key-'+k,'group-'+k+'-user-'+u);if(u%2)who.key_hash=who.key_hash.toUpperCase();return who;}));
 const initial=await Promise.all(groups.map(users=>Promise.all(users.map(who=>request('/join-queue',who)))));
 assert.equal(objects.size,20);assert.equal(initial.flat().filter(state=>state.your_turn).length,20);
 for(const row of initial){assert.equal(row[0].your_turn,true);assert.ok(row.slice(1).every(state=>!state.your_turn));}
 let tokens=initial.map(row=>row[0].lock_token);
 for(let turn=0;turn<8;turn++){
  await Promise.all(groups.map((users,k)=>request('/complete',{...users[turn],lock_token:tokens[k]})));
  if(turn<7){const next=await Promise.all(groups.map(users=>request('/my-turn',users[turn+1])));assert.ok(next.every(state=>state.your_turn));tokens=next.map(state=>state.lock_token);}
 }
 for(const object of objects.values())assert.deepEqual(object.queue.stats(),{active:0,waiting:0});
});

test('new preparing and uncertain deadlines persist through eviction; alarms progress without a client',async()=>{
 let now=0;const a={...identity('phases','A'),protocol:2},b={...identity('phases','B'),protocol:2},ctx=context();let object=new MiaoKeyQueue(ctx);object.queue.now=()=>now;
 const first=await call(object,'/join-queue',a);assert.equal(ctx.alarmAt,20000);
 now=1000;const begun=await call(object,'/begin-generation',{...a,lock_token:first.lock_token,generation_timeout_ms:30000});assert.equal(begun.phase,'possibly-sent');
 await call(object,'/join-queue',b);await call(object,'/finish',{...a,lock_token:first.lock_token,outcome:'uncertain'});
 object=new MiaoKeyQueue(context(ctx.data));object.queue.now=()=>now;
 now=31000;await object.alarm();assert.equal((await call(object,'/my-turn',b)).your_turn,false);
 now=51000;await object.alarm();const next=await call(object,'/my-turn',b);assert.equal(next.phase,'preparing');
 assert.equal((await call(object,'/finish',{...a,lock_token:first.lock_token,outcome:'success'})).finished,false);
 now=71000;await object.alarm();assert.equal(object.queue.stats().active,0);
});
test('failed durable begin transaction returns no authorization and reloads the previous phase',async()=>{
 const ctx=context(),object=new MiaoKeyQueue(ctx),a={...identity('begin-fail','A'),protocol:2};object.queue.now=()=>0;
 const first=await call(object,'/join-queue',a),put=ctx.storage.put;ctx.storage.put=async()=>{throw Error('failed commit');};
 assert.equal((await call(object,'/begin-generation',{...a,lock_token:first.lock_token,generation_timeout_ms:30000})).status,503);
 ctx.storage.put=put;assert.equal((await call(object,'/my-turn',a)).phase,'preparing');
 assert.equal((await call(object,'/begin-generation',{...a,lock_token:first.lock_token,generation_timeout_ms:30000})).phase,'possibly-sent');
});
test('mixed persisted old holder and new waiters preserve token, legacy deadline and FIFO',async()=>{
 let now=1000;const a=identity('mixed','A'),b={...identity('mixed','B'),protocol:2},c=identity('mixed','C');
 const data=new Map([['lanes',[[a.key_hash,{active:{user:a.user_id,task:a.task_id,token:'persisted-old-token',seen:0,started:0,expires:240000},waiting:[{user:b.user_id,task:b.task_id,seen:0,protocol:2,phase:'preparing'},{user:c.user_id,task:c.task_id,seen:0}]}]]]]);
 const object=new MiaoKeyQueue(context(data));object.queue.now=()=>now;
 assert.equal((await call(object,'/my-turn',a)).lock_token,'persisted-old-token');assert.equal(object.queue.lanes.get(a.key_hash).active.expires,240000);
 assert.equal((await call(object,'/my-turn',b)).position,1);assert.equal((await call(object,'/my-turn',c)).position,2);
 await call(object,'/complete',{...a,lock_token:'persisted-old-token'});
 assert.equal((await call(object,'/my-turn',b)).phase,'preparing');assert.equal((await call(object,'/my-turn',c)).position,1);
});

test('durable cooldown is atomic with finish, survives eviction and alarm resumes FIFO including old clients',async()=>{
 let now=0;const ctx=context(),a={...identity('cooldown','A'),protocol:2},b=identity('cooldown','legacy-B');let object=new MiaoKeyQueue(ctx);object.queue.now=()=>now;
 const first=await call(object,'/join-queue',a);await call(object,'/begin-generation',{...a,lock_token:first.lock_token,generation_timeout_ms:30000});await call(object,'/join-queue',b);
 const report={...a,lock_token:first.lock_token,outcome:'rate-limited',retry_after_ms:100000};
 assert.equal((await call(object,'/finish',report)).cooldown_remaining_ms,100000);assert.equal(ctx.data.get('lanes')[0][1].active,null);assert.equal(ctx.data.get('lanes')[0][1].cooldownUntil,100000);
 object=new MiaoKeyQueue(context(ctx.data));object.queue.now=()=>now;
 now=20000;assert.equal((await call(object,'/my-turn',b)).your_turn,false);now=99999;assert.equal((await call(object,'/my-turn',b)).cooldown_remaining_ms,1);
 now=100000;await object.alarm();const next=await call(object,'/my-turn',b);assert.equal(next.status,200);assert.equal(next.your_turn,true);assert.equal(object.queue.lanes.get(b.key_hash).active.expires,340000);
 assert.equal((await call(object,'/finish',report)).finished,false);assert.equal((await call(object,'/my-turn',b)).lock_token,next.lock_token);
 await call(object,'/complete',{...b,lock_token:next.lock_token});now=300001;await object.alarm();assert.equal(ctx.data.size,0);
});

test('Phase 6 atomic rejection and retry authorization survive eviction/storage failure; maintenance drains retry-wait',async()=>{
 let now=0;const ctx=context(),a={...identity('retry-durable','A'),protocol:2,retry_protocol:1},b=identity('retry-durable','B');let object=new MiaoKeyQueue(ctx);object.queue.now=()=>now;
 const lease=await call(object,'/join-queue',a);await call(object,'/join-queue',b);
 const beginBody={...a,lock_token:lease.lock_token,attempt_no:0,generation_timeout_ms:30000};const permit=await call(object,'/begin-generation',beginBody);
 const rejection={...a,lock_token:lease.lock_token,attempt_no:0,attempt_id:permit.attempt_id,rejection_status:429};
 const put=ctx.storage.put;ctx.storage.put=async()=>{throw Error('commit failed');};
 assert.equal((await call(object,'/retry-generation',rejection)).status,503);ctx.storage.put=put;
 assert.equal((await call(object,'/my-turn',a)).phase,'possibly-sent');assert.equal((await call(object,'/retry-generation',rejection)).phase,'retry-wait');
 assert.equal(ctx.data.get('lanes')[0][1].active.expires,20000);
 object=new MiaoKeyQueue(ctx,{QUEUE_MAINTENANCE:'true'});object.queue.now=()=>now;
 now=10000;assert.equal((await call(object,'/join-queue',a)).status,503);assert.equal((await call(object,'/my-turn',b)).your_turn,false);
 ctx.storage.put=async()=>{throw Error('commit failed');};assert.equal((await call(object,'/begin-generation',{...beginBody,attempt_no:1})).status,503);ctx.storage.put=put;
 assert.equal((await call(object,'/my-turn',a)).phase,'retry-wait');const next=await call(object,'/begin-generation',{...beginBody,attempt_no:1});assert.equal(next.phase,'possibly-sent');assert.notEqual(next.attempt_id,permit.attempt_id);
 assert.equal((await call(object,'/finish',{...rejection,outcome:'success'})).status,400);
 await call(object,'/retry-generation',{...rejection,attempt_no:1,attempt_id:next.attempt_id});
 object=new MiaoKeyQueue(ctx,{QUEUE_MAINTENANCE:'true'});object.queue.now=()=>now;
 now=30000;await object.alarm();const successor=await call(object,'/my-turn',b);assert.equal(successor.your_turn,true);
 assert.equal((await call(object,'/finish',{...rejection,outcome:'rejected'})).finished,false);assert.equal((await call(object,'/my-turn',b)).lock_token,successor.lock_token);
});
