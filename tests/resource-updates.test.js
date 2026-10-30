import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {BUNDLED_RESOURCES} from '../src/resources/resources.js';
import {sha256} from '../src/platform/browser-crypto.js';
import {createResourceUpdater,validateResourceManifest,RESOURCE_REMOTE_BASE} from '../src/resources/resource-updates.js';

test('resource notifications cover bundled and remote upgrades, deduplicate and never downgrade',async()=>{
    const settings={installed:true,resourceVersion:'2.1-1024'},notices=[],calls=[];let revision=BUNDLED_RESOURCES.revision+1,time=0;
    const updater=createResourceUpdater({settings,localBase:'https://tavern/plugin/',now:()=>time,onAvailable:state=>notices.push(state.latest.revision),fetchImpl:async(url,options)=>{calls.push({url:String(url),options});return Response.json({...BUNDLED_RESOURCES,revision,version:'2.2.2-1026b'});}});
    await Promise.all([updater.check(),updater.check()]);await updater.check();
    assert.deepEqual(notices,[BUNDLED_RESOURCES.revision,revision]);assert.equal(calls.length,1);
    assert.equal(calls[0].options.credentials,'omit');assert.equal(calls[0].options.headers,undefined);assert.equal(calls[0].url,RESOURCE_REMOTE_BASE+'assets/resource-manifest.json');
    Object.assign(settings,{resourceVersion:'2.2.2-1026b',resourceRevision:revision});updater.changed();assert.equal(updater.snapshot().available,false);
    revision--;time+=600001;await updater.check();assert.equal(updater.snapshot().latest.revision,BUNDLED_RESOURCES.revision+1);assert.equal(notices.length,2);
    settings.resourceRevision++;assert.equal(updater.snapshot().available,false);await assert.rejects(updater.load(),/版本较新/);
});
test('offline checks retain bundled updates and manual checks can recover',async()=>{
    let offline=true;const settings={installed:true,resourceVersion:'old'};
    const updater=createResourceUpdater({settings,localBase:'https://tavern/plugin/',fetchImpl:async()=>{if(offline)throw Error('offline');return Response.json(BUNDLED_RESOURCES);}});
    await assert.rejects(updater.check(),/offline/);assert.equal(updater.snapshot().available,true);assert.equal(updater.snapshot().checking,false);assert.match(updater.snapshot().error,/offline/);
    offline=false;await updater.check(true);assert.equal(updater.snapshot().error,'');
});
test('downloaded packs are verified before use and future resources load without a plugin reload',async()=>{
    const world='{"entries":{"0":{"uid":0,"comment":"主体","content":"new"}}}',regex='[]';
    const manifest={...BUNDLED_RESOURCES,revision:BUNDLED_RESOURCES.revision+1,version:'2.3-1101',worldName:'[喵喵]文生图 2.3',worldSHA256:await sha256(world),regexSHA256:await sha256(regex)};
    let corrupt=false;const calls=[];
    const updater=createResourceUpdater({settings:{},localBase:'https://tavern/plugin/',fetchImpl:async url=>{url=String(url);calls.push(url);return url.endsWith('resource-manifest.json')?Response.json(manifest):new Response(url.includes('worldbook.json')?(corrupt?'corrupt':world):regex);}});
    await updater.check();const pack=await updater.load();assert.equal(pack.world,world);assert.deepEqual(pack.rules,[]);assert.equal(pack.manifest.worldName,manifest.worldName);
    assert.ok(calls.every(url=>url.startsWith(RESOURCE_REMOTE_BASE)));assert.ok(calls.slice(1).every(url=>url.includes('?v=')));
    corrupt=true;await assert.rejects(updater.load(),/校验失败/);
    assert.throws(()=>validateResourceManifest({...manifest,worldName:'用户世界书'}),/版本信息/);
    assert.throws(()=>validateResourceManifest({...manifest,worldSHA256:'bad'}),/版本信息/);
});
test('bundled resource metadata matches the shipped files across line endings',async()=>{
    const manifest=JSON.parse(await readFile(new URL('../assets/resource-manifest.json',import.meta.url),'utf8'));
    assert.deepEqual(manifest,BUNDLED_RESOURCES);
    for(const [file,key] of [['worldbook.json','worldSHA256'],['regex.json','regexSHA256']]){
        const text=await readFile(new URL('../assets/'+file,import.meta.url),'utf8');assert.equal(await sha256(text.replace(/\r\n/g,'\n')),manifest[key]);
    }
});

test('resource manifests accept patch versions and reject mismatched version labels',()=>{
    const patch={...BUNDLED_RESOURCES,worldName:'[喵喵]文生图 2.2.2',version:'2.2.2-1026'};
    assert.deepEqual(validateResourceManifest(patch),patch);
    assert.throws(()=>validateResourceManifest({...patch,version:'2.2-1025'}),/版本信息/);
    assert.throws(()=>validateResourceManifest({...patch,worldName:'[喵喵]文生图 2.2.1.1'}),/版本信息/);
});
