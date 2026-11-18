import test from 'node:test';
import assert from 'node:assert/strict';
import {activeSecondaryPreset, addSecondaryPreset, listedSecondaryMacros, readSecondaryLibrary, readSecondaryPreset, secondaryPresetFile} from '../src/prompts/secondary-presets.js';
import {buildSecondaryMessages, requestSecondaryTags} from '../src/prompts/secondary-tags.js';

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

test('an unrecognized template macro blocks the HTTP request', async()=>{
    const payload={url:'https://fixture.invalid/chat',model:'fixture',maxTags:1,preset:{instructions:'{{尚无数据}}',bodyTemplate:'{{正文}}'}};
    let sends=0;
    await assert.rejects(requestSecondaryTags(payload,'fixture-key','reply',{
        macros:{substitute:text=>text},fetchImpl:()=>{sends++;},
    }),/尚无数据/);
    assert.equal(sends,0);
});

test('visible prose is held as text while Tavern macros and legacy variable tags expand', async()=>{
    const payload={url:'https://fixture.invalid/chat',model:'fixture',maxTags:1,
        preset:{instructions:'Hello {{char}}, {@getvar::对象@}',bodyTemplate:'<原文>{{正文}}</原文>'}};
    let messages;
    await requestSecondaryTags(payload,'fixture-key','This is data: {{setvar::x::no}}',{
        macros:{substitute:text=>text.replace('{{char}}','Fixture Cat').replace('{{getvar::对象}}','visitor')},
        fetchImpl:async (_url,{body})=>{messages=JSON.parse(body).messages;return Response.json({choices:[{message:{content:'image###cat###'}}]});},
    });
    assert.equal(messages[0].content,'Hello Fixture Cat, visitor');
    assert.equal(messages.at(-1).content,'<原文>This is data: {{setvar::x::no}}</原文>');
});
