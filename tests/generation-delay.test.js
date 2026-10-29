import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForGeneration} from '../generation-delay.js';
import {retryGeneration} from '../generation-retry.js';
import {runWithQueue} from '../cloud-queue.js';

test('every generation attempt waits a fresh 500–3000 ms, including explicit-error retries',async()=>{
    const waits=[],events=[],randoms=[0,.5,.999999999999];let attempts=0;
    const result=await retryGeneration({enabled:true,delays:[0,0],run:()=>runWithQueue({twoPhase:false,url:'https://queue.example',keyHash:'a'.repeat(64),fetchImpl:async url=>{events.push(new URL(url).pathname);return Response.json({your_turn:true,lock_token:'lease'});},generate:async()=>{
        await waitForGeneration({random:()=>randoms[attempts],sleep:async ms=>{waits.push(ms);events.push('delay');}});
        events.push('image');if(++attempts<3)throw Object.assign(Error('busy'),{source:'nai-generation',status:429,retryableGeneration:true});return 'image';
    }})});
    assert.equal(result,'image');assert.deepEqual(waits,[500,1750,3000]);
    assert.deepEqual(events,['/join-queue','delay','image','/complete','/join-queue','delay','image','/complete','/join-queue','delay','image','/complete']);
});
test('changes before or during the mandatory delay prevent a billable image request',async()=>{
    let valid=false,sleeps=0,sent=0;
    const run=async()=>{await waitForGeneration({canContinue:()=>valid,sleep:async()=>{sleeps++;valid=false;}});sent++;};
    await assert.rejects(run(),/原消息/);assert.equal(sleeps,0);valid=true;
    await assert.rejects(run(),/原消息/);assert.equal(sleeps,1);assert.equal(sent,0);
    await assert.rejects(waitForGeneration({canContinue:()=>{throw Error('Key changed');},sleep:async()=>{sleeps++;}}),/Key changed/);assert.equal(sleeps,1);
});
