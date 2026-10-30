// Real local workerd/SQLite, production date; no production account or NAI.
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {runWithQueue} from '../src/queue/cloud-queue.js';
import {sendPrepared} from '../src/generation/generation-lifecycle.js';
import {httpRequestError} from '../src/platform/request-errors.js';
import {createQueueTransport} from '../src/queue/queue-network.js';
mkdirSync(new URL('../docs/local/',import.meta.url),{recursive:true});
const root=fileURLToPath(new URL('../',import.meta.url)),runtime=await import(process.env.MIAO_MINIFLARE?pathToFileURL(process.env.MIAO_MINIFLARE).href:'miniflare'),base=Date.now()+3600000;
const wrapper=`import worker,{MiaoKeyQueue as Base} from '../cloudflare/worker.js';export default worker;
export class MiaoKeyQueue extends Base{constructor(ctx,env){let fail=false;const storage=new Proxy(ctx.storage,{get(target,key){if(key==='put')return (...args)=>{if(fail){fail=false;throw Error('fixture commit failure');}return target.put(...args);};const v=Reflect.get(target,key,target);return typeof v==='function'?v.bind(target):v;}});super({storage,blockConcurrencyWhile:ctx.blockConcurrencyWhile.bind(ctx)},env);this.testNow=${base};this.queue.now=()=>this.testNow;this.failPut=()=>{fail=true;};}async fetch(r){const p=new URL(r.url).pathname;if(p==='/__clock'){this.testNow=Number(await r.text());return new Response('ok');}if(p==='/__fail'){this.failPut();return new Response('ok');}if(p==='/__alarm'){await this.alarm();return new Response('ok');}return super.fetch(r);}}`;
const options=maintenance=>({name:'phase6-retry-runtime',modulesRoot:root,compatibilityDate:'2026-10-23',compatibilityFlags:['nodejs_compat'],bindings:{QUEUE_MAINTENANCE:maintenance?'true':'false'},durableObjects:{MIAO_KEY_QUEUE:{className:'MiaoKeyQueue',useSQLite:true}},durableObjectsPersist:store,modules:[{type:'ESModule',path:resolve(root,'tests/__retry-wrapper.mjs'),contents:wrapper},...['cloudflare/worker.js','queue-service/queue.mjs','queue-service/lease-policy.mjs','shared/queue-protocol.js'].map(path=>({type:'ESModule',path:resolve(root,path),contents:readFileSync(resolve(root,path),'utf8')}))]});
const store=mkdtempSync(resolve(tmpdir(),'mewo-phase6-sqlite-')),mf=new runtime.Miniflare(options(false)),hash='6'.repeat(64),who=id=>({key_hash:hash,user_id:'sqlite-user-'+id,task_id:'sqlite-task-'+id,protocol:2,retry_protocol:1});
const control=async(path,time=base)=>{const ns=await mf.getDurableObjectNamespace('MIAO_KEY_QUEUE');const res=await ns.get(ns.idFromName(hash)).fetch('https://test.internal'+path,{method:'POST',body:String(time)});assert.equal(res.status,200);};
const post=async(path,body,status=200)=>{const res=await mf.dispatchFetch('https://queue.test'+path,{method:'POST',body:JSON.stringify(body)}),data=await res.json();assert.equal(res.status,status,JSON.stringify(data));return data;};
const results=[];
try{
 const a=who('A'),b=who('B'),lease=await post('/join-queue',a);await post('/join-queue',b);
 const begin={...a,lock_token:lease.lock_token,attempt_no:0,generation_timeout_ms:30000},permit=await post('/begin-generation',begin);
 const rejection={...a,lock_token:lease.lock_token,attempt_no:0,attempt_id:permit.attempt_id,rejection_status:429};
 await control('/__fail');await post('/retry-generation',rejection,503);assert.equal((await post('/my-turn',a)).phase,'possibly-sent');
 assert.equal((await post('/retry-generation',rejection)).phase,'retry-wait');await mf.setOptions(options(true));await control('/__clock',base+9999);
 await post('/join-queue',who('denied'),503);await post('/begin-generation',{...begin,attempt_no:1},400);assert.equal((await post('/my-turn',b)).your_turn,false);
 await control('/__clock',base+10000);await control('/__fail');await post('/begin-generation',{...begin,attempt_no:1},503);assert.equal((await post('/my-turn',a)).phase,'retry-wait');
 const next=await post('/begin-generation',{...begin,attempt_no:1});assert.notEqual(next.attempt_id,permit.attempt_id);assert.equal((await post('/begin-generation',{...begin,attempt_no:1})).attempt_id,next.attempt_id);
 await post('/finish',{...rejection,outcome:'success'},400);
 await post('/retry-generation',{...rejection,attempt_no:1,attempt_id:next.attempt_id});await mf.setOptions(options(true));await control('/__clock',base+30000);await control('/__alarm');
 const successor=await post('/my-turn',b);assert.equal(successor.your_turn,true);assert.equal((await post('/finish',{...rejection,outcome:'rejected'})).finished,false);await post('/complete',{...b,lock_token:successor.lock_token});
 results.push('atomic retry report/begin commit failures, reload, attempt idempotence, stale finish, maintenance retry and alarm handoff');
 await mf.setOptions(options(false));
 for(const relay of [true,false]){
  let now=0,posts=0;const visited=[];
  const transport=createQueueTransport({allowRelay:()=>relay,now:()=>now,fetchImpl:async(url,opts)=>{
   await control('/__clock',base+now);
   if(url.startsWith('https:')){if(relay)throw new TypeError('fixture phone direct blocked');return mf.dispatchFetch(url,opts);}
   const target=JSON.parse(opts.body).url;visited.push(target);return mf.dispatchFetch(target);
  }});
  assert.equal(await runWithQueue({url:'https://queue.test',keyHash:hash,autoRetry:true,requestJSON:transport,now:()=>now,sleep:async ms=>{now+=ms;},generate:controls=>sendPrepared({source:'nai-generation',send:async()=>{if(++posts<4)throw httpRequestError({source:'nai-generation',status:429});return 'png';}},controls)}),'png');
  assert.equal(posts,4);assert.equal(now,30000);assert.equal(visited.some(x=>/lock_token|Bearer|prompt/.test(x)),false);results.push(relay?'ST visit relay: four client POSTs, 3 derived-proof retry reports, no secret URLs':'TT direct: four client POSTs, same SQLite holder, 10s intervals');
 }
 const result={compatibilityDate:'2026-10-23',kind:'real-workerd-SQLite',passed:results};writeFileSync(new URL('../docs/local/queue-phase6-runtime-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await mf.dispose();}
