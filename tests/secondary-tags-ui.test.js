import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
const require=createRequire(import.meta.url);
const fixturePNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=','base64');

async function previewAddress(server){
    return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(Error('预览启动超时')),10000);
        server.stdout.on('data',data=>{const match=String(data).match(/http:\/\/[^\s]+/);if(match){clearTimeout(timer);resolve(match[0]);}});
        server.on('exit',()=>{clearTimeout(timer);reject(Error('预览启动失败'));});
    });
}

test('updating the extension keeps device and tab keys available after reloading the settings panel',{timeout:30000},async()=>{
    const {chromium}=require(process.env.MIAO_PLAYWRIGHT_MODULE||`${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`);
    const server=spawn(process.execPath,['tests/preview-server.mjs'],{env:{...process.env,MIAO_PREVIEW_PORT:'0'},stdio:['ignore','pipe','pipe']});
    let browser;
    try{
        const base=await previewAddress(server);
        browser=await chromium.launch({channel:process.env.MIAO_BROWSER_CHANNEL||'chrome',headless:true});
        for(const mode of ['device','page','legacy-device']){
            const remember=mode==='page'?'page':'device';
            const page=await browser.newPage();
            page.setDefaultTimeout(6500);
            await page.route('https://key-update.invalid/v1/models',route=>route.fulfill({
                headers:{'access-control-allow-origin':'*','access-control-allow-headers':'authorization'},
                json:{data:[{id:'fixture'}]},
            }));
            await page.goto(base+'/?settings-smoke&key-update');
            await page.locator('#miao-nai-menu').waitFor();
            await page.evaluate(async()=>{
                const p=window.preview;
                const {createKeyVault}=await import('/scripts/extensions/third-party/test/src/novelai/direct-key.js');
                const {fingerprintKey}=await import('/scripts/extensions/third-party/test/src/queue/cloud-queue.js');
                const user='miao-preview-user';
                await createKeyVault(user).set('fixture-nai-key',true);
                await createKeyVault(JSON.stringify([user,'custom-novelai'])).set('fixture-custom-key',true);
                Object.assign(p.settings,{tagSource:'secondary',
                    keyHash:await fingerprintKey('fixture-nai-key'),rememberDirectKey:true,
                    customKeyHash:await fingerprintKey('fixture-custom-key'),rememberCustomKey:true});
            });
            await page.locator('#miao-nai-menu').click();
            await page.locator('.miao-overview').getByRole('button',{name:'资源',exact:true}).click();
            const persistence=page.getByRole('combobox',{name:'副 API Key 保存',exact:true});
            assert.equal(await persistence.inputValue(),'device');
            await persistence.selectOption(remember);
            await page.getByRole('textbox',{name:'副 API 地址',exact:true}).fill('https://key-update.invalid/v1');
            await page.getByRole('textbox',{name:'副 API 模型',exact:true}).fill('fixture');
            await page.getByLabel('副 API Key',{exact:true}).fill('fixture-secondary-key');
            await page.getByRole('button',{name:'保存副 API',exact:true}).click();
            await page.getByText('副 API 已配置',{exact:true}).waitFor();
            await page.evaluate(legacy=>{
                const p=window.preview;
                if(legacy)p.settings.secondaryTagAPI.remember=false;
                const saves=p.settingsSaves??0;
                p.beforeRequest=path=>{
                    if(path==='/api/extensions/update')sessionStorage.setItem('miao-fixture-update-saved',String(p.settingsSaves>saves));
                };
            },mode==='legacy-device');
            await page.getByRole('button',{name:'返回主页',exact:true}).click();
            await page.getByRole('button',{name:'检查并更新',exact:true}).click();
            await page.waitForFunction(()=>window.preview.reloads===1);
            assert.equal(await page.evaluate(()=>sessionStorage.getItem('miao-fixture-update-saved')),'true');
            await page.reload();
            await page.locator('#miao-nai-menu').click();
            await page.locator('.miao-overview').getByRole('button',{name:'资源',exact:true}).click();
            await page.getByText('副 API 已配置',{exact:true}).waitFor();
            assert.equal(await page.getByLabel('副 API Key',{exact:true}).inputValue(),'');
            assert.equal(await page.getByLabel('副 API Key',{exact:true}).getAttribute('placeholder'),'已保存，留空沿用');
            assert.equal(await persistence.inputValue(),mode==='legacy-device'?'page':remember);
            if(mode==='legacy-device')await page.getByRole('textbox',{name:'副 API 模型',exact:true}).fill('fixture-new-model');
            await page.getByRole('button',{name:'保存',exact:true}).click();
            await page.getByRole('button',{name:'已保存',exact:true}).waitFor();
            assert.equal(await persistence.inputValue(),remember);
            const result=await page.evaluate(async remember=>{
                const {createKeyVault}=await import('/scripts/extensions/third-party/test/src/novelai/direct-key.js');
                const {fingerprintKey}=await import('/scripts/extensions/third-party/test/src/queue/cloud-queue.js');
                const p=window.preview,user='miao-preview-user';
                const scopes=[user,JSON.stringify([user,'custom-novelai']),JSON.stringify([user,'secondary-tags',p.settings.secondaryTagAPI.url])];
                const keys=await Promise.all(scopes.map((scope,index)=>createKeyVault(scope,index===2?{tabStorage:()=>sessionStorage}:{}).get()));
                const {persistent}=await createKeyVault(scopes[2],{tabStorage:()=>sessionStorage}).status();
                return [
                    keys[0]==='fixture-nai-key'&&p.settings.keyHash===await fingerprintKey(keys[0]),
                    keys[1]==='fixture-custom-key'&&p.settings.customKeyHash===await fingerprintKey(keys[1]),
                    keys[2]==='fixture-secondary-key'&&persistent===(remember==='device'),
                ];
            },remember);
            assert.deepEqual(result,[true,true,true]);
            const request=page.waitForRequest(request=>request.method()==='GET'&&request.url()==='https://key-update.invalid/v1/models');
            await page.getByRole('button',{name:'获取模型',exact:true}).click();
            assert.equal((await request).headers().authorization,'Bearer fixture-secondary-key');
            await page.close();
        }
    }finally{await browser?.close();server.kill();}
});

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
            const nav=page.locator('.miao-overview:visible, .miao-tabs:visible');
            if(tt){
                await page.route('**/fixture-nai.zip',route=>route.fulfill({contentType:'image/png',body:fixturePNG}));
                await nav.getByRole('button',{name:'生成',exact:true}).tap();
                await page.getByLabel('API Key',{exact:true}).fill('automatic-draw-fixture-key');
                await page.getByRole('button',{name:'保存密钥',exact:true}).tap();
                await page.waitForFunction(()=>!!window.preview.settings.keyHash);
                await page.getByRole('button',{name:'返回主页',exact:true}).tap();
            }
            await nav.getByRole('button',{name:'资源',exact:true}).click();
            await page.getByRole('combobox',{name:'来源',exact:true}).selectOption('secondary');
            await page.waitForFunction(()=>window.preview.injections?.miao_nai_image_instruction?.text==='');
            const presetPicker=page.getByRole('combobox',{name:'当前副 API 预设',exact:true});
            assert.equal(await presetPicker.inputValue(),'electronic-ghost');
            assert.equal(await presetPicker.locator('option').count(),1);
            assert.equal(await presetPicker.locator('option').first().textContent(),'电子幽灵1.9（默认）');
            const exportButton=page.getByRole('button',{name:'导出当前预设',exact:true});
            assert.equal(await exportButton.isEnabled(),true);
            const messages=page.locator('.miao-secondary-preset-messages');
            assert.ok(await messages.locator('details:visible').count()>3);
            assert.match(await messages.locator('details[open] pre').textContent(),/\{\{正文\}\}/);
            assert.equal(await page.getByRole('button',{name:'更新资源',exact:true}).count(),1);
            assert.equal(await page.getByRole('button',{name:'提取绘图 tag',exact:true}).count(),0);
            assert.equal(requests.length,0,'viewing the bundled preset must not trigger a request');
            const bodyTemplate='<剧情原文>\n{{正文}}\n</剧情原文>';
            const full={prompts:[
                {identifier:'body',name:'正文条目',role:'system',content:bodyTemplate},
                {identifier:'setting',name:'设定',role:'system',content:'完整的设定示例'},
                {identifier:'example',name:'示范',role:'assistant',content:'示范回复'},
                {identifier:'style',name:'风格',role:'system',content:'完整的风格示例'},
                {identifier:'unlisted',name:'备用范例',role:'system',content:'备用内容'},
            ],prompt_order:[{character_id:100001,order:['setting','style','body','example'].map(identifier=>({identifier,enabled:true}))}]};
            const input=page.locator('[data-miao-secondary-preset-import]');
            await input.setInputFiles({name:'电子幽灵-测试.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(full))});
            await messages.getByText('备用范例 · system · 未启用',{exact:true}).waitFor();
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
            await input.setInputFiles({name:'fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
            await page.getByText(/发送前展开：.*\{\{getvar::对象\}\}/).waitFor();
            assert.equal(await presetPicker.inputValue(),'import-1');
            if(tt)await page.getByRole('button',{name:'保存副 API',exact:true}).click();
            else await page.getByRole('button',{name:'保存',exact:true}).click();
            await page.waitForFunction(()=>!!window.preview.settings.secondaryTagAPI);
            await page.getByText('副 API 已配置',{exact:true}).waitFor();
            assert.ok(!(await page.evaluate(()=>JSON.stringify(window.preview.settings))).includes('fixture-secondary-key'));
            assert.equal(await keyInput.inputValue(),'');
            if(!tt){
                const save=page.locator('.miao-save-button');
                await page.getByRole('button',{name:'已保存',exact:true}).waitFor();
                assert.equal(await page.getByRole('textbox',{name:'副 API 地址',exact:true}).inputValue(),endpoint);
                const saved=await page.evaluateHandle(()=>window.preview.settings.secondaryTagAPI);
                const saves=await page.evaluate(()=>window.preview.settingsSaves);
                await save.click();
                await page.waitForFunction(before=>window.preview.settingsSaves>before,saves);
                await page.getByRole('button',{name:'已保存',exact:true}).waitFor();
                assert.equal(await page.evaluate(connection=>window.preview.settings.secondaryTagAPI===connection,saved),true,
                    'saving unchanged connection fields must not restart secondary API state');
                await saved.dispose();
            }
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
                await input.setInputFiles({name:download.suggestedFilename(),mimeType:'application/json',buffer:data});
                await page.waitForFunction(previous=>window.preview.settingsSaves>previous,saves);
                assert.equal(await presetPicker.locator('option').count(),3,'reimporting the same preset must not duplicate it');
            }
            await page.getByRole('button',{name:'关闭设置',exact:true}).click();
            const rawReply='<think>private reasoning</think>正文：猫跳上窗台。 ┈┈绘图标题┈┈ <easter_egg>彩蛋介绍</easter_egg> image###inline main tag###';
            await page.evaluate(async({tt,meowRegex,rawReply})=>{
                const p=window.preview;
                Object.assign(p.settings,{mode:tt?'auto':'stream',cloudQueue:false,eggProfileEnabled:false});
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
                const main=createLore(),builtin=createLore(),secondary=createLore();
                const promptMode=p.settings.promptConfig.mode;
                p.settings.tagSource='main';p.settings.promptConfig.mode='external';
                await p.emit('WORLDINFO_ENTRIES_LOADED',main);
                p.settings.promptConfig.mode='builtin';
                await p.emit('WORLDINFO_ENTRIES_LOADED',builtin);
                p.settings.tagSource='secondary';p.settings.promptConfig.mode=promptMode;
                await p.emit('WORLDINFO_ENTRIES_LOADED',secondary);
                p.worldEntryCounts=[main,builtin,secondary].map(lore=>Object.values(lore).map(group=>group.length));
                await p.emit('WORLD_INFO_ACTIVATED',[...Object.values(secondary).flat(),named]);
                p.chat.push({name:'Reply',mes:rawReply});
                window.drawSecondaryFixture();
                await p.emit('STREAM_TOKEN_RECEIVED');await p.emit('CHARACTER_MESSAGE_RENDERED',3);
            },{tt,meowRegex,rawReply});
            await page.waitForTimeout(180);
            assert.equal(requests.length,0);
            assert.equal(await page.evaluate(()=>window.preview.calls.length),0);
            assert.deepEqual(await page.evaluate(()=>window.preview.worldEntryCounts),[[1,2,1,1],[0,0,1,0],[0,0,1,0]]);
            await page.evaluate(()=>window.preview.emit('GENERATION_ENDED',4));
            await page.waitForTimeout(100);
            assert.equal(requests.length,0,'an early ENDED event must not send a streaming draft');
            await page.evaluate(async()=>{
                await window.preview.emit('MESSAGE_RECEIVED',3,'normal');
                await window.preview.emit('CHARACTER_MESSAGE_RENDERED',3,'normal');
            });
            const secondary=page.locator('[data-miao-source=secondary]');
            await secondary.waitFor();
            assert.equal(await secondary.count(),1);
            assert.equal(await page.getByRole('button',{name:'提取绘图 tag',exact:true}).count(),0);
            assert.equal(requests.length,1);
            assert.equal(requests[0].auth,'Bearer fixture-secondary-key');
            assert.equal(requests[0].body.model,'fixture-model');
            assert.equal(requests[0].body.stream,false);
            assert.equal(await page.evaluate(()=>window.miaoTestToasts.some(item=>item.type==='info'&&item.message.includes('正在生成绘图 tag'))),true);
            assert.equal(await page.evaluate(()=>window.miaoTestToasts.some(item=>item.type==='success'&&item.message.includes('已生成 1 个绘图 tag'))),true);
            assert.equal(requests[0].body.messages[0].content,'FIXTURE_DIRECTOR 猫');
            assert.deepEqual(requests[0].body.messages.at(-1),{role:'user',content:'<剧情原文>\n画面：猫跳上窗台。\n</剧情原文>\n猫和花\n\n角色：历史素材。\n\n用户：Earlier filtered text\nEarlier filtered text\nGarden lore'});
            assert.doesNotMatch(requests[0].body.messages.map(message=>message.content).join('\n'),/\$角色名\$|当前存档的角色绑定表/);
            assert.equal(await page.evaluate(()=>window.preview.chat.at(-1).mes),rawReply);
            const calls=await page.evaluate(()=>window.preview.promptRegexCalls);
            assert.deepEqual(calls.map(({placement,depth,isPrompt})=>[placement,depth,isPrompt]),[[2,2,true],[1,1,true],[2,0,true]]);
            assert.ok(calls.every(call=>!call.isMarkdown&&!call.raw.includes('private reasoning')));
            assert.ok(calls.at(-1).raw.includes('┈┈绘图标题┈┈'),'Meow scripts must see the original decorations');
            assert.equal(await page.evaluate(()=>window.preview.regexBatchCalls??0),tt?1:0);
            if(tt){
                await secondary.locator(':scope>img').waitFor();
                assert.equal(await page.evaluate(()=>window.preview.calls.length),1);
                await page.locator('#miao-nai-menu').tap();
                await nav.getByRole('button',{name:'资源',exact:true}).tap();
                await messages.getByText('最近发送 · 宏展开后',{exact:true}).tap();
                const expanded=messages.locator('details').nth(3).locator('pre');
                assert.equal(await expanded.textContent(),requests[0].body.messages.map(({role,content})=>role+'\n'+content).join('\n\n'));
                assert.equal(requests.length,1,'the last-request preview must not send a request');
                await page.getByRole('button',{name:'关闭设置',exact:true}).tap();
            }else{
                const picture=secondary.locator(':scope>img');
                await picture.waitFor();
                assert.equal(await page.evaluate(()=>window.preview.calls.length),1);
                assert.match(await page.evaluate(()=>window.preview.calls[0].prompt),/cat, bright window/);
                await page.setViewportSize({width:390,height:844});
                await page.evaluate(async()=>{
                    window.preview.settings.promptFavoritesEnabled=true;
                    await window.preview.emit('MESSAGE_UPDATED',3);
                });
                await secondary.getByRole('button',{name:'收藏提示词与例图',exact:true,includeHidden:true}).waitFor({state:'attached'});
                await picture.press('Enter');
                const operations=secondary.locator('.miao-image-operations');
                await operations.waitFor();
                assert.deepEqual(await operations.evaluate(grid=>{
                    const top=grid.firstElementChild.getBoundingClientRect().top;
                    return [...grid.children].filter(button=>button.getBoundingClientRect().top===top).map(button=>button.textContent);
                }),['提示词','收藏提示词','下载','放大']);

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
                    p.settings.mode='auto';
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
                    await page.waitForFunction(()=>window.preview.calls.length===2);
                }finally{release();}
                await page.evaluate(async()=>{
                    const p=window.preview;
                    p.settings.mode='auto';
                    p.context.saveChat=async()=>false;
                    await window.completeSecondaryFixtureReply('Reply with an unsuccessful save');
                });
                await page.waitForFunction(()=>window.miaoTestToasts.some(t=>t.type==='error'&&t.message.includes('保存聊天失败')));
                assert.equal(requests.length,5);
                assert.deepEqual(await page.evaluate(()=>[Object.keys(window.preview.chat.at(-1).miao_nai_image_secondary_tags??{}),window.preview.calls.length]),[[],2]);
            }
            assert.deepEqual(errors,[]);await page.close();
        }
    }finally{await browser?.close();server.kill();}
});

