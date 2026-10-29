// Local actual 20-second alarm, unchanged production lease policy and date.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),runtime=await import(process.env.MIAO_MINIFLARE?pathToFileURL(process.env.MIAO_MINIFLARE).href:'miniflare');
const entry=`import worker,{MiaoKeyQueue as Base} from '../cloudflare/worker.js';export default worker;export class MiaoKeyQueue extends Base{constructor(ctx,env){super(ctx,env);this.testContext=ctx;}async fetch(request){if(new URL(request.url).pathname==='/__snapshot')return this.testContext.blockConcurrencyWhile(async()=>Response.json([...this.queue.lanes]));return super.fetch(request);}}`;
const modules=[{type:'ESModule',path:resolve(root,'tests/__wall-entry.mjs'),contents:entry},...['cloudflare/worker.js','queue-service/queue.mjs','queue-service/lease-policy.mjs','queue-protocol.js'].map(path=>({type:'ESModule',path:resolve(root,path),contents:readFileSync(resolve(root,path),'utf8')}))];
const mf=new runtime.Miniflare({name:'phase5-wall-runtime',modulesRoot:root,modules,compatibilityDate:'2026-10-23',compatibilityFlags:['nodejs_compat'],durableObjects:{MIAO_KEY_QUEUE:{className:'MiaoKeyQueue',useSQLite:true}}});
const hash='b'.repeat(64),who=id=>({key_hash:hash,user_id:'wall-user-'+id,task_id:'wall-task-'+id,protocol:2});
const call=async(path,body)=>{const res=await mf.dispatchFetch('https://fixture.invalid'+path,{method:'POST',body:JSON.stringify(body)});assert.equal(res.status,200);return res.json();};
try{
 const a=who('A'),b=who('B'),start=performance.now();await call('/join-queue',a);await call('/join-queue',b);
 // No request can run queue cleanup during this real wait. Inspect-only entry
 // reads memory without calling turn/stats, proving the platform alarm fired.
 await new Promise(resolve=>setTimeout(resolve,20200));
 const ns=await mf.getDurableObjectNamespace('MIAO_KEY_QUEUE'),snapshot=await (await ns.get(ns.idFromName(hash)).fetch('https://test.internal/__snapshot')).json();
 assert.equal(snapshot[0][1].active.task,b.task_id);assert.equal(snapshot[0][1].active.pending,true);
 const next=await call('/my-turn',b);await call('/complete',{...b,lock_token:next.lock_token});
 const result={compatibilityDate:'2026-10-23',kind:'actual-workerd-alarm',prepareMs:20000,observedByMs:performance.now()-start,alarmRanBeforeQuery:true,exactAlarmLatencyUnmeasured:true};writeFileSync(new URL('../docs/queue-phase5-wall-runtime.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await mf.dispose();}
