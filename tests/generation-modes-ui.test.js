import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
const require=createRequire(import.meta.url);

test('manual, after-reply and stream generation avoid duplicate, historical and cross-message requests',{timeout:90000},async()=>{
 const {chromium}=require(process.env.MIAO_PLAYWRIGHT_MODULE||`${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`);
 const server=spawn(process.execPath,['tests/preview-server.mjs'],{env:{...process.env,MIAO_PREVIEW_PORT:'0'},stdio:['ignore','pipe','pipe']});let browser;
 try{
  const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('预览启动超时')),10000);server.stdout.on('data',data=>{const match=String(data).match(/http:\/\/[^\s]+/);if(match){clearTimeout(timer);resolve(match[0]);}});server.on('exit',()=>{clearTimeout(timer);reject(Error('预览启动失败'));});});
  browser=await chromium.launch({channel:process.env.MIAO_BROWSER_CHANNEL||'chrome',headless:true});
  const prepare=async mode=>{
   const page=await browser.newPage();page.setDefaultTimeout(6000);await page.goto(url+'/?settings-smoke');await page.locator('#miao-nai-menu').waitFor();
   await page.evaluate(async mode=>{const p=window.preview;Object.assign(p.settings,{mode,cloudQueue:false,enabled:true,eggProfileEnabled:false});for(const profile of p.settings.profiles){profile.vibeEnabled=false;profile.vibes=[];}p.chat.splice(0,p.chat.length,{name:'User fixture',is_user:true,mes:'fixture user'},{name:'History fixture',mes:'image###history###'});window.drawGenerationFixture=()=>{document.getElementById('chat').innerHTML=p.chat.map((message,index)=>`<div class="mes" mesid="${index}"><div class="mes_text">${message.mes}</div></div>`).join('');};window.drawGenerationFixture();await p.emit('CHAT_CHANGED');await p.emit('CHARACTER_MESSAGE_RENDERED',1);},mode);
   await page.locator('[mesid="1"] .miao-image-card').waitFor();assert.equal(await page.evaluate(()=>window.preview.calls.length),0,'loading history must not send requests');return page;
  };
  for(const mode of ['manual','auto','stream']){
   const page=await prepare(mode);
   await page.evaluate(async()=>{const p=window.preview;await p.emit('GENERATION_STARTED','normal',{});p.chat.push({name:'Reply fixture',mes:'<think>image###ignore reasoning###'});window.drawGenerationFixture();await p.emit('STREAM_TOKEN_RECEIVED');});
   await page.waitForTimeout(60);assert.equal(await page.evaluate(()=>window.preview.calls.length),0);
   await page.evaluate(async()=>{const p=window.preview;p.chat.at(-1).mes+='</think>image###one###image###partial';window.drawGenerationFixture();await p.emit('STREAM_TOKEN_RECEIVED');await p.emit('STREAM_TOKEN_RECEIVED');});
   if(mode==='stream')await page.waitForFunction(()=>window.preview.calls.length===1);
   else{await page.waitForTimeout(60);assert.equal(await page.evaluate(()=>window.preview.calls.length),0);}
   await page.evaluate(async()=>{const p=window.preview;p.chat.at(-1).mes='image###one###image###two###';window.drawGenerationFixture();await p.emit('STREAM_TOKEN_RECEIVED');await p.emit('STREAM_TOKEN_RECEIVED');});
   if(mode==='stream')await page.waitForFunction(()=>window.preview.calls.length===2);
   else{await page.waitForTimeout(60);assert.equal(await page.evaluate(()=>window.preview.calls.length),0);}
   await page.evaluate(async()=>{const p=window.preview;await p.emit('CHARACTER_MESSAGE_RENDERED',2);await p.emit('GENERATION_ENDED');await p.emit('GENERATION_ENDED');await p.emit('CHARACTER_MESSAGE_RENDERED',2);});
   if(mode==='manual'){
    const first=page.locator('[mesid="2"] .miao-image-card').first();
    await first.getByRole('button',{name:'查看提示词',exact:true}).click();
    const prompt=page.locator('.miao-prompt-view');
    await prompt.getByRole('button',{name:'编辑提示词',exact:true}).click();
    await prompt.getByRole('textbox',{name:'编辑本次 tag 提示词',exact:true}).fill('manual edit fixture');
    await prompt.getByRole('button',{name:'保存提示词',exact:true}).click();
    await prompt.waitFor({state:'detached'});
    assert.match(await page.evaluate(()=>window.preview.chat[2].mes),/image###manual edit fixture###/);
    assert.equal(await page.evaluate(()=>window.preview.calls.length),0,'saving an undrawn tag must not start generation');
    await first.getByRole('button',{name:'生成插图',exact:true}).click();
    await page.waitForFunction(()=>window.preview.calls.length===1);
    assert.match(await page.evaluate(()=>window.preview.calls[0].prompt),/manual edit fixture/);
    await page.locator('[mesid="2"] .miao-image-card').nth(1).getByRole('button',{name:'生成插图',exact:true}).click();
   }
   await page.waitForFunction(()=>Object.keys(window.preview.chat.at(-1).miao_nai_image_swipes?.[0]||{}).length===2);
   assert.equal(await page.evaluate(()=>window.preview.calls.length),2,mode+' must generate each visible tag once');
   assert.ok(await page.evaluate(()=>window.preview.calls.every(call=>!call.prompt.includes('history')&&!call.prompt.includes('ignore reasoning'))));
   await page.close();
  }
  // A new reply at a reused index must not inherit a previous reply's attempted flag.
  const automatic=await prepare('auto');
  for(let attempt=1;attempt<=2;attempt++){
   await automatic.evaluate(async()=>{const p=window.preview;p.chat.splice(1);await p.emit('GENERATION_STARTED','normal',{});p.chat.push({name:'Reply fixture',mes:'image###reused scene###'});window.drawGenerationFixture();await p.emit('CHARACTER_MESSAGE_RENDERED',1);await p.emit('GENERATION_ENDED');});
   await automatic.waitForFunction(count=>window.preview.calls.length===count,attempt);
   await automatic.waitForFunction(()=>!!window.preview.chat.at(-1).miao_nai_image_swipes?.[0]?.['body:0:reused scene']);
  }
  await automatic.close();
  // Deleting a message while its image is in flight cannot retarget that image.
  const manual=await prepare('manual');
  await manual.evaluate(async()=>{const p=window.preview;p.chat[1].mes='image###same scene###';p.holdImage=true;window.drawGenerationFixture();await p.emit('MESSAGE_UPDATED',1);});
  await manual.locator('[mesid="1"] .miao-image-card').getByRole('button',{name:'生成插图',exact:true}).click();await manual.waitForFunction(()=>!!window.preview.releaseImage);
  await manual.evaluate(async()=>{const p=window.preview;p.deletedMessage=p.chat[1];p.chat[1]={name:'History fixture',mes:'image###same scene###'};window.drawGenerationFixture();await p.emit('MESSAGE_UPDATED',1);});
  await manual.locator('[mesid="1"] .miao-image-card').getByRole('button',{name:'生成插图',exact:true}).waitFor();
  await manual.locator('[mesid="1"] .miao-image-card').getByRole('button',{name:'生成插图',exact:true}).click();
  await manual.evaluate(()=>{const p=window.preview;p.holdImage=false;p.releaseImage();});
  await manual.waitForFunction(()=>window.preview.calls.length===2);
  await manual.waitForFunction(()=>!!window.preview.chat[1].miao_nai_image_swipes?.[0]?.['body:0:same scene']);
  assert.equal(await manual.evaluate(()=>window.preview.deletedMessage.miao_nai_image_swipes?.[0]?.['body:0:same scene']?.url),undefined);
  await manual.close();
 }finally{await browser?.close();server.kill();}
});
