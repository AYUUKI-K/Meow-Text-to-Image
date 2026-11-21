import test from 'node:test';
import assert from 'node:assert/strict';
import {activeSecondaryPreset, addSecondaryPreset, listedSecondaryMacros, readSecondaryLibrary, readSecondaryPreset, secondaryPresetFile} from '../src/prompts/secondary-presets.js';
import {buildSecondaryMessages, requestSecondaryTags} from '../src/prompts/secondary-tags.js';
import {insertDrawingTags, numberedReply, roleList, expandRoleTags} from '../src/chat/secondary-placement.js';
import {drawingOptions, withDrawingOptions, worldDrawingPolicy} from '../src/prompts/drawing-options.js';
import {defaultPromptSettings} from '../src/prompts/prompt-settings.js';

test('full Tavern presets retain ordered enabled messages, prefill and inactive entries', async()=>{
    const source={prompts:[
        {identifier:'body',name:'正文',role:'system',content:'原文\n{{正文}}'},
        {identifier:'first',name:'场景',role:'system',content:'  包含正文之外的完整设置  '},
        {identifier:'prefill',name:'示范',role:'assistant',content:'完整示范'},
        {identifier:'marker',name:'未启用标记'},
    ],prompt_order:[{character_id:100001,order:['first','body','prefill'].map(identifier=>({identifier,enabled:true}))}]};
    const original=readSecondaryPreset(JSON.stringify(source),{fileName:'电子幽灵-本地测试.json'});
    const library=addSecondaryPreset(readSecondaryLibrary({}),original);
    const active=activeSecondaryPreset(library);
    assert.equal(active.id,'electronic-ghost');
    assert.deepEqual(active.entries.map(({name,enabled})=>[name,enabled]),[['场景',true],['正文',true],['示范',true],['未启用标记',false]]);
    assert.deepEqual(buildSecondaryMessages({preset:active},'场景正文'),[
        {role:'system',content:'  包含正文之外的完整设置  '},
        {role:'system',content:'原文\n场景正文'},
        {role:'assistant',content:'完整示范'},
    ]);
    assert.deepEqual(readSecondaryPreset(await secondaryPresetFile(active).blob.text()), original);
});

test('paragraph IDs are suffixes, map through regex changes, and write only wrapped tags', ()=>{
    const original='甲段。\r\n\r\n旧描述。\r\n\r\n最后一段。';
    const {text,anchors}=numberedReply('甲段。\n\n新描述。\n\n最后一段。',original);
    assert.equal(text,'甲段。\n[P01]\n\n新描述。\n[P02]\n\n最后一段。\n[P03]');
    const macro='$结城爱$';
    const result=insertDrawingTags(original,anchors.paragraphs,[{anchor:'P02',tag:`OPEN${macro}, windowCLOSE`},{anchor:'P99',tag:'OPENflowerCLOSE'}],anchors.end);
    assert.equal(result.text,'甲段。\r\n\r\n旧描述。\r\n\r\nOPEN$结城爱$, windowCLOSE\r\n\r\n最后一段。\r\n\r\nOPENflowerCLOSE');
    assert.equal(result.atEnd,1);
    assert.equal(expandRoleTags(macro,roleList('结城爱 = black hair, yellow eyes,')),'black hair, yellow eyes');
    assert.equal(expandRoleTags('$结城爱￥',roleList('结城爱 = black hair')),'black hair');
    assert.throws(()=>expandRoleTags(macro,roleList('其它角色 = glasses')),/未绑定/);
});

test('an existing secondary preset retains its current instructions and raw-body layout', ()=>{
    const legacy={name:'My previous preset',instructions:'Use visual tags.'};
    const preset=activeSecondaryPreset(readSecondaryLibrary({secondaryTagAPI:{preset:legacy}}));
    assert.equal(preset.name,legacy.name);
    const messages=buildSecondaryMessages({maxTags:3,preset},'一段正文');
    assert.equal(messages[0].content,legacy.instructions);
    assert.deepEqual(messages.at(-1),{role:'user',content:'一段正文'});
});

test('shared drawing options override inherited counts and suppress disabled format macros',()=>{
    const original=defaultPromptSettings(),stored=drawingOptions(original);
    const config=withDrawingOptions(original,{...stored,count:'4～6',egg:false,title:false,eggDescription:true,
        selfCheck:false,nsfw:false,orientation:'BL'});
    const output=drawingOptions(config);
    const preset={entries:[
        {name:'设置',enabled:true,role:'system',content:'{{setvar::张数::5~7}}{{setvar::彩蛋数量::(+1)}}'},
        {name:'彩蛋',enabled:true,role:'system',content:'EGG_FIXTURE'},
        {name:'绘画自检',enabled:true,role:'system',content:'SELF_CHECK_FIXTURE'},
        {name:'正文',enabled:true,role:'system',content:'{{正文}}\n图数 {{getvar::张数}}{{getvar::彩蛋数量}}\n{{getglobalvar::彩蛋}}\n<drawings><draw after="P01"></draw></drawings>'},
    ]};
    const text=buildSecondaryMessages({maxTags:6,preset,output},'模拟正文').map(message=>message.content).join('\n');
    assert.match(text,/图数 4~6[\s\S]*最多 6 张/);
    assert.doesNotMatch(text,/5~7|\(\+1\)|EGG_FIXTURE|SELF_CHECK_FIXTURE|getglobalvar|<egg_description>|\[bl\]/);
    assert.match(worldDrawingPolicy(config),/4~6 张/);
    assert.doesNotMatch(worldDrawingPolicy(config),/┈┈|<easter_egg>/);
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
