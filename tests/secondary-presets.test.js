import test from 'node:test';
import assert from 'node:assert/strict';
import {activeSecondaryPreset, addSecondaryPreset, listedSecondaryMacros, readSecondaryLibrary, readSecondaryPreset, secondaryPresetFile, secondaryPresets} from '../src/prompts/secondary-presets.js';
import {buildSecondaryMessages, requestSecondaryModels, requestSecondaryTags} from '../src/prompts/secondary-tags.js';
import {insertDrawingTags, numberedReply, roleList, expandRoleTags} from '../src/chat/secondary-placement.js';
import {drawingOptions, withDrawingOptions, worldDrawingPolicy} from '../src/prompts/drawing-options.js';
import {defaultPromptSettings} from '../src/prompts/prompt-settings.js';

test('model discovery uses the sibling OpenAI-compatible endpoint and never follows redirects',async()=>{
    for(const [address,expected] of [
        ['https://fixture.invalid','https://fixture.invalid/v1/models'],
        ['https://fixture.invalid/proxy/v1/','https://fixture.invalid/proxy/v1/models'],
        ['https://fixture.invalid/proxy/v1/chat/completions','https://fixture.invalid/proxy/v1/models'],
    ]){
        const result=await requestSecondaryModels(address,'fixture-key',{fetchImpl:async (url,options)=>{
            assert.equal(url,expected);
            assert.equal(options.method,'GET');
            assert.equal(options.redirect,'error');
            assert.equal(options.credentials,'omit');
            assert.equal(options.headers.Authorization,'Bearer fixture-key');
            return Response.json({data:[{id:'provider/model-a'},{id:'provider/model-a'},null,{id:'provider/model-b'}]});
        }});
        assert.deepEqual(result,['provider/model-a','provider/model-b']);
    }
    await assert.rejects(requestSecondaryModels('https://fixture.invalid/custom','fixture-key'),/手动填写/);
    await assert.rejects(requestSecondaryModels('https://fixture.invalid','fixture-key',{
        fetchImpl:async()=>new Response('',{status:404}),
    }),/手动填写/);
});

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
    assert.equal(active.id,'import-0');
    assert.equal(secondaryPresets(library)[0].name,'电子幽灵1.7');
    assert.deepEqual(active.entries.map(({name,enabled})=>[name,enabled]),[['场景',true],['正文',true],['示范',true],['未启用标记',false]]);
    assert.deepEqual(buildSecondaryMessages({preset:active},'场景正文'),[
        {role:'system',content:'  包含正文之外的完整设置  '},
        {role:'system',content:'原文\n场景正文'},
        {role:'assistant',content:'完整示范'},
    ]);
    assert.deepEqual(readSecondaryPreset(await secondaryPresetFile(active).blob.text()), original);
    const upgraded=readSecondaryLibrary({secondaryTagPresets:{activeId:'electronic-ghost',imports:[],electronicGhost:original}});
    assert.deepEqual(activeSecondaryPreset(upgraded),active);
    assert.equal(activeSecondaryPreset({...upgraded,activeId:'electronic-ghost'}).name,'电子幽灵1.7');
});

test('the old placement import stays available while the built-in 1.7 becomes active', ()=>{
    const old={name:'电子幽灵1.6-段落定位',entries:[{name:'自定义正文',role:'system',enabled:true,content:'自定义指令\n{{正文}}'}]};
    for(const settings of [
        {secondaryTagPresets:{activeId:'import-0',imports:[old]}},
        {secondaryTagPresets:{activeId:'electronic-ghost',imports:[],electronicGhost:old}},
    ]){
        const library=readSecondaryLibrary(settings);
        assert.equal(activeSecondaryPreset(library).name,'电子幽灵1.7');
        const selected=readSecondaryLibrary({secondaryTagPresets:{...library,activeId:'import-0'}});
        assert.match(activeSecondaryPreset(selected).name,/旧版副本/);
        assert.deepEqual(activeSecondaryPreset(selected).entries,old.entries);
    }
});

