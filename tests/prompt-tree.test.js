import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {promptTree,treeById,treeRoots,validatePromptTree} from '../src/prompts/tree-defaults.js';
import {defaultPromptSettings,defaultLegacyPromptSettings,fixedMacroSnapshot,updateFixedMacros,migratePromptSettings} from '../src/prompts/prompt-settings.js';
import {defaultTreeSettings,effectiveEnabled,savedEnabled,treeText,withTreeText,withTreeEnabled,migrateTreeSettings,promptWarnings} from '../src/prompts/tree-settings.js';
import {composePrompt} from '../src/prompts/prompt-composer.js';
import {promptTemplates} from '../src/prompts/prompt-templates.js';
import {createPromptInjection,PROMPT_ID} from '../src/platform/prompt-injection.js';
import {createEggMarkerCache} from '../src/profiles/easter-egg-selection.js';
const source=JSON.parse(readFileSync(new URL('./support/prompt-tree-source.json',import.meta.url),'utf8'));

test('fixed registry preserves the source blocks and the two updated 2.3.0 blocks',()=>{
 assert.equal(validatePromptTree(),true);assert.equal(new Set(promptTree.map(n=>n.nodeId)).size,promptTree.length);
 assert.deepEqual(treeRoots.map(id=>treeById[id].displayId),['00','01','02','03','04','05']);
 assert.equal(treeById['selfcheck.egg'].parentId,'selfcheck');assert.equal(treeById['egg.description'].parentId,'egg');
 assert.deepEqual(treeById.selfcheck.children.slice(-4),['selfcheck.item10','selfcheck.egg','selfcheck.nsfw','selfcheck.total']);
 assert.equal(treeById.composition.children.length,0);assert.deepEqual(Object.keys(treeById.composition.slots),['body']);
 assert.equal(Object.keys(source).length,31);let slots=0;
 for(const node of promptTree)slots+=Object.keys(node.slots).length;assert.equal(slots,31);
 const updated={
  'tags.rules':'198c08b69210771cf628c926acc28a697b5c9d0785651fb7292c803712b9766c',
  'selfcheck.item2':'beed0cade6f19ad7000fd88ef0ee30c99f7c2411ef6ce1e292620331ec385b7e',
 };
 for(const [displayId,{nodeId,slot,sha256}] of Object.entries(source)){
  const body=treeById[nodeId].slots[slot];assert.equal(createHash('sha256').update(body).digest('hex'),updated[nodeId]??sha256,displayId+' changed');
 }
 assert.throws(()=>promptTree.push({}));assert.throws(()=>treeById.selfcheck.children.reverse());assert.throws(()=>{treeById.egg.label='new';});
 const invalid=structuredClone(promptTree);invalid[1].parentId='missing';assert.throws(()=>validatePromptTree(invalid));
 const duplicate=structuredClone(promptTree);duplicate[1].nodeId=duplicate[0].nodeId;assert.throws(()=>validatePromptTree(duplicate));
});

