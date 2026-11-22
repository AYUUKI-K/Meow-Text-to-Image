import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRequest, defaults} from '../src/core/core.js';
import {generationInfo} from '../src/images/image-metadata.js';
import {naiPayload} from '../src/novelai/direct-client.js';
import {usesDirectGeneration} from '../src/novelai/nai-connection.js';

const profile={...defaults, positive:'fixture style', positiveSuffix:'fixture lighting', negative:'watermark', qualityPreset:'none', ucPreset:'none', seed:1};

test('structured captions keep style on the scene and match numbered UC and centers',()=>{
    const raw=`Scene Composition: two people, park;
Character 2 Prompt: person, green coat | centers: E5;
Character 2 UC: hat;
Character 1 Prompt: person, red coat |centers:A2;
Character 1 UC: glasses;`;
    const request=buildRequest(profile,raw);
    const {input,parameters}=naiPayload(request);
    assert.equal(input,'fixture style,\ntwo people, park,\nfixture lighting,');
    assert.equal(parameters.negative_prompt,'watermark');
    assert.equal(parameters.use_coords,true);
    assert.equal(parameters.v4_prompt.use_coords,true);
    assert.deepEqual(parameters.v4_prompt.caption.char_captions,[
        {char_caption:'person, red coat',centers:[{x:0.1,y:0.3}]},
        {char_caption:'person, green coat',centers:[{x:0.9,y:0.9}]},
    ]);
    assert.deepEqual(parameters.v4_negative_prompt.caption.char_captions,[
        {char_caption:'glasses',centers:[{x:0.1,y:0.3}]},
        {char_caption:'hat',centers:[{x:0.9,y:0.9}]},
    ]);
    assert.equal(usesDirectGeneration({naiConnection:'official'},false,[],request.characters),true);
    const info=generationInfo({text:[]},{request});
    assert.deepEqual(info.characters.map(c=>[c.positive,c.negative]),[['person, red coat','glasses'],['person, green coat','hat']]);
});

test('inline legacy layout and plain image prompts stay usable',()=>{
    const request=buildRequest(profile,'park, Character 1 Prompt: red coat, Character 2 Prompt: green coat');
    const {parameters}=naiPayload(request);
    assert.equal(parameters.use_coords,false);
    assert.deepEqual(parameters.characterPrompts.map(c=>[c.prompt,c.uc]),[['red coat',''],['green coat','']]);
    const scene='red coat, Text: spring; bright morning';
    assert.equal(buildRequest(profile,scene).prompt,`fixture style,\n${scene},\nfixture lighting,`);
    const plain=naiPayload(buildRequest(profile,scene));
    assert.deepEqual(plain.parameters.v4_prompt.caption.char_captions,[]);
    assert.deepEqual(plain.parameters.characterPrompts,[]);
});

test('invalid coordinates and incomplete or incompatible character fields stop before submission',()=>{
    assert.throws(()=>buildRequest(profile,'Scene Composition: park; Character 1 Prompt: coat |centers:Z9;'),/A1 到 E5/);
    assert.throws(()=>buildRequest(profile,'Scene Composition: park; Character 2 UC: hat;'),/角色 2 缺少正面/);
    assert.throws(()=>buildRequest(profile,'park; Character 1 Prompt: red coat; Character 01 Prompt: blue coat;'),/重复/);
    assert.throws(()=>buildRequest({...profile,model:'nai-diffusion-3'},'park; Character 1 Prompt: coat;'),/V4/);
});