test('paragraph IDs are suffixes, map through regex changes, and write only wrapped tags', ()=>{
    const original='甲段。\r\n\r\n旧描述。\r\n\r\n最后一段。';
    const {text,anchors}=numberedReply('甲段。\n\n新描述。\n\n最后一段。',original);
    assert.equal(text,'甲段。\n[P01]\n\n新描述。\n[P02]\n\n最后一段。\n[P03]');
    const macro='$结城爱$';
    const result=insertDrawingTags(original,anchors.paragraphs,[{anchor:'P02',tag:`OPEN${macro}, windowCLOSE`},{anchor:'P99',quote:'最后一段。',tag:'OPENflowerCLOSE'}]);
    assert.equal(result.text,'甲段。\r\n\r\n旧描述。\r\n\r\nOPEN$结城爱$, windowCLOSE\r\n\r\n最后一段。\r\n\r\nOPENflowerCLOSE');
    assert.equal(result.unplaced,0);
    assert.equal(expandRoleTags(macro,roleList('结城爱 = black hair, yellow eyes,')),'black hair, yellow eyes');
    assert.equal(expandRoleTags('$结城爱￥',roleList('结城爱 = black hair')),'black hair');
    assert.throws(()=>expandRoleTags(macro,roleList('其它角色 = glasses')),/未绑定/);
});

test('normal figures stay in distinct prose paragraphs and the bonus reuses the existing XML',()=>{
    const raw='第一段。\n第二段。\n\n第三段。\n\n<Meow_FM>彩蛋内容</Meow_FM>\n\n末尾信息。';
    const {text,anchors}=numberedReply(raw,raw,'/meow_FM');
    assert.match(text,/第一段。\n\[P01\]\n\n第二段。\n\[P02\]\n\n第三段。\n\[P03\]/);
    const drawings=[{anchor:'P02',tag:'[A]'}, {anchor:'P02',tag:'[DUPLICATE]'},
        {anchor:'P02',quote:'第一段。',tag:'[B]'}, {anchor:'P99',tag:'[INVALID]'},
        {anchor:'P99',quote:'第三段。',tag:'[C]'}, {anchor:'P01',tag:'[EGG]',egg:true}];
    const result=insertDrawingTags(raw,anchors.paragraphs,drawings,anchors.egg,3);
    assert.match(result.text,/第一段。\s+\[B\]\s+第二段。\s+\[A\]\s+第三段。\s+\[C\]\s+<Meow_FM>彩蛋内容<\/Meow_FM>\s+\[EGG\]\s+末尾信息。/);
    assert.equal(result.text.replace(/\n\n\[(?:A|B|C|EGG)\]/g,''),raw);
    assert.equal(result.unplaced,2);
    assert.equal(insertDrawingTags('单段。',[{id:'P01',end:3}],drawings.slice(-1)).starts.size,0);
});

test('numbering preserves HTML paragraph boundaries and does not invent offsets for regex-only text',()=>{
    const raw='<p>她推开窗。\n风吹了进来。</p><p>他拿起杯子。</p>';
    const {text,anchors}=numberedReply('序言（正则添加）。\n<p>她推开窗。\n风吹了进来。</p><p>他拿起杯子。</p>',raw);
    assert.match(text,/^序言（正则添加）。\n\n<p>她推开窗。\n风吹了进来。<\/p>\n\[P02\]/);
    const result=insertDrawingTags(raw,anchors.paragraphs,[{anchor:'P01',tag:'[INVALID]'},{anchor:'P02',tag:'[WINDOW]'}]);
    assert.equal(result.text,'<p>她推开窗。\n风吹了进来。</p>\n\n[WINDOW]\n\n<p>他拿起杯子。</p>');
    assert.equal(result.unplaced,1);
});

test('secondary API sees the entire tail while only prose before the first egg markup gets positions',()=>{
    const raw='开头。\n\n第二段。\n\n<meowfm>彩蛋正文</meowfm>同行尾注。\n\n<Meow_FM>第二处标记</Meow_FM>\n\n收尾。';
    const {text,anchors}=numberedReply(raw,raw);
    assert.equal(text,'开头。\n[P01]\n\n第二段。\n[P02]\n\n<meowfm>彩蛋正文</meowfm>同行尾注。\n\n<Meow_FM>第二处标记</Meow_FM>\n\n收尾。');
    const drawings=[{anchor:'P02',tag:'[BODY]'},{tag:'[EGG]',egg:true}];
    const placed=insertDrawingTags(raw,anchors.paragraphs,drawings,anchors.egg);
    assert.match(placed.text,/第二段。\n\n\[BODY\]\n\n<meowfm>彩蛋正文<\/meowfm>\n\n\[EGG\]\n\n同行尾注。/);
});

