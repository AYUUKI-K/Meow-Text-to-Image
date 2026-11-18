import test from 'node:test';
import assert from 'node:assert/strict';
import {activeSecondaryPreset, addSecondaryPreset, listedSecondaryMacros, readSecondaryLibrary, readSecondaryPreset, secondaryPresetFile} from '../src/prompts/secondary-presets.js';
import {buildSecondaryMessages} from '../src/prompts/secondary-tags.js';

test('an existing secondary preset retains its current instructions and raw-body layout', ()=>{
    const legacy={name:'My previous preset',instructions:'Use visual tags.'};
    const preset=activeSecondaryPreset(readSecondaryLibrary({secondaryTagAPI:{preset:legacy}}));
    assert.equal(preset.name,legacy.name);
    const messages=buildSecondaryMessages({maxTags:3,preset},'一段正文');
    assert.equal(messages[0].content,legacy.instructions);
    assert.deepEqual(messages.at(-1),{role:'user',content:'一段正文'});
});

test('portable presets replace only the user body slot and can round trip without adding duplicates', async()=>{
    const type='miao-secondary-tag-preset',input={type,version:1,name:'Custom preset',instructions:'{{getvar::名字}}',
        bodyTemplate:'<source>{{正文}}</source>\n{{世界书触发}}'};
    const library=addSecondaryPreset(readSecondaryLibrary({}),readSecondaryPreset(JSON.stringify(input)));
    const preset=activeSecondaryPreset(library);
    assert.deepEqual(listedSecondaryMacros(preset),['{{getvar::名字}}','{{世界书触发}}']);
    assert.deepEqual(buildSecondaryMessages({maxTags:3,preset},'literal $& {{user}}').at(-1),
        {role:'user',content:'<source>literal $& {{user}}</source>\n{{世界书触发}}'});
    const {blob}=secondaryPresetFile({...preset,apiKey:'fixture-key',url:'https://fixture.invalid/'});
    const serialized=await blob.text();
    assert.deepEqual(JSON.parse(serialized),input);
    assert.deepEqual(addSecondaryPreset(library,readSecondaryPreset(serialized)),library);
    assert.throws(()=>readSecondaryPreset(JSON.stringify({...input,bodyTemplate:'{{正文}}{{正文}}'})),/仅包含一个/);
});
