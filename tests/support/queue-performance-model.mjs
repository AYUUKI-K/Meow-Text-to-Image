import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {runWithQueue as currentRun} from '../../src/queue/cloud-queue.js';
import {sendPrepared,prepareGeneration} from '../../src/generation/generation-lifecycle.js';
import {withGenerationTimeout} from '../../src/generation/generation-timeout.js';
import {waitForGeneration} from '../../src/generation/generation-delay.js';
import {LeaseQueue} from '../../queue-service/queue.mjs';
import {queueCapabilities} from '../../shared/queue-protocol.js';
import {httpRequestError} from '../../src/platform/request-errors.js';
import {VirtualClock,seededRandom,distribution} from './queue-virtual-clock.mjs';

// Full runWithQueue, real beforeSend/assertSend/onResponse and timeout code;
// only RPC/network/upstream time is simulated. Persistence is tested separately.
export async function simulateQueue({count=10,keys=1,keyFor=i=>i%keys,durationFor,version='new',historical,scenario='15s',seed=20261029,budgetMs=30000,alarmDelayMs=0,pollMs,preparingDelayMs,clients,legacyMode='normal',retry=false}={}){
 const clock=new VirtualClock(),restore=clock.install(),cryptoDescriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto'),crypto=globalThis.crypto;
 // Use the production secure-random SHA fallback to avoid OS crypto thread
 // completion affecting virtual ordering; hashes/tokens are never exported.
 Object.defineProperty(globalThis,'crypto',{configurable:true,value:{randomUUID:()=>crypto.randomUUID(),getRandomValues:array=>crypto.getRandomValues(array)}});
 const Queue=historical?.Queue??LeaseQueue,run=historical?.run??currentRun,errorFor=historical?.httpError??httpRequestError;
 const queue=new Queue({now:()=>clock.now,waitingMs:120000,renewalMs:30000});
 const jobs=Array.from({length:count},(_,i)=>{
  const random=seededRandom(seed+i*997),mix=[5000,15000,29000,40000,null];
  const duration=durationFor?durationFor(i):scenario==='mixed'?mix[Math.floor(random()*mix.length)]:({'5s':5000,'15s':15000,'29s':29000,'40s':40000,'none':null,'80s':80000,'ambiguous500':40000}[scenario]??null);
  return {i,key:keyFor(i),modern:clients?clients(i):version==='new',duration,delay:preparingDelayMs??500+Math.floor(random()*2501),permitAt:null,sendAt:null,releasedAt:null,clientEnd:null,posts:0,accepted:0,error:null,identity:null,settled:false};
 });
 const hashes=Array.from({length:keys},(_,i)=>createHash('sha256').update('sim-fixture-'+i).digest('hex'));
 const identities=new Map(),busy=new Map();let alarm,requests=0,rejected429=0,overlapAttempts=0,joinSequence=0;
 const totals={idleMs:0,demandIdleMs:0,expiryLagMs:0,preSendMs:0,requiredDelayMs:0,unclaimedMs:0,protectionAfterUpstreamMs:0,blockedPreparationMs:0,cooldownMs:0};
 const accounted=new Set();
 const snapshot=()=>{
  const present=new Set();for(const lane of queue.lanes.values()){if(lane.active)present.add(lane.active.task);for(const j of lane.waiting)present.add(j.task);}
  for(const [id,job] of identities)if(!present.has(id)&&job.releasedAt===null){job.releasedAt=clock.now;accounted.add(job.i);}
 };
 const arm=()=>{
  clock.clear(alarm);const deadlines=[];
  for(const lane of queue.lanes.values()){
   if(lane.active)deadlines.push(lane.active.expires);
   for(const job of lane.waiting)deadlines.push(job.seen+queue.waitingMs);
   if(lane.cooldownUntil>clock.now)deadlines.push(lane.cooldownUntil);
  }
  if(deadlines.length)alarm=clock.timer(()=>{queue.cleanup();snapshot();arm();},Math.max(0,Math.min(...deadlines)-clock.now)+alarmDelayMs);
 };
 const requestFor=job=>async(url,{body}={})=>{
  requests++;const path=new URL(url).pathname;let state;
  if(path==='/ping')return {ready:true,capabilities:queueCapabilities};
  if(path==='/join-queue'){job.joinOrder??=joinSequence++;if(job.identity&&job.identity.task_id!==body.task_id){identities.delete(job.identity.task_id);job.releasedAt=null;}job.identity=body;identities.set(body.task_id,job);state=queue.join(body);}
  else if(path==='/my-turn')state=queue.turn(body);
  else if(path==='/begin-generation')state=queue.begin(body);
  else if(path==='/finish')state=queue.finish(body);
  else state=queue.release(body);
  snapshot();arm();
  if(state.your_turn&&job.permitAt===null)job.permitAt=clock.now;
  return state;
 };
 const integrate=(from,to)=>{
  const dt=to-from;if(dt<=0)return;
  for(let k=0;k<keys;k++){
   const lane=queue.lanes.get(hashes[k]);
   if(lane?.active){
    const job=identities.get(lane.active.task);if(!job)continue;totals.expiryLagMs+=Math.max(0,to-Math.max(from,lane.active.expires));
    if(lane.active.pending){totals.unclaimedMs+=dt;totals.preSendMs+=dt;}
    else if(job.sendAt===null){totals.preSendMs+=dt;if(scenario==='prep-hang'||scenario==='prep-lost')totals.blockedPreparationMs+=dt;else totals.requiredDelayMs+=dt;}
    else {const until=busy.get(k)?.until??from;totals.protectionAfterUpstreamMs+=Math.max(0,to-Math.max(from,until));}
   }else if(lane?.cooldownUntil>from)totals.cooldownMs+=Math.min(dt,lane.cooldownUntil-from);
   else{totals.idleMs+=dt;if(lane?.waiting.length)totals.demandIdleMs+=dt;}
  }
 };
 const posted=job=>{
  if(job.modern){const holder=queue.lanes.get(hashes[job.key])?.active;assert.equal(holder?.task,job.identity.task_id);assert.equal(holder?.phase,'possibly-sent');assert.ok(clock.now<holder.sendNotAfter);}
  job.posts++;job.sendAt??=clock.now;
  const prior=busy.get(job.key);
  if(prior?.until>clock.now){rejected429++;overlapAttempts++;throw errorFor({source:'nai-generation',status:429});}
  job.accepted++;const duration=scenario==='ambiguous500'&&job.accepted>1?5000:job.duration??40000;
  busy.set(job.key,{until:clock.now+duration,job:job.i});
  if(scenario==='ambiguous500'&&job.accepted===1)throw errorFor({source:'nai-generation',status:500});
  if(job.duration===null)return new Promise(()=>{});
  return clock.sleep(duration).then(()=> 'mock-image-bytes');
 };
 let simulationError;
 try{
  jobs.forEach(job=>{
   const execute=async()=>{
    if(job.modern&&scenario==='prep-hang'){
     await prepareGeneration(()=>new Promise(()=>{}),{now:()=>clock.now});return;
    }
    const taskRun=()=>run({url:'https://fixture.invalid',keyHash:hashes[job.key],generationTimeoutMs:budgetMs,...(historical?{}:{twoPhase:job.modern}),requestJSON:requestFor(job),now:()=>clock.now,sleep:clock.sleep,...(pollMs!==undefined?{pollMs}:{}),generate:async controls=>{
     if(scenario==='prep-hang'||scenario==='prep-lost'){
      if(legacyMode==='heartbeat')return new Promise(()=>{});
      // Simulated full browser loss: heartbeats are stopped for this identity.
      return clock.sleep(1000000000);
     }
     await waitForGeneration({random:()=>0,sleep:()=>clock.sleep(job.delay)});
     if(job.modern)return sendPrepared({source:'nai-generation',send:()=>posted(job)},{...controls,timeoutMs:budgetMs});
     if(version==='v2.4.3'){
      const remaining=await controls?.beforeSend?.();return withGenerationTimeout(()=>posted(job),{timeoutMs:remaining??budgetMs});
     }
     if(job.duration===null){
      // Common injected transport loss at 30s. v2.4.0 had no local 30s timer.
      posted(job);await clock.sleep(budgetMs);throw Object.assign(Error('fixture network lost'),{name:'TypeError',source:'nai-generation'});
     }
     return posted(job);
    }});
    if(retry&&historical?.retry)return historical.retry({enabled:true,run:taskRun,sleep:clock.sleep});
    return taskRun();
   };
   execute().then(()=>{job.clientEnd=clock.now;job.settled=true;},error=>{job.clientEnd=clock.now;job.settled=true;job.error=error.code??error.name;if(!job.identity){job.releasedAt=clock.now;accounted.add(job.i);}});
  });
  if(scenario==='prep-lost'){
   // Suppress only the real client heartbeat callbacks; the server alarm stays.
   // Waiting polls remain active; this scenario is used with one lost holder.
   const interval=globalThis.setInterval;globalThis.setInterval=(fn,ms,...args)=>interval(()=>{},ms,...args);
  }
  await clock.run(()=>{
   snapshot();return jobs.every(j=>j.releasedAt!==null&&(j.settled||['prep-hang','prep-lost'].includes(scenario)))&&![...queue.lanes.values()].some(l=>l.active||l.waiting.length||l.cooldownUntil>clock.now);
  },{onAdvance:integrate});
 }catch(error){simulationError=error;}
 finally{restore();Object.defineProperty(globalThis,'crypto',cryptoDescriptor);}
 if(simulationError)throw simulationError;
 const waits=jobs.map(j=>j.permitAt),ends=jobs.map(j=>j.settled?Math.max(j.releasedAt??0,j.clientEnd??0):null);
 const fifo=[...Array(keys)].every((_,key)=>{const group=jobs.filter(j=>j.key===key&&j.permitAt!==null).sort((a,b)=>a.joinOrder-b.joinOrder);return group.every((job,i)=>i===0||job.permitAt>=group[i-1].permitAt);});
 assert.equal(fifo,true,'FIFO order');assert.ok(jobs.every(job=>job.modern?job.posts<=1:true),'new task duplicate POST');
 return {count,keys,version,scenario,seed,budgetMs,alarmDelayMs,waiting:distribution(waits),final:distribution(ends),serverFinal:distribution(jobs.map(j=>j.releasedAt)),localUnfinished:jobs.filter(j=>!j.settled).length,permitViolations:0,first:waits[0],fifth:waits[4]??null,tenth:waits[9]??null,last:waits.at(-1),totalMs:clock.now,
  ...totals,invalidOccupancyMs:totals.blockedPreparationMs+totals.unclaimedMs+totals.protectionAfterUpstreamMs,
  requests,posts:jobs.reduce((n,j)=>n+j.posts,0),duplicatePosts:jobs.reduce((n,j)=>n+Math.max(0,j.posts-1),0),duplicateAccepted:jobs.reduce((n,j)=>n+Math.max(0,j.accepted-1),0),rejected429,overlapAttempts,fifo,
  jobs:jobs.map(({i,key,duration,delay,permitAt,sendAt,releasedAt,clientEnd,posts,accepted,error})=>({i,key,duration,delay,permitAt,sendAt,releasedAt,clientEnd,posts,accepted,error}))};
}
