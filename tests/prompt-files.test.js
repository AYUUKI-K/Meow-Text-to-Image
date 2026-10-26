import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults} from '../core.js';
import {promptFileData,promptFilename,importPromptData,readPromptFile,readPromptFiles,promptBundleData,PROMPT_BUNDLE_LIMIT,readPreviewData,PROMPT_FILE_LIMIT,PREVIEW_DATA_LIMIT} from '../prompt-files.js';

const profile={...defaults,name:'猫猫',positive:'year 2025,\n1.5::artist:猫::, ',positiveSuffix:'\nno text,',negative:'lowres, bad hands',vibes:[{id:'private-vibe',strength:0.8}],key:'private-key',model:'nai-diffusion-4-5-curated',width:1216,height:832,steps:28,scale:6.5,seed:12345,sampler:'k_dpmpp_2m',scheduler:'exponential',varietyBoost:true};
test('prompt files round trip all three strings and generation parameters without Vibes or keys',async()=>{
    const data=promptFileData(profile),serialized=JSON.stringify(data);
    assert.deepEqual(Object.keys(data).sort(),['name','parameters','prompts','type','version']);
    assert.deepEqual(Object.keys(data.prompts).sort(),['negative','positive','positiveSuffix']);
    assert.ok(!serialized.includes('private'));
    const restored=await readPromptFile(new File(['\uFEFF'+serialized],'串.json'));
    for(const field of ['positive','positiveSuffix','negative'])assert.equal(restored[field],profile[field]);
    assert.deepEqual(restored.vibes,[]);assert.equal(restored.vibeEnabled,false);for(const field of ['model','width','height','steps','scale','seed','sampler','scheduler','varietyBoost'])assert.equal(restored[field],profile[field]);
});
test('import creates a unique profile and ignores injected non-profile properties',()=>{
    const existing=[profile,{...profile,name:'猫猫 (2)'}],before=JSON.stringify(existing);
    const data={...promptFileData(profile),vibes:profile.vibes,key:'private-key',model:'anything',prompts:{...promptFileData(profile).prompts,vibes:profile.vibes},parameters:{...promptFileData(profile).parameters,vibes:profile.vibes,key:'private-key'}};
    const restored=importPromptData(data,existing);
    assert.equal(restored.name,'猫猫 (3)');assert.equal(JSON.stringify(existing),before);
    assert.equal(restored.key,undefined);assert.equal(restored.model,profile.model);assert.deepEqual(restored.vibes,[]);
});
test('invalid and oversized files fail before import; empty prompt strings are valid',async()=>{
    await assert.rejects(readPromptFile(new File(['not json'],'串.json')),/有效的 JSON/);
    for(const data of [null,{}, {...promptFileData(profile),version:3},{...promptFileData(profile),prompts:{positive:'a'}},{...promptFileData(profile),prompts:{positive:5,positiveSuffix:'',negative:''}}])assert.throws(()=>importPromptData(data),/导出的 JSON/);
    await assert.rejects(readPromptFile({size:PROMPT_FILE_LIMIT+1,text(){throw Error('must not read');}}),/1 MB/);
    assert.equal(importPromptData(promptFileData({...profile,positive:'',positiveSuffix:'',negative:''})).positive,'');
    assert.equal(promptFilename('a/b:c*?.'),'喵喵NAI-a_b_c__.json');
});

test('legacy prompt-only files remain importable and ignore extra parameters',()=>{
    const data={...promptFileData(profile),version:1};
    const restored=importPromptData(data);
    assert.equal(restored.positive,profile.positive);assert.equal(restored.width,defaults.width);assert.equal(restored.varietyBoost,false);assert.deepEqual(restored.vibes,[]);
});
test('invalid parameter files fail without silently replacing the configuration',()=>{
    const data=promptFileData(profile);
    assert.throws(()=>importPromptData({...data,parameters:null}),/缺少生成参数/);
    for(const patch of [{width:513},{height:0},{steps:51},{scale:11},{seed:-2},{width:2048,height:2048},{model:''},{sampler:{}},{scheduler:' '.repeat(3)},{varietyBoost:'true'},{width:null}])assert.throws(()=>importPromptData({...data,parameters:{...data.parameters,...patch}}));
    assert.equal(importPromptData({...data,parameters:{...data.parameters,seed:-1}}).seed,-1);
});

