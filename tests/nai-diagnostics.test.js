import test from 'node:test';
import assert from 'node:assert/strict';
import {createDirectClient} from '../direct-client.js';
import {prepareGeneration,sendPrepared} from '../generation-lifecycle.js';
import {runGenerationTask} from '../generation-options.js';
import {reportNAIFailure} from '../nai-diagnostics.js';

const runtime={tt:true,ios:true};
const secret='private-key',prompt='private-prompt',url='http://relay.invalid/private/path?secret=query';
const request={vibes:[],prompt,negative_prompt:'private-negative',model:'nai-diffusion-4-5-full'};
function fixture(fetchImpl,onDiagnostic){return createDirectClient({settings:{naiConnection:'custom',customGenerationURL:url},save(){},getHeaders:()=>({}),getKey:async()=>secret,unzipPNG:async()=>{throw Error('private ZIP detail');},fetchImpl,onDiagnostic,runtime});}

test('iOS HTTP fetch rejection has local diagnostic code, no fabricated HTTP status, no retry and safe TT log entry',async()=>{
    const logs=[];let sends=0;
    const client=fixture(async()=>{sends++;throw new TypeError(secret+' '+url+' '+prompt);},entry=>logs.push(entry));
    const prepared=await prepareGeneration(()=>client.prepareGenerate(request));
    await assert.rejects(runGenerationTask({scope:{autoRetryEnabled:true},generate:()=>sendPrepared(prepared),retryOptions:{sleep:()=>assert.fail('must not retry')}}),error=>{
        assert.equal(error.name,'TypeError');assert.equal(error.status,undefined);assert.equal(error.diagnosticCode,'MEWO_CUSTOM_IOS_HTTP_NO_RESPONSE');
        assert.match(error.message,/HTTP 状态码不可用/);assert.match(error.message,/TestFlight/);assert.equal(error.retryableGeneration,undefined);return true;
    });
    assert.equal(sends,1);assert.equal(logs.length,1);
    assert.deepEqual(logs[0],{diagnosticCode:'MEWO_CUSTOM_IOS_HTTP_NO_RESPONSE',phase:'fetch',source:'nai-generation',httpStatus:null,errorType:'TypeError',host:'TT',platform:'iOS',endpointProtocol:'http'});
    const logged=JSON.stringify(logs);for(const value of [secret,url,prompt,'private-negative','private/path','query'])assert.equal(logged.includes(value),false);
});

test('actual HTTP errors retain status and classification; body and image failures have separate codes',async()=>{
    for(const [reply,code,status] of [
        [()=>Response.json({message:'Forbidden'},{status:403}),'MEWO_CUSTOM_HTTP_403',403],
        [()=>new Response('Bad Gateway',{status:502}),'MEWO_CUSTOM_HTTP_502',502],
        [()=>({ok:true,status:200,arrayBuffer:async()=>{throw new TypeError(secret);}}),'MEWO_CUSTOM_RESPONSE_BODY',200],
        [()=>new Response('<html>private page</html>'),'MEWO_CUSTOM_IMAGE_FORMAT',200],
        [()=>({ok:false,status:502,text:async()=>{throw new TypeError(secret);}}),'MEWO_CUSTOM_RESPONSE_BODY',502],
    ]){
        const logs=[],client=fixture(async()=>reply(),entry=>logs.push(entry));
        await assert.rejects(client.generate(request),error=>{assert.equal(error.diagnosticCode,code);if(code.startsWith('MEWO_CUSTOM_HTTP'))assert.equal(error.status,status);assert.equal(error.message.includes(secret),false);assert.equal(error.retryableGeneration===true,false);return true;});
        assert.equal(logs.length,1);assert.equal(logs[0].httpStatus,status);
    }
});

test('timeouts, aborts and HTTPS transport failures have stable distinct codes without changing names',()=>{
    for(const [error,protocol,code] of [
        [Object.assign(Error('timeout'),{name:'TimeoutError',localGenerationTimeout:true}),'http:','MEWO_NAI_LOCAL_TIMEOUT'],
        [Object.assign(Error('abort'),{name:'AbortError'}),'http:','MEWO_CUSTOM_ABORTED'],
        [new TypeError('network'),'https:','MEWO_CUSTOM_NETWORK_NO_RESPONSE'],
    ]){
        const name=error.name;
        reportNAIFailure(error,{phase:'fetch',source:'nai-generation',protocol,runtime,onDiagnostic:()=>{throw Error('logger failure');}});
        assert.equal(error.name,name);assert.equal(error.diagnosticCode,code);assert.match(error.message,new RegExp(code));
    }
});

test('diagnostic hooks catch async parsing and local timeout without changing queue release or official errors',async()=>{
    const events=[];
    await assert.rejects(sendPrepared({source:'nai-generation',send:async()=> 'bytes',postprocess:async()=>{events.push('parse');throw Error('parse');},onError:()=>events.push('log')},{onResponse:()=>events.push('release')}),/parse/);
    assert.deepEqual(events,['release','parse','log']);
    const logs=[],client=fixture(()=>new Promise(()=>{}),entry=>logs.push(entry));
    await assert.rejects(client.generate(request,{timeoutMs:5}),error=>error.localGenerationTimeout&&error.diagnosticCode==='MEWO_NAI_LOCAL_TIMEOUT');
    assert.equal(logs.length,1);
    const original=Error('official');await assert.rejects(sendPrepared({send:async()=>{throw original;}}),error=>error===original&&error.diagnosticCode===undefined);
});
