import test from 'node:test';import assert from 'node:assert/strict';
import {defaults} from '../core.js';
import {ensureProfileIds,sampleRequest,sampleSignature,createProfilePreviews} from '../profile-previews.js';
test('samples share editable prompt, square size and seed, without mutating the real profile',()=>{
 const p={...defaults,width:1216,height:832,seed:-1,positive:'front',positiveSuffix:'tail',vibeMode:'random',vibes:[{id:'a',key:'one',strength:.4},{id:'b',key:'two',strength:.5}]},before=JSON.stringify(p);
 const a=sampleRequest(p,[],'adult cat, flowers'),b=sampleRequest(p,[],'adult cat, flowers');
 assert.equal(a.width,512);assert.equal(a.height,512);assert.equal(a.seed,b.seed);assert.equal(a.prompt,'front,\nadult cat, flowers,\ntail,');assert.equal(a.vibes[0].id,'a');assert.equal(JSON.stringify(p),before);
 assert.equal(sampleSignature(p),sampleSignature({...p,name:'renamed',width:512,height:512,seed:999}));assert.notEqual(sampleSignature(p,[],'one'),sampleSignature(p,[],'two'));assert.throws(()=>sampleRequest(p,[],''),/例图提示词/);
});
test('profile copies receive independent identities and do not inherit another preview',()=>{
 const p={...defaults,id:'same',preview:{url:'/a'}};const list=[p,structuredClone(p),{...defaults}];ensureProfileIds(list);
 assert.equal(new Set(list.map(p=>p.id)).size,3);assert.equal(list[0].preview.url,'/a');assert.equal(list[1].preview,undefined);
});
test('unchanged saves do not regenerate; manual refresh and prompt changes do',async()=>{
 const p={...defaults,id:'a'},list=[p],calls=[],errors=[];let prompt='one';let queue=Promise.resolve();
 const previews=createProfilePreviews({profiles:()=>list,library:()=>[],prompt:()=>prompt,enqueue:run=>(queue=queue.then(run)),generate:async request=>{calls.push(request);return 'png';},saveImage:async()=>'/preview.png',persist:async()=>{},onError:e=>errors.push(e)});
 await previews.refresh(p,{ifChanged:true});await previews.refresh(p,{ifChanged:true});assert.equal(calls.length,1);p.name='new';await previews.refresh(p,{ifChanged:true});assert.equal(calls.length,1);
 await previews.refresh(p);assert.equal(calls.length,2);prompt='two';assert.equal(previews.state(p).status,'待更新');await previews.refresh(p,{ifChanged:true});assert.equal(calls.length,3);assert.equal(errors.length,0);
});
test('queued edits and deleted profiles never receive stale results or extra generation',async()=>{
 const p={...defaults,id:'a'},list=[p],jobs=[],requests=[];let release;
 const previews=createProfilePreviews({profiles:()=>list,library:()=>[],enqueue:run=>new Promise((resolve,reject)=>jobs.push(()=>run().then(resolve,reject))),generate:async req=>{requests.push(req);await new Promise(r=>release=r);return 'png';},saveImage:async()=>'/old.png',persist:async()=>{}});
 const first=previews.refresh(p);const same=previews.refresh(p);assert.equal(first,same);const start=jobs.shift()();await Promise.resolve();p.positive='new';release();await start;await first;assert.equal(p.preview,undefined);
 const queued=previews.refresh(p);list.length=0;await jobs.shift()();await queued;assert.equal(requests.length,1);
});
test('save failures keep the generated sample visible and can be saved without charging again',async()=>{
 const p={...defaults,id:'a'},errors=[];let calls=0;
 const previews=createProfilePreviews({profiles:()=>[p],library:()=>[],enqueue:run=>Promise.resolve().then(run),generate:async()=>{calls++;return 'png';},saveImage:async()=>'/preview.png',persist:async()=>{throw Error('offline');},onError:e=>errors.push(e)});
 await previews.refresh(p);assert.equal(p.preview.url,'/preview.png');assert.match(errors[0].message,/例图已生成/);await previews.refresh(p,{ifChanged:true});assert.equal(calls,1);
});
