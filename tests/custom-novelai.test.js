import test from 'node:test';
import assert from 'node:assert/strict';
import {createDirectClient,naiPayload} from '../src/novelai/direct-client.js';
import {migrateConnection,connectionSnapshot,assertConnection,usesDirectGeneration,validateEndpoint,resolveCustomEndpoints,saveCustomConnection,onlineEncodingAvailable} from '../src/novelai/nai-connection.js';
import {parseNAIImage,unzipNAIPNG} from '../src/novelai/nai-response.js';
import {generationOptions,runGenerationTask} from '../src/generation/generation-options.js';
import {prepareGeneration,sendPrepared} from '../src/generation/generation-lifecycle.js';
import {waitForGeneration} from '../src/generation/generation-delay.js';
import {fingerprintKey} from '../src/queue/cloud-queue.js';
import {LeaseQueue} from '../queue-service/queue.mjs';
import {queueCapabilities} from '../shared/queue-protocol.js';
import {defaults,buildRequest} from '../src/core/core.js';
import {promptFileData} from '../src/prompts/prompt-files.js';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=','base64');
const zip=Buffer.from([80,75,3,4,0,0]);
const key='custom-token.with-full.suffix',prompt='private prompt with\nnew line',negative='private negative',encoding='cHJpdmF0ZS12aWJl';
const id='12345678-1234-1234-1234-123456789abc';
const raw={id,name:'fixture',image:'cHJpdmF0ZS1pbWFnZQ==',encodings:{'v4-5full':{fixture:{encoding,params:{information_extracted:1}}}}};
const request=()=>({...buildRequest({...defaults,model:'nai-diffusion-4-5-full'},prompt),negative_prompt:negative,vibes:[]});
function fixture({url='https://relay.invalid/image/custom?route=%2Fraw',reply=()=>new Response(png),settings:overrides={},onDiagnostic=()=>{}}={}){
    const settings={naiConnection:'custom',customGenerationURL:url,customEncodeURL:'https://encode.invalid/independent',customKeyHash:'custom-hash',keyHash:'official-hash',vibeLibrary:[{id}],...overrides},calls=[];
    const client=createDirectClient({settings,save(){},getHeaders:()=>({'X-ST':'host-only'}),getKey:async(expected,connection)=>{if(expected)assert.equal(expected,connection.keyHash);return connection.naiConnection==='custom'?key:'official-token';},unzipPNG:async bytes=>{assert.deepEqual(Buffer.from(bytes),zip);return png.toString('base64');},onDiagnostic,fetchImpl:async(url,options={})=>{
        calls.push({url,options});
        if(url.startsWith('/user/files/'))return Response.json(raw);
        if(url==='/api/files/upload')return Response.json({path:'/user/files/'+JSON.parse(options.body).name});
        return reply(url,options);
    }});
    return {settings,client,calls};
}

test('old settings migrate to official without touching original credentials or generation choices',()=>{
    const settings={keyHash:'official-existing',rememberDirectKey:true,enabled:true,autoRetryEnabled:true,cloudQueue:true};
    assert.equal(migrateConnection(settings),true);assert.equal(settings.naiConnection,'official');
    assert.equal(settings.keyHash,'official-existing');assert.equal(settings.rememberDirectKey,true);
    assert.equal(settings.enabled,true);assert.equal(settings.autoRetryEnabled,true);assert.equal(settings.cloudQueue,true);
    assert.equal(migrateConnection(settings),false);
});

