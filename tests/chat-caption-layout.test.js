import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {readFile,mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);

test('plain chat captions keep images close, render decorated titles and wrap without exposing markup',{timeout:60000},async()=>{
 const {chromium}=require(process.env.MIAO_PLAYWRIGHT_MODULE||`${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`);
 const rules=JSON.parse(await readFile(new URL('../assets/regex.json',import.meta.url),'utf8')),rule=rules[2];
 assert.equal(rule.replaceString.includes('\n'),false,'HTML formatting must not add message line breaks');
 const server=spawn(process.execPath,['tests/preview-server.mjs'],{env:{...process.env,MIAO_PREVIEW_PORT:'0'},stdio:['ignore','pipe','pipe']});let browser;
 try{
  const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('预览启动超时')),10000);server.stdout.on('data',data=>{const match=String(data).match(/http:\/\/[^\s]+/);if(match){clearTimeout(timer);resolve(match[0]);}});server.on('exit',()=>{clearTimeout(timer);reject(Error('预览启动失败'));});});
  browser=await chromium.launch({channel:process.env.MIAO_BROWSER_CHANNEL||'chrome',headless:true});
  for(const tt of [false,true]){
   const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto(url+'/?settings-smoke'+(tt?'&tt':''));await page.locator('#miao-nai-menu').waitFor();
   for(const width of [320,375,430,1024])for(const variant of ['short','decorated','long']){
    await page.setViewportSize({width,height:800});
    const title=variant==='long'?'很长的手机插图标题'.repeat(12):variant==='decorated'?'✦✧✦·测试插图标题·(๑´ڡ๑)·✦✧✦':'手机插图标题';
    await page.evaluate(async({rule,title})=>{
     const p=window.preview,source=`正文开头。\n\n┈┈${title}┈┈\n\n\nimage###scene###\n\n正文结尾。`,pattern=new RegExp(rule.findRegex.slice(1,rule.findRegex.lastIndexOf('/')),'gi');
     p.chat.splice(0,p.chat.length,{name:'Layout fixture',mes:source,miao_nai_image_swipes:{0:{'body:0:scene':{url:'/fixture-image/portrait.svg',request:{width:832,height:1216}}}}});
     const converter=new showdown.Converter({simpleLineBreaks:true});
     document.getElementById('chat').innerHTML='<div class="mes" mesid="0"><div class="mes_text">'+converter.makeHtml(source.replace(pattern,rule.replaceString))+'</div></div>';
     document.getElementById('report').hidden=true;
     await p.emit('MESSAGE_UPDATED',0);
    },{rule,title});
    const image=page.locator('.miao-image-card>img');await image.waitFor();await image.evaluate(img=>img.decode());
    const metrics=await page.evaluate(()=>{
     const caption=document.querySelector('.miao-image-caption'),image=document.querySelector('.miao-image-card>img'),root=document.querySelector('.mes_text');
     return {gap:image.getBoundingClientRect().top-caption.getBoundingClientRect().bottom,captionHeight:caption.getBoundingClientRect().height,overflow:root.scrollWidth-root.clientWidth,text:root.textContent,source:window.preview.chat[0].mes,whiteSpace:getComputedStyle(caption).whiteSpace,fontSize:parseFloat(getComputedStyle(caption).fontSize),rootFontSize:parseFloat(getComputedStyle(root).fontSize),captionText:caption.textContent,children:caption.children.length};
    });
    assert.ok(metrics.gap>=0&&metrics.gap<=12,JSON.stringify({width,variant,tt,...metrics}));
    assert.equal(metrics.whiteSpace,'normal');assert.ok(metrics.overflow<=1);assert.ok(metrics.fontSize<metrics.rootFontSize);assert.equal(metrics.captionText,title);assert.equal(metrics.children,0);assert.equal(await page.locator('.miao-image-caption details,.miao-image-caption summary').count(),0);assert.equal(metrics.text.includes('</span>'),false);assert.ok(metrics.text.includes('正文结尾。'));assert.ok(metrics.source.includes('image###scene###'));
    if(variant==='long'&&width<500)assert.ok(metrics.captionHeight>24,'long captions must wrap rather than truncate');
    if(tt&&width===375&&variant==='decorated'){await mkdir('docs/local',{recursive:true});await page.screenshot({path:'docs/local/caption-plain-mobile.png'});}
   }
   assert.equal(await page.evaluate(()=>window.preview.calls.length),0);assert.deepEqual(errors,[]);await page.close();
  }
 }finally{await browser?.close();server.kill();}
});
