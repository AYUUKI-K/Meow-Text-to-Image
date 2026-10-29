// Actual production-policy retry-wait alarm; no polling/cleanup during the wait.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),runtime=await import(process.env.MIAO_MINIFLARE?pathToFileURL(process.env.MIAO_MINIFLARE).href:'miniflare');
const entry=`import worker,{MiaoKeyQueue as Base} from '../cloudflare/worker.js';export default worker;export class MiaoKeyQueue extends Base{constructor(ctx,env){super(ctx,env);this.testContext=ctx;}async fetch(r){if(new URL(r.url).pathname==='/__snapshot')return this.testContext.blockConcurrencyWhile(async()=>Response.json([...this.queue.lanes]));return super.fetch(r);}}`;
const modules=[{type:'ESModule',path:resolve(root,'tests/__retry-wall-entry.mjs'),contents:entry},...['cloudflare/worker.js','queue-service/queue.mjs','queue-service/lease-policy.mjs','queue-protocol.js'].map(path=>({type:'ESModule',path:resolve(root,path),contents:readFileSync(resolve(root,path),'utf8')}))];
const mf=new runtime.Miniflare({name:'phase6-wall-runtime',modulesRoot:root,modules,compatibilityDate:'2026-10-23',compatibilityFlags:['nodejs_compat'],durableObjects:{MIAO_KEY_QUEUE:{className:'MiaoKeyQueue',useSQLite:true}}});
const hash='6'.repeat(64),who=id=>({key_hash:hash,user_id:'wall-retry-'+id,task_id:'wall-retry-'+id,protocol:2,retry_protocol:1});
const call=async(path,body)=>{const r=await mf.dispatchFetch('https://queue.test'+path,{method:'POST',body:JSON.stringify(body)});assert.equal(r.status,200);return r.json();};
try{
 const a=who('A'),b=who('B'),first=await call('/join-queue',a);await call('/join-queue',b);const permit=await call('/begin-generation',{...a,lock_token:first.lock_token,attempt_no:0,generation_timeout_ms:30000});
 const start=performance.now();await call('/retry-generation',{...a,lock_token:first.lock_token,attempt_no:0,attempt_id:permit.attempt_id,rejection_status:429});
 await new Promise(resolve=>setTimeout(resolve,20300));
 const ns=await mf.getDurableObjectNamespace('MIAO_KEY_QUEUE'),stub=ns.get(ns.idFromName(hash));
 let snapshot;
 // An earlier preparing alarm can wake just before retry expiry and re-arm
 // at the existing 1s minimum. Inspect-only samples never run queue cleanup.
 do{snapshot=await (await stub.fetch('https://test.internal/__snapshot')).json();if(snapshot[0][1].active.task===b.task_id)break;await new Promise(resolve=>setTimeout(resolve,500));}while(performance.now()-start<30000);
 assert.equal(snapshot[0][1].active.task,b.task_id);assert.equal(snapshot[0][1].active.pending,true);
 const result={compatibilityDate:'2026-10-23',kind:'actual-workerd-retry-wait-alarm',retryWaitMs:10000,pickupGraceMs:10000,observedByMs:performance.now()-start,alarmRanBeforeQuery:true,exactAlarmLatencyUnmeasured:true};
 const next=await call('/my-turn',b);await call('/complete',{...b,lock_token:next.lock_token});writeFileSync(new URL('../docs/queue-phase6-wall-runtime.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await mf.dispose();}
