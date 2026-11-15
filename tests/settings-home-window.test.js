import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);

test('settings home and dragging preserve drafts and leave the chat interactive on ST and TT',{timeout:90000},async()=>{
 const {chromium}=require(process.env.MIAO_PLAYWRIGHT_MODULE||`${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`);
 const server=spawn(process.execPath,['tests/preview-server.mjs'],{env:{...process.env,MIAO_PREVIEW_PORT:'0'},stdio:['ignore','pipe','pipe']});let browser;
 try{
  const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('预览启动超时')),10000);server.stdout.on('data',data=>{const match=String(data).match(/http:\/\/[^\s]+/);if(match){clearTimeout(timer);resolve(match[0]);}});server.on('exit',()=>{clearTimeout(timer);reject(Error('预览启动失败'));});});
  browser=await chromium.launch({channel:process.env.MIAO_BROWSER_CHANNEL||'chrome',headless:true});
  for(const tt of [false,true]){
   const page=await browser.newPage({viewport:{width:1280,height:900},hasTouch:tt}),errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto(url+'/?settings-smoke&manual-delete'+(tt?'&tt':''));await page.locator('#miao-nai-menu').waitFor();
   await page.evaluate(()=>{window.preview.settings.promptFavoritesEnabled=true;const probe=document.createElement('button');probe.id='chat-probe';probe.textContent='聊天测试';probe.style='position:fixed;left:8px;bottom:8px;z-index:1';probe.onclick=()=>window.chatProbeClicked=true;document.body.append(probe);});
   await page.locator('#miao-nai-menu').click();await page.locator('.miao-settings[data-section=overview]').waitFor();
   assert.equal(await page.locator('.miao-settings-window').getAttribute('aria-modal'),'false');
   assert.equal(await page.locator('.miao-overview-row').count(),6);assert.equal(await page.locator('.miao-home-summary,.miao-home-tip').count(),0);assert.equal(await page.locator('.miao-window-grip').count(),1);assert.equal(await page.locator('.miao-window-toggle,.miao-window-logo').count(),0);
   const handle=page.locator('.miao-window-handle'),rect=await handle.boundingBox();
   await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();await page.mouse.move(18,22,{steps:8});await page.mouse.up();
   assert.ok(await page.evaluate(()=>Number.isFinite(window.preview.settings.windowPosition?.x)));
   await handle.focus();await page.keyboard.press('Home');
   const shell=page.locator('.miao-settings-window');assert.ok((await shell.boundingBox()).x<=9);
   await page.locator('.miao-overview').getByRole('button',{name:'生成',exact:true}).click();
   const key=page.locator('.miao-settings input[type=password]');await key.fill('fixture-unsaved-key');
   await page.locator('#chat-probe').click();assert.equal(await page.evaluate(()=>window.chatProbeClicked),true);
   await handle.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowDown');assert.equal(await key.inputValue(),'fixture-unsaved-key');
   assert.equal(await page.locator('.miao-settings').getAttribute('data-section'),'generation');
   assert.equal(await page.evaluate(()=>window.preview.secretWrites||0),0,'moving the window must not submit an unsaved key');
   await key.fill('');
   for(const section of ['配置','Vibe','资源','图库','收藏','生成']){
    await page.locator('.miao-tabs').getByRole('button',{name:section,exact:true}).click();
    const metrics=await page.locator('.miao-panel-body').evaluate(element=>({height:element.clientHeight,overflow:element.scrollWidth-element.clientWidth}));assert.ok(metrics.height>100);assert.ok(metrics.overflow<=1);
   }
   for(const width of [320,375,430,1280]){
    await page.setViewportSize({width,height:780});if(tt)await page.getByRole('button',{name:'返回主页',exact:true}).tap();else await page.getByRole('button',{name:'返回主页',exact:true}).click();
    await page.waitForFunction(()=>{const r=document.querySelector('.miao-settings-window').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1;});
    assert.ok(await page.locator('.miao-panel-body').evaluate(element=>element.scrollWidth<=element.clientWidth+1));
    assert.ok(await page.locator('.miao-overview-copy strong').evaluateAll(elements=>elements.every(element=>element.getBoundingClientRect().height<28&&element.scrollWidth<=element.clientWidth+1)),'home entry labels must not become vertical');
    const viewport=await shell.boundingBox();assert.ok(viewport.y>=0&&viewport.y+viewport.height<=781);
    if(tt&&width===375){await mkdir('docs/local',{recursive:true});await page.screenshot({path:'docs/local/settings-home-mobile.png'});}
   }
   await page.locator('.miao-overview').getByRole('button',{name:'图库',exact:true}).click();await page.locator('.miao-history-tile a').first().click();
   await page.locator('.miao-image-viewer').waitFor();assert.equal(await page.locator('.miao-settings-window').count(),1);
   await page.locator('.miao-image-viewer>img').click();await page.getByRole('button',{name:'关闭预览',exact:true}).click();
   await page.locator('.miao-settings[data-section=images]').waitFor();
   await page.getByRole('button',{name:'关闭设置',exact:true}).click();await shell.waitFor({state:'detached'});
   const remembered=await page.evaluate(()=>structuredClone(window.preview.settings.windowPosition));await page.locator('#miao-nai-menu').click();await shell.waitFor();
   assert.deepEqual(await page.evaluate(()=>window.preview.settings.windowPosition),remembered);assert.equal(await shell.getAttribute('data-collapsed'),null);
   await page.getByRole('button',{name:'关闭设置',exact:true}).click();await shell.waitFor({state:'detached'});
   assert.equal(await page.locator('[inert]').count(),0);assert.equal(await page.evaluate(()=>window.preview.calls.length),0);assert.deepEqual(errors,[]);await page.close();
  }
 }finally{await browser?.close();server.kill();}
});
