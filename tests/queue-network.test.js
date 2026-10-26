import test from 'node:test';
import assert from 'node:assert/strict';
import {queueJSON,createQueueTransport} from '../queue-network.js';
import {runWithQueue} from '../cloud-queue.js';
import {LeaseQueue} from '../queue-service/queue.mjs';

function relayFixture({legacy=false,lostJoin=false}={}){
    const queue=new LeaseQueue(),calls=[];let lost=false;
    const dispatch=(op,input)=>op==='join-queue'?queue.join(input):op==='my-turn'?queue.turn(input):queue.release(input);
    const fetchImpl=async(url,options={})=>{
        calls.push({url,options});
        if(url.startsWith('https://queue.example')){
            if(lostJoin&&!lost&&url.endsWith('/join-queue')){lost=true;dispatch('join-queue',JSON.parse(options.body));}
            throw new TypeError('phone cannot reach queue');
        }
        assert.equal(url,'/api/search/visit');assert.equal(options.credentials,'same-origin');assert.equal(options.headers['X-CSRF-Token'],'host-token');
        const request=JSON.parse(options.body);assert.equal(request.html,false);const target=new URL(request.url);assert.equal(target.origin,'https://queue.example');
        if(target.pathname==='/ping')return Response.json({ready:true,...(legacy?{}:{relay:1})});
        assert.equal(target.pathname,'/relay');const input=JSON.parse(target.searchParams.get('data'));
        try{return Response.json({relay_status:200,body:dispatch(target.searchParams.get('op'),input)});}
        catch(error){return Response.json({relay_status:error.status||400,body:{error:error.message}});}
    };
    const requestJSON=createQueueTransport({fetchImpl,getHeaders:()=>({'Content-Type':'application/json','X-CSRF-Token':'host-token'})});
    return {queue,calls,fetchImpl,requestJSON};
}

test('queue JSON uses a simple CORS request with no cookies or credentials',async()=>{
    const body={key_hash:'a'.repeat(64),user_id:'user-12345',task_id:'task-12345'};
    const result=await queueJSON('https://queue.example/join-queue',{method:'POST',body},{fetchImpl:async(url,options)=>{
        assert.equal(options.headers['Content-Type'],'text/plain;charset=UTF-8');assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');assert.deepEqual(JSON.parse(options.body),body);return Response.json({your_turn:true,lock_token:'lease'});
    }});assert.equal(result.your_turn,true);
});

test('blocked LAN phones use the same cloud queue through the host, without forwarding raw tokens or keys',async()=>{
    const {queue,calls,requestJSON}=relayFixture();let generated=0;
    assert.equal(await runWithQueue({url:'https://queue.example',keyHash:'a'.repeat(64),requestJSON,generate:async()=>{generated++;return 'image';}}),'image');
    assert.equal(generated,1);assert.deepEqual(queue.stats(),{active:0,waiting:0});
    assert.equal(calls.filter(call=>call.url.startsWith('https:')).length,1);
    const forwarded=calls.filter(call=>call.url==='/api/search/visit').map(call=>JSON.parse(call.options.body));
    const release=forwarded.find(call=>call.url.includes('op=complete'));
    const input=JSON.parse(new URL(release.url).searchParams.get('data'));
    assert.equal(input.release_proof.length,64);assert.ok(!Object.hasOwn(input,'lock_token'));
    assert.ok(forwarded.every(call=>!call.url.includes('host-token')&&!call.url.includes('lock_token')));
});

test('a lost direct join and relay retry retain the same identity and one lock',async()=>{
    const {queue,calls,requestJSON}=relayFixture({lostJoin:true});let generated=0;
    await runWithQueue({url:'https://queue.example',keyHash:'a'.repeat(64),requestJSON,generate:async()=>{generated++;assert.equal(queue.stats().active,1);}});
    const direct=JSON.parse(calls[0].options.body),forwarded=calls.filter(call=>call.url==='/api/search/visit').map(call=>JSON.parse(call.options.body)).find(call=>call.url.includes('op=join-queue'));
    const {greeting,...identity}=direct;assert.deepEqual(JSON.parse(new URL(forwarded.url).searchParams.get('data')),identity);
    assert.equal(generated,1);assert.deepEqual(queue.stats(),{active:0,waiting:0});
});

test('old relays and TT remain explicit failures and never bypass queueing',async()=>{
    const legacy=relayFixture({legacy:true});let generated=0;
    await assert.rejects(runWithQueue({url:'https://queue.example',keyHash:'a'.repeat(64),requestJSON:legacy.requestJSON,generate:async()=>{generated++;}}),/联系管理员更新队列/);
    assert.equal(generated,0);assert.equal(legacy.calls.length,2);
    const paths=[];const request=createQueueTransport({allowRelay:()=>false,fetchImpl:async url=>{paths.push(url);throw new TypeError('offline');}});
    await assert.rejects(request('https://queue.example/ping'),/连接队列服务失败/);assert.deepEqual(paths,['https://queue.example/ping']);
});

test('an explicit queue HTTP failure does not trigger a server relay or an image request',async()=>{
    const calls=[];const request=createQueueTransport({fetchImpl:async url=>{calls.push(url);return Response.json({error:'busy'},{status:429});}});
    await assert.rejects(request('https://queue.example/join-queue',{method:'POST',body:{}}),error=>error.status===429);
    assert.deepEqual(calls,['https://queue.example/join-queue']);
});

test('connection checks reject JSON that does not identify a ready queue',async()=>{
    const request=createQueueTransport({allowRelay:()=>false,fetchImpl:async()=>Response.json({unexpected:true})});
    await assert.rejects(request('https://queue.example/ping'),/未返回就绪/);
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
