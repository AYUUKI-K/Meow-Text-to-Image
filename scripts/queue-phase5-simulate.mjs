// Offline only: no fetch/network. Historical sources are read from local git,
// copied to a fresh OS temp directory, never checked out over the worktree.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {simulateQueue} from '../tests/support/queue-performance-model.mjs';
import {LeaseQueue} from '../queue-service/queue.mjs';
import {simulateExtreme} from '../tests/support/queue-extremes.mjs';
import {distribution} from '../tests/support/queue-virtual-clock.mjs';
mkdirSync(new URL('../docs/local/',import.meta.url),{recursive:true});
const root=fileURLToPath(new URL('../',import.meta.url));
const revisions={'v2.4.0':'0c60c57','v2.4.3':'80fa8ed0f3be9c6daea612e3d6f67d64aa708bd7'};
async function historical(version){
 const dir=mkdtempSync(resolve(tmpdir(),'mewo-phase5-history-'));
 for(const path of ['cloud-queue.js','queue-network.js','browser-crypto.js','request-errors.js','generation-retry.js'])writeFileSync(resolve(dir,path),execFileSync('git',['show',revisions[version]+':'+path],{cwd:root}));
 writeFileSync(resolve(dir,'package.json'),'{"type":"module"}');
 writeFileSync(resolve(dir,'queue.mjs'),execFileSync('git',['show',revisions[version]+':queue-service/queue.mjs'],{cwd:root}));
 const [{LeaseQueue:Queue},{runWithQueue:run},{retryGeneration:retry},{httpRequestError:httpError}]=await Promise.all(['queue.mjs','cloud-queue.js','generation-retry.js','request-errors.js'].map(path=>import(pathToFileURL(resolve(dir,path)))));
 return {Queue,run,retry,httpError};
}
const hash='f'.repeat(64),who=i=>({key_hash:hash,user_id:'worst-user-'+i,task_id:'worst-task-'+i,protocol:2});
// This intentionally excludes polling latency to verify the server's logical
// supremum. Confirmed preparation is 19.999s because begin at 20s is rejected.
function logicalWorst(ahead,budgetMs){
 let now=0;const q=new LeaseQueue({now:()=>now}),jobs=Array.from({length:ahead+1},(_,i)=>who(i));jobs.forEach(j=>q.join(j));
 for(let i=0;i<ahead;i++){
  const state=q.turn(jobs[i]);now+=19999;
  q.begin({...jobs[i],lock_token:state.lock_token,generation_timeout_ms:budgetMs});const until=q.lanes.get(hash).active.expires;
  while(now+60000<until){now+=60000;for(let j=i+1;j<jobs.length;j++)q.turn(jobs[j]);}
  now=until;for(let j=i+1;j<jobs.length;j++)q.turn(jobs[j]);
 }
 assert.equal(q.turn(jobs.at(-1)).your_turn,true);
 assert.equal(now,ahead*(19999+budgetMs+20000));return {ahead,budgetMs,theoreticalMs:ahead*(20000+budgetMs+20000),simulatedMs:now};
}
export async function runPerformanceSuite(){
 const matrix=[],multi=[],versions=[],theory=[],legacyMix=[],exceptions=[],budgetSensitivity=[];
 for(const count of [2,5,10,20,50,65])for(const scenario of ['5s','15s','29s','40s','none','mixed'])matrix.push(await simulateQueue({count,scenario}));
 for(const x of matrix){const service=3000+(x.scenario==='5s'?5000:x.scenario==='15s'?15000:x.scenario==='29s'?29000:50000);assert.ok(x.waiting.max<=(x.count-1)*(service+15000));}
 for(const [count,keys] of [[10,1],[50,1],[50,5],[100,10],[160,20]])multi.push(await simulateQueue({count,keys,scenario:'15s'}));
 // One hot lane plus four independent sparse lanes; same total 54.
 const crowded=await simulateQueue({count:54,keys:5,keyFor:i=>i<50?0:i-49,scenario:'15s'});
 multi.push({label:'hot50+sparse4',...crowded,hot:distribution(crowded.jobs.filter(j=>j.key===0).map(j=>j.permitAt)),sparse:distribution(crowded.jobs.filter(j=>j.key!==0).map(j=>j.permitAt))});
 const cooled=await simulateQueue({count:54,keys:5,keyFor:i=>i<50?0:i-49,durationFor:i=>i<50?80000:15000,scenario:'hot-cooldown'});assert.ok(cooled.rejected429>0);assert.ok(cooled.jobs.filter(j=>j.key!==0).every(j=>j.permitAt===0&&j.accepted===1));multi.push({label:'hot-cooldown',...cooled});
 for(const budget of [30000,180000])for(const ahead of [1,5,10,20,50,64])theory.push(logicalWorst(ahead,budget));
 for(const [label,old] of [['all-new',0],['half-old',32],['one-old',1],['all-old',64]])legacyMix.push({label,...simulateExtreme({ahead:64,oldCount:old}),noHeartbeat:simulateExtreme({ahead:64,oldCount:old,legacyHeartbeat:false})});
 for(const version of ['v2.4.0','v2.4.3','new']){
  const history=version==='new'?undefined:await historical(version);
  for(const scenario of ['15s','40s','none','prep-hang','prep-lost','80s','ambiguous500'])versions.push(await simulateQueue({count:scenario==='ambiguous500'?1:10,version,historical:history,scenario,legacyMode:scenario==='prep-hang'?'heartbeat':'normal',retry:scenario==='ambiguous500'}));
 }
 // Same deployed service, mixed clients, ordinary 15s image result.
 for(const [label,clients] of [['all-new',()=>true],['all-legacy',()=>false],['half-legacy',i=>i%2===0],['one-legacy',i=>i!==0]])exceptions.push({label,...await simulateQueue({count:20,scenario:'15s',clients})});
 for(const budgetMs of [30000,60000,180000])budgetSensitivity.push(await simulateQueue({count:10,scenario:'40s',budgetMs}));
 const q=new LeaseQueue({now:()=>0});for(let i=0;i<65;i++)q.join(who(i));let capacityStatus;
 try{q.join(who(65));}catch(error){capacityStatus=error.status;}assert.equal(capacityStatus,429);
 const extremes=[];for(const ahead of [1,5,10,20,50,64])for(const kind of ['unknown','preparing-lost','unclaimed','rate-limit','handoff-delay'])extremes.push(simulateExtreme({ahead,kind}));
 for(const ahead of [1,5,10,20,50,64])extremes.push(simulateExtreme({ahead,kind:'rate-limit',retryAfterMs:120000}));
 return {schema:1,extremes,budgetSensitivity,seed:20261029,policy:{preparingMs:20000,localMs:30000,graceMs:20000,sendWindowMs:5000,waitingMs:120000,renewalMs:30000},matrix,multi,theory,legacyMix,versions,exceptions,capacity:{accepted:65,rejectedTask:66,status:capacityStatus}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const output=resolve(root,process.argv[2]||'docs/local/queue-phase5-results.json');const result=await runPerformanceSuite();writeFileSync(output,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({matrix:result.matrix.length,multi:result.multi.length,theory:result.theory.length,versions:result.versions.length,capacity:result.capacity,output}));
}
