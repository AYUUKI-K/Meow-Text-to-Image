import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {planHistoryCleanup,isProtectedHistoryImage} from '../src/images/image-cleanup.js';
import {worldOptions,patchWorldOptions} from '../src/resources/world-options.js';
import {mergeWorldEntries} from '../src/resources/resources.js';
import {worldMacros} from '../src/resources/world-macros.js';
import {summarizeError} from '../src/platform/error-summary.js';

const now=Date.UTC(2026,10,7,12),base='https://fixture.test/chat';
const image=(age,{prefix='miao',folder='miao-nai',suffix='aa'}={})=>{const name=`${prefix}-${now-age*86400000}-${suffix}.png`;return {name,folder,url:`/user/images/${encodeURIComponent(folder)}/${name}`};};
test('1/3/7-day cleanup uses exact elapsed time, never includes unknown/future files or mutates input',()=>{
 const images=[image(0),image(1),image(2),image(3),image(4),image(7),image(8),image(-1),{name:'unrelated.png',folder:'miao-nai',url:'/user/images/miao-nai/unrelated.png'}],before=structuredClone(images);
 for(const days of [1,3,7]){const plan=planHistoryCleanup(images,{days,now,base});assert.deepEqual(plan.images,images.filter(item=>[2,3,4,7,8].some(age=>age>days&&item.name===image(age).name)));}
 assert.deepEqual(images,before);for(const days of [0,2,30,'3'])assert.throws(()=>planHistoryCleanup(images,{days,now,base}));
});
test('retention protects profile examples, archived sample/favorite names and favorites even when their UI is disabled',()=>{
 const sample=image(10,{prefix:'sample'}),orphan=image(11,{prefix:'sample'}),favorite=image(10,{prefix:'favorite'}),folder=image(10,{folder:'miao-nai-favorites'}),profile=image(10,{suffix:'ab'}),saved=image(10,{suffix:'ac'}),normal=image(10);
 const context={days:3,now,base,profiles:[{preview:{url:'https://fixture.test'+profile.url+'?version=1'}}],favorites:[{images:[saved.url]}]};
 const plan=planHistoryCleanup([sample,orphan,favorite,folder,profile,saved,normal],context);assert.deepEqual(plan.images,[normal]);assert.equal(plan.protectedCount,6);
 assert.equal(isProtectedHistoryImage(profile,context),true);assert.equal(isProtectedHistoryImage(normal,context),false);
 assert.equal(isProtectedHistoryImage({...normal,url:'https://external.test/image.png'},context),true);
});
const book=()=>({entries:{0:{comment:'tag头',content:'{{setvar::人格::My Persona}}\n{{setvar::对象::{{user}}}}'},1:{comment:'彩蛋[选开]',disable:false,constant:true},2:{comment:'小标题[选开]',disable:true,constant:true},3:{comment:'bg[选一]',disable:true,constant:true},4:{comment:'bl[选一]',disable:false,constant:true},5:{comment:'自定义条目',content:'untouched'}}});
test('world option toggles and exclusive choices preserve all text/macros and reject stale edits',()=>{
 const original=book(),snapshot=worldOptions(original),next=patchWorldOptions(original,snapshot,{'1':false,'3':true,'4':false});
 assert.equal(next.entries[1].disable,true);assert.equal(next.entries[3].disable,false);assert.equal(next.entries[4].disable,true);assert.deepEqual(next.entries[0],original.entries[0]);assert.deepEqual(next.entries[5],original.entries[5]);assert.equal(original.entries[1].disable,false);
 assert.throws(()=>patchWorldOptions(original,snapshot,{'3':true}),/只能选择/);
 const edited=structuredClone(original);edited.entries[1].disable=true;assert.throws(()=>patchWorldOptions(edited,snapshot,{'1':false}),/别处修改/);
});
test('official world upgrades preserve existing optional choices and user macro values while updating content',()=>{
 const original=book(),incoming=book();incoming.entries[0].content='{{setvar::人格::New Default}}\n{{setvar::对象::User}}';incoming.entries[1].disable=true;incoming.entries[1].content='new rules';incoming.entries[4].disable=true;
 const merged=mergeWorldEntries(original,incoming,{preserveMacros:true,preserveOptions:true});assert.equal(merged.entries[1].disable,false);assert.equal(merged.entries[4].disable,false);assert.equal(merged.entries[1].content,'new rules');assert.equal(worldMacros(merged)[0].value,'My Persona');assert.equal(worldMacros(merged)[1].value,'{{user}}');
});
test('short errors retain diagnostic codes, hide secrets and keep uncertain-result guidance',()=>{
 const error=Object.assign(Error('自定义接口请求失败（HTTP 503）。\n站点返回：'+ 'x'.repeat(150)+' https://secret.test/path Bearer SECRET_TOKEN'),{source:'nai-generation',status:503,diagnosticCode:'MEWO_CUSTOM_HTTP_503'});
 const summary=summarizeError(error);assert.ok(summary.brief.length<160);assert.match(summary.brief,/结果未确定/);assert.equal(summary.code,'MEWO_CUSTOM_HTTP_503');assert.match(summary.diagnostic,/HTTP：503/);assert.equal(summary.diagnostic.includes('secret.test'),false);assert.equal(summary.diagnostic.includes('SECRET_TOKEN'),false);
 assert.ok(summarizeError(Error('a'.repeat(500))).brief.length<=105);
 assert.equal(summarizeError(Object.assign(Error('图片删除失败'),{source:'image-delete',status:500})).brief,'图片删除失败');
});
test('updated centering regex replaces old family and uses a plain small caption without truncating the full title',async()=>{
 const rules=JSON.parse(await readFile(new URL('../assets/regex.json',import.meta.url),'utf8')),rule=rules.find(item=>item.scriptName.includes('居中美化'));
 const title='很长的标题'.repeat(30),rendered=`┈┈${title}┈┈`.replace(new RegExp(rule.findRegex.slice(1,rule.findRegex.lastIndexOf('/')),rule.findRegex.slice(rule.findRegex.lastIndexOf('/')+1)),rule.replaceString);
 assert.equal(rule.id,'ff3cb76e-e821-414d-ad49-9d49fb8e1903');assert.equal(rule.markdownOnly,true);assert.equal(rule.promptOnly,false);assert.ok(rendered.startsWith('<div class="miao-image-caption"'));assert.equal(rendered.split(title).length-1,1);assert.ok(rendered.includes('font-size:0.82em'));assert.equal(/<\/?(?:details|summary|span)\b/.test(rendered),false);assert.equal(rendered.includes('$1'),false);
 const expression=()=>new RegExp(rule.findRegex.slice(1,rule.findRegex.lastIndexOf('/')),'gi');
 assert.ok('┈┈标题┈┈\n\n\nimage###scene###'.replace(expression(),rule.replaceString).endsWith('</div>image###scene###'));
 assert.ok('┈┈标题┈┈\n\n普通正文'.replace(expression(),rule.replaceString).endsWith('</div>\n\n普通正文'),'ordinary paragraph breaks must be preserved');
});
