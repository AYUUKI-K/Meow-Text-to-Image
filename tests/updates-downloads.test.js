import test from 'node:test';import assert from 'node:assert/strict';
import {createExtensionUpdater} from '../src/platform/updates.js';
import {downloadImageSelection,downloadLocalPNG,downloadBrowserBlob} from '../src/images/downloads.js';
for(const folder of ['Mewo-Text-to-Image','Meow-Text-to-Image'])test(`update checks cache and only update the installed ${folder} in its own scope`,async()=>{
    const calls=[];
    const updater=createExtensionUpdater({moduleURL:`https://tavern/scripts/extensions/third-party/${folder}/index.js`,getGlobal:name=>name==='third-party/'+folder,getHeaders:()=>({'X-CSRF-Token':'test'}),fetchImpl:async(url,options)=>{calls.push({url,...JSON.parse(options.body)});return Response.json({isUpToDate:false});}});
    await Promise.all([updater.check(),updater.check()]);await updater.check();assert.equal(calls.length,1);
    await updater.check(true);assert.equal(calls.length,2);
    await updater.install();assert.equal((await updater.check()).needsReload,true);assert.equal(calls.length,4);
    assert.deepEqual(calls.map(c=>c.url),['/api/extensions/version','/api/extensions/version','/api/extensions/update','/api/extensions/version']);
    for(const call of calls){assert.equal(call.extensionName,folder);assert.equal(call.global,true);}
    assert.throws(()=>createExtensionUpdater({moduleURL:'https://example.com/index.js'}),/安装目录/);
});
test('failed update remains an error and never pretends it was installed',async()=>{
    const updater=createExtensionUpdater({moduleURL:'https://tavern/third-party/miao/index.js',getHeaders:()=>({}),fetchImpl:async()=>new Response('Forbidden',{status:403})});
    await assert.rejects(updater.install(),/403/);await assert.rejects(updater.check(),/403/);
});
test('selected images download separately with original names and image contents',async()=>{
    const requests=[],saves=[];
    await downloadImageSelection([{name:'first.png',url:'/first'},{name:'second.png',url:'/second'}],{
        fetchImpl:async url=>{requests.push(url);return new Response(url,{headers:{'Content-Type':'image/png'}});},
        saveBlob:async(blob,name)=>saves.push({name,type:blob.type,content:await blob.text()})});
    assert.deepEqual(requests,['/first','/second']);
    assert.deepEqual(saves,[{name:'first.png',type:'image/png',content:'/first'},{name:'second.png',type:'image/png',content:'/second'}]);
});

test('empty or failed selection produces no download',async()=>{
    let saves=0;const options={fetchImpl:async()=>new Response('',{status:404}),saveBlob:()=>saves++};
    await assert.rejects(downloadImageSelection([],options),/勾选/);
    await assert.rejects(downloadImageSelection([{name:'missing.png',url:'/missing'}],options),/missing.png.*404/);assert.equal(saves,0);
});

test('native export cancellation stops the remaining selected downloads',async()=>{
    const requests=[];await downloadImageSelection([{name:'a.png',url:'/a'},{name:'b.png',url:'/b'}],{
        fetchImpl:async url=>{requests.push(url);return new Response('png');},saveBlob:async()=>({delivered:false})});
    assert.deepEqual(requests,['/a']);
});

test('local PNG downloads use the original same-origin URL without fetching or copying its bytes',()=>{
    const started=[],removed=[];const documentImpl={body:{append(){}},createElement(){return {click(){started.push({url:this.href,name:this.download});},remove(){removed.push(true);}};}};
    const options={base:'http://127.0.0.1:8000/chat',documentImpl};
    assert.equal(downloadLocalPNG({url:'/user/images/miao-nai/miao-123.png',name:'原图.png'},options),true);
    assert.deepEqual(started,[{url:'http://127.0.0.1:8000/user/images/miao-nai/miao-123.png',name:'原图.png'}]);assert.equal(removed.length,1);
    for(const url of ['https://other.test/user/images/a.png','data:image/png;base64,AA==','blob:http://127.0.0.1:8000/fixture','/api/delete.png','/user/images/file.jpg','http://name:secret@127.0.0.1:8000/user/images/a.png'])assert.equal(downloadLocalPNG({url,name:'image.png'},options),false);
    assert.equal(started.length,1);
});

test('URL selection downloads start synchronously and retain the Blob path for unsupported sources',async()=>{
    const started=[],fetched=[],saved=[];
    const pending=downloadImageSelection([{url:'/local.png',name:'local.png'},{url:'/other.jpg',name:'other.jpg'}],{downloadURL:image=>{started.push(image.name);return image.url==='/local.png';},fetchImpl:async url=>{fetched.push(url);return new Response('jpeg bytes');},saveBlob:async(blob,name)=>saved.push(name)});
    assert.deepEqual(started,['local.png','other.jpg']);await pending;assert.deepEqual(fetched,['/other.jpg']);assert.deepEqual(saved,['other.jpg']);
});

test('browser Blob exports use one top-level context and keep URLs alive while the download starts',()=>{
    const events=[],timers=[],source=new Blob(['fixture bytes'],{type:'image/png'});
    const top={document:{body:{append:()=>events.push('append')},createElement:()=>({click(){events.push({url:this.href,name:this.download});},remove(){events.push('remove');}})},URL:{createObjectURL:blob=>{assert.equal(blob,source);events.push('create');return 'blob:top-fixture';},revokeObjectURL:url=>events.push({revoked:url})},setTimeout:(run,delay)=>timers.push({run,delay})};
    const child={top,document:{createElement(){throw Error('must not download in the iframe');}}};
    downloadBrowserBlob(source,'原图.png',{windowImpl:child});
    assert.deepEqual(events,['create','append',{url:'blob:top-fixture',name:'原图.png'},'remove']);assert.equal(timers[0].delay,60000);timers[0].run();assert.deepEqual(events.at(-1),{revoked:'blob:top-fixture'});
});

test('cross-origin parent access falls back to the current page without losing cleanup on a click error',()=>{
    const events=[],timers=[];const current={document:{body:{append(){}},createElement:()=>({click(){throw Error('download rejected');},remove(){events.push('remove');}})},URL:{createObjectURL:()=> 'blob:local-fixture',revokeObjectURL:url=>events.push(url)},setTimeout:run=>timers.push(run)};
    Object.defineProperty(current,'top',{get(){throw Error('cross-origin');}});
    assert.throws(()=>downloadBrowserBlob(new Blob(['bytes']),'image.png',{windowImpl:current}),/download rejected/);assert.deepEqual(events,['remove']);timers[0]();assert.deepEqual(events,['remove','blob:local-fixture']);
});
