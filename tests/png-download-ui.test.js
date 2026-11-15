import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
const require=createRequire(import.meta.url);

test('PNG buttons download original URLs on mobile browsers while JPG and TT keep their existing exports',{timeout:60000},async()=>{
 const {chromium}=require(process.env.MIAO_PLAYWRIGHT_MODULE||`${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`);
 const server=spawn(process.execPath,['tests/preview-server.mjs'],{env:{...process.env,MIAO_PREVIEW_PORT:'0'},stdio:['ignore','pipe','pipe']});let browser;
 try{
  const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('预览启动超时')),10000);server.stdout.on('data',data=>{const match=String(data).match(/http:\/\/[^\s]+/);if(match){clearTimeout(timer);resolve(match[0]);}});server.on('exit',()=>{clearTimeout(timer);reject(Error('预览启动失败'));});});
  browser=await chromium.launch({channel:process.env.MIAO_BROWSER_CHANNEL||'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true,acceptDownloads:true});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
   window.downloadAttempts=[];window.rejectBlobDownloads=true;window.sourceFetches=[];
   const click=HTMLAnchorElement.prototype.click,nativeFetch=window.fetch.bind(window);
   HTMLAnchorElement.prototype.click=function(){if(this.download){window.downloadAttempts.push({url:this.href,name:this.download,active:navigator.userActivation.isActive});if(window.rejectBlobDownloads&&this.href.startsWith('blob:'))return;}return click.call(this);};
   window.fetch=(url,options)=>{if(String(url).startsWith('/user/images/'))window.sourceFetches.push(String(url));return nativeFetch(url,options);};
  });
  await page.goto(url+'/?settings-smoke&manual-delete');await page.locator('#miao-nai-menu').waitFor();
  const originalURL=await page.locator('.miao-image-card>img').getAttribute('src'),original=await(await page.request.get(url+originalURL)).body();
  await page.locator('.miao-image-card>img').press('Enter');const before=await page.evaluate(()=>window.sourceFetches.length);
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'下载图片',exact:true}).tap()]);
  const originalName=decodeURIComponent(new URL(originalURL,url).pathname.split('/').at(-1));assert.equal(download.suggestedFilename(),originalName);assert.equal(await download.failure(),null);
  const chunks=[];for await(const chunk of await download.createReadStream())chunks.push(chunk);assert.deepEqual(Buffer.concat(chunks),original,'PNG metadata and all original bytes must survive');
  assert.equal(await page.evaluate(()=>window.sourceFetches.length),before,'the button must not read the PNG into another Blob');
  const attempt=await page.evaluate(()=>window.downloadAttempts.at(-1));assert.equal(attempt.url,url+originalURL);assert.equal(attempt.active,true);
  await page.locator('#miao-nai-menu').click();await page.locator('.miao-overview').getByRole('button',{name:'图库',exact:true}).click();
  await page.getByRole('button',{name:'多选',exact:true}).click();await page.locator('.miao-history-pick input').first().check();
  const [selected]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'下载选中图片',exact:true}).tap()]);
  assert.equal(await selected.failure(),null);assert.ok(selected.suggestedFilename().endsWith('.png'));assert.ok((await page.evaluate(()=>window.downloadAttempts.at(-1).url)).startsWith(url+'/user/images/'));
  await page.getByRole('button',{name:'关闭设置',exact:true}).click();
  await page.evaluate(async()=>{window.rejectBlobDownloads=false;window.preview.settings.exportFormat='jpg';await window.preview.emit('MESSAGE_UPDATED',0);});
  await page.locator('.miao-image-card>img[data-miao-export-state=ready][data-miao-image-format=jpg]').waitFor();
  if(await page.locator('.miao-image-tools').getAttribute('hidden')!==null)await page.locator('.miao-image-card>img').press('Enter');
  const [jpg]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'下载图片',exact:true}).tap()]);
  assert.equal(await jpg.failure(),null);assert.equal(jpg.suggestedFilename(),originalName.replace(/\.[^.]+$/,'.jpg'));const jpeg=[];for await(const chunk of await jpg.createReadStream())jpeg.push(chunk);assert.deepEqual([...Buffer.concat(jpeg).subarray(0,2)],[255,216]);
  await page.evaluate(async()=>{const frame=document.createElement('iframe');frame.id='download-frame';frame.setAttribute('sandbox','allow-scripts allow-same-origin');frame.style='position:fixed;inset:8px auto auto 8px;width:200px;height:100px;background:white;z-index:2147483647';await new Promise(resolve=>{frame.onload=resolve;frame.src='about:blank';document.body.append(frame);});});
  const frame=page.frames().find(frame=>frame.parentFrame());
  await frame.evaluate(async originalURL=>{const {downloadBrowserBlob}=await import('/scripts/extensions/third-party/test/src/images/downloads.js'),blob=await(await fetch(originalURL)).blob();const button=document.createElement('button');button.textContent='测试框架下载';button.onclick=()=>downloadBrowserBlob(blob,'frame.png');document.body.append(button);},originalURL);
  const [framed]=await Promise.all([page.waitForEvent('download'),page.frameLocator('#download-frame').getByRole('button',{name:'测试框架下载'}).click()]);
  assert.equal(await framed.failure(),null);assert.equal(framed.suggestedFilename(),'frame.png');assert.equal(await page.evaluate(()=>window.downloadAttempts.at(-1).name),'frame.png','iframe exports must be created in the top document');
  assert.equal(await page.evaluate(()=>window.preview.calls.length),0);assert.deepEqual(errors,[]);await page.close();
  const tt=await browser.newPage();await tt.goto(url+'/?settings-smoke&manual-delete&tt');await tt.locator('#miao-nai-menu').waitFor();await tt.locator('.miao-image-card>img').press('Enter');await tt.getByRole('button',{name:'下载图片',exact:true}).click();
  await tt.waitForFunction(()=>window.preview.nativeDownloads?.length===1);assert.equal(await tt.evaluate(()=>window.preview.nativeDownloads[0].type),'image/png');assert.equal(await tt.evaluate(()=>window.preview.calls.length),0);await tt.close();
 }finally{await browser?.close();server.kill();}
});
