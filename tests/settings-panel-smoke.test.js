import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);
async function browserRuntime(){
 try{return require('playwright');}catch{}
 const path=process.env.MIAO_PLAYWRIGHT_MODULE||`${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
 try{return require(path);}catch{throw Error('面板冒烟测试需要现有 Playwright；设置 MIAO_PLAYWRIGHT_MODULE 指向其安装目录');}
}
test('actual extension startup, fixed prompt tree, drafts, rollback, modes and narrow editor', {timeout:90000},async()=>{
 const {chromium}=await browserRuntime();
 const server=spawn(process.execPath,['tests/preview-server.mjs'],{env:{...process.env,MIAO_PREVIEW_PORT:'0'},stdio:['ignore','pipe','pipe']});
 let browser;
 try{
 const url=await new Promise((resolve,reject)=>{let stderr='';const timer=setTimeout(()=>reject(Error('预览启动超时：'+stderr)),10000);server.stderr.on('data',d=>stderr+=String(d));server.stdout.on('data',d=>{const match=String(d).match(/http:\/\/[^\s]+/);if(match){clearTimeout(timer);resolve(match[0]);}});server.on('exit',()=>{clearTimeout(timer);reject(Error('预览启动失败：'+stderr));});});
 browser=await chromium.launch({channel:process.env.MIAO_BROWSER_CHANNEL||'chrome',headless:true});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.name+': '+e.message));
 await page.addInitScript(()=>window.addEventListener('unhandledrejection',e=>{(window.smokeRejections??=[]).push(String(e.reason));}));
 await page.goto(url+'/?settings-smoke');await page.locator('#miao-nai-menu').waitFor();await page.locator('#miao-nai-menu').click();await page.locator('.miao-settings').waitFor();
 const nav=page.locator('.miao-tabs');
 for(const label of ['生成','配置','Vibe','生图指令','图库']){await nav.getByRole('button',{name:label,exact:true}).click();assert.ok(await page.locator('.miao-panel-body').isVisible());}
 await nav.getByRole('button',{name:'生成',exact:true}).click();await page.getByRole('checkbox',{name:'启用收藏提示词',exact:true}).check();await nav.getByRole('button',{name:'收藏',exact:true}).click();
 await nav.getByRole('button',{name:'生图指令',exact:true}).click();
 const source=page.getByRole('combobox',{name:'来源',exact:true}),injection=()=>page.evaluate(()=>window.preview.injections.miao_nai_image_instruction.text);
 await source.selectOption('external');await page.waitForFunction(()=>window.preview.injections?.miao_nai_image_instruction?.text==='');await page.locator('.miao-prompt-tree').waitFor({state:'detached'});
 assert.deepEqual(await page.locator('.miao-panel-body h3').allTextContents(),['提示词来源','出图规则','捕捉标签','世界书与正则']);assert.equal(await page.locator('.miao-prompt-tree').count(),0);
 const previousWorld='[喵喵]文生图 2.2.2',currentWorld='[喵喵]文生图 2.2.3';
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
 await page.waitForFunction(()=>window.preview.settings.resourceRevision===2026110703);
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
 // Switching source must commit the pending capture fields, including on failure.
 await page.getByRole('textbox',{name:'起始标签',exact:true}).fill('custom###');
 await source.selectOption('builtin');await page.waitForFunction(()=>window.preview.settings.promptConfig.mode==='builtin');await page.locator('.miao-prompt-tree').waitFor();
 assert.equal(await page.evaluate(()=>window.preview.settings.startTag),'custom###');assert.match(await injection(),/custom###\s*\[图片tag\]\s*###/);
 assert.match(await injection(),/严禁新建、补写或重复任何彩蛋标记/);
 await page.getByRole('textbox',{name:'起始标签',exact:true}).fill('image###');
 assert.deepEqual(await page.locator('.miao-prompt-tree > .miao-tree-node').evaluateAll(nodes=>nodes.map(n=>n.dataset.displayId)),['00','01','02','03','04','05']);
 const branch=id=>page.locator(`[data-node-id="${id}"]`),button=(name)=>page.getByRole('button',{name,exact:true});
 const before=await injection(),saves=await page.evaluate(()=>window.preview.settingsSaves);
 for(const name of ['任务与参数','Tag 结构与补充规则','NSFW 扩展','自检','输出要求'])await button('展开'+name).click();
 await button('展开彩蛋任务').click();
 assert.ok(await branch('egg').locator(':scope > .miao-tree-children > [data-node-id="egg.description"]').isVisible());
 assert.equal(await branch('selfcheck').locator(':scope > .miao-tree-children > [data-node-id="selfcheck.egg"]').count(),1);
 assert.equal(await branch('selfcheck.item10').locator('[data-node-id="selfcheck.egg"]').count(),0);
 await button('收起Tag 结构与补充规则').click();await button('展开Tag 结构与补充规则').click();assert.ok(await branch('egg.description').isVisible());
 assert.equal(await injection(),before);assert.equal(await page.evaluate(()=>window.preview.settingsSaves),saves);
 assert.equal(await page.getByText('最终 D0 提示词预览',{exact:true}).count(),0);
 assert.equal(await page.locator('.miao-prompt-tree [draggable="true"],.miao-prompt-tree [contenteditable]').count(),0);
 assert.equal(await page.locator('.miao-prompt-tree').getByRole('button',{name:/新增|删除|拖拽|改名|排序/}).count(),0);
 for(const name of ['任务与参数','重要步骤与绘图数量','同人角色','画面组成','通用 Tag 规范及补充','彩蛋任务','彩蛋解析','自检','彩蛋额外检查','小标题','图片标签结构']){
  await button('编辑'+name).click();const dlg=page.getByRole('dialog',{name:'编辑 · '+name,exact:true});assert.equal(await dlg.locator('textarea').count(),['自检','彩蛋任务'].includes(name)?2:1);await dlg.getByRole('button',{name:'取消',exact:true}).click();await dlg.waitFor({state:'detached'});
 }
 // Ordinary parameters are emitted once, with no internal setvar assignments.
 const fixed=page.getByRole('textbox',{name:'人格',exact:true});await fixed.fill('FIXTURE_PERSONA');await fixed.press('Tab');await page.waitForFunction(()=>window.preview.injections.miao_nai_image_instruction.text.includes('绘图执行者：FIXTURE_PERSONA'));
 assert.ok(!(await injection()).includes('{{setvar'));
 await button('编辑画面组成').click();
 const editor=page.getByRole('dialog',{name:'编辑 · 画面组成',exact:true}),text=editor.getByRole('textbox',{name:'正文',exact:true}),base=await text.inputValue();
 await text.fill(base+'\nSMOKE_CUSTOM');await editor.getByRole('button',{name:'保存',exact:true}).click();await editor.waitFor({state:'detached'});assert.ok((await injection()).includes('SMOKE_CUSTOM'));
 await button('编辑画面组成').click();await text.fill('discard draft');page.once('dialog',d=>d.accept());await editor.getByRole('button',{name:'取消',exact:true}).click();await editor.waitFor({state:'detached'});assert.ok((await injection()).includes('SMOKE_CUSTOM'));
 await button('编辑画面组成').click();await editor.getByRole('button',{name:'恢复默认',exact:true}).click();assert.equal(await text.inputValue(),base);await editor.getByRole('button',{name:'保存',exact:true}).click();await editor.waitFor({state:'detached'});assert.equal(await page.evaluate(()=>window.preview.settings.promptConfig.textOverridesById.composition),undefined);
 await button('编辑画面组成').click();await text.fill(base+'\nRETRY_DRAFT');await page.evaluate(()=>window.preview.failSettingsSave=true);const oldInjection=await injection();await editor.getByRole('button',{name:'保存',exact:true}).click();await editor.getByText('保存失败，请重试',{exact:true}).waitFor();assert.ok((await text.inputValue()).endsWith('RETRY_DRAFT'));assert.equal(await injection(),oldInjection);await page.evaluate(()=>window.preview.failSettingsSave=false);await editor.getByRole('button',{name:'保存',exact:true}).click();await editor.waitFor({state:'detached'});
 const sw=name=>page.getByRole('switch',{name:'启用'+name,exact:true});
 await sw('彩蛋解析').uncheck();assert.ok(!(await injection()).includes('<easter_egg>'));await sw('彩蛋任务').uncheck();assert.ok(!(await injection()).includes('是否记得在彩蛋标记之后输出彩蛋'));await sw('彩蛋任务').check();assert.equal(await sw('彩蛋解析').isChecked(),false);await sw('彩蛋解析').check();
 await sw('自检').uncheck();assert.ok(!(await injection()).includes('## 自检'));assert.ok(!(await injection()).includes('如启用自检：'));await sw('自检').check();
 await sw('NSFW 环节检查').uncheck();await sw('NSFW 扩展').check();assert.equal(await sw('NSFW 环节检查').isChecked(),false);assert.ok((await injection()).includes('15.NSFW:'));
 await button('展开性向补充').click();await page.getByRole('combobox',{name:'发送的性向',exact:true}).selectOption('BL');assert.ok((await injection()).includes('[bl]'));assert.ok(!(await injection()).includes('[bg]'));
 // Editing an unselected candidate must not select it.
 await button('编辑BG').click();const bg=page.getByRole('dialog',{name:'编辑 · BG',exact:true});await bg.getByRole('textbox').fill('UNSELECTED_BG');await bg.getByRole('button',{name:'保存',exact:true}).click();await bg.waitFor({state:'detached'});assert.ok(!(await injection()).includes('UNSELECTED_BG'));
 await sw('NSFW 扩展').uncheck();assert.equal(await page.getByRole('combobox',{name:'发送的性向',exact:true}).inputValue(),'BL');assert.ok(!(await injection()).includes('[bl]'));
 await sw('小标题').focus();await page.keyboard.press('Space');await sw('小标题').click({trial:true});assert.equal(await sw('小标题').isChecked(),true);assert.ok((await injection()).includes('胡里花哨'));
 const drawingCount=page.getByRole('textbox',{name:'出图张数',exact:true});
 await drawingCount.fill('4~6');await drawingCount.blur();
 await page.waitForFunction(()=>window.preview.runtimeMacros?.miao_image_count()==='4~6');
 assert.ok((await injection()).includes('全部配图共 4~6 张'));
 // Source save failure keeps the old UI and D0.
 await page.evaluate(()=>window.preview.failSettingsSave=true);await source.selectOption('external');await page.waitForFunction(()=>document.querySelectorAll('dialog[open]').length>1);assert.equal(await source.inputValue(),'builtin');assert.ok(await page.locator('.miao-prompt-tree').isVisible());await page.evaluate(()=>window.preview.failSettingsSave=false);await page.locator('dialog[open]:not(.miao-settings-dialog) .popup-controls button').click();
 await source.selectOption('external');await page.waitForFunction(()=>window.preview.injections.miao_nai_image_instruction.text==='');await page.locator('.miao-prompt-tree').waitFor({state:'detached'});assert.deepEqual(await page.locator('.miao-panel-body h3').allTextContents(),['提示词来源','出图规则','捕捉标签','世界书与正则']);
 assert.equal(await drawingCount.inputValue(),'4~6');
 assert.match(await page.evaluate(()=>window.preview.runtimeMacros.miao_drawing_policy()),/4~6 张[\s\S]*┈┈/);
 await page.getByRole('textbox',{name:'结束标签',exact:true}).fill('END');await button('保存').click();await page.waitForFunction(()=>window.preview.settings.endTag==='END');
 await button('关闭设置').click();await page.locator('#miao-nai-menu').click();await page.locator('.miao-settings').waitFor();await nav.getByRole('button',{name:'生图指令',exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'结束标签',exact:true}).inputValue(),'END');assert.equal(await page.locator('.miao-prompt-tree').count(),0);
 await source.selectOption('builtin');await page.locator('.miao-prompt-tree').waitFor();await button('编辑画面组成').click();assert.ok((await text.inputValue()).endsWith('RETRY_DRAFT'));
 await mkdir('docs/local',{recursive:true});await page.screenshot({path:'docs/local/settings-editor-desktop.png'});
 for(const size of [{width:390,height:844},{width:390,height:430}]){
  await page.setViewportSize(size);await page.waitForFunction(({width,height})=>{const b=[...document.querySelectorAll('.miao-prompt-editor button')].find(n=>n.textContent==='保存')?.getBoundingClientRect(),card=document.querySelector('.miao-prompt-editor-card')?.getBoundingClientRect();return b&&b.bottom<=height&&card&&card.width<=width;},size);assert.ok(await editor.isVisible());const box=await editor.boundingBox();assert.ok(box.width<=size.width);const cancel=await editor.getByRole('button',{name:'取消',exact:true}).boundingBox();assert.ok(cancel.y+cancel.height<=size.height);
 }
 await page.screenshot({path:'docs/local/settings-editor-mobile.png'});await editor.getByRole('button',{name:'取消',exact:true}).click();
 assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.smokeRejections||[]),[]);assert.equal(await page.evaluate(()=>window.preview.calls.length),0,'No generation API calls');
 // Real entry initialization with synthetic historical settings, including failed persistence.
 for(const variant of ['normal','external','custom','save-fail']){
  const historical=await browser.newPage();historical.on('pageerror',e=>errors.push(variant+': '+e.message));
  await historical.goto(url+'/?settings-smoke&prompt-v1='+variant);await historical.locator('#miao-nai-menu').waitFor();
  await historical.waitForFunction(()=>window.preview.injections?.miao_nai_image_instruction!==undefined);
  if(variant==='save-fail')await historical.waitForFunction(()=>window.miaoTestToasts.some(n=>n.message.includes('迁移或保存失败')));
  else if(variant!=='custom')await historical.waitForFunction(()=>window.preview.settings.promptConfig.version===2);
  await historical.locator('#miao-nai-menu').click();await historical.locator('.miao-settings').waitFor();await historical.locator('.miao-tabs').getByRole('button',{name:'生图指令',exact:true}).click();
  if(variant==='external'){
   assert.equal(await historical.locator('.miao-prompt-tree').count(),0);assert.equal(await historical.evaluate(()=>window.preview.injections.miao_nai_image_instruction.text),'');
  }else if(variant==='custom'||variant==='save-fail'){
   assert.equal(await historical.evaluate(()=>window.preview.settings.promptConfig.version),1);
   if(variant==='custom')assert.ok(await historical.evaluate(()=>window.preview.injections.miao_nai_image_instruction.text.includes('V1_CUSTOM_WHOLE_BODY')));
   else assert.ok(await historical.evaluate(()=>window.preview.injections.miao_nai_image_instruction.text.includes('<imageTag>')));
   await historical.evaluate(()=>window.preview.failSettingsSave=true);
   await historical.getByRole('button',{name:'使用新树结构（保留旧版备份）',exact:true}).click();await historical.waitForFunction(()=>document.querySelectorAll('dialog[open]').length>1);
   assert.equal(await historical.evaluate(()=>window.preview.settings.promptConfig.version),1);await historical.evaluate(()=>window.preview.failSettingsSave=false);await historical.locator('dialog[open]:not(.miao-settings-dialog) .popup-controls button').click();
   await historical.getByRole('button',{name:'使用新树结构（保留旧版备份）',exact:true}).click();await historical.getByText('提示词条目',{exact:true}).waitFor();
   assert.deepEqual(await historical.evaluate(()=>window.preview.settings.promptConfig.legacyBackup.config),await historical.evaluate(()=>window.preview.originalPromptConfig));
  }else{
   assert.equal(await historical.getByRole('textbox',{name:'人格',exact:true}).inputValue(),'V1_FIXTURE');assert.equal(await historical.evaluate(()=>window.preview.settings.promptConfig.enabledById['output.subtitle']),true);
  }
  // Persist a tree edit, then reload the actual entry; migration must be idempotent.
  if(variant!=='external'){
   await historical.getByRole('button',{name:'编辑画面组成',exact:true}).click();const dlg=historical.getByRole('dialog',{name:'编辑 · 画面组成',exact:true});await dlg.getByRole('textbox',{name:'正文',exact:true}).fill('PERSISTED_TREE_FIXTURE');await dlg.getByRole('button',{name:'保存',exact:true}).click();await dlg.waitFor({state:'detached'});
   const saved=await historical.evaluate(()=>structuredClone(window.preview.settings.promptConfig));
   await historical.reload();await historical.waitForFunction(()=>window.preview.injections?.miao_nai_image_instruction?.text.includes('PERSISTED_TREE_FIXTURE'));
   assert.deepEqual(await historical.evaluate(()=>window.preview.settings.promptConfig),saved);
  }
  assert.equal(await historical.evaluate(()=>window.preview.calls.length),0);await historical.close();
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
   await page.locator('.miao-tabs').getByRole('button',{name:'生图指令',exact:true}).click();
   await page.getByRole('combobox',{name:'来源',exact:true}).selectOption('external');
   await page.waitForFunction(()=>window.preview.injections?.miao_nai_image_instruction?.text==='');
   await page.locator('.miao-tabs').getByRole('button',{name:'生成',exact:true}).click();
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
   assert.equal(await page.evaluate(()=>window.preview.calls.length),0,'host NovelAI endpoint must not be called');
   assert.deepEqual(errors,[]);
   await page.close();
  }
 }finally{await browser?.close();server.kill();}
});
