import assert from 'node:assert/strict';
import {LeaseQueue} from '../../queue-service/queue.mjs';
import {runWithQueue} from '../../src/queue/cloud-queue.js';
import {sendPrepared} from '../../src/generation/generation-lifecycle.js';
import {httpRequestError} from '../../src/platform/request-errors.js';
import {queueCapabilities} from '../../shared/queue-protocol.js';
import {VirtualClock,distribution} from './queue-virtual-clock.mjs';

export async function simulateRetries({count=6,keys=1,scenario='all429',mixed=false}={}){
 const clock=new VirtualClock(),restore=clock.install(),descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto'),crypto=globalThis.crypto;
 Object.defineProperty(globalThis,'crypto',{configurable:true,value:{randomUUID:()=>crypto.randomUUID(),getRandomValues:a=>crypto.getRandomValues(a)}});
 const q=new LeaseQueue({now:()=>clock.now}),jobs=Array.from({length:count},(_,i)=>({i,key:i%keys,legacy:mixed&&i%2===0,posts:[],authorized:[],attemptIds:[],identity:null,holderAt:null,releasedAt:null,permitAt:null,end:null,success:false,error:null})),byTask=new Map(),inFlight=new Map();let alarm,sequence=0,peak=0;
 const hashes=Array.from({length:keys},(_,i)=>i.toString(16).padStart(64,'0'));
 const observe=()=>{
  const present=new Set();for(const lane of q.lanes.values()){
   if(lane.active){present.add(lane.active.task);const job=byTask.get(lane.active.task);if(job)job.holderAt??=clock.now;}
   for(const w of lane.waiting)present.add(w.task);
  }
  for(const [id,job] of byTask)if(!present.has(id))job.releasedAt??=clock.now;
 };
 const arm=()=>{
  clock.clear(alarm);const deadlines=[];for(const lane of q.lanes.values()){if(lane.active)deadlines.push(lane.active.expires);for(const job of lane.waiting)deadlines.push(job.seen+q.waitingMs);if(lane.cooldownUntil>clock.now)deadlines.push(lane.cooldownUntil);}
  if(deadlines.length)alarm=clock.timer(()=>{q.cleanup();observe();arm();},Math.max(0,Math.min(...deadlines)-clock.now));
 };
 const rpc=job=>async(url,{body}={})=>{
  const op=new URL(url).pathname;let state;
  try{
   if(op==='/ping')return {ready:true,capabilities:queueCapabilities};
   if(op==='/join-queue'){job.identity=body;byTask.set(body.task_id,job);job.order??=sequence++;state=q.join(body);}
   else if(op==='/my-turn')state=q.turn(body);else if(op==='/begin-generation')state=q.begin(body);else if(op==='/retry-generation')state=q.retry(body);else if(op==='/finish')state=q.finish(body);else state=q.release(body);
   if(state.your_turn)job.permitAt??=clock.now;
   if(op==='/begin-generation'){job.authorized.push(clock.now);job.attemptIds.push(state.attempt_id);}
   return state;
  }finally{observe();arm();}
 };
 const send=async job=>{
  const holder=q.lanes.get(hashes[job.key]).active;assert.equal(holder.task,job.identity.task_id);assert.equal(holder.phase,'possibly-sent');assert.ok(clock.now<holder.sendNotAfter);assert.equal(inFlight.get(job.key)??0,0);
  inFlight.set(job.key,1);peak=Math.max(peak,[...inFlight.values()].reduce((a,b)=>a+b,0));job.posts.push(clock.now);
  const rejected=scenario==='all429'||scenario==='external'&&job.key===0||scenario==='partial'&&job.i%2===1&&job.posts.length<4;
  try{await clock.sleep(rejected?100:2000);if(rejected)throw httpRequestError({source:'nai-generation',status:429});return 'png';}finally{inFlight.set(job.key,0);}
 };
 const legacy=async job=>{
  const call=rpc(job),identity={key_hash:hashes[job.key],user_id:'model-old-user-'+job.i,task_id:'model-old-task-'+job.i,protocol:2};let state=await call('https://queue.test/join-queue',{body:identity});
  while(!state.your_turn){await clock.sleep(5000);state=await call('https://queue.test/my-turn',{body:identity});}
  const held={...identity,lock_token:state.lock_token};await call('https://queue.test/begin-generation',{body:{...held,generation_timeout_ms:30000}});
  try{const result=await send(job);await call('https://queue.test/finish',{body:{...held,outcome:'success'}});return result;}
  catch(error){await call('https://queue.test/finish',{body:{...held,outcome:'rate-limited'}});throw error;}
 };
 try{
  for(const job of jobs){
   const run=job.legacy?legacy(job):runWithQueue({url:'https://queue.test',keyHash:hashes[job.key],autoRetry:true,requestJSON:rpc(job),now:()=>clock.now,sleep:clock.sleep,generate:controls=>sendPrepared({source:'nai-generation',send:()=>send(job)},controls)});
   run.then(()=>{job.success=true;job.end=clock.now;},error=>{job.error=error.code??error.name;job.end=clock.now;});
  }
  await clock.run(()=>jobs.every(j=>j.end!==null&&j.releasedAt!==null)&&![...q.lanes.values()].some(l=>l.cooldownUntil>clock.now));
  for(let k=0;k<keys;k++){const ordered=jobs.filter(j=>j.key===k).sort((a,b)=>a.order-b.order);assert.ok(ordered.every((j,i)=>i===0||j.permitAt>=ordered[i-1].permitAt));}
  for(const job of jobs){assert.ok(job.posts.length<=(job.legacy?1:4));for(let i=1;i<job.posts.length;i++)assert.ok(job.posts[i]-job.posts[i-1]>=10000);if(!job.legacy)assert.equal(new Set(job.attemptIds).size,job.posts.length);}
  return {count,keys,scenario,mode:mixed?'mixed-old-v2-cooldown':'all-new',mockRefusalMs:100,mockSuccessMs:2000,tailWaiting:distribution(jobs.map(j=>j.permitAt)),hold:distribution(jobs.map(j=>j.releasedAt-j.holderAt)),longestFailureMs:Math.max(0,...jobs.filter(j=>!j.success).map(j=>j.end)),totalMs:clock.now,successes:jobs.filter(j=>j.success).length,failures:jobs.filter(j=>!j.success).length,duplicateAccepted:0,permitViolations:0,fifo:true,peakParallel:peak,jobs:jobs.map(({identity,attemptIds,holderAt,...job})=>({...job,holdMs:job.releasedAt-holderAt,retries:job.posts.length-1,intervals:job.posts.slice(1).map((at,i)=>at-job.posts[i])}))};
 }finally{restore();Object.defineProperty(globalThis,'crypto',descriptor);}
}