test('Electronic Ghost is available by default and assembles a complete non-streaming request',async()=>{
    const preset=activeSecondaryPreset(readSecondaryLibrary({}));
    assert.equal(preset.id,'electronic-ghost');
    assert.match(preset.name,/电子幽灵/);
    assert.ok(preset.entries.length>3);
    const output={...drawingOptions(defaultPromptSettings()),egg:false};
    await assert.rejects(requestSecondaryTags({url:'https://fixture.invalid/chat',model:'fixture',maxTags:3,preset,output},'fixture-key','猫走到窗前。\n[P01]',{
        macros:{values:{角色启用列表:()=>''},substitute:text=>text.replace(/\{\{user\}\}/g,'访客').replace(/\{\{(?:set|get)(?:global)?var::[^}]*\}\}/gi,'')},
        fetchImpl:async(_url,{body})=>{
            const payload=JSON.parse(body),messages=payload.messages.map(item=>item.content).join('\n');
            assert.equal(payload.stream,false);
            assert.match(messages,/猫走到窗前。\n\[P01\]/);
            assert.match(messages,/本楼不输出彩蛋条目/);
            assert.match(messages,/\(1\.2::角色英文名\(作品出处\)::, 本段动作或表情\)/);
            assert.doesNotMatch(messages,/1\.5::English Name|逐字逐句地|Tag≥Tag/);
            assert.doesNotMatch(messages,/\$角色名\$|\$xiao|\{\{角色启用列表\}\}/);
            return new Response(null,{status:503});
        },
    }),/HTTP 503/);
});

test('the Electronic Ghost example shows a title for every enabled drawing, including the bonus',()=>{
    const preset=activeSecondaryPreset(readSecondaryLibrary({}));
    const defaults=drawingOptions(defaultPromptSettings());
    const example=options=>buildSecondaryMessages({maxTags:3,preset,output:{...defaults,...options}},'完整正文')
        .map(({content})=>content).join('\n').match(/<drawings>\n[\s\S]+?<\/drawings>/)?.[0];
    const enabled=example({title:true,egg:true,eggDescription:true});
    const draws=[...enabled.matchAll(/<draw [^>]+>([\s\S]*?)<\/draw>/g)];
    assert.equal(draws.length,3);
    assert.ok(draws.every(([, content])=>/<title>[^<]+<\/title>\s*<tags>/.test(content)));
    assert.match(draws[2][0],/<draw egg="true">[\s\S]*<egg_description>/);
    assert.doesNotMatch(example({title:false,egg:false}),/<title>|egg="true"|<egg_description>/);
});

test('the bundled preset sends exact role calls while keeping fixed tags for local expansion',async()=>{
    const preset=activeSecondaryPreset(readSecondaryLibrary({}));
    const output={...drawingOptions(defaultPromptSettings()),egg:false};
    const roles=roleList('苏禾 = amber eyes, blue coat\n温枝 = purple hair');
    const macros={values:{上下文:()=>'',用户需求:()=>'',世界书触发:()=>''},substitute:text=>
        text.replace(/\{\{user\}\}/g,'测试').replace(/\{\{(?:get|set)(?:global)?var::[^{}]*\}\}/gi,'')};
    await assert.rejects(requestSecondaryTags({url:'https://fixture.invalid/chat',model:'fixture',maxTags:3,preset,output},'fixture-key','苏禾递过钥匙。\n[P01]',{
        macros,roleTags:roles,fetchImpl:async(_url,{body})=>{
            const wire=JSON.parse(body).messages.map(message=>message.content).join('\n');
            assert.match(wire,/苏禾 → \$苏禾\$\n温枝 → \$温枝\$/);
            assert.doesNotMatch(wire,/amber eyes|blue coat|purple hair/);
            return new Response(null,{status:503});
        },
    }),/HTTP 503/);
    assert.equal(expandRoleTags('($苏禾$, passing a key)',roles),'(amber eyes, blue coat, passing a key)');
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

test('a disabled optional instruction cannot remove the required body from a custom preset',()=>{
    for(const name of ['彩蛋','绘画自检']){
        const preset={entries:[{name,role:'user',enabled:true,content:'本楼正文\n{{正文}}'}]};
        const output={...drawingOptions(defaultPromptSettings()),egg:false,selfCheck:false};
        const messages=buildSecondaryMessages({maxTags:3,preset,output},'完整正文');
        assert.deepEqual(messages.filter(message=>message.role==='user'),[{role:'user',content:'本楼正文\n完整正文'}]);
    }
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