test('custom endpoint migration preserves legacy URLs and distinguishes them from empty initialized fields',()=>{
    const legacy={naiConnection:'custom',customGenerationURL:'https://relay.invalid/special/%2f?x=1',customEncodeURL:'https://encode.invalid/vibe?route=old',customKeyHash:'old-hash'};
    assert.equal(migrateConnection(legacy),true);assert.equal(legacy.customGenerationURLMode,'exact');assert.equal(legacy.customEncodeURLMode,'manual');
    assert.equal(resolveCustomEndpoints(legacy).generationURL,legacy.customGenerationURL);assert.equal(resolveCustomEndpoints(legacy).encodeURL,legacy.customEncodeURL);
    assert.equal(migrateConnection(legacy),false);assert.equal(legacy.customGenerationURLMode,'exact');
    const legacyDisabled={naiConnection:'custom',customGenerationURL:'https://relay.invalid/ai/generate-image',customEncodeURL:'',customKeyHash:'old-hash'};
    migrateConnection(legacyDisabled);assert.equal(legacyDisabled.customGenerationURLMode,'exact');assert.equal(legacyDisabled.customEncodeURLMode,'disabled');
    const newConnection={};migrateConnection(newConnection,{newInstallation:true});assert.equal(newConnection.customGenerationURLMode,'auto');assert.equal(newConnection.customEncodeURLMode,'derived');
    const oldEmptyFields={naiConnection:'official',customGenerationURL:'',customEncodeURL:'',customKeyHash:''};migrateConnection(oldEmptyFields);assert.equal(oldEmptyFields.customGenerationURLMode,'auto');assert.equal(oldEmptyFields.customEncodeURLMode,'derived');
});

