import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {LeaseQueue} from '../queue-service/queue.mjs';
import {createQueueServer} from '../queue-service/service.mjs';
import {runWithQueue,fingerprintKey,queuePollMs} from '../cloud-queue.js';
const hash=key=>createHash('sha256').update(key).digest('hex');
const identity=(key,user)=>({key_hash:hash(key),user_id:'user-id-'+user,task_id:'task-id-'+user});
test('A/B share key one; C with key two is granted independently',()=>{
 const q=new LeaseQueue(),a=identity('one','a'),b=identity('one','b'),c=identity('two','c');
 const first=q.join(a);assert.equal(first.your_turn,true);assert.equal(q.join(b).your_turn,false);assert.equal(q.join(c).your_turn,true);
 assert.equal(q.turn(b).position,1);assert.throws(()=>q.release({...a,lock_token:'wrong'}));
 q.release({...a,lock_token:first.lock_token});assert.equal(q.turn(b).your_turn,true);
});
test('duplicate joins do not duplicate jobs; raw keys are rejected',()=>{
 const q=new LeaseQueue(),a=identity('one','a');assert.deepEqual(q.join(a),q.join(a));assert.deepEqual(q.stats(),{active:1,waiting:0});
 assert.throws(()=>q.join({...a,key:'must-never-send-this'}));assert.throws(()=>q.join({...a,key_hash:'invalid'}));
});
test('stale holders expire and heartbeats keep a waiter alive',()=>{
 let now=0;const q=new LeaseQueue({now:()=>now,leaseMs:100,waitingMs:60}),a=identity('one','a'),b=identity('one','b');
 q.join(a);q.join(b);now=50;assert.equal(q.turn(b).your_turn,false);now=101;assert.equal(q.turn(b).your_turn,true);
});
test('key hashing is stable and trims spaces',async()=>assert.equal(await fingerprintKey(' demo-key '),hash('demo-key')));

test('distant waiters poll less and return to fast polling near the front',async()=>{
 assert.equal(queuePollMs(1),5000);assert.equal(queuePollMs(64),15000);
 const waits=[],positions=[64,3,1];let generated=0;
 await runWithQueue({url:'https://queue.example',keyHash:hash('one'),sleep:async ms=>waits.push(ms),fetchImpl:async url=>{
  if(url.endsWith('/complete'))return Response.json({released:true});
  return Response.json(positions.length?{your_turn:false,position:positions.shift()}:{your_turn:true,lock_token:'lease'});
 },generate:async()=>{generated++;}});
 assert.deepEqual(waits,[15000,10000,5000]);assert.equal(generated,1);
});

test('generation renews its lease every minute and stops heartbeats on completion',async t=>{
 t.mock.timers.enable({apis:['setInterval']});let finish,turns=0;
 const running=runWithQueue({url:'https://queue.example',keyHash:hash('one'),fetchImpl:async url=>{if(url.endsWith('/my-turn'))turns++;return Response.json({your_turn:true,lock_token:'lease'});},generate:()=>new Promise(resolve=>finish=resolve)});
 while(!finish)await new Promise(resolve=>setImmediate(resolve));
 t.mock.timers.tick(59999);assert.equal(turns,0);t.mock.timers.tick(1);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(turns,1);
 finish('image');await running;t.mock.timers.tick(60000);assert.equal(turns,1);
});

test('temporary queue failures retry the same identity without duplicating generation',async()=>{
 const joins=[];let generated=0;
 const result=await runWithQueue({url:'https://queue.example',keyHash:hash('one'),sleep:async()=>{},fetchImpl:async(url,options)=>{
  if(url.endsWith('/join-queue')){joins.push(JSON.parse(options.body));if(joins.length===1)throw new TypeError('response lost');if(joins.length===2)return new Response('busy',{status:503});}
  return Response.json({your_turn:true,lock_token:'lease'});
 },generate:async()=>{generated++;return 'image';}});
 assert.equal(result,'image');assert.equal(generated,1);assert.equal(joins.length,3);assert.deepEqual(joins[0],joins[1]);assert.deepEqual(joins[1],joins[2]);
});

test('queue outage is bounded and never calls the image service before a confirmed lease',async()=>{
 let joins=0,generated=0;
 await assert.rejects(runWithQueue({url:'https://queue.example',keyHash:hash('one'),sleep:async()=>{},fetchImpl:async url=>{if(url.endsWith('/join-queue')){joins++;return new Response('unavailable',{status:503});}return Response.json({released:true});},generate:async()=>{generated++;}}),/503/);
 assert.equal(joins,4);assert.equal(generated,0);
});
test('real HTTP coordination: same-key waits, different-key runs; no raw key or prompt sent',async()=>{
 const queue=new LeaseQueue(),server=createQueueServer({queue});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+server.address().port,started=[],bodies=[];let finishA;
 const options={url,pollMs:2,heartbeatMs:100,fetchImpl:(u,o)=>{bodies.push(JSON.parse(o.body));return fetch(u,o);}};
 try{
  const a=runWithQueue({...options,keyHash:hash('one'),generate:()=>{started.push('a');return new Promise(r=>finishA=r);}});
  while(!finishA)await new Promise(r=>setTimeout(r,2));
  const b=runWithQueue({...options,keyHash:hash('one'),generate:async()=>{started.push('b');return 'image-b';}});
  const c=runWithQueue({...options,keyHash:hash('two'),generate:async()=>{started.push('c');return 'image-c';}});
  assert.equal(await c,'image-c');assert.deepEqual(started,['a','c']);finishA('image-a');assert.equal(await a,'image-a');assert.equal(await b,'image-b');assert.deepEqual(started,['a','c','b']);
  assert.deepEqual(queue.stats(),{active:0,waiting:0});
  assert.ok(bodies.every(body=>Object.keys(body).every(key=>['key_hash','user_id','task_id','greeting','lock_token'].includes(key))));
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('generation errors release the lock without retrying NAI',async()=>{
 const queue=new LeaseQueue(),server=createQueueServer({queue});await new Promise(r=>server.listen(0,'127.0.0.1',r));let calls=0;
 try{await assert.rejects(()=>runWithQueue({url:'http://127.0.0.1:'+server.address().port,keyHash:hash('one'),generate:async()=>{calls++;throw new Error('upstream failed');}}),/upstream failed/);assert.equal(calls,1);assert.deepEqual(queue.stats(),{active:0,waiting:0});}
 finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('HTTP burst with 12 keys and 48 clients never overlaps the same key and allows parallel keys',async()=>{
 const queue=new LeaseQueue(),server=createQueueServer({queue});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const active=new Map();let parallel=0,peak=0;
 try{
  const jobs=Array.from({length:48},(_,i)=>{const key='burst-key-'+(i%12);return runWithQueue({url:'http://127.0.0.1:'+server.address().port,keyHash:hash(key),pollMs:2,heartbeatMs:100,generate:async()=>{
   assert.equal(active.get(key)||0,0);active.set(key,1);parallel++;peak=Math.max(peak,parallel);
   await new Promise(resolve=>setTimeout(resolve,5));active.set(key,0);parallel--;return i;
  }});});
  assert.equal((await Promise.all(jobs)).length,48);assert.ok(peak>1);assert.deepEqual(queue.stats(),{active:0,waiting:0});
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