const png={mime:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII='};
test('portable examples contain only raster bytes and restore before the new configuration is returned',async()=>{
    const source={...profile,preview:{url:'/user/images/local/sample-123.png',signature:'private-vibe'}},data=promptFileData(source,{...png,url:'private URL',signature:'private signature'});
    assert.deepEqual(data.preview,png);assert.ok(!JSON.stringify(data).includes('private'));assert.ok(!JSON.stringify(data).includes('/user/'));
    const existing=[source],before=JSON.stringify(existing),file=new File([JSON.stringify(data)],'randomhash.json');let calls=0;
    const restored=await readPromptFile(file,existing,{restorePreview:async(image,p)=>{calls++;assert.deepEqual(image,png);assert.equal(p.name,'猫猫 (2)');assert.deepEqual(p.vibes,[]);assert.equal(p.preview,undefined);return {url:'/user/images/new/sample-456.png',signature:'fresh'};}});
    assert.equal(calls,1);assert.equal(restored.preview.url,'/user/images/new/sample-456.png');assert.equal(JSON.stringify(existing),before);
    await assert.rejects(readPromptFile(file,existing),/更新插件/);
    await assert.rejects(readPromptFile(file,existing,{restorePreview:async()=>{throw Error('storage failed');}}),/storage failed/);assert.equal(JSON.stringify(existing),before);
});
test('example data rejects links, scripts, invalid encodings, oversized payloads and excessive dimensions',async()=>{
    const huge=Buffer.from(png.data,'base64');huge.writeUInt32BE(100000,16);
    for(const preview of [null,{url:'https://remote/image.png'},{mime:'image/svg+xml',data:btoa('<svg/>')},{mime:'image/png',data:btoa('<html>text</html>')},{...png,data:png.data+'==='},{...png,data:'A'.repeat(PREVIEW_DATA_LIMIT+4)},{...png,data:huge.toString('base64')},{mime:'image/jpeg',data:png.data}]){
        assert.throws(()=>readPreviewData(preview),/例图/);
        let called=false;await assert.rejects(readPromptFile(new File([JSON.stringify({...promptFileData(profile),preview})],'invalid.json'),[],{restorePreview:async()=>{called=true;}}),/例图/);assert.equal(called,false);
    }
    assert.equal(promptFilename('白发猫猫 · 串'),'喵喵NAI-白发猫猫 · 串.json');
});

test('selected profiles round trip as one package, preserving order, parameters and examples but excluding private fields',async()=>{
 const data=promptBundleData([promptFileData(profile,png),promptFileData({...profile,name:'second',width:512,height:512})]);
 assert.equal(data.profiles.length,2);assert.ok(!JSON.stringify(data).includes('private'));let restored=0;
 const result=await readPromptFiles(new File([JSON.stringify(data)],'package.json'),[profile],{restorePreview:async()=>{restored++;return {url:'restored.png'};}});
 assert.equal(restored,1);assert.deepEqual(result.map(p=>p.name),['猫猫 (2)','second']);assert.equal(result[0].preview.url,'restored.png');assert.equal(result[0].steps,28);assert.equal(result[1].width,512);assert.ok(result.every(p=>!p.vibes.length&&!p.vibeEnabled));
 const repeated=await readPromptFiles(new File([JSON.stringify(promptBundleData([promptFileData(profile),promptFileData(profile)]))],'same.json'),[profile]);assert.deepEqual(repeated.map(p=>p.name),['猫猫 (2)','猫猫 (3)']);
});
test('a corrupt package is fully rejected before restoring images, and package import accepts individual legacy files',async()=>{
 const data={type:'miao-nai-prompt-bundle',version:1,profiles:[promptFileData(profile,png),{bad:true}]};let writes=0;
 await assert.rejects(readPromptFiles(new File([JSON.stringify(data)],'broken.json'),[],{restorePreview:async()=>{writes++;}}));assert.equal(writes,0);
 for(const profiles of [[],Array.from({length:101},()=>promptFileData(profile))])assert.throws(()=>promptBundleData(profiles));
 await assert.rejects(readPromptFiles({size:PROMPT_BUNDLE_LIMIT+1,text(){throw Error('must not read');}}),/20 MB/);
 const result=await readPromptFiles(new File([JSON.stringify({...promptFileData(profile),version:1})],'old.json'));assert.equal(result.length,1);assert.equal(result[0].width,defaults.width);
});
