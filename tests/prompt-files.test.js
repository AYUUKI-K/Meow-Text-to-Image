import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults} from '../core.js';
import {promptFileData,promptFilename,importPromptData,readPromptFile,PROMPT_FILE_LIMIT} from '../prompt-files.js';

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
