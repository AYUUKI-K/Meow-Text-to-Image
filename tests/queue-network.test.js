import test from 'node:test';
import assert from 'node:assert/strict';
import {queueJSON} from '../queue-network.js';
import {runWithQueue} from '../cloud-queue.js';

test('queue JSON uses a simple CORS request with no cookies or credentials',async()=>{
    const body={key_hash:'a'.repeat(64),user_id:'user-12345',task_id:'task-12345'};
    const result=await queueJSON('https://queue.example/join-queue',{method:'POST',body},{fetchImpl:async(url,options)=>{
        assert.equal(options.headers['Content-Type'],'text/plain;charset=UTF-8');assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');assert.deepEqual(JSON.parse(options.body),body);return Response.json({your_turn:true,lock_token:'lease'});
    }});assert.equal(result.your_turn,true);
});
test('queue timeouts include a hung bridge or body and retain the queue error source',async()=>{
    for(const fetchImpl of [()=>new Promise(()=>{}),async()=>({ok:true,json:()=>new Promise(()=>{})})])await assert.rejects(queueJSON('https://queue.example/ping',{}, {fetchImpl,timeoutMs:5}),e=>e.name==='TimeoutError'&&e.source==='queue'&&!e.message.includes('结果尚不确定'));
    await assert.rejects(queueJSON('https://queue.example/ping',{}, {fetchImpl:async()=>new Response('<html>proxy page</html>')}),/队列返回内容无效/);
});
test('broken queue connections never fall back to uncoordinated generation or claim NAI returned an error',async()=>{
    let calls=0,sent=0;
    await assert.rejects(runWithQueue({url:'https://queue.example',keyHash:'a'.repeat(64),sleep:async()=>{},fetchImpl:async()=>{calls++;throw new TypeError('offline');},generate:async()=>{sent++;}}),e=>e.source==='queue'&&e.message.includes('未发送新的生图请求')&&!e.message.includes('不会自动重试'));
    assert.equal(calls,4);assert.equal(sent,0);
    await assert.rejects(runWithQueue({url:'https://queue.example',keyHash:'a'.repeat(64),fetchImpl:async()=>Response.json({your_turn:true}),generate:async()=>{sent++;}}),/队列状态无效/);assert.equal(sent,0);
});
