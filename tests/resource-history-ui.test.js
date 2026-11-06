import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);

test('resource upgrade preserves persona/options; TT retention protects examples and errors remain horizontal',{timeout:90000},async()=>{
 const {chromium}=require(process.env.MIAO_PLAYWRIGHT_MODULE||`${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`);
 const server=spawn(process.execPath,['tests/preview-server.mjs'],{env:{...process.env,MIAO_PREVIEW_PORT:'0'},stdio:['ignore','pipe','pipe']});let browser;
 try{
  const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('隔离预览启动超时')),10000);server.stdout.on('data',data=>{const match=String(data).match(/http:\/\/[^\s]+/);if(match){clearTimeout(timer);resolve(match[0]);}});server.on('exit',()=>{clearTimeout(timer);reject(Error('隔离预览启动失败'));});});
  browser=await chromium.launch({channel:process.env.MIAO_BROWSER_CHANNEL||'chrome',headless:true});
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url+'/?settings-smoke&resources');await page.locator('#miao-nai-menu').waitFor();
  await page.evaluate(()=>{
   const p=window.preview,book=p.worlds['[喵喵]文生图 2.0'];
   Object.assign(book.entries,{55:{uid:55,comment:'tag头',content:'{{setvar::人格::KEPT_PERSONA}}\n{{setvar::对象::{{user}}}}\n{{setvar::cot_xml::custom_cot}}\n{{setvar::张数::4}}'},56:{uid:56,comment:'小标题[选开]',content:'old subtitle',disable:true,constant:true},57:{uid:57,comment:'bl[选一]',content:'old choice',disable:false,constant:true}});

  });
  await page.locator('#miao-nai-menu').click();const nav=page.locator('.miao-tabs');await nav.getByRole('button',{name:'资源',exact:true}).click();
  await page.getByRole('button',{name:'更新资源',exact:true}).click();
  try{await page.waitForFunction(()=>window.preview.settings.resourceVersion==='2.2.3-1107c',{},{timeout:6000});}
  catch(error){
   const diagnostic=await page.evaluate(()=>({errors:[...document.querySelectorAll('.miao-error-view')].map(n=>n.textContent),toasts:window.miaoTestToasts,writes:window.preview.worldWrites?.length,resource:window.preview.settings.resourceVersion}));
   throw Error('资源更新未完成：'+JSON.stringify(diagnostic));
  }
  const upgraded=await page.evaluate(()=>{
   const p=window.preview,book=p.worlds['[喵喵]文生图 2.2.3'],entry=name=>Object.values(book.entries).find(item=>item.comment===name);
   return {header:entry('tag头').content,subtitle:entry('小标题[选开]').disable,bl:entry('bl[选一]').disable,user:entry('用户添加').content,selected:p.selectedWorlds,rules:p.regexScripts};
  });
  for(const value of ['KEPT_PERSONA','{{user}}','custom_cot','::4}}'])assert.ok(upgraded.header.includes(value));assert.equal(upgraded.subtitle,true);assert.equal(upgraded.bl,false);assert.equal(upgraded.user,'用户自己的条目');
  assert.deepEqual(upgraded.selected,['[喵喵]文生图 2.2.3']);assert.equal(upgraded.rules.filter(rule=>rule.scriptName.includes('居中美化')).length,1);assert.ok(upgraded.rules.find(rule=>rule.scriptName.includes('居中美化')).replaceString.includes('font-size:0.82em'));
  await page.getByRole('checkbox',{name:'小标题',exact:true}).check();await page.waitForFunction(()=>Object.values(window.preview.worlds['[喵喵]文生图 2.2.3'].entries).find(entry=>entry.comment==='小标题[选开]').disable===false);
  const bg=await page.evaluate(()=>Object.entries(window.preview.worlds['[喵喵]文生图 2.2.3'].entries).find(([,entry])=>entry.comment==='bg[选一]')[0]);await page.getByRole('combobox',{name:'世界书性向选项',exact:true}).selectOption(bg);
  await page.waitForFunction(()=>Object.values(window.preview.worlds['[喵喵]文生图 2.2.3'].entries).find(entry=>entry.comment==='bl[选一]').disable===true);
  const persona=page.getByRole('textbox',{name:'人格（setvar）',exact:true});await persona.fill('NEW_PERSONA');await page.getByRole('button',{name:'保存酒馆宏',exact:true}).click();await page.waitForFunction(()=>Object.values(window.preview.worlds['[喵喵]文生图 2.2.3'].entries).find(entry=>entry.comment==='tag头').content.includes('NEW_PERSONA'));
  await page.getByRole('button',{name:'更新资源',exact:true}).click();await page.waitForFunction(()=>window.preview.worldWrites.length>=5);
  assert.equal(await page.getByRole('textbox',{name:'人格（setvar）',exact:true}).inputValue(),'NEW_PERSONA');assert.equal(await page.getByRole('checkbox',{name:'小标题',exact:true}).isChecked(),true);
  assert.equal(await page.evaluate(()=>window.preview.calls.length),0);await page.close();

  const mobile=await browser.newPage();mobile.on('pageerror',error=>errors.push(error.message));
  await mobile.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedError=text;}}});});
  await mobile.goto(url+'/?tt&settings-smoke&manual-delete');await mobile.locator('#miao-nai-menu').waitFor();
  const original=await mobile.evaluate(()=>{
   const p=window.preview,now=Date.now(),name=(prefix,age,suffix)=>`${prefix}-${now-age*86400000}-${suffix}.png`,path=name=>'/user/images/miao-nai/'+name;
   const names={recent:name('miao',0,'aa'),two:name('miao',2,'ab'),four:name('miao',4,'ac'),eight:name('miao',8,'ad'),sample:name('sample',9,'ae'),favorite:name('favorite',9,'af'),profile:name('miao',10,'ba'),saved:name('miao',11,'bb')};
   p.files=Object.values(names);p.settings.profiles[0].preview={url:path(names.profile)};p.settings.promptFavorites=[{id:'saved-fixture',name:'Saved',positive:'fixture',images:[path(names.saved)]}];return names;
  });
  await mobile.locator('#miao-nai-menu').click();await mobile.locator('.miao-tabs').getByRole('button',{name:'图库',exact:true}).click();await mobile.locator('.miao-history-tile').first().waitFor();await mobile.setViewportSize({width:375,height:780});
  const clean=mobile.getByRole('button',{name:'清理 3 天外',exact:true});await clean.click();await mobile.locator('.miao-confirmation-layer').waitFor();assert.ok((await mobile.locator('.miao-confirmation-message').textContent()).includes('删除 2 张图片'));
  await mobile.locator('[data-action=cancel]').click();await mobile.locator('.miao-confirmation-layer').waitFor({state:'detached'});assert.equal(await mobile.evaluate(()=>window.preview.files.length),8);
  await clean.click();await mobile.locator('.miao-confirmation-layer').waitFor();
  // A new favorite added while confirmation is open must also be protected.
  await mobile.evaluate(name=>window.preview.settings.promptFavorites[0].images.push('/user/images/miao-nai/'+name),original.eight);
  await mobile.locator('[data-action=confirm]').click();await mobile.waitForFunction(name=>!window.preview.files.includes(name),original.four);
  const remaining=await mobile.evaluate(()=>window.preview.files);assert.equal(remaining.length,7);for(const key of ['recent','two','eight','sample','favorite','profile','saved'])assert.ok(remaining.includes(original[key]));
  await mobile.evaluate(()=>window.preview.failImageDelete=true);await mobile.getByRole('button',{name:'清理 1 天外',exact:true}).click();await mobile.locator('.miao-confirmation-layer').waitFor();await mobile.locator('[data-action=confirm]').click();await mobile.waitForFunction(()=>window.miaoTestToasts.some(item=>item.type==='error'));
  const short=await mobile.evaluate(()=>window.miaoTestToasts.filter(item=>item.type==='error').at(-1).message);assert.ok(short.length<160);assert.equal(short.includes('\n'),false);
  await mobile.evaluate(()=>window.miaoTestToasts.filter(item=>item.type==='error').at(-1).options.onclick());await mobile.locator('.miao-error-copy').waitFor();assert.equal(await mobile.locator('.miao-error-details').getAttribute('open'),null);
  for(const size of [{width:320,height:700},{width:375,height:780},{width:768,height:700}]){
   await mobile.setViewportSize(size);const metrics=await mobile.locator('.miao-error-copy').evaluate(button=>{const style=getComputedStyle(button),box=button.getBoundingClientRect();return {width:box.width,height:box.height,mode:style.writingMode,space:style.whiteSpace,scroll:button.scrollWidth,client:button.clientWidth};});
   assert.equal(metrics.mode,'horizontal-tb');assert.equal(metrics.space,'nowrap');assert.ok(metrics.width>=120&&metrics.height<=60,JSON.stringify(metrics));assert.ok(metrics.scroll<=metrics.client+1);
  }
  await mobile.getByRole('button',{name:'复制错误码',exact:true}).click();await mobile.getByText('已复制',{exact:true}).waitFor();assert.ok((await mobile.evaluate(()=>window.copiedError)).includes('HTTP：500'));
  await mkdir('docs/local',{recursive:true});await mobile.setViewportSize({width:375,height:780});await mobile.screenshot({path:'docs/local/error-copy-mobile.png'});
  assert.equal(await mobile.evaluate(()=>window.preview.calls.length),0);assert.deepEqual(errors,[]);await mobile.close();
 }finally{await browser?.close();server.kill();}
});
