import test from 'node:test';
import assert from 'node:assert/strict';
import {retryGeneration,isRetryableGeneration} from '../src/generation/generation-retry.js';
import {generationOptions,migrateGenerationOptions,migrateGenerationMode,runGenerationTask} from '../src/generation/generation-options.js';
import {httpRequestError,parseRetryAfter} from '../src/platform/request-errors.js';
const refused=(status=429,retryAfterMs=0)=>httpRequestError({source:'nai-generation',status,retryAfterMs});
test('R01–R03: local mode never uses cloud, opt-in fixed 10s and at most four POSTs',async()=>{
 for(const enabled of [false,true])for(const success of [false,true]){
  let now=0;const posts=[],statuses=[],scope={cloudQueue:false,autoRetryEnabled:enabled};
  const job=runGenerationTask({scope,queueOptions:{requestJSON:()=>assert.fail('cloud RPC')},retryOptions:{now:()=>now,sleep:async ms=>{now+=ms;}},onStatus:s=>statuses.push(s),generate:async()=>{posts.push(now);if(success&&posts.length===4)return 'image';throw refused();}});
  if(enabled&&success)assert.equal(await job,'image');else await assert.rejects(job,/HTTP 429/);
  assert.deepEqual(posts,enabled?[0,10000,20000,30000]:[0]);if(!enabled)assert.equal(statuses.length,0);
 }
});
test('R11: legacy defaults do not opt in; explicit new choice, cloud choice and timeout survive reload',()=>{
 for(const cloudQueue of [false,true])for(const retryQueue of [false,true]){
  const s={cloudQueue,retryQueue,generationTimeoutSeconds:77};assert.equal(migrateGenerationOptions(s),true);assert.equal(s.autoRetryEnabled,false);assert.equal(s.cloudQueue,cloudQueue);assert.equal(s.generationTimeoutSeconds,77);
  s.autoRetryEnabled=true;const reloaded=JSON.parse(JSON.stringify(s));assert.equal(migrateGenerationOptions(reloaded),false);assert.equal(reloaded.autoRetryEnabled,true);
 }
 const empty={};migrateGenerationOptions(empty);assert.equal(empty.cloudQueue,false);assert.equal(empty.autoRetryEnabled,false);
});
test('R12: queued tasks snapshot mode and serialize through all local retries',async()=>{
 let now=0;const settings={cloudQueue:false,autoRetryEnabled:true},first=generationOptions(settings),posts=[];let tail=Promise.resolve();
 const enqueue=fn=>{const p=tail.then(fn);tail=p.catch(()=>{});return p;};
 const run=(scope,id)=>runGenerationTask({scope,queueOptions:{requestJSON:()=>assert.fail('cloud RPC')},retryOptions:{now:()=>now,sleep:async ms=>{now+=ms;settings.cloudQueue=true;settings.autoRetryEnabled=false;}},generate:async()=>{posts.push([id,now]);throw refused();}});
 const a=enqueue(()=>run(first,'A'));const second={...generationOptions(settings),autoRetryEnabled:false};const b=enqueue(()=>run(second,'B'));
 await assert.rejects(a);await assert.rejects(b);assert.deepEqual(posts.map(x=>x[0]),['A','A','A','A','B']);assert.equal(generationOptions(settings).cloudQueue,true);assert.equal(generationOptions(settings).autoRetryEnabled,false);
});
test('R08/R09: ambiguous errors, encoding, queue errors and postprocessing never qualify',async()=>{
 for(const source of ['nai-generation','tavern-generation','nai-encode','queue','image-save'])for(const status of [408,500,502,503,504,429]){
  if(['nai-generation','tavern-generation'].includes(source)&&status===429)continue;
  let posts=0;await assert.rejects(retryGeneration({enabled:true,run:async()=>{posts++;throw httpRequestError({source,status,body:'concurrent generation busy'});},sleep:async()=>assert.fail('sleep')}));assert.equal(posts,1);
 }
 for(const name of ['AbortError','TimeoutError','TypeError']){let posts=0;await assert.rejects(retryGeneration({enabled:true,run:()=>{posts++;throw Object.assign(refused(),{name});},sleep:async()=>assert.fail('sleep')}));assert.equal(posts,1);}
});
test('R10: Retry-After 20/120s honored; above 120s stops instead of sending early',async()=>{
 for(const delay of [20000,120000,120001]){
  let now=0;const posts=[];const job=retryGeneration({enabled:true,now:()=>now,sleep:async ms=>{now+=ms;},run:async()=>{posts.push(now);if(posts.length===1)throw refused(429,delay);return 'ok';}});
  if(delay>120000){await assert.rejects(job,/超过 120 秒/);assert.deepEqual(posts,[0]);}else{assert.equal(await job,'ok');assert.deepEqual(posts,[0,delay]);}
 }
 assert.equal(parseRetryAfter('999999'),999999000);assert.equal(parseRetryAfter('bad'),0);assert.equal(parseRetryAfter(new Date(20000).toUTCString(),10000),10000);
});
test('R06/R18: cancel or frozen local retry does not resume or call cloud; restart is opt-in',async()=>{
 for(const freeze of [false,true]){
  let valid=true,now=0,posts=0;
  await assert.rejects(runGenerationTask({scope:{cloudQueue:false,autoRetryEnabled:true},canContinue:()=>valid,queueOptions:{requestJSON:()=>assert.fail('cloud RPC')},retryOptions:{now:()=>now,sleep:async()=>{if(freeze)now=21000;else valid=false;}},generate:async()=>{posts++;throw refused();}}),freeze?/过期/:/原消息/);assert.equal(posts,1);
 }
 const settings={retryQueue:true};migrateGenerationOptions(settings);let posts=0;await assert.rejects(runGenerationTask({scope:generationOptions(settings),generate:async()=>{posts++;throw refused();},queueOptions:{requestJSON:()=>assert.fail('cloud RPC')}}));assert.equal(posts,1);
});