test('manual secondary gestures extract the visible floor and only the image button starts generation', {timeout:90000},async()=>{
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
                const request=route.request().method()==='POST'?route.request().postDataJSON():null;
                if(request)requests.push(request);
                const role=request?.messages.some(message=>message.content.includes('试用人物 = black hair, yellow eyes'))?'$试用人物$':'short hair';
                const messages=request?.messages.map(message=>message.content).join('\n')??'';
                const recovered=messages.includes('无法定位的回填测试。')?'START-FIG empty station, mist END-FIG':
                    messages.includes('第九楼专属正文。')?'整理如下：\n```xml\n<drawings><draw after="P01"><title>┈雨 & 灯┈┈</title><tags>rain, black umbrella</tags></draw><draw after="P02"><title>缺少结束标签<tags>START-FIG window light END-FIG</tags></draw></drawings>\n```\n完成。':null;
                if(recovered){
                    await route.fulfill({headers:{'access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type'},
                        json:{choices:[{message:{content:recovered}}]}});
                    return;
                }
                await route.fulfill({headers:{'access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type'},
                    json:{choices:[{message:{content:`<drawings><draw after="P01" egg="true">START-FIG extra bonus END-FIG</draw><draw after="P03">START-FIG $其他存档角色$, walking END-FIG</draw><draw after="P02"><title>✧·试用标题·(≧▽≦)·✧</title><tags>START-FIG Scene Composition: warm light;Character 1 Prompt:${role}, sitting|centers:B3;Character 1 UC: outdoors;Character 2 Prompt: red hair, holding a book; END-FIG</tags></draw><draw after="P01">START-FIG extra shot END-FIG</draw><draw egg="true"><tags>┈┈简单彩蛋┈┈\nSTART-FIG 4koma, teacup, text, speech bubble, english text\nText: From $5 to $10?\n\nText: I owe you one!END-FIG</tags><egg_description>彩蛋 &amp; 茶</egg_description></draw></drawings>`}}]}});
            });
            await page.goto(base+'/?settings-smoke'+(tt?'&tt':''));
            await page.evaluate(tt=>{
                const p=window.preview;
                const profile={description:'{{char}} 戴金边眼镜。 <think>隐藏的角色卡内容</think>',personality:'平静而有耐心。',scenario:'卡片旧场景。'};
                Object.assign(p.context,{characterId:0,characters:[
                    {avatar:'sample-a.png',name:'角色卡 A',...(tt?{data:profile}:profile)},{avatar:'sample-b.png',name:'角色卡 B',description:'其他角色卡的设定。'}],
                    name1:'玩家 A',
                    chatMetadata:{scenario:'当前聊天的场景。',miao_nai_image_role_bindings:'已有角色 = silver hair\n第二角色 = blue eyes'},
                    saveMetadata:async()=>{},updateMessageBlock(index,message){
                        if(index===9&&message.mes.includes('START-FIG'))throw Error('fixture: host refresh failed');
                        document.querySelector(`#chat .mes[mesid="${index}"] .mes_text`).textContent=message.mes;
                    }});
                p.context.powerUserSettings.persona_description='{{user}} 穿蓝色外套。';
                Object.assign(p.settings,{mode:'manual',cloudQueue:false,eggProfileEnabled:false});
            },tt);
            await page.locator('#miao-nai-menu').click();
            const nav=page.locator('.miao-overview:visible, .miao-tabs:visible');
            if(tt){
                await page.route('**/fixture-nai.zip',route=>route.fulfill({contentType:'image/png',body:fixturePNG}));
                await nav.getByRole('button',{name:'生成',exact:true}).tap();
                await page.getByLabel('API Key',{exact:true}).fill('inline-drawings-fixture-key');
                await page.getByRole('button',{name:'保存密钥',exact:true}).tap();
                await page.waitForFunction(()=>!!window.preview.settings.keyHash);
                await page.getByRole('button',{name:'返回主页',exact:true}).tap();
            }
            await nav.getByRole('button',{name:'资源',exact:true}).click();
            await page.getByRole('combobox',{name:'来源',exact:true}).selectOption('secondary');
            const count=page.getByRole('textbox',{name:'正文图张数',exact:true});
            await count.fill('2');await count.blur();
            await page.waitForFunction(()=>window.preview.settings.promptConfig.params.count==='2');
            await page.getByRole('switch',{name:'启用小标题',exact:true}).check();
            await page.getByRole('switch',{name:'启用NSFW 扩展',exact:true}).check();
            await page.getByRole('combobox',{name:'发送的性向',exact:true}).selectOption('BL');
            const fixture={type:'miao-secondary-tag-preset',version:2,name:'电子幽灵-结构测试',entries:[
                {name:'格式',role:'system',enabled:true,content:'{{setvar::张数::5~7}}<drawings><draw after="P02">{{miao_image_start}}tag{{miao_image_end}}</draw></drawings>'},
                {name:'正文槽位',role:'system',enabled:true,content:'可用角色：\n{{角色启用列表}}\n<persona>{{用户人设}}</persona>\n<character>{{角色设定}}</character>\n\n{{正文}}'},
            ]};
            await page.locator('[data-miao-secondary-preset-import]').setInputFiles({name:'fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
            await page.getByText('格式 · system',{exact:true}).waitFor();
            await page.getByRole('textbox',{name:'副 API 地址',exact:true}).fill('https://draw-fixture.invalid/v1');
            await page.getByRole('textbox',{name:'副 API 模型',exact:true}).fill('fixture');
            await page.getByLabel('副 API Key',{exact:true}).fill('fixture-key');
            await page.getByRole('button',{name:'保存副 API',exact:true}).click();
            await page.waitForFunction(()=>Boolean(window.preview.settings.secondaryTagAPI));
            await page.getByRole('textbox',{name:'起始标签',exact:true}).fill('START-FIG');
            await page.getByRole('textbox',{name:'结束标签',exact:true}).fill('END-FIG');
            await page.getByRole('button',{name:'保存捕捉标签',exact:true}).click();
            const characters=page.getByRole('textbox',{name:'角色名',exact:true});
            const roleTags=page.getByRole('textbox',{name:'固定 tag',exact:true});
            assert.equal(await characters.first().getAttribute('placeholder'),'小爱');
            assert.equal(await roleTags.first().getAttribute('placeholder'),'blue eyes,long hair,white hair,');
            assert.deepEqual(await characters.evaluateAll(inputs=>inputs.map(input=>input.value)),['已有角色','第二角色']);
            assert.deepEqual(await roleTags.evaluateAll(inputs=>inputs.map(input=>input.value)),['silver hair','blue eyes']);
            if(tt)assert.match(await page.locator('.miao-role-row').first().evaluate(row=>getComputedStyle(row).gridTemplateAreas),/"name remove" "tags tags"/);
            await characters.first().fill('试用人物');
            await roleTags.first().fill('black hair,\nyellow eyes');
            const removeRole=page.getByRole('button',{name:'移除角色',exact:true});
            await removeRole.nth(1).click();
            await page.getByRole('button',{name:'添加角色',exact:true}).click();
            await characters.nth(1).fill('临时演员');
            await roleTags.nth(1).fill('red hair');
            await page.getByRole('button',{name:'保存角色 tag',exact:true}).click();
            await page.waitForFunction(()=>window.preview.context.chatMetadata.miao_nai_image_role_bindings==='试用人物 = black hair, yellow eyes\n临时演员 = red hair');
            await removeRole.nth(1).click();
            await page.getByRole('button',{name:'保存',exact:true}).click();
            await page.waitForFunction(()=>window.preview.context.chatMetadata.miao_nai_image_role_bindings==='试用人物 = black hair, yellow eyes');
            await page.getByRole('button',{name:'已保存',exact:true}).waitFor();
            await roleTags.first().fill('unsaved fixture draft');
            await page.evaluate(async()=>{
                const p=window.preview;
                p.archiveA=p.context.chatMetadata;
                p.context.characterId=1;
                p.context.chatMetadata={miao_nai_image_role_bindings:'试用人物 = blue hair'};
                await p.emit('CHAT_CHANGED');
            });
            assert.equal(await page.locator('.miao-role-scope').textContent(),'角色卡 B · preview');
            assert.equal(await characters.first().inputValue(),'试用人物');
            assert.equal(await roleTags.first().inputValue(),'blue hair');
            await roleTags.first().fill('red hair');
            await page.getByRole('button',{name:'保存角色 tag',exact:true}).click();
            assert.deepEqual(await page.evaluate(()=>{
                const p=window.preview,key='miao_nai_image_role_bindings';
                return [p.archiveA[key],p.context.chatMetadata[key]];
            }),['试用人物 = black hair, yellow eyes','试用人物 = red hair']);
            await page.evaluate(async()=>{
                const p=window.preview;
                p.context.characterId=0;
                p.chatId='preview-new';
                p.context.chatMetadata={};
                await p.emit('CHAT_CHANGED');
            });
            assert.equal(await page.locator('.miao-role-scope').textContent(),'角色卡 A · preview-new');
            assert.equal(await characters.first().inputValue(),'');
            await page.evaluate(async()=>{
                const p=window.preview;
                p.chatId='preview';p.context.chatMetadata=p.archiveA;
                await p.emit('CHAT_CHANGED');
            });
            assert.equal(await roleTags.first().inputValue(),'black hair, yellow eyes');
            await page.getByRole('button',{name:'关闭设置',exact:true}).click();
            const prose='走到门口。\n把窗推开。\n花店亮灯。\n\n<meowfm>彩蛋正文。</meowfm>';
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
            const ball=page.locator('#miao-nai-floating');
            const tapBall=()=>tt?ball.tap():ball.click();
            const tripleTap=async()=>{await tapBall();await tapBall();await tapBall();};
            await ball.waitFor();
            assert.match(await ball.getAttribute('aria-label'),/三击为当前 AI 楼层出词/);
            await tapBall();await tapBall();await page.waitForTimeout(420);
            assert.equal(requests.length,0,'manual mode waits for three taps');
            assert.equal(await page.evaluate(()=>window.preview.calls.length),0);
            await tripleTap();
            await page.waitForFunction(()=>window.preview.chat[0].mes.includes('START-FIG'));
            assert.equal(requests.length,1);
            assert.match(requests[0].messages[0].content,/START-FIGtagEND-FIG/);
            const wire=requests[0].messages.map(message=>message.content).join('\n');
            assert.match(wire,/<persona>玩家 A\n玩家 A 穿蓝色外套。<\/persona>/);
            assert.match(wire,/<character>角色卡 A[\s\S]*角色卡 A 戴金边眼镜。\s*[\s\S]*平静而有耐心。/);
            assert.match(wire,/场景\n当前聊天的场景。<\/character>/);
            assert.doesNotMatch(wire,/隐藏的角色卡内容|其他角色卡的设定|卡片旧场景|\{\{用户人设\}\}|\{\{角色设定\}\}/);
            assert.match(wire,/试用人物 = black hair, yellow eyes[\s\S]*走到门口。\n\[P01\][\s\S]*花店亮灯。\n\[P03\]/);
            assert.match(wire,/每位在绑定表中且确实出镜的角色都必须在自己的括号组里写一次 \$角色名\$[\s\S]*其他出镜角色由你根据正文和人物资料直接写英文外貌和动作 tag/);
            assert.match(wire,/\$试用人物\$ = black hair, yellow eyes/);
            assert.match(wire,/即使正文、User 人设、Char 角色卡或世界书也写了这些外观，也不要在同一角色组里另写一次/);
            assert.match(wire,/由你根据这张图创作标题、装饰符号和颜文字/);
            assert.match(wire,/漫画彩蛋默认配一两句简短对白[\s\S]*对白默认使用简短英文/);
            assert.match(wire,/正文图 2 张[\s\S]*额外生成 1 张彩蛋图[\s\S]*\[bl\]/);
            assert.doesNotMatch(wire,/5~7|\[bg\]/);
            const [placed,original,updated]=await page.evaluate(()=>[window.preview.chat[0].mes,...window.preview.chat[0].swipes]);
            const boundary=placed.indexOf('<meowfm>');
            assert.match(placed.slice(0,boundary),/把窗推开。\s+START-FIG\n<miao-title>✧·试用标题·\(≧▽≦\)·✧<\/miao-title>\nwarm light, \(\$试用人物\$, sitting\), \(red hair, holding a book\)END-FIG/);
            assert.doesNotMatch(placed,/Scene Composition|Character 1|centers|outdoors/);
            assert.match(placed.slice(0,boundary),/走到门口。\s+START-FIGextra shotEND-FIG\s+把窗推开。/);
            assert.match(placed.slice(boundary),/^<meowfm>彩蛋正文。<\/meowfm>\s+START-FIG\n<miao-title>简单彩蛋<\/miao-title>\n4koma, teacup, text, speech bubble, english text\nText: From \$5 to \$10\?\n\nI owe you one!END-FIG\s+<easter_egg>\s+彩蛋 &amp; 茶/);
            assert.doesNotMatch(placed,/┈/);
            assert.equal(placed.match(/<meowfm>/g).length,1);
            assert.doesNotMatch(placed,/\/meow_FM/i);
            assert.doesNotMatch(placed,/extra bonus/);
            assert.doesNotMatch(placed,/其他存档角色/);
            assert.equal(await page.evaluate(()=>window.miaoTestToasts.some(t=>t.type==='warning'&&t.message.includes('未知角色调用'))),true);
            assert.deepEqual([original,updated],['另一条分支',placed]);
            assert.equal(await page.evaluate(()=>window.miaoTestToasts.some(t=>t.type==='warning'&&t.message.includes('1 张图的副 API 返回缺少小标题'))),true);
            const disabled=await page.evaluate(async()=>{
                const {drawingResponse}=await import('/scripts/extensions/third-party/test/src/chat/secondary-placement.js');
                return drawingResponse('<drawings><draw after="P01" egg="true"><title>标题</title><tags>START-FIG cat END-FIG</tags><egg_description>解析</egg_description></draw></drawings>',
                    {start:'START-FIG',end:'END-FIG'},{title:false,egg:true,eggDescription:false,eggMarker:'/meow_FM'}).drawings[0];
            });
            assert.equal(disabled.egg,true);
            assert.equal(disabled.title,undefined);
            assert.equal(disabled.eggDescription,undefined);
            const imageCards=id=>page.locator(`#chat [mesid="${id}"] .miao-image-card`);
            const clickGenerate=async(id,count)=>{
                for(let i=0;i<count;i++)await imageCards(id).nth(i).getByRole('button',{name:'生成插图',exact:true}).click();
            };
            await imageCards(0).nth(2).getByRole('button',{name:'生成插图',exact:true}).waitFor();
            assert.equal(await page.evaluate(()=>window.preview.calls.length),0);
            await tripleTap();await page.waitForFunction(()=>window.miaoTestToasts.some(t=>t.message==='本楼已有绘图提示词'));
            assert.equal(requests.length,1);
            assert.equal(await page.evaluate(()=>window.preview.calls.length),0);
            await clickGenerate(0,3);
            await page.waitForFunction(()=>document.querySelectorAll('#chat .miao-image-card>img').length===3,null,{timeout:7500});
            const generated=await page.evaluate(()=>window.preview.calls.map(call=>call.prompt??call.input));
            assert.equal(generated.length,3);
            const nai=generated.find(text=>text.includes('warm light'));
            assert.match(nai,/\(black hair, yellow eyes, sitting\), \(red hair, holding a book\)/);
            assert.doesNotMatch(nai,/试用人物/);
            assert.ok(await page.evaluate(()=>window.preview.calls.every(call=>!call.characters)));
            const bonus=generated.find(text=>text.includes('speech bubble'));
            assert.ok(generated.every(text=>!/miao-title|试用标题|简单彩蛋/.test(text)));
            assert.match(bonus,/speech bubble, english text[\s\S]*\nText: From \$5 to \$10\?\n\nI owe you one!$/);
            assert.doesNotMatch(bonus,/no text/);
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
            await nav.getByRole('button',{name:'资源',exact:true}).click();
            assert.equal(await characters.inputValue(),'');
            await page.getByRole('button',{name:'关闭设置',exact:true}).click();
            await page.evaluate(async()=>{
                const p=window.preview;
                const chat=document.getElementById('chat');
                Object.assign(chat.style,{height:'360px',overflowY:'auto',overflowAnchor:'none'});
                for(let id=1;id<=7;id++)p.chat.push({name:'User',mes:'用户楼层 '+id,is_user:true});
                p.chat.push({name:'Reply',mes:'另一个 RP 回复。\n\n炉边有一杯茶。\n\n结束。'});
                p.chat.push({name:'Reply',mes:'第九楼专属正文。\n\n门外下雨。\n\n结束。'});
                for(const id of [7,8,9]){
                    chat.insertAdjacentHTML('beforeend',`<div class="mes" mesid="${id}" style="min-height: 400px"><div class="mes_text"></div></div>`);
                    p.context.updateMessageBlock(id,p.chat[id]);
                    await p.emit('MESSAGE_RECEIVED',id,'normal');
                    await p.emit('CHARACTER_MESSAGE_RENDERED',id,'normal');
                }
                await p.emit('GENERATION_ENDED',p.chat.length);
            });
            const showFloor=id=>page.locator(`#chat .mes[mesid="${id}"]`).evaluate(row=>{
                const parent=row.parentElement,rect=row.getBoundingClientRect();
                parent.scrollTop+=rect.top-parent.getBoundingClientRect().top+(rect.height-parent.clientHeight)/2;
            });
            await showFloor(7);await tripleTap();await page.waitForTimeout(150);
            assert.equal(requests.length,1,'the visible user floor must not generate');
            await showFloor(8);await tripleTap();
            await page.waitForFunction(()=>window.preview.chat[8].mes.includes('START-FIG'));
            assert.equal(requests.length,2);
            assert.match(requests[1].messages.map(message=>message.content).join('\n'),/另一个 RP 回复/);
            assert.doesNotMatch(requests[1].messages.map(message=>message.content).join('\n'),/第九楼专属正文/);
            assert.doesNotMatch(requests[1].messages.map(message=>message.content).join('\n'),/\$角色名\$|试用人物 =/);
            assert.match(await page.evaluate(()=>window.preview.chat[8].mes),/\(short hair, sitting\)/);
            assert.doesNotMatch(await page.evaluate(()=>window.preview.chat[9].mes),/START-FIG/);
            await showFloor(9);await tripleTap();
            await page.waitForFunction(()=>window.preview.chat[9].mes.includes('START-FIG'));
            assert.equal(requests.length,3);
            assert.match(requests[2].messages.map(message=>message.content).join('\n'),/第九楼专属正文/);
            const recovered=await page.evaluate(()=>window.preview.chat[9].mes);
            assert.match(recovered,/START-FIG\n<miao-title>雨 &amp; 灯<\/miao-title>\nrain, black umbrellaEND-FIG/);
            assert.match(recovered,/START-FIGwindow lightEND-FIG/);
            assert.doesNotMatch(recovered,/┈|缺少结束标签/);
            await imageCards(9).nth(1).getByRole('button',{name:'生成插图',exact:true}).waitFor();
            assert.equal(await page.evaluate(()=>window.preview.calls.length),3);
            await clickGenerate(8,2);await clickGenerate(9,2);
            await page.waitForFunction(()=>[8,9].every(id=>document.querySelectorAll(`#chat .mes[mesid="${id}"] .miao-image-card>img`).length===2),null,{timeout:18000});
            assert.equal(await page.evaluate(()=>window.preview.calls.length),7);

            const fallbackText='无法定位的回填测试。\n\n夜里的车站。';
            const normalWidth=await page.evaluate(async text=>{
                const p=window.preview,id=p.chat.length,chat=document.getElementById('chat');
                const profile=p.settings.profiles[p.settings.active];
                p.settings.profiles.push({...profile,id:'fixture-egg-profile',width:profile.width===768?1024:768});
                Object.assign(p.settings,{eggProfileEnabled:true,eggProfileId:'fixture-egg-profile'});
                p.chat.push({name:'Reply',mes:text});
                chat.insertAdjacentHTML('beforeend',`<div class="mes" mesid="${id}" style="min-height: 400px"><div class="mes_text"></div></div>`);
                p.context.updateMessageBlock(id,p.chat[id]);
                await p.emit('MESSAGE_RECEIVED',id,'normal');
                return Number(profile.width);
            },fallbackText);
            await showFloor(10);await tripleTap();
            const fallbackCard=page.locator('#chat [mesid="10"] [data-miao-source="secondary"]');
            await fallbackCard.getByRole('button',{name:'生成插图',exact:true}).waitFor();
            assert.equal(requests.length,4);
            assert.deepEqual(await page.evaluate(()=>[window.preview.chat[10].mes,window.preview.chat[10].miao_nai_image_secondary_tags[0]]),
                [fallbackText,[{prompt:'empty station, mist',egg:false}]]);
            assert.equal(await page.evaluate(()=>window.preview.calls.length),7);
            await clickGenerate(10,1);
            await fallbackCard.locator(':scope>img').waitFor();
            assert.equal(await page.evaluate(()=>{const request=window.preview.calls.at(-1);return request.width??request.parameters.width;}),normalWidth);

            const beforeSave='第一段。\n\n第二段。\n\n第三段 START-FIGexisting viewEND-FIG';
            await page.evaluate(async beforeSave=>{
                const p=window.preview,{writeSwipeImage}=await import('/scripts/extensions/third-party/test/src/chat/swipe-history.js');
                p.context.saveChat=()=>new Promise(resolve=>{p.failSecondarySave=()=>resolve(false);});
                p.settings.mode='auto';
                const message={name:'Reply',mes:beforeSave,swipes:['另一分支',beforeSave],swipe_id:1};
                writeSwipeImage(message,1,'body:0:existing view',{url:'/user/images/miao-nai/miao-1792737847709.png'});
                p.chat.push(message);
                const id=p.chat.length-1;
                document.getElementById('chat').insertAdjacentHTML('beforeend',`<div class="mes" mesid="${id}"><div class="mes_text"></div></div>`);
                p.context.updateMessageBlock(id,message);
                await p.emit('MESSAGE_RECEIVED',id,'normal');
            },beforeSave);
            await page.waitForFunction(()=>typeof window.preview.failSecondarySave==='function');
            assert.deepEqual(await page.evaluate(()=>Object.keys(window.preview.chat.at(-1).miao_nai_image_swipes[1])),['body:1:existing view']);
            await page.evaluate(async()=>{
                const p=window.preview,message=p.chat.at(-1);
                message.swipe_id=0;message.mes=message.swipes[0];
                await p.emit('MESSAGE_SWIPED',p.chat.length-1);
                p.failSecondarySave();
            });
            await page.waitForFunction(original=>window.preview.chat.at(-1).swipes[1]===original,beforeSave);
            const rolledBack=await page.evaluate(()=>{
                const message=window.preview.chat.at(-1);
                return {active:message.mes,slots:Object.keys(message.miao_nai_image_swipes[1]),
                    mirror:Object.keys(message.swipe_info[1].extra.miao_nai_image)};
            });
            assert.deepEqual(rolledBack,{active:'另一分支',slots:['body:0:existing view'],mirror:['1:body:0:existing view']});
            await page.close();
        }
    }finally{await browser?.close();server.kill();}
});
