// Actual workerd/SQLite upgrade test. The clock/alarm endpoints exist ONLY in
// this in-memory test wrapper, never in the deployed Worker or its router.
import assert from 'node:assert/strict';
import {runWithQueue} from '../cloud-queue.js';
import {sendPrepared} from '../generation-lifecycle.js';
import {assessQueueDrain} from '../queue-service/drain-status.mjs';
import {execFileSync} from 'node:child_process';
import {readFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
const runtime=await import(process.env.MIAO_MINIFLARE?pathToFileURL(process.env.MIAO_MINIFLARE).href:'miniflare');
const base=Date.now()+3600000,revision='80fa8ed0f3be9c6daea612e3d6f67d64aa708bd7';
const wrapper=`import worker,{MiaoKeyQueue as Base} from '../cloudflare/worker.js';
export default worker;
export class MiaoKeyQueue extends Base {
 constructor(ctx,env){
  let fail=false;const storage=new Proxy(ctx.storage,{get(target,key){if(key==='put')return (...args)=>{if(fail){fail=false;throw Error('fixture SQLite commit failure');}return target.put(...args);};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
  super({storage,blockConcurrencyWhile:ctx.blockConcurrencyWhile.bind(ctx)},env);this.failNextPut=()=>{fail=true;};this.testNow=${base};this.queue.now=()=>this.testNow;}
 async fetch(request){
  const path=new URL(request.url).pathname;
  if(path==='/__clock'){this.testNow=Number(await request.text());return new Response('ok');}
  if(path==='/__fail-put'){this.failNextPut();return new Response('ok');}
  if(path==='/__snapshot')return Response.json([...this.queue.lanes]);
  if(path==='/__alarm'){await this.alarm();return Response.json({ok:true});}
  return super.fetch(request);
 }
}`;
const module=(path,contents)=>({type:'ESModule',path:resolve(root,path),contents});
const current=path=>readFileSync(resolve(root,path),'utf8');
const old=path=>execFileSync('git',['show',revision+':'+path],{cwd:root,encoding:'utf8'});
const options=(legacy,maintenance=false)=>({bindings:{QUEUE_MAINTENANCE:maintenance?'true':'false'},name:'queue-migration-check',modulesRoot:root,compatibilityDate:process.env.MIAO_RUNTIME_DATE||'2026-10-23',compatibilityFlags:['nodejs_compat'],durableObjects:{MIAO_KEY_QUEUE:{className:'MiaoKeyQueue',useSQLite:true}},durableObjectsPersist:store,modules:[
 module('tests/__clock-wrapper.mjs',wrapper),module('cloudflare/worker.js',(legacy?old:current)('cloudflare/worker.js')),module('queue-service/queue.mjs',(legacy?old:current)('queue-service/queue.mjs')),
 ...(!legacy?[module('queue-protocol.js',current('queue-protocol.js')),module('queue-service/lease-policy.mjs',current('queue-service/lease-policy.mjs'))]:[])
]});
const store=mkdtempSync(resolve(tmpdir(),'mewo-queue-sqlite-'));
const mf=new runtime.Miniflare(options(true));
const hash=createHash('sha256').update('migration-fixture-only').digest('hex');
const who=id=>({key_hash:hash,user_id:'migration-user-'+id,task_id:'migration-task-'+id});
const call=async(path,body)=>{const response=await mf.dispatchFetch('https://queue.test'+path,{method:'POST',body:JSON.stringify(body)});const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;};
const control=async(path,time)=>{const ns=await mf.getDurableObjectNamespace('MIAO_KEY_QUEUE');const stub=ns.get(ns.idFromName(hash));assert.equal((await stub.fetch('https://test.internal'+path,{method:'POST',body:String(time??'')})).status,200);};
try{
 let posts=0;
 const requestJSON=async(url,{method='GET',body}={})=>{
  const response=await mf.dispatchFetch(url,{method,...(body?{body:JSON.stringify(body)}:{})});return response.json();
 };
 await assert.rejects(runWithQueue({url:'https://queue.test',keyHash:hash,requestJSON,generate:async()=>{posts++;}}),/先更新 Worker/);assert.equal(posts,0);
 const a=who('oldA'),b=who('oldB'),c={...who('newC'),protocol:2},d={...who('newD'),protocol:2};
 const first=await call('/join-queue',a);await call('/join-queue',b);
 await mf.setOptions(options(false)); // Same namespace, class, SQLite database.
 await runWithQueue({url:'https://queue.test',keyHash:createHash('sha256').update('independent-client-fixture').digest('hex'),requestJSON,generate:controls=>sendPrepared({source:'nai-generation',send:async()=>{posts++;return 'image';}},controls)});assert.equal(posts,1);
 assert.equal((await call('/my-turn',a)).lock_token,first.lock_token);assert.equal((await call('/my-turn',b)).position,1);
 await call('/join-queue',c);await call('/join-queue',d);
 await call('/complete',{...a,lock_token:first.lock_token});const next=await call('/my-turn',b);assert.equal(next.your_turn,true);
 await call('/complete',{...b,lock_token:next.lock_token});const third=await call('/my-turn',c);assert.equal(third.phase,'preparing');
 await control('/__clock',base+19999);const begun=await call('/begin-generation',{...c,lock_token:third.lock_token,generation_timeout_ms:30000});assert.equal(begun.phase,'possibly-sent');
 await call('/finish',{...c,lock_token:third.lock_token,outcome:'uncertain'});
 await mf.setOptions(options(false)); // Reload actual SQLite state again.
 await control('/__clock',base+49999);await control('/__alarm');assert.equal((await call('/my-turn',d)).your_turn,false);
 await control('/__clock',base+69999);await control('/__alarm');const fourth=await call('/my-turn',d);assert.equal(fourth.phase,'preparing');
 assert.equal((await call('/finish',{...c,lock_token:third.lock_token,outcome:'success'})).finished,false);
 await call('/begin-generation',{...d,lock_token:fourth.lock_token,generation_timeout_ms:30000});
 await call('/finish',{...d,lock_token:fourth.lock_token,outcome:'rate-limited'});
 const e=who('legacyE');assert.equal((await call('/join-queue',e)).your_turn,false);
 await mf.setOptions(options(false));await control('/__clock',base+84998);assert.equal((await call('/my-turn',e)).your_turn,false);
 await control('/__clock',base+84999);await control('/__alarm');const fifth=await call('/my-turn',e);assert.equal(fifth.your_turn,true);
 await call('/complete',{...e,lock_token:fifth.lock_token});
 const f={...who('boundaryF'),protocol:2};const sixth=await call('/join-queue',f);assert.equal(sixth.phase,'preparing');
 await control('/__clock',base+104999);await control('/__alarm');
 const response=await mf.dispatchFetch('https://queue.test/begin-generation',{method:'POST',body:JSON.stringify({...f,lock_token:sixth.lock_token,generation_timeout_ms:30000})});assert.equal(response.status,400);
 const pf={...who('persistFail'),protocol:2},pfLease=await call('/join-queue',pf);await control('/__fail-put');
 const pfFail=await mf.dispatchFetch('https://queue.test/begin-generation',{method:'POST',body:JSON.stringify({...pf,lock_token:pfLease.lock_token,generation_timeout_ms:30000})});assert.equal(pfFail.status,503);
 assert.equal((await call('/my-turn',pf)).phase,'preparing');await call('/begin-generation',{...pf,lock_token:pfLease.lock_token,generation_timeout_ms:30000});await call('/finish',{...pf,lock_token:pfLease.lock_token,outcome:'not-sent'});
 const ma={...who('maintA'),protocol:2},mb=who('maintB'),mc={...who('maintC'),protocol:2};
 const held=await call('/join-queue',ma);await call('/begin-generation',{...ma,lock_token:held.lock_token,generation_timeout_ms:30000});await call('/join-queue',mb);await call('/join-queue',mc);
 await mf.setOptions(options(false,true));await control('/__clock',base+134999);
 const ping=await (await mf.dispatchFetch('https://queue.test/ping')).json();assert.equal(ping.maintenance,true);assert.deepEqual(ping.capabilities,[]);
 const denied=await mf.dispatchFetch('https://queue.test/join-queue',{method:'POST',body:JSON.stringify(who('denied'))});assert.equal(denied.status,503);
 await control('/__alarm');assert.equal((await call('/my-turn',mb)).your_turn,false);
 await call('/finish',{...ma,lock_token:held.lock_token,outcome:'uncertain'});
 await control('/__clock',base+154999);await control('/__alarm');const oldMaint=await call('/my-turn',mb);assert.equal(oldMaint.your_turn,true);
 await call('/complete',{...mb,lock_token:oldMaint.lock_token});const newMaint=await call('/my-turn',mc);await call('/begin-generation',{...mc,lock_token:newMaint.lock_token,generation_timeout_ms:30000});const maintenanceCooldown=await call('/finish',{...mc,lock_token:newMaint.lock_token,outcome:'rate-limited'});assert.equal(maintenanceCooldown.cooldown_remaining_ms,30000);
 const inspect=async()=>{const ns=await mf.getDurableObjectNamespace('MIAO_KEY_QUEUE');return (await ns.get(ns.idFromName(hash)).fetch('https://test.internal/__snapshot')).json();};
 assert.equal(assessQueueDrain({maintenance:true,completeSnapshot:true,lanes:await inspect(),now:base+154999}).rollbackEligible,false);
 await control('/__clock',base+154999+maintenanceCooldown.cooldown_remaining_ms);await control('/__alarm');assert.equal(assessQueueDrain({maintenance:true,completeSnapshot:true,lanes:await inspect(),now:base+154999+maintenanceCooldown.cooldown_remaining_ms}).rollbackEligible,true);
 console.log('workerd/SQLite: real v0.6.3 storage upgrade, old locks/FIFO, two-phase reload, alarm hard-release, cooldown, 20s boundary and deployment-controlled maintenance drain passed; no NAI requests.');
}finally{await mf.dispose();}
