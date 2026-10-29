import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareGeneration,sendPrepared} from '../generation-lifecycle.js';
import {createDirectClient} from '../direct-client.js';
import {runWithQueue} from '../cloud-queue.js';
import {LeaseQueue} from '../queue-service/queue.mjs';
const keyHash='b'.repeat(64);
const dispatch=q=>async(url,{body})=>url.endsWith('/join-queue')?q.join(body):url.endsWith('/my-turn')?q.turn(body):q.release(body);

test('hung key and Vibe reads time out before joining; ignored abort and late data cannot send',async()=>{
 for(const kind of ['key','vibe']){
  let late,sent=0,joined=0;
  const id='12345678-1234-1234-1234-123456789abc';
  const client=createDirectClient({settings:{vibeLibrary:[{id}]},save(){},getHeaders:()=>({}),getKey:()=>kind==='key'?new Promise(r=>late=r):Promise.resolve('fixture'),unzipPNG:async()=>'',fetchImpl:async url=>{
   if(url.startsWith('/user/files/'))return new Promise(r=>late=r);sent++;return new Response('zip');
  }});
  const operation=async()=>{const prepared=await prepareGeneration(()=>client.prepareGenerate({vibes:kind==='vibe'?[{id}]:[]}),{timeoutMs:5});joined++;return sendPrepared(prepared);};
  await assert.rejects(operation(),/准备超时/);late(kind==='key'?'fixture':Response.json({id,encodings:{}}));
  await new Promise(r=>setImmediate(r));assert.equal(joined,0);assert.equal(sent,0);
 }
});
test('preparation cancellation and clock expiry discard results even before the timeout callback runs',async()=>{
 const controller=new AbortController();
 const pending=prepareGeneration(()=>new Promise(()=>{}),{signal:controller.signal});controller.abort();await assert.rejects(pending,/已取消/);
 let now=0;await assert.rejects(prepareGeneration(async()=>{now=21000;return 'late';},{now:()=>now}),/准备超时/);
});
test('a pause after asynchronous validation is rechecked at the synchronous fetch boundary',async()=>{
 let now=0,sent=0;const q=new LeaseQueue({now:()=>now});
 await assert.rejects(runWithQueue({twoPhase:false,url:'https://fixture.invalid',keyHash,now:()=>now,generationTimeoutMs:30000,requestJSON:dispatch(q),generate:controls=>sendPrepared({source:'nai-generation',send:()=>{sent++;}}, {...controls,beforeSend:async()=>{const budget=await controls.beforeSend();now=30001;return budget;}})}),/未发送/);
 assert.equal(sent,0);
});
test('full response releases before slow ZIP, image save and chat save; local postprocessing has no network deadline',async()=>{
 const events=[];let resume,entered;
 const ready=new Promise(r=>entered=r);
 const pending=sendPrepared({source:'nai-generation',send:async()=>{events.push('body');return 'bytes';},postprocess:async()=>{events.push('zip');entered();await new Promise(r=>resume=r);events.push('image-save','chat-save');return 'image';}},{assertSend:()=>events.push('send'),onResponse:async()=>events.push('release'),timeoutMs:5});
 await ready;assert.deepEqual(events,['send','body','release','zip']);await new Promise(r=>setTimeout(r,10));resume();assert.equal(await pending,'image');
});
test('Vibe encode cache bypasses key lookup and send; uncached encoding releases before local read/write',async()=>{
 const id='12345678-1234-1234-1234-123456789abc',item={id,name:'fixture',image:'YQ==',encodings:{'v4-5full':{'miao-1':{encoding:'YQ==',params:{information_extracted:1}}}}};
 const events=[];
 const client=createDirectClient({settings:{vibeLibrary:[{id}]},save(){},getHeaders:()=>({}),getKey:async()=>{events.push('key');return 'fixture';},unzipPNG:async()=>'',fetchImpl:async url=>{
  if(url.startsWith('/user/files/')){events.push('read');return Response.json(item);}
  if(url.endsWith('encode-vibe')){events.push('encode');return new Response('encoded');}
  events.push('write');return Response.json({path:'user/files/miao-vibe-'+id+'.json'});
 }});
 assert.equal((await client.prepareEncode({id,model:'nai-diffusion-4-5-full',information:1})).cached,true);assert.deepEqual(events,['read']);
 events.length=0;const prepared=await prepareGeneration(()=>client.prepareEncode({id,model:'nai-diffusion-4-5-full',information:.5}));
 await sendPrepared(prepared,{onResponse:async()=>events.push('release'),timeoutMs:180000});
 assert.deepEqual(events,['read','key','encode','release','read','write']);
});

test('elapsed budget tolerates wall-clock rollback and monotonic clocks stopping during background sleep',async()=>{
 const {elapsedClock}=await import('../generation-lifecycle.js');let wall=1000,mono=100;const now=elapsedClock({wall:()=>wall,monotonic:()=>mono});
 wall=900;mono=6100;assert.equal(now(),6000);wall=17000;assert.equal(now(),16000);wall=1;mono=1;assert.equal(now(),16000);
});
