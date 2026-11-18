import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
const require=createRequire(import.meta.url);

test('the secondary tag API sees only completed reply text and saves tags to the original swipe', {timeout:60000}, async()=>{
    const {chromium}=require(process.env.MIAO_PLAYWRIGHT_MODULE||`${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`);
    const server=spawn(process.execPath,['tests/preview-server.mjs'],{env:{...process.env,MIAO_PREVIEW_PORT:'0'},stdio:['ignore','pipe','pipe']});
    let browser;
    try{
        const base=await new Promise((resolve,reject)=>{
            const timer=setTimeout(()=>reject(Error('预览启动超时')),10000);
            server.stdout.on('data',data=>{const match=String(data).match(/http:\/\/[^\s]+/);if(match){clearTimeout(timer);resolve(match[0]);}});
            server.on('exit',()=>{clearTimeout(timer);reject(Error('预览启动失败'));});
        });
        browser=await chromium.launch({channel:process.env.MIAO_BROWSER_CHANNEL||'chrome',headless:true});
        for(const tt of [false,true]){
            const endpoint='https://tag-fixture.invalid/v1/chat/completions',requests=[],errors=[];
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
            await page.goto(base+'/?settings-smoke'+(tt?'&tt':''));
            await page.locator('#miao-nai-menu').click();
            const nav=tt?page.locator('.miao-overview'):page.locator('.miao-tabs');
            await nav.getByRole('button',{name:'生图指令',exact:true}).click();
            await page.getByRole('combobox',{name:'来源',exact:true}).selectOption('secondary');
            await page.waitForFunction(()=>window.preview.injections?.miao_nai_image_instruction?.text==='');
            await page.getByRole('textbox',{name:'副 API 地址',exact:true}).fill('https://tag-fixture.invalid/v1');
            await page.getByRole('textbox',{name:'副 API 模型',exact:true}).fill('fixture-model');
            await page.getByLabel('副 API Key',{exact:true}).fill('fixture-secondary-key');
            await page.locator('input[type=file]').setInputFiles({name:'fixture.json',mimeType:'application/json',
                buffer:Buffer.from(JSON.stringify({type:'miao-secondary-tag-preset',version:1,name:'Fixture preset',instructions:'FIXTURE_DIRECTOR'}))});
            await page.waitForFunction(()=>[...document.querySelectorAll('input')].some(input=>input.value==='Fixture preset'));
            await page.getByRole('button',{name:'保存副 API',exact:true}).click();
            await page.waitForFunction(()=>!!window.preview.settings.secondaryTagAPI);
            assert.ok(!(await page.evaluate(()=>JSON.stringify(window.preview.settings))).includes('fixture-secondary-key'));
            await page.getByRole('button',{name:'关闭设置',exact:true}).click();
            await page.evaluate(async tt=>{
                const p=window.preview;
                Object.assign(p.settings,{mode:tt?'manual':'stream',cloudQueue:false,eggProfileEnabled:false});
                p.chat.splice(0,p.chat.length,{name:'User',mes:'Earlier private text',is_user:true});
                window.drawSecondaryFixture=()=>{document.getElementById('chat').innerHTML=p.chat.map((message,index)=>`<div class="mes" mesid="${index}"><div class="mes_text">${message.mes}</div></div>`).join('');};
                window.drawSecondaryFixture();await p.emit('CHAT_CHANGED');
                await p.emit('GENERATION_STARTED','normal',{},false);
                p.chat.push({name:'Reply',mes:'<think>private reasoning</think>正文：猫跳上窗台。 image###inline main tag###'});
                window.drawSecondaryFixture();
                await p.emit('STREAM_TOKEN_RECEIVED');await p.emit('CHARACTER_MESSAGE_RENDERED',1);
            },tt);
            await page.waitForTimeout(180);
            assert.equal(requests.length,0);
            assert.equal(await page.evaluate(()=>window.preview.calls.length),0);
            await page.evaluate(async()=>{await window.preview.emit('GENERATION_ENDED',2);await window.preview.emit('GENERATION_ENDED',2);});
            if(tt){
                assert.equal(requests.length,0);
                await page.getByRole('button',{name:'提取绘图 tag',exact:true}).tap();
            }
            const secondary=page.locator('[data-miao-source=secondary]');
            await secondary.waitFor();
            assert.equal(await secondary.count(),1);
            assert.equal(requests.length,1);
            assert.equal(requests[0].auth,'Bearer fixture-secondary-key');
            assert.equal(requests[0].body.model,'fixture-model');
            assert.equal(requests[0].body.messages[0].content,'FIXTURE_DIRECTOR');
            assert.equal(requests[0].body.messages.at(-1).content,'正文：猫跳上窗台。');
            assert.equal(await page.evaluate(()=>window.preview.chat.at(-1).mes),'<think>private reasoning</think>正文：猫跳上窗台。 image###inline main tag###');
            if(tt){
                assert.equal(await page.evaluate(()=>window.preview.calls.length),0);
                await secondary.getByRole('button',{name:'生成插图',exact:true}).waitFor();
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
                await page.waitForFunction(()=>document.querySelector('.miao-secondary-tag-action button')?.disabled);
                for(let i=0;i<60&&!release;i++)await new Promise(resolve=>setTimeout(resolve,50));
                assert.equal(requests.length,2);assert.ok(release);
                await page.evaluate(async()=>{
                    const p=window.preview,message=p.chat.at(-1);
                    message.swipe_id=2;message.mes='Third swipe text';
                    window.drawSecondaryFixture();await p.emit('MESSAGE_SWIPED',1);
                });
                release();
                await page.getByRole('button',{name:'提取绘图 tag',exact:true}).waitFor();
                assert.deepEqual(await page.evaluate(()=>Object.keys(window.preview.chat.at(-1).miao_nai_image_secondary_tags)),['0']);
                assert.equal(await page.evaluate(()=>window.preview.calls.length),1);
                await page.evaluate(async()=>{
                    const p=window.preview;
                    await p.emit('GENERATION_STARTED','normal',{},false);
                    p.chat.push({name:'Stopped reply',mes:'Partially generated text'});
                    window.drawSecondaryFixture();
                    await p.emit('GENERATION_ENDED',3);await p.emit('GENERATION_STOPPED');
                });
                await page.waitForTimeout(160);
                assert.equal(requests.length,2,'ENDED before STOPPED must not send a partial reply');
            }
            assert.deepEqual(errors,[]);await page.close();
        }
    }finally{await browser?.close();server.kill();}
});
