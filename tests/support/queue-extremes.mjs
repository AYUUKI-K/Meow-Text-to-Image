import assert from 'node:assert/strict';
import {LeaseQueue} from '../../queue-service/queue.mjs';
export function simulateExtreme({ahead=64,budgetMs=30000,kind='unknown',oldCount=0,retryAfterMs,legacyHeartbeat=true}={}){
 let now=0;const q=new LeaseQueue({now:()=>now,waitingMs:120000,renewalMs:30000}),hash='d'.repeat(64);
 const jobs=Array.from({length:ahead+1},(_,i)=>({key_hash:hash,user_id:'extreme-user-'+i,task_id:'extreme-task-'+i,...(i<oldCount?{}:{protocol:2})}));
 const refresh=()=>{for(const job of [...(q.lanes.get(hash)?.waiting??[])])q.turn(jobs.find(j=>j.task_id===job.task));};
 const advance=(target,renew)=>{while(now+30000<target){now+=30000;refresh();if(renew)q.turn(renew);}now=target;q.cleanup();refresh();};
 if(kind==='unclaimed'){
  const dummy={key_hash:hash,user_id:'extreme-dummy-user',task_id:'extreme-dummy-task'},held=q.join(dummy);jobs.slice(0,-1).forEach(j=>q.join(j));q.release({...dummy,lock_token:held.lock_token});q.join(jobs.at(-1));
 }else jobs.forEach(j=>q.join(j));
 const cooldowns=[];
 for(let i=0;i<ahead;i++){
  if(kind==='unclaimed'){advance(q.lanes.get(hash).active.expires);continue;}
  if(kind==='handoff-delay'&&i>0)advance(now+44999);
  const state=q.turn(jobs[i]);
  if(i<oldCount){advance(now+(legacyHeartbeat?600000:240000),legacyHeartbeat?jobs[i]:undefined);continue;}
  if(kind==='preparing-lost'){advance(now+20000);continue;}
  now+=19999;q.begin({...jobs[i],lock_token:state.lock_token,generation_timeout_ms:budgetMs});
  if(kind==='rate-limit'){
   advance(now+budgetMs-1);const result=q.finish({...jobs[i],lock_token:state.lock_token,outcome:'rate-limited',...(retryAfterMs!==undefined?{retry_after_ms:retryAfterMs}:{})});cooldowns.push(result.cooldown_remaining_ms);advance(now+result.cooldown_remaining_ms);
  }else advance(q.lanes.get(hash).active.expires);
 }
 assert.equal(q.turn(jobs.at(-1)).your_turn,true);
 const old=oldCount*(legacyHeartbeat?600000:240000),modern=ahead-oldCount;
 const theoreticalMs=kind==='preparing-lost'?ahead*20000:kind==='unclaimed'?ahead*45000:kind==='rate-limit'?ahead*(20000+budgetMs)+cooldowns.reduce((a,b)=>a+b,0):old+modern*(20000+budgetMs+20000)+(kind==='handoff-delay'?Math.max(0,ahead-1)*45000:0);
 assert.ok(now<=theoreticalMs);return {ahead,budgetMs,kind,oldCount,theoreticalMs,simulatedMs:now,cooldowns};
}
