// Full async client fault simulations; no HTTP/NAI. Full browser freezes are
// explicitly modelled by delaying that page's promise/timer delivery together.
import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {LeaseQueue} from '../queue-service/queue.mjs';
import {runWithQueue} from '../src/queue/cloud-queue.js';
import {sendPrepared} from '../src/generation/generation-lifecycle.js';
import {queueCapabilities} from '../shared/queue-protocol.js';
import {httpRequestError} from '../src/platform/request-errors.js';
import {VirtualClock} from '../tests/support/queue-virtual-clock.mjs';
mkdirSync(new URL('../docs/local/',import.meta.url),{recursive:true});
export async function faultScenario(name){
 const clock=new VirtualClock(),restore=clock.install(),crypto=globalThis.crypto,descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto');
 Object.defineProperty(globalThis,'crypto',{configurable:true,value:{randomUUID:()=>crypto.randomUUID(),getRandomValues:a=>crypto.getRandomValues(a)}});
 const queue=new LeaseQueue({now:()=>clock.now,waitingMs:120000,renewalMs:30000}),hash=createHash('sha256').update('fault-fixture').digest('hex');
 const ids=name==='waiting-pause-120s'?['A','C','D','B','E']:['A','B'];
 const rows=ids.map(id=>({id,identity:null,posts:0,permitAt:null,serverEnd:null,clientEnd:null,firstExpiredAt:null,joins:0,settled:false}));let alarm,beginCalls=0,joinCalls=0,finishCalls=0;
 const snapshot=()=>{for(const row of rows)if(row.identity){const lane=queue.lanes.get(hash),present=lane&&queue.find(lane,row.identity);if(!present&&row.serverEnd===null){row.serverEnd=clock.now;if(!row.posts)row.firstExpiredAt??=clock.now;}}};
 const arm=()=>{clock.clear(alarm);const d=[];for(const l of queue.lanes.values()){if(l.active)d.push(l.active.expires);for(const j of l.waiting)d.push(j.seen+queue.waitingMs);if(l.cooldownUntil>clock.now)d.push(l.cooldownUntil);}if(d.length)alarm=clock.timer(()=>{queue.cleanup();snapshot();arm();},Math.max(0,Math.min(...d)-clock.now)+(name==='alarm-late-4s'?4000:0));};
 const request=row=>async(url,{body}={})=>{
  const path=new URL(url).pathname;if(path==='/ping')return {ready:true,capabilities:queueCapabilities};
  if(name==='queue-503'&&path==='/join-queue'&&joinCalls++===0)throw httpRequestError({source:'queue',status:503});
  if(name==='finish-offline'&&row.id==='A'&&path==='/finish'){finishCalls++;throw new TypeError('fixture offline');}
  let state;
  try{
   if(path==='/join-queue'){row.identity=body;row.serverEnd=null;row.joins++;state=queue.join(body);}
   else if(path==='/my-turn')state=queue.turn(body);else if(path==='/begin-generation')state=queue.begin(body);else if(path==='/finish')state=queue.finish(body);else state=queue.release(body);
  }catch(error){snapshot();arm();throw httpRequestError({source:'queue',status:error.status??400,body:JSON.stringify({error:error.message})});}
  snapshot();arm();
  if(path==='/begin-generation'&&row.id==='A'&&['begin-lost-once','begin-lost-all'].includes(name)){beginCalls++;if(beginCalls===1||name==='begin-lost-all')throw new TypeError('fixture reply lost');}
  if(state.your_turn)row.permitAt??=clock.now;return state;
 };
 try{
  for(const row of rows){
   let firstSleep=true;
   runWithQueue({generationTimeoutMs:30000,url:'https://fixture.invalid',keyHash:hash,now:()=>clock.now,pollMs:name==='alarm-late-4s'?7000:5000,requestJSON:request(row),sleep:ms=>{
    if(name==='waiting-pause-120s'&&row.id==='B'&&firstSleep){firstSleep=false;return clock.sleep(120000);}return clock.sleep(ms);
   },generate:async controls=>{
    if(row.id==='A'&&name==='pre-begin-pause-30s')await clock.sleep(30000);
    if(row.id==='A'&&name==='post-send-browser-pause'){
     await controls.beforeSend();controls.assertSend();row.posts++;row.sendAt=clock.now;
     // Upstream body is complete at 5s, but this page's callbacks (including
     // its local timeout) cannot run until 60s. No claim of OS-level proof.
     await clock.sleep(60000);await controls.onResponse();return 'late-body';
    }
    const none=name==='waiting-pause-120s'?['A','C','D'].includes(row.id):row.id==='A'&&name==='alarm-late-4s';
    const prepared={source:'nai-generation',send:()=>{
     row.posts++;row.sendAt=clock.now;
     assert.equal(queue.lanes.get(hash)?.active.task,row.identity.task_id);
     return none?new Promise(()=>{}):clock.sleep(row.id==='A'?5000:15000).then(()=> 'fixture-body');
    },...(row.id==='A'&&name==='zip-hang'?{postprocess:()=>new Promise(()=>{})}:{})};
    return sendPrepared(prepared,{...controls,...(row.id==='A'&&name==='post-begin-pause-10s'?{beforeSend:async()=>{const budget=await controls.beforeSend();await clock.sleep(10000);return budget;}}:{})});
   }}).then(()=>{row.settled=true;row.clientEnd=clock.now;},error=>{row.settled=true;row.clientEnd=clock.now;row.error=error.code??error.name;});
  }
  await clock.run(()=>{snapshot();return rows.every(r=>r.serverEnd!==null&&(r.settled||name==='zip-hang'&&r.id==='A'))&&![...queue.lanes.values()].some(l=>l.active||l.waiting.length);});
 }finally{restore();Object.defineProperty(globalThis,'crypto',descriptor);}
 assert.ok(rows.every(row=>row.posts<=1),'no duplicate NAI POST');
 if(['pre-begin-pause-30s','post-begin-pause-10s','begin-lost-all'].includes(name))assert.equal(rows[0].posts,0);
 if(name==='waiting-pause-120s'){const b=rows.find(r=>r.id==='B');assert.equal(b.joins,1);assert.equal(b.posts,0);assert.equal(b.permitAt,null);assert.equal(b.firstExpiredAt,120000);}
 if(name==='alarm-late-4s'){assert.equal(rows[0].serverEnd,54000);assert.equal(rows[1].permitAt,56000);}
 return {name,totalMs:clock.now,beginCalls,finishCalls,rows:rows.map(({identity,...row})=>row)};
}
export async function runFaultSuite(){const result=[];for(const name of ['waiting-pause-120s','pre-begin-pause-30s','begin-lost-once','begin-lost-all','post-begin-pause-10s','post-send-browser-pause','zip-hang','finish-offline','queue-503','alarm-late-4s'])result.push(await faultScenario(name));return result;}
if(process.argv[1]===fileURLToPath(import.meta.url)){const result=await runFaultSuite();writeFileSync(new URL('../docs/local/queue-phase5-fault-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}
