import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {LeaseQueue} from '../queue-service/queue.mjs';
import {createQueueServer} from '../queue-service/service.mjs';
import {runWithQueue} from '../cloud-queue.js';
import {createQueueTransport} from '../queue-network.js';
import {stageError} from '../request-errors.js';
import {createDirectClient} from '../direct-client.js';
import {generationTimeoutSeconds,withGenerationTimeout} from '../generation-timeout.js';
const hash=value=>createHash('sha256').update(value).digest('hex'),keyHash=hash('fixture-only');
const who=name=>({key_hash:keyHash,user_id:'fixture-user-'+name,task_id:'fixture-task-'+name});
const dispatcher=queue=>async(url,{body})=>url.endsWith('/join-queue')?queue.join(body):url.endsWith('/my-turn')?queue.turn(body):queue.release(body);

test('single-image timeout defaults to 30s and bounds malformed saved values',()=>{
 for(const value of [undefined,null,'',0,-1,Infinity,181,'bad'])assert.equal(generationTimeoutSeconds(value),30);
 assert.equal(generationTimeoutSeconds(45),45);assert.equal(generationTimeoutSeconds('60'),60);
});
test('the default deadline expires at 30 seconds, not while waiting in a queue',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let aborted=false;
 const pending=withGenerationTimeout(signal=>{signal.addEventListener('abort',()=>aborted=true);return new Promise(()=>{});});
 await new Promise(resolve=>setImmediate(resolve));t.mock.timers.tick(29999);assert.equal(aborted,false);
 t.mock.timers.tick(1);await assert.rejects(pending,error=>error.name==='TimeoutError');assert.equal(aborted,true);
});
test('timeout aborts an ignored-signal bridge without waiting for its body or accepting late results',async()=>{
 let signal,finish;
 await assert.rejects(withGenerationTimeout(s=>{signal=s;return new Promise(resolve=>finish=resolve);},{timeoutMs:10}),error=>error.name==='TimeoutError'&&error.source==='nai-generation');
 assert.equal(signal.aborted,true);finish('late image');
 assert.equal(await withGenerationTimeout(async()=> 'image',{timeoutMs:100}),'image');
});
test('direct generation covers body reads, validates lease after key lookup and preserves timeout source',async()=>{
 const events=[];let signal;
 const client=createDirectClient({settings:{},save(){},getHeaders:()=>({}),getKey:async()=>{events.push('key');return 'fixture-key';},unzipPNG:async()=> 'image',fetchImpl:async(url,options)=>{events.push('send');signal=options.signal;return {ok:true,arrayBuffer:()=>new Promise(()=>{})};}});
 await assert.rejects(client.generate({vibes:[]},{timeoutMs:10,beforeSend:async()=>events.push('lease')}),error=>error.name==='TimeoutError');
 assert.deepEqual(events,['key','lease','send']);assert.equal(signal.aborted,true);
});
test('a page resuming after lease expiry cannot send NAI while another holder is active',async()=>{
 let now=0,sent=0;const queue=new LeaseQueue({now:()=>now});
 await assert.rejects(runWithQueue({url:'https://fixture.invalid',keyHash,now:()=>now,requestJSON:dispatcher(queue),generate:async({beforeSend})=>{
  now=240001;assert.equal(queue.join(who('other')).your_turn,true);await beforeSend();sent++;
 }}));assert.equal(sent,0);assert.equal(queue.lanes.get(keyHash).active.user,who('other').user_id);
});
test('a live lease survives a long preparation and is refreshed before sending exactly once',async()=>{
 let now=0,sent=0;const queue=new LeaseQueue({now:()=>now});
 await runWithQueue({url:'https://fixture.invalid',keyHash,now:()=>now,requestJSON:dispatcher(queue),generate:async({beforeSend})=>{now=20000;await beforeSend();sent++;}});
 assert.equal(sent,1);assert.equal(queue.stats().active,0);
});
test('Vibe preparation transport failures release the lease; actual NAI timeout retains it',async()=>{
 for(const source of ['vibe-file','nai-generation']){
  const queue=new LeaseQueue();await assert.rejects(runWithQueue({url:'https://fixture.invalid',keyHash,requestJSON:dispatcher(queue),generate:async()=>{throw stageError(source,new TypeError('offline'));}}));
  assert.equal(queue.stats().active,source==='vibe-file'?0:1);
 }
});
test('lost join replies are cancelled with a client-owned proof, without making an image request',async()=>{
 const queue=new LeaseQueue();let joins=0,sent=0;
 await assert.rejects(runWithQueue({url:'https://fixture.invalid',keyHash,sleep:async()=>{},requestJSON:async(url,options)=>{
  const result=await dispatcher(queue)(url,options);if(url.endsWith('/join-queue')){joins++;throw new TypeError('reply lost');}return result;
 },generate:async()=>{sent++;}}));assert.equal(joins,4);assert.equal(sent,0);assert.deepEqual(queue.stats(),{active:0,waiting:0});
 const first=queue.join({...who('owner'),cancel_hash:hash(hash('owner-secret'))});
 assert.throws(()=>queue.release({...who('owner'),cancel_proof:hash('wrong-secret')}));
 assert.equal(queue.turn(who('owner')).lock_token,first.lock_token);
 assert.equal(queue.release({...who('owner'),cancel_proof:hash('owner-secret')}).released,true);
});
test('a failed cached relay falls back to the recovered direct network',async()=>{
 let browser=false,relay=true;const paths=[];
 const request=createQueueTransport({fetchImpl:async(url)=>{paths.push(url);if(url.startsWith('https:')){if(!browser)throw new TypeError('browser offline');return Response.json({ready:true});}if(!relay)throw new TypeError('relay offline');return Response.json({ready:true,relay:1});}});
 await request('https://fixture.invalid/ping');browser=true;relay=false;
 assert.equal((await request('https://fixture.invalid/ping')).ready,true);
 const count=paths.length;await request('https://fixture.invalid/ping');assert.deepEqual(paths.slice(count),['https://fixture.invalid/ping']);
});
test('Node queue-full errors remain HTTP 429',async()=>{
 const queue=new LeaseQueue({maxJobs:1}),server=createQueueServer({queue});queue.join(who('holder'));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const response=await fetch('http://127.0.0.1:'+server.address().port+'/join-queue',{method:'POST',body:JSON.stringify(who('full'))});assert.equal(response.status,429);}
 finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
