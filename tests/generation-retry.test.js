import test from 'node:test';
import assert from 'node:assert/strict';
import {retryGeneration} from '../generation-retry.js';
import {runWithQueue} from '../cloud-queue.js';
import {httpRequestError,checkedFetch,parseRetryAfter} from '../request-errors.js';
test('explicit 500 waits then rejoins the queue; each failed attempt releases its lock',async()=>{
    let attempts=0;const calls=[],waits=[];
    const result=await retryGeneration({enabled:true,delays:[2000,3000],sleep:async ms=>waits.push(ms),run:()=>runWithQueue({url:'https://queue.example',keyHash:'a'.repeat(64),
        fetchImpl:async url=>{calls.push(new URL(url).pathname);return Response.json({your_turn:true,lock_token:'lease'});},
        generate:async()=>{if(++attempts<3)throw Object.assign(Error('500'),{status:500});return 'image';}})});
    assert.equal(result,'image');assert.equal(attempts,3);assert.equal(waits.reduce((a,b)=>a+b,0),5000);
    assert.deepEqual(calls,['/join-queue','/complete','/join-queue','/complete','/join-queue','/complete']);
});
test('retry is opt-in, bounded and never repeats transport failures or other HTTP errors',async()=>{
    for(const [enabled,error,count] of [[false,{status:500},1],[true,{status:500},4],[true,{status:401},1],[true,{status:429},1],[true,{name:'TimeoutError'},1],[true,{name:'TypeError'},1],[true,{},1]]){
        let attempts=0;await assert.rejects(retryGeneration({enabled,run:async()=>{attempts++;throw Object.assign(Error('failure'),error);},sleep:async()=>{}}));assert.equal(attempts,count);
    }
});
test('message or key change while waiting prevents another billable request',async()=>{
    let valid=true,attempts=0;
    await assert.rejects(retryGeneration({enabled:true,canContinue:()=>valid,run:async()=>{attempts++;throw Object.assign(Error('500'),{status:500});},sleep:async()=>{valid=false;}}),/原消息/);
    assert.equal(attempts,1);
});

test('busy, rate-limit and unavailable errors enter cloud retry after an initially unqueued attempt',async()=>{
    const calls=[],statuses=[];let attempts=0;
    const run=async()=>{const status=[409,429,503][attempts++];if(status)throw httpRequestError({source:'nai-generation',status});return 'image';};
    const queued=()=>runWithQueue({url:'https://queue.example',keyHash:'a'.repeat(64),generate:run,fetchImpl:async url=>{calls.push(new URL(url).pathname);return Response.json({your_turn:true,lock_token:'lease'});}});
    const result=await retryGeneration({enabled:true,run:attempt=>attempt?queued():run(),sleep:async()=>{},onStatus:status=>statuses.push(status)});
    assert.equal(result,'image');assert.equal(attempts,4);assert.equal(statuses.length,105);assert.deepEqual(calls,['/join-queue','/complete','/join-queue','/complete','/join-queue','/complete']);
});
test('Retry-After is respected but bounded, and non-generation failures never enter retry',async()=>{
    let count=0,waited=0;
    const result=await retryGeneration({enabled:true,delays:[1000],sleep:async ms=>{waited+=ms;},run:async()=>{if(count++===0)await checkedFetch('nai-generation','/fixture',{}, {fetchImpl:async()=>new Response('rate limit',{status:429,headers:{'Retry-After':'20'}})});return 'ok';}});
    assert.equal(result,'ok');assert.equal(waited,20000);assert.equal(parseRetryAfter('999999'),120000);assert.equal(parseRetryAfter('bad'),0);assert.equal(parseRetryAfter(new Date(20000).toUTCString(),10000),10000);
    for(const input of [{source:'nai-generation',status:401},{source:'nai-generation',status:403},{source:'nai-generation',status:402},{source:'nai-generation',status:400},{source:'nai-generation',status:500,body:'Invalid access token'},{source:'nai-generation',status:500,body:'Not enough Anlas'},{source:'queue',status:429},{source:'image-delete',status:503},{source:'nai-generation',status:504},{source:'nai-generation',status:408}]){
        let attempts=0;await assert.rejects(retryGeneration({enabled:true,run:async()=>{attempts++;throw httpRequestError(input);},sleep:async()=>{}}));assert.equal(attempts,1);
    }
});
