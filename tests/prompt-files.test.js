import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults} from '../core.js';
import {promptFileData,promptFilename,importPromptData,readPromptFile,PROMPT_FILE_LIMIT} from '../prompt-files.js';

const profile={...defaults,name:'猫猫',positive:'year 2025,\n1.5::artist:猫::, ',positiveSuffix:'\nno text,',negative:'lowres, bad hands',vibes:[{id:'private-vibe',strength:0.8}],key:'private-key',width:1216};
test('prompt files round trip all three strings without Vibes, keys or generation settings',async()=>{
    const data=promptFileData(profile),serialized=JSON.stringify(data);
    assert.deepEqual(Object.keys(data).sort(),['name','prompts','type','version']);
    assert.deepEqual(Object.keys(data.prompts).sort(),['negative','positive','positiveSuffix']);
    assert.ok(!serialized.includes('private'));
    const restored=await readPromptFile(new File(['\uFEFF'+serialized],'串.json'));
    for(const field of ['positive','positiveSuffix','negative'])assert.equal(restored[field],profile[field]);
    assert.deepEqual(restored.vibes,[]);assert.equal(restored.vibeEnabled,false);assert.equal(restored.width,defaults.width);
});
test('import creates a unique profile and ignores injected non-prompt properties',()=>{
    const existing=[profile,{...profile,name:'猫猫 (2)'}],before=JSON.stringify(existing);
    const data={...promptFileData(profile),vibes:profile.vibes,key:'private-key',model:'anything',prompts:{...promptFileData(profile).prompts,vibes:profile.vibes}};
    const restored=importPromptData(data,existing);
    assert.equal(restored.name,'猫猫 (3)');assert.equal(JSON.stringify(existing),before);
    assert.equal(restored.key,undefined);assert.equal(restored.model,defaults.model);assert.deepEqual(restored.vibes,[]);
});
test('invalid and oversized files fail before import; empty prompt strings are valid',async()=>{
    await assert.rejects(readPromptFile(new File(['not json'],'串.json')),/有效的 JSON/);
    for(const data of [null,{}, {...promptFileData(profile),version:2},{...promptFileData(profile),prompts:{positive:'a'}},{...promptFileData(profile),prompts:{positive:5,positiveSuffix:'',negative:''}}])assert.throws(()=>importPromptData(data),/导出的 JSON/);
    await assert.rejects(readPromptFile({size:PROMPT_FILE_LIMIT+1,text(){throw Error('must not read');}}),/1 MB/);
    assert.equal(importPromptData(promptFileData({...profile,positive:'',positiveSuffix:'',negative:''})).positive,'');
    assert.equal(promptFilename('a/b:c*?.'),'喵喵NAI-a_b_c__.json');
});