test('custom URL resolver covers base URLs, existing routes, exact paths and manual Vibe routes',()=>{
    const cases=[
        ['https://nai.pkppkq.bond/','https://nai.pkppkq.bond/ai/generate-image','https://nai.pkppkq.bond/ai/encode-vibe'],
        ['https://nai.pkppkq.bond/v1','https://nai.pkppkq.bond/v1/ai/generate-image','https://nai.pkppkq.bond/v1/ai/encode-vibe'],
        ['https://nai.pkppkq.bond/v1/ai/generate-image///','https://nai.pkppkq.bond/v1/ai/generate-image','https://nai.pkppkq.bond/v1/ai/encode-vibe'],
        ['http://chami.yyqzx.com/image/chami','http://chami.yyqzx.com/image/chami/ai/generate-image','http://chami.yyqzx.com/image/chami/ai/encode-vibe'],
    ];
    for(const [input,generation,encode] of cases){
        const resolved=resolveCustomEndpoints({customGenerationURL:input,customGenerationURLMode:'auto',customEncodeURLMode:'derived'});
        assert.equal(resolved.generationURL,generation);assert.equal(resolved.encodeURL,encode);assert.equal(resolved.encodeEnabled,true);
        assert.doesNotMatch(resolved.generationURL,/\/ai\/ai\//);assert.doesNotMatch(resolved.encodeURL,/generate-image\/ai\/encode-vibe/);
    }
    const exact=resolveCustomEndpoints({customGenerationURL:'http://chami.yyqzx.com/image/chami',customGenerationURLMode:'exact',customEncodeURLMode:'derived'});
    assert.equal(exact.generationURL,'http://chami.yyqzx.com/image/chami');assert.equal(exact.encodeURL,'http://chami.yyqzx.com/image/chami/ai/encode-vibe');
    const relative=resolveCustomEndpoints({customGenerationURL:'https://relay.invalid/v1/ai/generate-image',customGenerationURLMode:'exact',customEncodeURL:'vendor/encode?mode=v2',customEncodeURLMode:'manual'});
    assert.equal(relative.encodeURL,'https://relay.invalid/v1/vendor/encode?mode=v2');
    const rootPath=resolveCustomEndpoints({customGenerationURL:'https://relay.invalid/v1/ai/generate-image',customGenerationURLMode:'exact',customEncodeURL:'/custom/encode',customEncodeURLMode:'manual'});
    assert.equal(rootPath.encodeURL,'https://relay.invalid/custom/encode');
    const absolute=resolveCustomEndpoints({customGenerationURL:'https://relay.invalid/v1/ai/generate-image',customGenerationURLMode:'exact',customEncodeURL:'https://other.invalid/encode?key=manual',customEncodeURLMode:'manual'});
    assert.equal(absolute.encodeURL,'https://other.invalid/encode?key=manual');assert.equal(absolute.crossOrigin,true);
});

test('custom URL resolver preserves generation query semantics and blocks ambiguous derived encoding',()=>{
    const resolved=resolveCustomEndpoints({customGenerationURL:'https://relay.invalid/v1?route=%2Fimage&key=private',customGenerationURLMode:'auto',customEncodeURLMode:'derived'});
    assert.equal(resolved.generationURL,'https://relay.invalid/v1/ai/generate-image?route=%2Fimage&key=private');
    assert.equal(resolved.encodeURL,'https://relay.invalid/v1/ai/encode-vibe');assert.equal(resolved.encodeEnabled,false);assert.match(resolved.encodeError,/查询参数.*手动/);
    for(const bad of ['https://relay.invalid/path%zz','https://relay.invalid/path#fragment','https://user:pass@relay.invalid/path'])assert.throws(()=>resolveCustomEndpoints({customGenerationURL:bad,customGenerationURLMode:'auto',customEncodeURLMode:'derived'}),/HTTP\/HTTPS|百分号|fragment/);
});

test('endpoint validation accepts arbitrary full HTTP(S) paths exactly, rejects credentials and other schemes',()=>{
    for(const url of ['https://gate.davidzhao.top/ai/generate-image','http://chami.yyqzx.com/image/chami','HTTPS://relay.invalid/custom%2fpath?b=2&a=1','http://localhost:1234/'])assert.equal(validateEndpoint(url),url);
    for(const url of ['', '/ai/generate-image','ftp://relay.invalid/image','javascript:alert(1)','https://user:pass@relay.invalid/image','https://user@relay.invalid',' https://relay.invalid'])assert.throws(()=>validateEndpoint(url),/HTTP\/HTTPS/);
    assert.equal(validateEndpoint('',{optional:true}),'');
});

test('custom endpoint is used once verbatim, with native payload and whole Bearer token for ordinary and Vibe requests',async()=>{
    for(const url of ['https://relay.invalid/ai/generate-image','http://relay.invalid/image/chami?x=%2f&y=1'])for(const vibes of [[],[{id,key:'fixture',strength:.5}]]){
        const {client,calls,settings}=fixture({url}),body={...request(),vibes};
        const image=await client.generate(body,{expectedKeyHash:'custom-hash',connection:connectionSnapshot(settings)});
        assert.equal(image,png.toString('base64'));
        const sent=calls.filter(call=>!call.url.startsWith('/user/'));assert.equal(sent.length,1);assert.equal(sent[0].url,url);
        const options=sent[0].options,payload=JSON.parse(options.body);
        assert.equal(options.headers.Authorization,'Bearer '+key);assert.equal(options.headers['Content-Type'],'application/json');assert.equal(options.headers['X-ST'],undefined);
        assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');
        assert.equal(payload.input,body.prompt);assert.equal(payload.prompt,undefined);assert.equal(payload.action,'generate');assert.equal(payload.parameters.steps,body.steps);
        assert.deepEqual(payload,naiPayload(body,vibes.length?{reference_image_multiple:[encoding],reference_information_extracted_multiple:[1],reference_strength_multiple:[.5]}:{}));
        assert.equal(JSON.stringify(settings).includes(key),false);assert.deepEqual(body.vibes,vibes);
    }
});

test('PNG signature wins over content-type; ZIP retains first non-directory PNG selection and saves base64',async()=>{
    const files=[{dir:true,name:'folder.png'}, {dir:false,name:'notes.txt'}, {dir:false,name:'first.PNG',async:async format=>{assert.equal(format,'base64');return png.toString('base64');}}, {dir:false,name:'second.png',async:()=>assert.fail('second PNG')}];
    let unzipped=0;const unzipPNG=bytes=>unzipNAIPNG(bytes,{loadZip:async()=>({loadAsync:async data=>{unzipped++;assert.deepEqual(Buffer.from(data),zip);return {files};}})});
    const saved=[];
    for(const bytes of [png,zip]){
        const image=await parseNAIImage(bytes,{unzipPNG});
        saved.push({extension:'png',data:image});
        const {client}=fixture({reply:()=>new Response(bytes,{headers:{'Content-Type':'application/json'}})});
        assert.equal(await client.generate(request()),image);
    }
    assert.equal(unzipped,1);assert.deepEqual(saved,[{extension:'png',data:png.toString('base64')},{extension:'png',data:png.toString('base64')}]);
    await assert.rejects(parseNAIImage(zip,{unzipPNG:bytes=>unzipNAIPNG(bytes,{loadZip:async()=>({loadAsync:async()=>({files:[]})})})}),/ZIP 损坏或没有 PNG/);
});

test('JSON, HTML, empty, unknown, corrupt ZIP and local save errors never resubmit an image',async()=>{
    for(const [bytes,pattern] of [[Buffer.from('{"error":{"message":"明确错误"}}'),/JSON.*明确错误/],[Buffer.from('<html>private raw page</html>'),/HTML/],[Buffer.alloc(0),/空响应/],[Buffer.from('unknown'),/未知格式/],[Buffer.from([80,75,3,4,99]),/ZIP 损坏/]]){
        const {client,calls,settings}=fixture({reply:()=>new Response(bytes)});
        await assert.rejects(runGenerationTask({scope:{...generationOptions(settings),autoRetryEnabled:true},generate:()=>client.generate(request()),retryOptions:{sleep:()=>assert.fail('no retry')}}),pattern);
        assert.equal(calls.length,1);
    }
    const {client,calls,settings}=fixture();
    await assert.rejects(runGenerationTask({scope:{...generationOptions(settings),autoRetryEnabled:true},generate:async()=>{await client.generate(request());throw Error('local image-save failure');},retryOptions:{sleep:()=>assert.fail('no retry')}}),/image-save/);
    assert.equal(calls.length,1);
});

test('custom errors preserve HTTP status, redact echoes and report only allowlisted parameter summaries',async()=>{
    for(const [status,detail,code] of [[403,'Forbidden','permission'],[403,'参考图最多支持 3 个','parameters'],[502,'Bad Gateway','unavailable'],[422,'Invalid steps','parameters']]){
        const {client,calls}=fixture({reply:()=>Response.json({error:{message:detail}},{status})});
        const body={...request(),vibes:Array.from({length:4},()=>({id,key:'fixture',strength:.5}))};
        await assert.rejects(client.generate(body),error=>{
            assert.equal(error.status,status);assert.equal(error.code,code);assert.equal(error.retryableGeneration,false);
            assert.match(error.message,new RegExp('HTTP '+status));assert.match(error.message,/步数.*Vibe 数量 4/);
            if(detail==='Forbidden')assert.match(error.message,/未提供具体原因/);
            assert.doesNotMatch(error.message,/private|cHJpdmF0ZS|custom-token|Authorization/);
            return true;
        });
        assert.equal(calls.filter(c=>c.url=== 'https://relay.invalid/image/custom?route=%2Fraw').length,1);
    }
    const body={...request(),vibes:[{id,key:'fixture',strength:.5}]},echo=[key,body.prompt,negative,encoding];
    for(const status of [200,400]){
        const {client}=fixture({reply:()=>Response.json({detail:'Invalid parameters '+echo.join(' | ')+' Authorization: Bearer another-token'},{status})});
        await assert.rejects(client.generate(body),error=>{const serialized=JSON.stringify(error)+error.message;for(const secret of [...echo,'another-token'])assert.equal(serialized.includes(secret),false);assert.match(error.message,/已隐藏/);return true;});
    }
});

test('generic 403 and unknown 502 do not guess parameter limits or change/retry the payload',async()=>{
    for(const [status,body] of [[403,{message:'Forbidden'}],[502,{detail:'Bad gateway'}]]){
        const {client,calls,settings}=fixture({reply:()=>Response.json(body,{status})}),input=request(),before=structuredClone(input);
        await assert.rejects(runGenerationTask({scope:{...generationOptions(settings),autoRetryEnabled:true},generate:()=>client.generate(input),retryOptions:{sleep:()=>assert.fail('no retry')}}),error=>{assert.notEqual(error.code,'parameters');assert.doesNotMatch(error.message,/超限|最多支持|格式错误/);return true;});
        assert.deepEqual(input,before);assert.equal(calls.length,1);
    }
});

test('missing encoding endpoint blocks online encoding before any I/O; import/export of existing Vibes remains available',async()=>{
    const {client,settings,calls}=fixture({settings:{customEncodeURL:''}});
    assert.equal(onlineEncodingAvailable(settings),false);
    await assert.rejects(client.encode({id,model:'nai-diffusion-4-5-full',information:.5}),/禁用在线 Vibe 编码/);assert.equal(calls.length,0);
    const [item]=await client.import({data:raw});assert.ok(item.id);
    const exported=await client.export([id]);assert.equal(exported.length,1);
    assert.equal(JSON.stringify(exported).includes(key),false);assert.equal(JSON.stringify(settings).includes(key),false);
    const image=await client.generate({...request(),vibes:[{id,key:'fixture',strength:.5}]});assert.equal(image,png.toString('base64'));
    assert.equal(calls.some(c=>c.url.includes('novelai.net')||c.url.includes('encode.invalid')),false);
});

test('custom encoding uses the independent exact URL and custom token, preserving native encode structure',async()=>{
    const {client,calls}=fixture({reply:()=>new Response('encoded fixture')});
    await client.encode({id,model:'nai-diffusion-4-5-full',information:.5});
    const encode=calls.find(c=>c.url==='https://encode.invalid/independent');assert.ok(encode);
    assert.equal(encode.options.headers.Authorization,'Bearer '+key);
    assert.deepEqual(JSON.parse(encode.options.body),{image:raw.image,model:'nai-diffusion-4-5-full',information_extracted:.5});
    assert.equal(calls.some(c=>c.url.includes('novelai.net')),false);
    assert.equal(calls.filter(c=>c.url==='/api/files/upload').some(c=>c.options.body.includes(key)),false);
});

test('new custom routes send generation and Vibe encoding to the snapshotted derived endpoints',async()=>{
    const {client,calls,settings}=fixture({url:'https://relay.invalid/v1/',reply:url=>url.includes('/generate-image')?new Response(png):new Response('encoded fixture'),settings:{customGenerationURLMode:'auto',customEncodeURL:'',customEncodeURLMode:'derived'}});
    const connection=connectionSnapshot(settings);
    assert.equal(connection.resolvedGenerationURL,'https://relay.invalid/v1/ai/generate-image');
    assert.equal(connection.resolvedEncodeURL,'https://relay.invalid/v1/ai/encode-vibe');
    await client.generate(request(),{connection});
    await client.encode({id,model:'nai-diffusion-4-5-full',information:.5},{connection});
    const generation=calls.find(call=>call.url===connection.resolvedGenerationURL),encode=calls.find(call=>call.url===connection.resolvedEncodeURL);
    assert.ok(generation);assert.ok(encode);assert.equal(generation.options.headers.Authorization,'Bearer '+key);assert.equal(encode.options.headers.Authorization,'Bearer '+key);
    assert.equal(generation.options.headers['Content-Type'],'application/json');assert.equal(encode.options.headers['Content-Type'],'application/json');
    assert.equal(generation.options.credentials,'omit');assert.equal(encode.options.credentials,'omit');assert.equal(generation.options.redirect,'error');assert.equal(encode.options.redirect,'error');
    assert.deepEqual(JSON.parse(encode.options.body),{image:raw.image,model:'nai-diffusion-4-5-full',information_extracted:.5});
    assert.equal(calls.some(call=>call.url.includes('novelai.net')),false);
});

test('ambiguous derived Vibe routes and disabled encoding never send a POST',async()=>{
    for(const customEncodeURLMode of ['derived','disabled']){
        const {client,calls}=fixture({url:'https://relay.invalid/v1?tenant=test',settings:{customGenerationURLMode:'auto',customEncodeURL:'',customEncodeURLMode}});
        assert.equal(onlineEncodingAvailable({naiConnection:'custom',customGenerationURL:'https://relay.invalid/v1?tenant=test',customGenerationURLMode:'auto',customEncodeURLMode}),false);
        await assert.rejects(client.encode({id,model:'nai-diffusion-4-5-full',information:.5}),/查询参数|禁用在线/);
        assert.equal(calls.filter(call=>String(call.options.method).toUpperCase()==='POST'&&!call.url.startsWith('/api/')).length,0);
    }
});

test('prepared/local queued tasks reject changed connection, either URL, credential, or switch-away-and-back before send',async()=>{
    for(const change of [s=>s.naiConnection='official',s=>s.customGenerationURL+='2',s=>s.customEncodeURL+='2',s=>s.customGenerationURLMode='auto',s=>s.customEncodeURLMode='disabled',s=>s.customKeyHash='changed',s=>{s.naiConnection='official';s.connectionRevision=1;s.naiConnection='custom';s.connectionRevision=2;}]){
        const {client,settings,calls}=fixture(),snapshot=generationOptions(settings),valid=()=>{assertConnection(settings,snapshot);return true;};
        const prepared=await prepareGeneration(()=>client.prepareGenerate(request(),{connection:snapshot}),{canContinue:valid});
        change(settings);
        await assert.rejects(sendPrepared(prepared,{canContinue:valid}),/已更换/);
        await assert.rejects(client.prepareGenerate(request(),{connection:snapshot}),/已更换/);
        assert.equal(calls.length,0);
    }
});

test('custom generation uses existing cloud lease, wait, retry and release with only credential fingerprint sent to queue',async()=>{
    let now=0,posts=0;const {client,settings,calls}=fixture({reply:()=>++posts===1?Response.json({message:'Too many requests'},{status:429}):new Response(png)});
    settings.customKeyHash=await fingerprintKey(key);settings.cloudQueue=true;settings.autoRetryEnabled=true;settings.queueUrl='https://queue.invalid';
    const scope=generationOptions(settings),q=new LeaseQueue({now:()=>now}),rpc=[],events=[],valid=()=>{assertConnection(settings,scope);return true;};
    const prepared=await prepareGeneration(()=>client.prepareGenerate(request(),{connection:scope,expectedKeyHash:scope.keyHash}),{canContinue:valid});
    const requestJSON=async(url,{body}={})=>{rpc.push({url,body});const path=new URL(url).pathname;return path==='/ping'?{ready:true,capabilities:queueCapabilities}:path==='/join-queue'?q.join(body):path==='/my-turn'?q.turn(body):path==='/begin-generation'?q.begin(body):path==='/retry-generation'?q.retry(body):q.finish(body);};
    const image=await runGenerationTask({scope,canContinue:valid,queueOptions:{requestJSON,now:()=>now,sleep:async ms=>{now+=ms;}},generate:async controls=>{
        await waitForGeneration({canContinue:valid,random:()=>0,sleep:async ms=>{events.push('wait');now+=ms;}});
        assert.equal(q.stats().active,1);events.push('send');return sendPrepared(prepared,{...controls,canContinue:valid});
    }});
    assert.equal(image,png.toString('base64'));assert.equal(posts,2);assert.deepEqual(events,['wait','send','wait','send']);assert.equal(q.stats().active,0);
    assert.equal(scope.keyHash,await fingerprintKey(key));assert.notEqual(scope.keyHash,settings.keyHash);
    const serialized=JSON.stringify(rpc);for(const secret of [key,prompt,negative,settings.customGenerationURL,settings.customEncodeURL,scope.resolvedGenerationURL,scope.resolvedEncodeURL])assert.equal(serialized.includes(secret),false);
    assert.equal(calls.length,2);
});

test('cancellation while waiting for existing cloud permission prevents custom POST',async()=>{
    const {client,settings,calls}=fixture();settings.customKeyHash=await fingerprintKey(key);
    const scope=generationOptions({...settings,cloudQueue:true,queueUrl:'https://queue.invalid'}),q=new LeaseQueue(),prepared=await client.prepareGenerate(request(),{connection:scope});let valid=true;
    await assert.rejects(runGenerationTask({scope,canContinue:()=>valid,queueOptions:{requestJSON:async(url,{body}={})=>{const path=new URL(url).pathname;if(path==='/ping')return {ready:true,capabilities:queueCapabilities};if(path==='/join-queue')return q.join(body);if(path==='/my-turn')return q.turn(body);if(path==='/begin-generation'){valid=false;return q.begin(body);}return q.finish(body);}},generate:controls=>sendPrepared(prepared,{...controls,canContinue:()=>valid})}),/原消息|未发送/);
    assert.equal(calls.length,0);
});

test('official routing remains tavern for ordinary ST generation and direct for TT/Vibes',async()=>{
    const official={naiConnection:'official'};
    assert.equal(usesDirectGeneration(official,false,[]),false);
    assert.equal(usesDirectGeneration(official,true,[]),true);
    assert.equal(usesDirectGeneration(official,false,[{id}]),true);
    assert.equal(usesDirectGeneration({naiConnection:'custom'},false,[]),true);
    const {client,calls}=fixture({settings:{naiConnection:'official'}});
    await client.generate({...request(),vibes:[{id,key:'fixture',strength:.5}]});
    const sent=calls.find(c=>c.url==='https://image.novelai.net/ai/generate-image');assert.ok(sent);assert.equal(sent.options.headers.Authorization,'Bearer official-token');
    assert.equal(onlineEncodingAvailable({naiConnection:'official',customEncodeURL:''}),true);
});

test('CORS/mixed content failures explain browser restrictions without retrying or leaking token',async()=>{
    const {client,calls}=fixture({reply:()=>{throw new TypeError('raw '+key);}});
    await assert.rejects(client.generate(request()),error=>{assert.equal(error.name,'TypeError');assert.match(error.message,/CORS.*混合内容/);assert.equal(error.message.includes(key),false);return true;});
    assert.equal(calls.length,1);
});

test('query credentials in custom endpoint URLs never enter request diagnostics or errors',async()=>{
    const marker='query-secret-marker',diagnostics=[],{client}=fixture({url:`https://relay.invalid/image/custom?token=${marker}`,reply:()=>{throw new TypeError(`Failed to fetch https://relay.invalid/image/custom?token=${marker}`);},onDiagnostic:entry=>diagnostics.push(entry)});
    await assert.rejects(client.generate(request()),error=>{assert.equal(error.message.includes(marker),false);return true;});
    assert.equal(JSON.stringify(diagnostics).includes(marker),false);assert.equal(diagnostics.length,1);assert.equal(diagnostics[0].endpointProtocol,'https');
});

test('saving validates locally, keeps only endpoints/hash and excludes token from profile exports',async()=>{
    let saved=0;const settings={keyHash:'official-existing',rememberDirectKey:true,rememberCustomKey:false},values=[],vault={set:async(...args)=>values.push(args),get:async()=>''};
    const save=()=>saved++;
    await saveCustomConnection({settings,vault,input:key,generationURL:'http://relay.invalid/custom',fingerprint:fingerprintKey,save});
    assert.deepEqual(values,[[key,false]]);assert.equal(saved,1);assert.equal(settings.keyHash,'official-existing');assert.equal(settings.rememberDirectKey,true);
    assert.equal(settings.customKeyHash,await fingerprintKey(key));assert.equal(settings.customEncodeURL,'');assert.equal(settings.customGenerationURLMode,'auto');assert.equal(settings.customEncodeURLMode,'derived');
    assert.equal(JSON.stringify(settings).includes(key),false);assert.equal(JSON.stringify(promptFileData({...defaults,...settings})).includes(key),false);
    await assert.rejects(saveCustomConnection({settings,vault,input:key,generationURL:'ftp://relay.invalid',fingerprint:fingerprintKey,save}),/HTTP\/HTTPS/);assert.equal(values.length,1);
});

test('cross-origin manual Vibe endpoint requires explicit confirmation before saving the shared Key',async()=>{
    const settings={},values=[],vault={set:async(...args)=>values.push(args),get:async()=>''},save=()=>{};
    const valuesToSave={settings,vault,input:key,generationURL:'https://relay.invalid/v1',generationURLMode:'auto',encodeURL:'https://other.invalid/encode?token=private',encodeURLMode:'manual',fingerprint:fingerprintKey,save};
    await assert.rejects(saveCustomConnection(valuesToSave),/需要确认.*另一站点/);assert.equal(values.length,0);assert.equal(settings.customGenerationURL,undefined);
    let confirmation;
    await saveCustomConnection({...valuesToSave,confirmCrossOrigin:async origins=>{confirmation=origins;return true;}});
    assert.deepEqual(confirmation,{generationOrigin:'https://relay.invalid',encodeOrigin:'https://other.invalid'});
    assert.equal(values.length,1);assert.equal(settings.customEncodeURL,'https://other.invalid/encode?token=private');assert.equal(settings.customEncodeURLMode,'manual');
});