test('default tree composes plain text, one parameter block and fixed shells without metadata or macros',()=>{
 const config=defaultPromptSettings(),before=structuredClone(config),text=composePrompt(config);
 assert.equal(config.version,2);assert.deepEqual(config,defaultTreeSettings());assert.equal(config.enabledById['output.subtitle'],false);
 assert.equal((text.match(/<imageTag>/g)||[]).length,1);assert.equal((text.match(/<\/imageTag>/g)||[]).length,1);
 assert.equal((text.match(/绘图执行者：/g)||[]).length,1);assert.equal((text.match(/彩蛋分隔标记：/g)||[]).length,1);
 assert.ok(text.startsWith('---\n\n<imageTag>\n\n'));assert.ok(text.endsWith('</imageTag>\n\n---'));
 assert.ok(!/\{\{(?:setvar|getvar|setglobalvar|getglobalvar|insert|slot)/.test(text));assert.ok(!text.includes('parentId'));assert.ok(!text.includes('04.EGG'));
 assert.ok(text.indexOf('完成彩蛋任务。')<text.indexOf('## 自检'));assert.ok(text.indexOf('## 自检')<text.indexOf('## 图片标准格式为:'));
 assert.equal(composePrompt(config),text);assert.deepEqual(config,before);
 const other=defaultPromptSettings();other.params.persona='OTHER';assert.ok(composePrompt(other).includes('绘图执行者：OTHER'));assert.equal(composePrompt(config),text);
 // Incoming settings cannot replace, reorder or insert registry nodes.
 assert.equal(composePrompt({...config,nodes:[{body:'UNTRUSTED'}],children:['output','task']}),text);
});

test('all parent/egg/check/orientation combinations obey effective state without altering saved choices',()=>{
 const ids=['tags','egg','egg.description','selfcheck','nsfw','selfcheck.nsfw','output.subtitle'];
 for(let bits=0;bits<128;bits++)for(const orientation of ['','BG','BL','GL','INTERSEX']){
  let c=defaultPromptSettings();ids.forEach((id,i)=>{c=withTreeEnabled(c,id,!!(bits&(1<<i)));});c.orientation=orientation;
  const before=structuredClone(c),text=composePrompt(c),egg=c.enabledById.tags&&c.enabledById.egg,check=c.enabledById.selfcheck;
  assert.equal(text.includes(treeById.egg.slots.body),egg);assert.equal(text.includes('<easter_egg>'),egg&&c.enabledById['egg.description']);
  assert.equal(text.includes(treeById['selfcheck.egg'].slots.body),egg&&check);
  assert.equal(text.includes(treeById.selfcheck.slots.prefix),check);assert.equal(text.includes('\n\n</imgthink>\n\n'),check);
  assert.equal(text.includes(treeById['output.selfcheck'].slots.body),check);assert.equal(text.includes(treeById['selfcheck.nsfw'].slots.body),check&&c.enabledById['selfcheck.nsfw']);
  assert.equal(text.includes(treeById['nsfw.rules'].slots.body),c.enabledById.nsfw);assert.equal(text.includes(treeById['output.subtitle'].slots.body),c.enabledById['output.subtitle']);
  for(const choice of ['BG','BL','GL','INTERSEX'])assert.equal(text.includes(treeById['orientation.'+choice.toLowerCase()].slots.body),c.enabledById.nsfw&&orientation===choice);
  if(c.enabledById.nsfw&&check)assert.ok(text.indexOf('15.NSFW:')<text.indexOf('## 自检'));
  assert.deepEqual(c,before);
 }
});

test('individual switches, sparse overrides and unknown macros survive parent toggling',()=>{
 let c=withTreeText(defaultPromptSettings(),'egg.description',{body:'CUSTOM {{user}} {{getvar::unknown}}'});
 const overrides=structuredClone(c.textOverridesById);c=withTreeEnabled(c,'egg',false);assert.equal(effectiveEnabled(c,'egg.description'),false);assert.equal(savedEnabled(c,'egg.description'),true);assert.deepEqual(c.textOverridesById,overrides);
 c=withTreeEnabled(c,'egg',true);assert.ok(composePrompt(c).includes('CUSTOM {{user}} {{getvar::unknown}}'));
 c=withTreeText(c,'egg.description',{body:treeById['egg.description'].slots.body});assert.deepEqual(c.textOverridesById,{});
 for(const node of promptTree.filter(n=>n.toggleable)){
  const toggled=withTreeEnabled(defaultPromptSettings(),node.nodeId,false);assert.equal(effectiveEnabled(toggled,node.nodeId),false);if(node.slots.body)assert.ok(!composePrompt(toggled).includes(node.slots.body));
 }
 assert.throws(()=>withTreeEnabled(c,'output.format',false));assert.throws(()=>withTreeText(c,'egg',{prefix:'unknown'}));assert.throws(()=>withTreeText(c,'composition',{body:'<imageTag>'}));assert.throws(()=>withTreeText(c,'composition',{body:'x'.repeat(100001)}));assert.throws(()=>composePrompt({...c,orientation:'all'}));
 assert.throws(()=>withTreeText(c,'selfcheck',{suffix:''}),/成对/);
});

test('v1 migration preserves parameters, modules, external mode and versioned original; custom text needs explicit adoption',()=>{
 const v1=defaultLegacyPromptSettings('external');v1.fixed.人格='{{user}}';v1.fixed.彩蛋标签='/fixture';v1.modules.selfCheck=false;v1.modules.nsfw=true;v1.orientation='gl';
 const original=structuredClone(v1),c=migrateTreeSettings(v1);assert.deepEqual(v1,original);assert.equal(c.mode,'external');assert.equal(c.params.persona,'{{user}}');assert.equal(c.params.eggMarker,'/fixture');assert.equal(c.orientation,'GL');assert.equal(c.enabledById.selfcheck,false);assert.equal(c.enabledById['output.subtitle'],true);assert.deepEqual(c.legacyBackup.config,original);assert.equal(c.legacyBackup.config.fixed.cot_xml,'star_cot');assert.equal(migrateTreeSettings(c),c);assert.equal(composePrompt(c),'');
 const v1custom={...defaultLegacyPromptSettings(),overrides:{main:'CUSTOM WHOLE BODY {{user}}'}};
 assert.equal(migrateTreeSettings(v1custom),v1custom);assert.ok(composePrompt(v1custom).includes('CUSTOM WHOLE BODY'));
 const adopted=migrateTreeSettings(v1custom,{adoptTree:true});assert.deepEqual(adopted.legacyBackup.config,v1custom);assert.ok(!composePrompt(adopted).includes('CUSTOM WHOLE BODY'));assert.ok(composePrompt(adopted.legacyBackup.config).includes('CUSTOM WHOLE BODY'));
 const redundant={...defaultLegacyPromptSettings(),overrides:{main:promptTemplates.main.content}};assert.equal(migrateTreeSettings(redundant).version,2);
 assert.throws(()=>migrateTreeSettings({...v1,orientation:'bad'}));assert.deepEqual(v1,original);
 const book={entries:structuredClone(promptTemplates)},before=structuredClone(book),external=migratePromptSettings(book);assert.equal(external.version,2);assert.equal(external.mode,'external');assert.deepEqual(book,before);
});

test('ordinary parameter saving, marker cache and warnings share the same values',async()=>{
 let c=defaultPromptSettings();const snap=fixedMacroSnapshot(c);assert.equal(snap.version,2);assert.equal(snap.macros.length,4);
 c=updateFixedMacros(c,snap,{persona:'{{user}}',eggMarker:'/fixture'});assert.ok(composePrompt(c).includes('绘图执行者：{{user}}'));assert.ok(!composePrompt(c).includes('{{setvar'));
 const cache=createEggMarkerCache({read:()=>fixedMacroSnapshot(c),key:()=>c.params.eggMarker});assert.equal(await cache.read(),'/fixture');c={...c,params:{...c.params,eggMarker:'/new'}};assert.equal(await cache.read(),'/new');
 assert.ok(promptWarnings(c).some(s=>s.includes('宏')));assert.deepEqual(promptWarnings(defaultPromptSettings()),[]);
 const customFormat=withTreeText(defaultPromptSettings(),'output.format',{body:'CUSTOM_START\n[prompt]\nCUSTOM_END'});assert.ok(promptWarnings(customFormat,'image###','###').some(s=>s.includes('图片标签结构已自定义')));
});

test('D0 uses a single synchronous ID, clears external/disabled and can roll back a failed save',()=>{
 const calls=[],settings={enabled:true,promptConfig:defaultPromptSettings()};
 const injection=createPromptInjection({settings,context:()=>({setExtensionPrompt:(...args)=>calls.push(args)}),onError:()=>{}});
 const original=settings.promptConfig,text=injection.update();settings.promptConfig=withTreeText(original,'composition',{body:'edited'});assert.ok(injection.update().includes('edited'));settings.promptConfig=original;assert.equal(injection.update(),text);
 settings.promptConfig={...original,mode:'external'};assert.equal(injection.update(),'');settings.promptConfig=original;settings.enabled=false;assert.equal(injection.update(),'');
 assert.ok(calls.every(call=>call[0]===PROMPT_ID&&JSON.stringify(call.slice(2))==='[1,0,false,0]'));
});
