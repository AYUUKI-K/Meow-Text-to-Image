import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
const require=createRequire(import.meta.url);

test('chat images show tools first, enlarge on a later single click, and preserve reroll gestures on ST and TT',{timeout:60000},async()=>{
 const {chromium}=require(process.env.MIAO_PLAYWRIGHT_MODULE||`${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`);
 const server=spawn(process.execPath,['tests/preview-server.mjs'],{env:{...process.env,MIAO_PREVIEW_PORT:'0'},stdio:['ignore','pipe','pipe']});let browser;
 try{
  const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('预览启动超时')),10000);server.stdout.on('data',data=>{const match=String(data).match(/http:\/\/[^\s]+/);if(match){clearTimeout(timer);resolve(match[0]);}});server.on('exit',()=>{clearTimeout(timer);reject(Error('预览启动失败'));});});
  browser=await chromium.launch({channel:process.env.MIAO_BROWSER_CHANNEL||'chrome',headless:true});
  for(const tt of [false,true]){
   const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});page.setDefaultTimeout(6000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto(url+'/?settings-smoke&manual-delete'+(tt?'&tt':''));await page.locator('#miao-nai-menu').waitFor();
   if(tt){
    await page.locator('#miao-nai-menu').tap();await page.locator('.miao-overview').getByRole('button',{name:'生成',exact:true}).tap();
    await page.locator('.miao-settings input[type=password]').fill('fixture-image-gesture-key-not-real');await page.getByRole('button',{name:'保存密钥',exact:true}).tap();
    await page.waitForFunction(()=>!!window.preview.settings.keyHash);await page.getByRole('button',{name:'关闭设置',exact:true}).tap();
   }
   const image=page.locator('.miao-image-card>img'),tools=page.locator('.miao-image-tools'),viewer=page.locator('.miao-image-viewer');
   await image.tap();await tools.waitFor({state:'visible'});assert.equal(await viewer.count(),0,'first tap must only reveal tools');
   await image.tap();await viewer.waitFor();assert.equal(await page.evaluate(()=>window.preview.calls.length),0,'enlarging must not generate');
   await viewer.locator(':scope>img').tap();await page.getByRole('button',{name:'关闭预览',exact:true}).tap();await viewer.waitFor({state:'detached'});
   // Closing the viewer is an outside click: the next tap must show tools again.
   await image.tap();await tools.waitFor({state:'visible'});assert.equal(await viewer.count(),0);
   await image.press('Enter');await viewer.waitFor();await viewer.locator(':scope>img').tap();await page.getByRole('button',{name:'关闭预览',exact:true}).tap();await viewer.waitFor({state:'detached'});
   // An outside click must cancel a pending single-click action as well.
   await image.tap();await page.locator('#report').tap();await page.waitForTimeout(450);assert.equal(await tools.isVisible(),false);assert.equal(await viewer.count(),0);
   for(const clicks of [2,3]){
    await page.evaluate(async clicks=>{Object.assign(window.preview.settings,{rerollClicks:clicks,cloudQueue:false,eggProfileEnabled:false});await window.preview.emit('MESSAGE_UPDATED',0);},clicks);
    await page.waitForFunction(clicks=>document.querySelector('.miao-image-card>img')?.getAttribute('aria-label').includes((clicks===3?'三':'双')+'击'),clicks);
    const before=await page.evaluate(()=>window.preview.calls.length);
    // Exercise reroll while tools are already shown; it must not open a viewer.
    await image.tap();await tools.waitFor({state:'visible'});await image.click({clickCount:clicks,delay:50});
    await page.waitForFunction(count=>window.preview.calls.length===count,before+1);await page.waitForTimeout(1100);
    assert.equal(await page.evaluate(()=>window.preview.calls.length),before+1);assert.equal(await viewer.count(),0,'rapid multi-clicks must reroll rather than enlarge');
    await page.locator('#report').tap();
   }
   assert.deepEqual(errors,[]);await page.close();
  }
 }finally{await browser?.close();server.kill();}
});