test('new installation enables cloud queue only by default, preserving existing choices and local retry defaults',()=>{
 const fresh={};migrateGenerationOptions(fresh,{newInstallation:true});
 assert.equal(fresh.cloudQueue,true);assert.equal(fresh.autoRetryEnabled,false);assert.equal(fresh.generationTimeoutSeconds,60);
 for(const cloudQueue of [false,true]){
  const existing={cloudQueue};migrateGenerationOptions(existing);assert.equal(existing.cloudQueue,cloudQueue);
  const reloaded=JSON.parse(JSON.stringify(existing));migrateGenerationOptions(reloaded);assert.equal(reloaded.cloudQueue,cloudQueue);
 }
 const legacy={retryQueue:true};migrateGenerationOptions(legacy);assert.equal(legacy.cloudQueue,false);
});
test('generation mode replaces legacy disabled switch without unexpectedly enabling automatic generation',()=>{
 for(const mode of ['manual','auto','stream']){
  const settings={mode,enabled:false};assert.equal(migrateGenerationMode(settings),true);
  assert.equal(settings.mode,'manual');assert.equal(settings.enabled,true);assert.equal(migrateGenerationMode(settings),false);
  settings.mode=mode;assert.equal(migrateGenerationMode(settings),false);assert.equal(settings.mode,mode);
 }
 for(const mode of ['manual','auto','stream']){
  const settings={mode,enabled:true};migrateGenerationMode(settings);assert.equal(settings.mode,mode);
 }
 const legacy={stream:true};migrateGenerationMode(legacy);assert.equal(legacy.mode,'stream');
});


test('retry guard rejects 409/423 and unrecoverable 429 even if a caller supplies a retry flag',()=>{
 for(const status of [409,423])assert.equal(isRetryableGeneration({source:'nai-generation',status,code:'busy',retryableGeneration:true}),false);
 for(const code of ['quota','auth','parameters',undefined])assert.equal(isRetryableGeneration({source:'nai-generation',status:429,code,retryableGeneration:true}),false);
 for(const code of ['rate-limit','busy'])assert.equal(isRetryableGeneration({source:'nai-generation',status:429,code,retryableGeneration:true}),true);
});
