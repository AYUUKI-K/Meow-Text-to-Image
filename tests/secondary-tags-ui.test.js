import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
const require=createRequire(import.meta.url);

async function previewAddress(server){
    return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(Error('预览启动超时')),10000);
        server.stdout.on('data',data=>{const match=String(data).match(/http:\/\/[^\s]+/);if(match){clearTimeout(timer);resolve(match[0]);}});
        server.on('exit',()=>{clearTimeout(timer);reject(Error('预览启动失败'));});
    });
}

test('the secondary tag API sees only completed reply text and saves tags to the original swipe', {timeout:60000}, async()=>{
    const {chromium}=require(process.env.MIAO_PLAYWRIGHT_MODULE||`${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`);
    const server=spawn(process.execPath,['tests/preview-server.mjs'],{env:{...process.env,MIAO_PREVIEW_PORT:'0'},stdio:['ignore','pipe','pipe']});
    let browser;
    try{
        const base=await previewAddress(server);
        browser=await chromium.launch({channel:process.env.MIAO_BROWSER_CHANNEL||'chrome',headless:true});
        const meowRegex=JSON.parse(await readFile(new URL('../assets/regex.json',import.meta.url),'utf8'));
        for(const tt of [false,true]){
            const endpoint='https://tag-fixture.invalid/v1/chat/completions',requests=[],modelRequests=[],errors=[];
            const page=await browser.newPage(tt?{viewport:{width:390,height:844},hasTouch:true,isMobile:true}:{});
            page.setDefaultTimeout(6500);
            page.on('pageerror',error=>errors.push(error.message));
            let hold,release;
            await page.route(endpoint,async route=>{
                if(route.request().method()==='POST'){
                    requests.push({body:route.request().postDataJSON(),auth:route.request().headers().authorization});
                    if(hold)await new Promise(resolve=>{release=resolve;});
                }
                await route.fulfill({status:200,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'authorization, content-type'},
                    json:{choices:[{message:{content:'<thinking>image###draft tag###</thinking>image###cat, bright window###'},finish_reason:'stop'}]}}).catch(()=>{});
            });
            await page.route('https://tag-fixture.invalid/v1/models',async route=>{
                if(route.request().method()==='GET')modelRequests.push(route.request().headers().authorization);
                await route.fulfill({headers:{'access-control-allow-origin':'*','access-control-allow-headers':'authorization'},
                    json:{data:[{id:'fixture-other'},{id:'fixture-model'}]}});
            });
            await page.goto(base+'/?settings-smoke'+(tt?'&tt':''));
            await page.locator('#miao-nai-menu').click();
            const nav=tt?page.locator('.miao-overview'):page.locator('.miao-tabs');
            await nav.getByRole('button',{name:'生图指令',exact:true}).click();
            await page.getByRole('combobox',{name:'来源',exact:true}).selectOption('secondary');
            await page.waitForFunction(()=>window.preview.injections?.miao_nai_image_instruction?.text==='');
            const presetPicker=page.getByRole('combobox',{name:'当前副 API 预设',exact:true});
            assert.equal(await presetPicker.inputValue(),'electronic-ghost');
            assert.equal(await presetPicker.locator('option').count(),1);
            assert.equal(await presetPicker.locator('option').first().textContent(),'电子幽灵（待导入）');
            const exportButton=page.getByRole('button',{name:'导出当前预设',exact:true});
            assert.equal(await exportButton.isDisabled(),true);
            await page.evaluate(async endpoint=>{
                const p=window.preview;
                const previous=p.settings.secondaryTagAPI;
                p.settings.secondaryTagAPI={url:endpoint,model:'fixture-model'};
                await p.emit('GENERATION_STARTED','normal',{},false);
                p.chat.push({name:'Reply',mes:'There is no imported preset yet.'});
                document.getElementById('chat').insertAdjacentHTML('beforeend',`<div class="mes" mesid="${p.chat.length-1}"><div class="mes_text">There is no imported preset yet.</div></div>`);
                await p.emit('GENERATION_ENDED',p.chat.length);
                await new Promise(resolve=>setTimeout(resolve,150));
                p.settings.secondaryTagAPI=previous;
            },endpoint);
            assert.equal(await page.getByRole('button',{name:'提取绘图 tag',exact:true}).count(),0);
            assert.equal(await page.evaluate(()=>window.miaoTestToasts.some(item=>item.type==='error'&&item.message.includes('电子幽灵'))),false);
            assert.equal(requests.length,0,'a missing default preset must not trigger a request');
            const messages=page.locator('.miao-secondary-preset-messages');
            const bodyTemplate='<剧情原文>\n{{正文}}\n</剧情原文>';
            const full={prompts:[
                {identifier:'body',name:'正文条目',role:'system',content:bodyTemplate},
                {identifier:'setting',name:'设定',role:'system',content:'完整的设定示例'},
                {identifier:'example',name:'示范',role:'assistant',content:'示范回复'},
                {identifier:'style',name:'风格',role:'system',content:'完整的风格示例'},
                {identifier:'unlisted',name:'备用范例',role:'system',content:'备用内容'},
            ],prompt_order:[{character_id:100001,order:['setting','style','body','example'].map(identifier=>({identifier,enabled:true}))}]};
            const input=page.locator('#miao-nai-settings input[type=file]');
            await input.setInputFiles({name:'电子幽灵-测试.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(full))});
            await messages.locator('details').nth(4).waitFor();
            assert.equal(await messages.locator('details:visible').count(),5);
            assert.equal(await messages.locator('details[open] pre').textContent(),bodyTemplate);
            assert.equal(await exportButton.isEnabled(),true);
            assert.equal(requests.length,0,'previewing a preset must not call the secondary API');
            await page.getByRole('textbox',{name:'副 API 地址',exact:true}).fill('https://tag-fixture.invalid/v1');
            const modelInput=page.getByRole('textbox',{name:'副 API 模型',exact:true});
            const keyInput=page.getByRole('textbox',{name:'副 API Key',exact:true});
            await keyInput.fill('fixture-secondary-key');
            assert.equal(await keyInput.getAttribute('type'),'text');
            assert.equal(await modelInput.inputValue(),'');
            const chooser=page.getByRole('dialog',{name:'选择副 API 模型',exact:true});
            await page.getByRole('button',{name:'获取模型',exact:true}).click();
            await chooser.getByRole('searchbox',{name:'搜索模型',exact:true}).fill('fixture-model');
            assert.equal(await chooser.getByRole('button',{name:'fixture-other',exact:true}).count(),0);
            const picked=chooser.getByRole('button',{name:'fixture-model',exact:true});
            if(tt)await picked.tap();else await picked.click();
            assert.equal(await modelInput.inputValue(),'fixture-model');
            assert.deepEqual(modelRequests,['Bearer fixture-secondary-key']);
            assert.equal(requests.length,0);
            const fixture={type:'miao-secondary-tag-preset',version:1,name:'Fixture preset',
                instructions:'{{setvar::对象::猫}}{{setglobalvar::标题::{{getvar::对象}}和花}}FIXTURE_DIRECTOR {{getvar::对象}}',
                bodyTemplate:bodyTemplate+'\n{{getglobalvar::标题}}\n{{角色启用列表}}\n{{上下文}}\n{{用户需求}}\n{{世界书触发}}'};
            await page.locator('input[type=file]').setInputFiles({name:'fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
            await page.getByText(/发送前展开：.*\{\{getvar::对象\}\}/).waitFor();
            assert.equal(await presetPicker.inputValue(),'import-0');
            await page.getByRole('button',{name:'保存副 API',exact:true}).click();
            await page.waitForFunction(()=>!!window.preview.settings.secondaryTagAPI);
            assert.ok(!(await page.evaluate(()=>JSON.stringify(window.preview.settings))).includes('fixture-secondary-key'));
            assert.equal(await keyInput.inputValue(),'');
            await page.getByRole('button',{name:'获取模型',exact:true}).click();
            await chooser.getByRole('button',{name:'取消选择',exact:true}).click();
            assert.deepEqual(modelRequests,['Bearer fixture-secondary-key','Bearer fixture-secondary-key']);
            assert.equal(await modelInput.inputValue(),'fixture-model');
            if(tt){
                await exportButton.tap();
                await page.waitForFunction(()=>!!window.preview.nativeDownloads?.length);
                assert.equal(await page.evaluate(()=>window.preview.nativeDownloads[0].name),'meow-tag-preset.json');
            }else{
                const [download]=await Promise.all([page.waitForEvent('download'),exportButton.click()]);
                const chunks=[];for await(const chunk of await download.createReadStream())chunks.push(chunk);
                const data=Buffer.concat(chunks);
                assert.deepEqual(JSON.parse(data.toString()),fixture,'the export must contain only portable preset fields');
                const saves=await page.evaluate(()=>window.preview.settingsSaves);
                await page.locator('input[type=file]').setInputFiles({name:download.suggestedFilename(),mimeType:'application/json',buffer:data});
                await page.waitForFunction(previous=>window.preview.settingsSaves>previous,saves);
                assert.equal(await presetPicker.locator('option').count(),2,'reimporting the same preset must not duplicate it');
            }
            await page.getByRole('button',{name:'关闭设置',exact:true}).click();
            const rawReply='<think>private reasoning</think>正文：猫跳上窗台。 ┈┈绘图标题┈┈ <easter_egg>彩蛋介绍</easter_egg> image###inline main tag###';
            await page.evaluate(async({tt,meowRegex,rawReply})=>{
                const p=window.preview;
                Object.assign(p.settings,{mode:tt?'manual':'stream',cloudQueue:false,eggProfileEnabled:false});
                p.context.powerUserSettings.experimental_macro_engine=false;
                const local=new Map([['角色启用列表','cats']]),global=new Map();
                const scope=store=>({has:key=>store.has(key),get:key=>store.get(key)});
                p.context.variables={local:scope(local),global:scope(global)};
                // Model Tavern's flat legacy substitution API. Plugin must protect the visible reply and resolve nested setters.
                p.context.substituteParams=text=>text
                    .replace(/\{\{set(global)?var::([^:]+)::([^}]*)\}\}/g,(_,g,name,value)=>{(g?global:local).set(name,value);return '';})
                    .replace(/\{\{get(global)?var::([^}]+)\}\}/g,(_,g,name)=>(g?global:local).get(name)??'');
                p.regexScripts=[
                    ...meowRegex,
                    {findRegex:'正文：',replaceString:'画面：',placement:[2],promptOnly:true,minDepth:0,maxDepth:0},
                    {findRegex:'旧楼正文',replaceString:'历史素材',placement:[2],promptOnly:true,minDepth:2,maxDepth:2},
                    {findRegex:'Earlier visible text',replaceString:'Earlier filtered text',placement:[1],promptOnly:true,minDepth:1,maxDepth:1},
                    {findRegex:'画面',replaceString:'Display-only edit',placement:[2],markdownOnly:true},
                    {findRegex:'历史素材',replaceString:'Disabled edit',placement:[2],promptOnly:true,disabled:true},
                ];
                p.promptRegexCalls=[];
                p.chat.splice(0,p.chat.length,{name:'System',mes:'never send fixture',is_system:true},
                    {name:'Older assistant',mes:'旧楼正文。 ┈┈历史标题┈┈ image###old illustration###'},
                    {name:'User',mes:'Earlier visible text',is_user:true});
                window.drawSecondaryFixture=()=>{document.getElementById('chat').innerHTML=p.chat.map((message,index)=>`<div class="mes" mesid="${index}"><div class="mes_text">${message.mes}</div></div>`).join('');};
                window.drawSecondaryFixture();await p.emit('CHAT_CHANGED');
                await p.emit('GENERATION_STARTED','normal',{},false);
                const named={world:'[喵喵]文生图-标签跟随配置',comment:'主体',content:'draw using this plugin book'};
                const header={world:'renamed drawing world',comment:'tag头',content:'<imageTag>{{setvar::张数::3}}{{setvar::彩蛋标签::/fixture}}'};
                const sibling={world:'renamed drawing world',comment:'主体',content:'draw using a renamed book'};
                const garden={world:'Story world',comment:'主体',content:'Garden lore'};
                const createLore=()=>({globalLore:[named],characterLore:[header,sibling],chatLore:[garden],
                    personaLore:[{world:'[喵喵]文生图 2.2.3',comment:'彩蛋[选开]',content:'old optional instruction'}]});
                const main=createLore(),secondary=createLore();
                p.settings.tagSource='main';
                await p.emit('WORLDINFO_ENTRIES_LOADED',main);
                p.settings.tagSource='secondary';
                await p.emit('WORLDINFO_ENTRIES_LOADED',secondary);
                p.worldEntryCounts=[Object.values(main).map(group=>group.length),Object.values(secondary).map(group=>group.length)];
                await p.emit('WORLD_INFO_ACTIVATED',[...Object.values(secondary).flat(),named]);
                p.chat.push({name:'Reply',mes:rawReply});
                window.drawSecondaryFixture();
                await p.emit('STREAM_TOKEN_RECEIVED');await p.emit('CHARACTER_MESSAGE_RENDERED',3);
            },{tt,meowRegex,rawReply});
            await page.waitForTimeout(180);
            assert.equal(requests.length,0);
            assert.equal(await page.evaluate(()=>window.preview.calls.length),0);
            assert.deepEqual(await page.evaluate(()=>window.preview.worldEntryCounts),[[1,2,1,1],[0,0,1,0]]);
            await page.evaluate(async()=>{await window.preview.emit('GENERATION_ENDED',4);await window.preview.emit('GENERATION_ENDED',4);});
            const secondary=page.locator('[data-miao-source=secondary]');
            await secondary.waitFor();
            assert.equal(await secondary.count(),1);
            assert.equal(await page.getByRole('button',{name:'提取绘图 tag',exact:true}).count(),0);
            assert.equal(requests.length,1);
            assert.equal(requests[0].auth,'Bearer fixture-secondary-key');
            assert.equal(requests[0].body.model,'fixture-model');
            assert.equal(requests[0].body.messages[0].content,'FIXTURE_DIRECTOR 猫');
            assert.deepEqual(requests[0].body.messages.at(-1),{role:'user',content:'<剧情原文>\n画面：猫跳上窗台。\n</剧情原文>\n猫和花\ncats\n角色：历史素材。\n\n用户：Earlier filtered text\nEarlier filtered text\nGarden lore'});
            assert.equal(await page.evaluate(()=>window.preview.chat.at(-1).mes),rawReply);
            const calls=await page.evaluate(()=>window.preview.promptRegexCalls);
            assert.deepEqual(calls.map(({placement,depth,isPrompt})=>[placement,depth,isPrompt]),[[2,2,true],[1,1,true],[2,0,true]]);
            assert.ok(calls.every(call=>!call.isMarkdown&&!call.raw.includes('private reasoning')));
            assert.ok(calls.at(-1).raw.includes('┈┈绘图标题┈┈'),'Meow scripts must see the original decorations');
            assert.equal(await page.evaluate(()=>window.preview.regexBatchCalls??0),tt?1:0);
            if(tt){
                assert.equal(await page.evaluate(()=>window.preview.calls.length),0);
                await secondary.getByRole('button',{name:'生成插图',exact:true}).waitFor();
                await page.locator('#miao-nai-menu').tap();
                await nav.getByRole('button',{name:'生图指令',exact:true}).tap();
                await messages.getByText('最近发送 · 宏展开后',{exact:true}).tap();
                const expanded=messages.locator('details').nth(3).locator('pre');
                assert.equal(await expanded.textContent(),requests[0].body.messages.map(({role,content})=>role+'\n'+content).join('\n\n'));
                assert.equal(requests.length,1,'the last-request preview must not send a request');
                await page.getByRole('button',{name:'关闭设置',exact:true}).tap();
            }else{
                await secondary.locator(':scope>img').waitFor();
                assert.equal(await page.evaluate(()=>window.preview.calls.length),1);
                assert.match(await page.evaluate(()=>window.preview.calls[0].prompt),/cat, bright window/);

                // Switching to another swipe while a request is in flight discards the old response.
                hold=true;
                await page.evaluate(async()=>{
                    const p=window.preview;
                    await p.emit('GENERATION_STARTED','swipe',{},false);
                    const message=p.chat.at(-1);message.swipe_id=1;message.mes='Second swipe text';
                    window.drawSecondaryFixture();await p.emit('GENERATION_ENDED',2);
                });
                for(let i=0;i<60&&!release;i++)await new Promise(resolve=>setTimeout(resolve,50));
                assert.equal(requests.length,2);assert.ok(release);
                await page.evaluate(async()=>{
                    const p=window.preview,message=p.chat.at(-1);
                    message.swipe_id=2;message.mes='Third swipe text';
                    window.drawSecondaryFixture();await p.emit('MESSAGE_SWIPED',1);
                });
                release();
                await page.waitForTimeout(120);
                assert.deepEqual(await page.evaluate(()=>Object.keys(window.preview.chat.at(-1).miao_nai_image_secondary_tags)),['0']);
                assert.equal(await page.evaluate(()=>window.preview.calls.length),1);
                await page.evaluate(async()=>{
                    const p=window.preview;
                    await p.emit('GENERATION_STARTED','normal',{},false);
                    Object.assign(p.chat.at(-1),{swipe_id:3,mes:'Navigation to an existing swipe'});
                    window.drawSecondaryFixture();
                    await p.emit('MESSAGE_SWIPED',p.chat.length-1);await p.emit('GENERATION_ENDED',p.chat.length);
                });
                await page.waitForTimeout(120);
                assert.equal(requests.length,2,'navigation alone must not be sent to the secondary API');
                await page.evaluate(async()=>{
                    const p=window.preview;
                    await p.emit('GENERATION_STARTED','normal',{},false);
                    p.chat.push({name:'Stopped reply',mes:'Partially generated text'});
                    window.drawSecondaryFixture();
                    await p.emit('GENERATION_ENDED',3);await p.emit('GENERATION_STOPPED');
                });
                await page.waitForTimeout(160);
                assert.equal(requests.length,2,'ENDED before STOPPED must not send a partial reply');
                await page.evaluate(async()=>{
                    const p=window.preview;
                    await p.emit('GENERATION_STARTED','normal',{},false);
                    p.chat.push({name:'Connection failed',mes:'This draft was never completed'});
                    const id=p.chat.length-1;
                    p.context.streamingProcessor={messageId:id,isStopped:true};
                    window.drawSecondaryFixture();
                    await p.emit('GENERATION_ENDED',p.chat.length);
                    await p.emit('MESSAGE_RECEIVED',id,'normal');
                    await p.emit('CHARACTER_MESSAGE_RENDERED',id,'normal');
                    delete p.context.streamingProcessor;
                });
                await page.waitForTimeout(120);
                assert.equal(requests.length,2,'an errored stream must not send a draft even if Tavern emits reply events');
                release=null;
                await page.evaluate(async()=>{
                    const p=window.preview;
                    p.settings.mode='manual';
                    window.completeSecondaryFixtureReply=async text=>{
                        p.chat.push({name:'Reply',mes:text});
                        window.drawSecondaryFixture();
                        await p.emit('MESSAGE_RECEIVED',p.chat.length-1,'normal');
                    };
                    await window.completeSecondaryFixtureReply('Earlier completed reply');
                });
                for(let i=0;i<60&&!release;i++)await new Promise(resolve=>setTimeout(resolve,50));
                assert.ok(release);
                assert.equal(requests.length,3);
                hold=false;
                try{
                    await page.evaluate(()=>window.completeSecondaryFixtureReply('Newer completed reply'));
                    await page.waitForFunction(()=>!!window.preview.chat.at(-1).miao_nai_image_secondary_tags);
                    assert.equal(requests.length,4,'an older request must not block a newly finished floor');
                    assert.match(requests[3].body.messages.at(-1).content,/Newer completed reply/);
                    assert.equal(await page.evaluate(()=>window.preview.chat.at(-2).miao_nai_image_secondary_tags),undefined);
                }finally{release();}
            }
            assert.deepEqual(errors,[]);await page.close();
        }
    }finally{await browser?.close();server.kill();}
});

test('the configured drawing format writes into the active swipe and only expands role tags for NAI', {timeout:45000},async()=>{
    const {chromium}=require(process.env.MIAO_PLAYWRIGHT_MODULE||`${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`);
    const server=spawn(process.execPath,['tests/preview-server.mjs'],{env:{...process.env,MIAO_PREVIEW_PORT:'0'},stdio:['ignore','pipe','pipe']});
    let browser;
    try{
        const base=await previewAddress(server);
        browser=await chromium.launch({channel:process.env.MIAO_BROWSER_CHANNEL||'chrome',headless:true});
        for(const tt of [false,true]){
            const page=await browser.newPage(tt?{viewport:{width:390,height:844},hasTouch:true,isMobile:true}:{});
            page.setDefaultTimeout(6500);
            const requests=[];
            await page.route('https://draw-fixture.invalid/v1/chat/completions',async route=>{
                if(route.request().method()==='POST')requests.push(route.request().postDataJSON());
                await route.fulfill({headers:{'access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type'},
                    json:{choices:[{message:{content:'<drawings><draw after="P02"><title>试用标题</title><tags>START-FIG $试用人物$, sitting END-FIG</tags></draw><draw after="P02">START-FIG extra shot END-FIG</draw><draw after="P03" egg="true"><tags>START-FIG teacup END-FIG</tags><egg_description>彩蛋 &amp; 茶</egg_description></draw></drawings>'}}]}});
            });
            await page.goto(base+'/?settings-smoke'+(tt?'&tt':''));
            await page.evaluate(()=>{
                const p=window.preview;
                Object.assign(p.context,{characterId:0,characters:[{avatar:'sample.png',name:'测试角色卡'}],chatMetadata:{},
                    saveMetadata:async()=>{},updateMessageBlock(index,message){
                        document.querySelector(`#chat .mes[mesid="${index}"] .mes_text`).textContent=message.mes;
                    }});
                Object.assign(p.settings,{mode:'manual',cloudQueue:false,eggProfileEnabled:false});
            });
            await page.locator('#miao-nai-menu').click();
            const nav=page.locator(tt?'.miao-overview':'.miao-tabs');
            if(tt){
                await nav.getByRole('button',{name:'生成',exact:true}).tap();
                await page.getByLabel('API Key',{exact:true}).fill('inline-drawings-fixture-key');
                await page.getByRole('button',{name:'保存密钥',exact:true}).tap();
                await page.waitForFunction(()=>!!window.preview.settings.keyHash);
                await page.getByRole('button',{name:'返回功能列表',exact:true}).tap();
            }
            await nav.getByRole('button',{name:'生图指令',exact:true}).click();
            await page.getByRole('combobox',{name:'来源',exact:true}).selectOption('secondary');
            const count=page.getByRole('textbox',{name:'出图张数',exact:true});
            await count.fill('1~2');await count.blur();
            await page.waitForFunction(()=>window.preview.settings.promptConfig.params.count==='1~2');
            await page.getByRole('switch',{name:'启用小标题',exact:true}).check();
            await page.getByRole('switch',{name:'启用NSFW 扩展',exact:true}).check();
            await page.getByRole('combobox',{name:'发送的性向',exact:true}).selectOption('BL');
            const fixture={type:'miao-secondary-tag-preset',version:2,name:'电子幽灵-结构测试',entries:[
                {name:'格式',role:'system',enabled:true,content:'{{setvar::张数::5~7}}<drawings><draw after="P02">{{miao_image_start}}tag{{miao_image_end}}</draw></drawings>'},
                {name:'正文槽位',role:'system',enabled:true,content:'可用角色：\n{{角色启用列表}}\n\n{{正文}}'},
            ]};
            await page.locator('#miao-nai-settings input[type=file]').setInputFiles({name:'fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
            await page.getByText('格式 · system',{exact:true}).waitFor();
            await page.getByRole('textbox',{name:'副 API 地址',exact:true}).fill('https://draw-fixture.invalid/v1');
            await page.getByRole('textbox',{name:'副 API 模型',exact:true}).fill('fixture');
            await page.getByLabel('副 API Key',{exact:true}).fill('fixture-key');
            await page.getByRole('button',{name:'保存副 API',exact:true}).click();
            await page.waitForFunction(()=>Boolean(window.preview.settings.secondaryTagAPI));
            await page.getByRole('textbox',{name:'起始标签',exact:true}).fill('START-FIG');
            await page.getByRole('textbox',{name:'结束标签',exact:true}).fill('END-FIG');
            await page.getByRole('button',{name:'保存捕捉标签',exact:true}).click();
            const characters=page.getByRole('textbox',{name:'测试角色卡',exact:true});
            await characters.fill('试用人物 = black hair, yellow eyes');
            await page.getByRole('button',{name:'保存角色 tag',exact:true}).click();
            await page.waitForFunction(()=>!!window.preview.context.chatMetadata.miao_nai_image_role_bindings);
            await page.getByRole('button',{name:'关闭设置',exact:true}).click();
            const prose='走到门口。\n\n把窗推开。\n\n花店亮灯。';
            await page.evaluate(async ({prose,tt})=>{
                const p=window.preview;
                p.chat.splice(0,p.chat.length);
                await p.emit('CHAT_CHANGED');
                await p.emit('GENERATION_STARTED','normal',{},false);
                if(tt){
                    await p.emit('GENERATION_ENDED',0);
                    await new Promise(resolve=>setTimeout(resolve,50));
                }
                p.chat.push({name:'Reply',mes:prose,swipes:['另一条分支',prose],swipe_id:1});
                document.getElementById('chat').innerHTML='<div class="mes" mesid="0"><div class="mes_text"></div></div>';
                p.context.updateMessageBlock(0,p.chat[0]);
                await p.emit('MESSAGE_RECEIVED',0,'normal');
                await p.emit('CHARACTER_MESSAGE_RENDERED',0,'normal');
            },{prose,tt});
            const generate=page.getByRole('button',{name:'生成插图',exact:true});
            await generate.first().waitFor();
            assert.equal(requests.length,1);
            assert.match(requests[0].messages[0].content,/START-FIGtagEND-FIG/);
            const wire=requests[0].messages.map(message=>message.content).join('\n');
            assert.match(wire,/试用人物 = black hair, yellow eyes[\s\S]*走到门口。\n\[P01\][\s\S]*花店亮灯。\n\[P03\]/);
            assert.match(wire,/全部配图共 1~2 张[\s\S]*\[bl\]/);
            assert.doesNotMatch(wire,/5~7|\[bg\]/);
            const expected='走到门口。\n\n把窗推开。\n\n┈┈试用标题┈┈\n\nSTART-FIG$试用人物$, sittingEND-FIG\n\n花店亮灯。\n\n/meow_FM\nSTART-FIGteacupEND-FIG\n\n<easter_egg>\n彩蛋 &amp; 茶\n</easter_egg>';
            assert.deepEqual(await page.evaluate(()=>[window.preview.chat[0].mes,...window.preview.chat[0].swipes]),
                [expected,'另一条分支',expected]);
            const disabled=await page.evaluate(async()=>{
                const {drawingResponse}=await import('/scripts/extensions/third-party/test/src/chat/secondary-placement.js');
                return drawingResponse('<drawings><draw after="P01" egg="true"><title>标题</title><tags>START-FIG cat END-FIG</tags><egg_description>解析</egg_description></draw></drawings>',
                    {start:'START-FIG',end:'END-FIG'},{title:false,egg:true,eggDescription:false,eggMarker:'/meow_FM'}).drawings[0];
            });
            assert.equal(disabled.egg,true);
            assert.equal(disabled.title,undefined);
            assert.equal(disabled.eggDescription,undefined);
            assert.equal(await generate.count(),2);
            assert.equal(await page.evaluate(()=>window.preview.calls.length),0,'manual mode extracts tags without generating an image');
            await generate.first().click();
            await page.waitForFunction(()=>window.preview.calls.length===1);
            const nai=await page.evaluate(()=>window.preview.calls[0].prompt??window.preview.calls[0].input);
            assert.match(nai,/black hair, yellow eyes, sitting/);
            assert.doesNotMatch(nai,/试用人物/);
            await page.evaluate(async()=>{
                const p=window.preview;
                p.chatId='another-archive';p.context.chatMetadata={};
                await p.emit('CHAT_CHANGED');
                await p.emit('MESSAGE_RECEIVED',0,'first_message');
                await p.emit('CHARACTER_MESSAGE_RENDERED',0,'normal');
            });
            await page.waitForTimeout(120);
            assert.equal(requests.length,1,'opening an archive must not process its existing last floor');
            await page.locator('#miao-nai-menu').click();
            await nav.getByRole('button',{name:'生图指令',exact:true}).click();
            assert.equal(await characters.inputValue(),'');
            await page.getByRole('button',{name:'关闭设置',exact:true}).click();
            await page.evaluate(async()=>{
                const p=window.preview;
                p.chat.push({name:'Reply',mes:'另一个 RP 回复。\n\n炉边有一杯茶。\n\n结束。'});
                const id=p.chat.length-1;
                document.getElementById('chat').insertAdjacentHTML('beforeend',`<div class="mes" mesid="${id}"><div class="mes_text"></div></div>`);
                p.context.updateMessageBlock(id,p.chat[id]);
                await p.emit('MESSAGE_RECEIVED',id,'normal');
                await p.emit('CHARACTER_MESSAGE_RENDERED',id,'normal');
                await p.emit('GENERATION_ENDED',p.chat.length);
            });
            await page.waitForFunction(()=>window.preview.chat.at(-1).mes.includes('START-FIG'));
            assert.equal(requests.length,2,'one finished reply may be published without a start event');
            assert.equal(await page.evaluate(()=>window.preview.calls.length),1);
            await page.close();
        }
    }finally{await browser?.close();server.kill();}
});
