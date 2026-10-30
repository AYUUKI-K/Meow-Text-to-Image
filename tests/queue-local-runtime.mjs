// Actual Node loopback HTTP + event-loop test, with mocked image work only.
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createQueueServer} from '../queue-service/service.mjs';
import {LeaseQueue} from '../queue-service/queue.mjs';
import {runWithQueue} from '../src/queue/cloud-queue.js';
import {sendPrepared} from '../src/generation/generation-lifecycle.js';
import {distribution} from './support/queue-virtual-clock.mjs';
mkdirSync(new URL('../docs/local/',import.meta.url),{recursive:true});
const queue=new LeaseQueue(),server=createQueueServer({queue}),samples=[],faults={join503:0,beginLost:0,finishLost:0},joinOrder=new Map(),taskIndex=new Map(),seen=new Set();
const originalJoin=queue.join.bind(queue);queue.join=body=>{if(!seen.has(body.task_id)){seen.add(body.task_id);joinOrder.set(body.task_id,seen.size);}return originalJoin(body);};
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port;
const start=performance.now(),posts=[],latencies=[],permits=[],active=new Map();let peak=0,parallel=0;
try{
 const jobs=Array.from({length:20},(_,i)=>{
  const hash=createHash('sha256').update('local-fixture-'+i%4).digest('hex');let taskId;
  return runWithQueue({url,keyHash:hash,pollMs:15,retryDelays:[5,10],fetchImpl:async(target,options={})=>{
   const path=new URL(target).pathname,body=options.body?JSON.parse(options.body):null;if(body){taskId=body.task_id;taskIndex.set(taskId,i);}
   const before=performance.now(),response=await fetch(target,options);await response.clone().arrayBuffer();latencies.push(performance.now()-before);
   if(path==='/join-queue'&&faults.join503===0){faults.join503++;return Response.json({error:'fixture proxy 503'},{status:503});}
   if(path==='/begin-generation'&&faults.beginLost===0){faults.beginLost++;throw new TypeError('fixture begin reply lost');}
   if(path==='/finish'&&faults.finishLost===0){faults.finishLost++;throw new TypeError('fixture finish reply lost');}
   return response;
  },generate:controls=>{
   permits.push({i,taskId,at:performance.now()-start});
   return sendPrepared({source:'nai-generation',send:async()=>{
    assert.equal(active.get(hash)||0,0);active.set(hash,1);parallel++;peak=Math.max(peak,parallel);posts.push(i);
    await new Promise(resolve=>setTimeout(resolve,20));parallel--;active.set(hash,0);return 'fixture-bytes';
   }},controls);
  }}).then(()=>samples.push({i,endMs:performance.now()-start}));
 });
 await Promise.all(jobs);assert.equal(posts.length,20);assert.equal(new Set(posts).size,20);assert.ok(peak>1);assert.equal(queue.stats().active,0);
 for(let k=0;k<4;k++){
  const group=permits.filter(p=>p.i%4===k);assert.ok(group.every((p,i)=>i===0||joinOrder.get(p.taskId)>joinOrder.get(group[i-1].taskId)));
 }
 const result={kind:'real-loopback-event-loop',count:20,keys:4,mockImageMs:20,testPollMs:15,testRetryMs:[5,10],productionTimeoutsUnchanged:true,elapsedMs:performance.now()-start,controlLatency:distribution(latencies),waiting:distribution(permits.map(p=>p.at)),end:distribution(samples.map(p=>p.endMs)),posts:posts.length,duplicatePosts:0,peak, faults};
 writeFileSync(new URL('../docs/local/queue-phase5-local-runtime.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
