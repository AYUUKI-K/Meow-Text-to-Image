import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForGeneration} from '../generation-delay.js';
import {retryGeneration} from '../generation-retry.js';
import {runWithQueue} from '../cloud-queue.js';

test('every generation attempt waits a fresh 2000–4000 ms, including explicit-error retries',async()=>{
    const waits=[],events=[],randoms=[0,.5,.999999999999];let attempts=0;
    const result=await retryGeneration({enabled:true,delays:[0,0],run:()=>runWithQueue({twoPhase:false,url:'https://queue.example',keyHash:'a'.repeat(64),fetchImpl:async url=>{events.push(new URL(url).pathname);return Response.json({your_turn:true,lock_token:'lease'});},generate:async()=>{
        await waitForGeneration({random:()=>randoms[attempts],sleep:async ms=>{waits.push(ms);events.push('delay');}});
        events.push('image');if(++attempts<3)throw Object.assign(Error('busy'),{source:'nai-generation',status:429,retryableGeneration:true});return 'image';
    }})});
    assert.equal(result,'image');assert.deepEqual(waits,[2000,3000,4000]);
    assert.deepEqual(events,['/join-queue','delay','image','/complete','/join-queue','delay','image','/complete','/join-queue','delay','image','/complete']);
});
test('changes before or during the mandatory delay prevent a billable image request',async()=>{
    let valid=false,sleeps=0,sent=0;
    const run=async()=>{await waitForGeneration({canContinue:()=>valid,sleep:async()=>{sleeps++;valid=false;}});sent++;};
    await assert.rejects(run(),/原消息/);assert.equal(sleeps,0);valid=true;
    await assert.rejects(run(),/原消息/);assert.equal(sleeps,1);assert.equal(sent,0);
    await assert.rejects(waitForGeneration({canContinue:()=>{throw Error('Key changed');},sleep:async()=>{sleeps++;}}),/Key changed/);assert.equal(sleeps,1);
});

test('local serial queue waits 2–4 seconds before each image and retry, with cloud queue on or off',async()=>{
    const {runGenerationTask}=await import('../generation-options.js');
    const {sendPrepared}=await import('../generation-lifecycle.js');
    const {LeaseQueue}=await import('../queue-service/queue.mjs');
    const {queueCapabilities}=await import('../queue-protocol.js');
    for(const cloudQueue of [false,true]){
        let now=0,tail=Promise.resolve(),attempt=0,active=0,maxActive=0;
        const events=[],waits=[],retryWaits=[],queue=new LeaseQueue({now:()=>now});
        const enqueue=run=>{const job=tail.then(run);tail=job.catch(()=>{});return job;};
        const sleep=async ms=>{retryWaits.push(ms);now+=ms;};
        const requestJSON=async(url,{body}={})=>{
            switch(new URL(url).pathname){
                case '/ping':return {ready:true,capabilities:queueCapabilities};
                case '/join-queue':return queue.join(body);
                case '/my-turn':return queue.turn(body);
                case '/begin-generation':return queue.begin(body);
                case '/retry-generation':return queue.retry(body);
                case '/finish':return queue.finish(body);
                default:assert.fail('Unexpected queue endpoint');
            }
        };
        const run=id=>enqueue(async()=>{
            active++;maxActive=Math.max(maxActive,active);
            try{return await runGenerationTask({scope:{cloudQueue,autoRetryEnabled:true,keyHash:'a'.repeat(64),queueUrl:'https://queue.example'},queueOptions:{requestJSON,now:()=>now,sleep},retryOptions:{now:()=>now,sleep},generate:async controls=>{
                const index=attempt++;
                await waitForGeneration({random:()=>[0,.5,.999999999999][index],sleep:async ms=>{waits.push(ms);events.push(`wait:${id}`);now+=ms;}});
                return sendPrepared({source:'nai-generation',send:async()=>{events.push(`send:${id}`);if(index===0)throw Object.assign(Error('busy'),{source:'nai-generation',status:429,retryableGeneration:true});return id;}},controls);
            }});}finally{active--;}
        });
        assert.deepEqual(await Promise.all([run('A'),run('B')]),['A','B']);
        assert.deepEqual(events,['wait:A','send:A','wait:A','send:A','wait:B','send:B']);
        assert.deepEqual(waits,[2000,3000,4000]);assert.equal(maxActive,1);
        assert.equal(retryWaits.reduce((sum,ms)=>sum+ms,0),10000);
        assert.equal(queue.stats().active,0);
    }
});
