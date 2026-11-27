import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {BUNDLED_RESOURCES,WORLD_NAME} from '../src/resources/resources.js';
const require=createRequire(import.meta.url);
async function browserRuntime(){
 try{return require('playwright');}catch{}
 const path=process.env.MIAO_PLAYWRIGHT_MODULE||`${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
 try{return require(path);}catch{throw Error('面板冒烟测试需要现有 Playwright；设置 MIAO_PLAYWRIGHT_MODULE 指向其安装目录');}
}
test('actual extension startup, navigation, resource updates, source rollback and saved settings migration', {timeout:90000},async()=>{
 const {chromium}=await browserRuntime();
 const server=spawn(process.execPath,['tests/preview-server.mjs'],{env:{...process.env,MIAO_PREVIEW_PORT:'0'},stdio:['ignore','pipe','pipe']});
 let browser;
 try{
 const url=await new Promise((resolve,reject)=>{let stderr='';const timer=setTimeout(()=>reject(Error('预览启动超时：'+stderr)),10000);server.stderr.on('data',d=>stderr+=String(d));server.stdout.on('data',d=>{const match=String(d).match(/http:\/\/[^\s]+/);if(match){clearTimeout(timer);resolve(match[0]);}});server.on('exit',()=>{clearTimeout(timer);reject(Error('预览启动失败：'+stderr));});});
 browser=await chromium.launch({channel:process.env.MIAO_BROWSER_CHANNEL||'chrome',headless:true});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.name+': '+e.message));
 await page.addInitScript(()=>window.addEventListener('unhandledrejection',e=>{(window.smokeRejections??=[]).push(String(e.reason));}));
 await page.goto(url+'/?settings-smoke');await page.locator('#miao-nai-menu').waitFor();await page.locator('#miao-nai-menu').click();await page.locator('.miao-settings').waitFor();
 const nav=page.locator('.miao-overview:visible, .miao-tabs:visible');
 for(const label of ['生成','配置','Vibe','资源','图库']){await nav.getByRole('button',{name:label,exact:true}).click();assert.ok(await page.locator('.miao-panel-body').isVisible());}
 await nav.getByRole('button',{name:'生成',exact:true}).click();await page.getByRole('checkbox',{name:'启用收藏提示词',exact:true}).check();await nav.getByRole('button',{name:'收藏',exact:true}).click();
 await nav.getByRole('button',{name:'资源',exact:true}).click();
 const source=page.getByRole('combobox',{name:'来源',exact:true});
 assert.equal(await source.inputValue(),'external');assert.deepEqual(await source.locator('option').evaluateAll(nodes=>nodes.map(node=>node.value)),['external','secondary']);
 assert.deepEqual(await page.locator('.miao-panel-body h3').allTextContents(),['提示词来源','出图规则','捕捉标签','世界书与正则','基础配置','世界书选开']);assert.equal(await page.locator('.miao-prompt-tree').count(),0);
 const previousWorld='[喵喵]文生图 2.2.3',currentWorld=WORLD_NAME;
 await page.evaluate(async previousWorld=>{
  const p=window.preview;
  p.worlds[previousWorld]={entries:{
   1:{uid:1,comment:'tag头',content:'{{setvar::人格::PRESERVED_FIXTURE}}'},
   4:{uid:4,comment:'彩蛋[选开]',content:'old',disable:true,constant:false},
  }};
  p.selectedWorlds.push(previousWorld);
  p.context.chatMetadata={world_info:previousWorld};
  p.context.saveMetadata=async()=>{p.resourceMetadataSaves=(p.resourceMetadataSaves||0)+1;return !p.failResourceMetadataSave;};
  const {updateWorldInfoList}=await import('/scripts/world-info.js');
  await updateWorldInfoList();
 },previousWorld);
 await page.getByRole('button',{name:'检查资源更新',exact:true}).click();
 await page.getByRole('button',{name:'更新资源',exact:true}).click();
 await page.waitForFunction(revision=>window.preview.settings.resourceRevision===revision,BUNDLED_RESOURCES.revision);
 const migrated=await page.evaluate(()=>{
  const p=window.preview,write=p.worldWrites.at(-1),entries=Object.values(write.data.entries);
  return {name:write.name,selection:p.displayedWorldSelection,savedSelection:p.worldInfo.globalSelect,
   chatWorld:p.context.chatMetadata.world_info,header:entries.find(entry=>entry.comment==='tag头').content,
   eggDisabled:entries.find(entry=>entry.comment==='彩蛋[选开]').disable};
 });
 assert.equal(migrated.name,currentWorld);
 assert.deepEqual(migrated.selection,[currentWorld]);
 assert.deepEqual(migrated.savedSelection,[currentWorld]);
 assert.equal(migrated.chatWorld,currentWorld);
 assert.match(migrated.header,/\{\{setvar::人格::PRESERVED_FIXTURE\}\}/);
 assert.equal(migrated.eggDisabled,true);
 const danglingAlias=await page.evaluate(async previousWorld=>{
  const p=window.preview,before=p.resourceMetadataSaves;
  p.settings.worldAliases[previousWorld]='Missing fixture world';
  p.context.chatMetadata.world_info=previousWorld;
  await p.emit('CHAT_CHANGED');
  await new Promise(resolve=>setTimeout(resolve,40));
  return {world:p.context.chatMetadata.world_info,saves:p.resourceMetadataSaves-before};
 },previousWorld);
 assert.deepEqual(danglingAlias,{world:previousWorld,saves:0});
 const indexedImage='/user/images/miao-nai/miao-1792737847716.png';
 await page.evaluate(async({previousWorld,currentWorld,indexedImage})=>{
  const p=window.preview;
  p.settings.worldAliases[previousWorld]=currentWorld;
  p.failResourceMetadataSave=true;
  const {writeSwipeImage}=await import('/scripts/extensions/third-party/test/src/chat/swipe-history.js');
  writeSwipeImage(p.chat[0],0,'resource-fixture',{url:indexedImage,archive:{cardId:'card:resource-fixture.png',cardName:'Resource fixture'}});
  await p.emit('CHAT_CHANGED');
 },{previousWorld,currentWorld,indexedImage});
 await page.waitForFunction(url=>window.preview.settings.imageArchive[url],indexedImage);
 assert.equal(await page.evaluate(()=>window.preview.context.chatMetadata.world_info),previousWorld);
 await page.locator('dialog[open]:not(.miao-settings-dialog) .popup-controls button').click();
 // Capture and world macros should be saved when leaving the main API mode.
 const start=page.getByRole('textbox',{name:'起始标签',exact:true});
 const persona=page.getByRole('textbox',{name:'人格（setvar）',exact:true});
 await persona.fill('{{user}} FIXTURE_PERSONA');
 await start.fill('custom###');
 await page.evaluate(()=>window.preview.failSettingsSave=true);
 await source.selectOption('secondary');
 const errorPopup=page.locator('dialog[open]:not(.miao-settings-dialog)');
 await errorPopup.waitFor();
 assert.equal(await source.inputValue(),'external');
 assert.equal(await page.evaluate(()=>window.preview.settings.startTag),'custom###');
 await page.evaluate(()=>window.preview.failSettingsSave=false);
 await errorPopup.locator('.popup-controls button').click();
 await source.selectOption('secondary');
 await page.getByRole('textbox',{name:'副 API 地址',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.preview.settings.tagSource),'secondary');
 assert.equal(await start.inputValue(),'custom###');
 assert.equal(await page.getByRole('button',{name:'保存酒馆宏',exact:true}).count(),0);
 await source.selectOption('external');
 await persona.waitFor();
 assert.equal(await persona.inputValue(),'{{user}} FIXTURE_PERSONA');
 assert.equal(await start.inputValue(),'custom###');
 assert.equal(await page.evaluate(()=>window.preview.injections),undefined);
 assert.deepEqual(await page.evaluate(()=>window.smokeRejections??[]),[]);
 assert.equal(await page.evaluate(()=>window.preview.calls.length),0);
 for(const [host,variant] of [['','prompt-v1=custom'],['','prompt-v1=external'],['&tt','prompt-v2=partial'],['','prompt-v2=save-fail']]){
  const historical=await browser.newPage({viewport:{width:390,height:820}});
  historical.on('pageerror',error=>errors.push(variant+': '+error.message));
  await historical.goto(url+'/?settings-smoke&'+variant+host);
  await historical.locator('#miao-nai-menu').click();
  await historical.locator('.miao-overview:visible, .miao-tabs:visible').getByRole('button',{name:'资源',exact:true}).click();
  assert.equal(await historical.getByRole('combobox',{name:'来源',exact:true}).inputValue(),'external');
  assert.equal(await historical.locator('.miao-prompt-tree').count(),0);
  assert.equal(await historical.evaluate(()=>window.preview.injections),undefined);
  const config=await historical.evaluate(()=>window.preview.settings.promptConfig);
  assert.equal(config.mode,'external');
  if(variant.startsWith('prompt-v1')){
   if(variant.endsWith('custom'))assert.equal(config.overrides.main,'V1_CUSTOM_WHOLE_BODY {{user}}');
   else assert.equal(config.legacyBackup.config.fixed.人格,'V1_FIXTURE');
  }else{
   assert.deepEqual(config.params,{persona:'V2_FIXTURE',count:'3',eggMarker:'/fixture_marker',target:'User'});
   assert.equal(config.textOverridesById.composition.body,'V2_KEPT_COMPOSITION');
   assert.equal(await historical.getByRole('switch',{name:'启用彩蛋任务',exact:true}).isChecked(),false);
  }
  if(variant.endsWith('save-fail')){
   assert.ok(await historical.evaluate(()=>window.miaoTestToasts.some(n=>n.message.includes('迁移或保存失败'))));
   await historical.evaluate(()=>window.preview.failSettingsSave=false);
  }
  const count=historical.getByRole('textbox',{name:'正文图张数',exact:true});
  await count.fill('4~6');await count.blur();
  await historical.waitForFunction(()=>{const config=JSON.parse(sessionStorage.getItem('miao-preview-prompt-state'));return (config?.params?.count??config?.fixed?.张数)==='4~6';});
  await historical.reload();
  await historical.locator('#miao-nai-menu').click();
  await historical.locator('.miao-overview:visible, .miao-tabs:visible').getByRole('button',{name:'资源',exact:true}).click();
  assert.equal(await count.inputValue(),'4~6');
  assert.equal(await historical.evaluate(()=>window.preview.injections),undefined);
  assert.equal(await historical.evaluate(()=>window.preview.calls.length),0);
  await historical.close();
 }

 assert.deepEqual(errors,[]);
 }finally{await browser?.close();server.kill();}
});

test('external preset output generates from its chat cards through a custom NovelAI endpoint', {timeout:40000}, async()=>{
 const {chromium}=await browserRuntime();
 const server=spawn(process.execPath,['tests/preview-server.mjs'],{env:{...process.env,MIAO_PREVIEW_PORT:'0'},stdio:['ignore','pipe','pipe']});
 let browser;
 try{
  const url=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('预览启动超时')),10000);
   server.stdout.on('data',data=>{const match=String(data).match(/http:\/\/[^\s]+/);if(match){clearTimeout(timer);resolve(match[0]);}});
   server.on('exit',()=>{clearTimeout(timer);reject(Error('预览启动失败'));});
  });
  browser=await chromium.launch({channel:process.env.MIAO_BROWSER_CHANNEL||'chrome',headless:true});
  const endpoint='https://image-fixture.invalid/custom/generate';
  for(const tt of ['', '&tt']){
   const page=await browser.newPage(),sent=[],errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.route(endpoint,async route=>{
    if(route.request().method()==='POST')sent.push(route.request().postDataJSON());
    await route.fulfill({status:200,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'authorization, content-type','content-type':'image/png'},body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=','base64')});
   });
   await page.goto(url+'/?settings-smoke'+tt);
   await page.locator('#miao-nai-menu').click();
   await page.locator('.miao-overview:visible, .miao-tabs:visible').getByRole('button',{name:'资源',exact:true}).click();
   assert.equal(await page.getByRole('combobox',{name:'来源',exact:true}).inputValue(),'external');
   await page.locator('.miao-overview:visible, .miao-tabs:visible').getByRole('button',{name:'生成',exact:true}).click();
   await page.getByRole('combobox',{name:'连接方式',exact:true}).selectOption('custom');
   await page.getByRole('textbox',{name:'自定义 API 地址',exact:true}).fill(endpoint);
   await page.getByRole('combobox',{name:'生图 URL 处理',exact:true}).selectOption('exact');
   await page.getByRole('combobox',{name:'Vibe 在线编码地址',exact:true}).selectOption('disabled');
   await page.locator('input[type=password]').fill('fixture-key-not-real');
   await page.getByRole('button',{name:'保存自定义连接',exact:true}).click();
   await page.waitForFunction(()=>!!window.preview.settings.customKeyHash);
   await page.getByRole('button',{name:'关闭设置',exact:true}).click();

   await page.evaluate(async()=>{
    const p=window.preview;
    Object.assign(p.settings,{mode:'manual',cloudQueue:false,eggProfileEnabled:false});
    const mes='<thinking>image###planning sample###</thinking><images><image>regex:fixture quote\n<font>Fixture title</font><Tag_think>image###draft sample###</Tag_think>image###Scene Composition: quiet park; Character 1 Prompt: red coat |centers:B4; Character 1 UC: scarf;###</image></images>';
    p.chat.splice(0,p.chat.length,{name:'External preset fixture',mes});
    document.getElementById('chat').innerHTML='<div class="mes" mesid="0"><div class="mes_text">'+mes+'</div></div>';
    await p.emit('CHAT_CHANGED');
   });
   const card=page.locator('#chat .miao-image-card');
   await card.getByRole('button',{name:'生成插图',exact:true}).click();
   await card.locator(':scope>img').waitFor();
   assert.equal(await card.count(),1);
   assert.equal(sent.length,1);
   assert.match(sent[0].input,/quiet park/);
   assert.doesNotMatch(sent[0].input,/regex:|Character|draft sample|red coat/);
   assert.deepEqual(sent[0].parameters.v4_prompt.caption.char_captions,[{char_caption:'red coat',centers:[{x:0.3,y:0.7}]}]);
   assert.deepEqual(sent[0].parameters.v4_negative_prompt.caption.char_captions,[{char_caption:'scarf',centers:[{x:0.3,y:0.7}]}]);

   // An explicitly marked bonus can be followed by an ordinary picture.
   await page.evaluate(async()=>{
    const p=window.preview,main=p.settings.profiles[p.settings.active];
    p.settings.profiles.push({...main,id:'fixture-egg',model:'nai-diffusion-3'});
    Object.assign(p.settings,{eggProfileEnabled:true,eggProfileId:'fixture-egg'});
    const mes='image###opening scene###\n<meowfm>bonus context</meowfm>\nimage###bonus scene###\nimage###final scene###';
    p.chat.splice(0,p.chat.length,{name:'External preset fixture',mes});
    document.getElementById('chat').innerHTML='<div class="mes" mesid="0"><div class="mes_text">'+mes+'</div></div>';
    await p.emit('CHAT_CHANGED');
   });
   for(const index of [1,2]){
    await card.nth(index).getByRole('button',{name:'生成插图',exact:true}).click();
    await card.nth(index).locator(':scope>img').waitFor();
   }
   assert.equal(sent.length,3);
   assert.match(sent[1].input,/bonus scene/);
   assert.equal(sent[1].model,'nai-diffusion-3');
   assert.match(sent[2].input,/final scene/);
   assert.equal(sent[2].model,sent[0].model);
   assert.equal(await page.evaluate(()=>window.preview.calls.length),0,'host NovelAI endpoint must not be called');
   assert.deepEqual(errors,[]);
   await page.close();
  }
 }finally{await browser?.close();server.kill();}
});
