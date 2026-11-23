import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {promptTemplates} from '../src/prompts/prompt-templates.js';
import {composePrompt} from '../src/prompts/prompt-composer.js';
import {defaultLegacyPromptSettings as defaultPromptSettings,migratePromptSettings,fixedMacroSnapshot,updateFixedMacros} from '../src/prompts/prompt-settings.js';
import {createPromptInjection,PROMPT_ID} from '../src/platform/prompt-injection.js';
test('the restored worldbook keeps its native modules and old fixed settings can still migrate',()=>{
 const book=JSON.parse(fs.readFileSync(new URL('../assets/worldbook.json',import.meta.url)));
 const entries=Object.values(book.entries);
 for(const t of Object.values(promptTemplates))assert.ok(entries.some(e=>e.comment===t.comment));
 for(const name of ['自检[选开]','彩蛋[选开]','小标题[选开]','bg[选一]','bl[选一]','gl[选一]','双性[选一]','彩蛋解析[选开]','NSFW提示词']){
  assert.ok(entries.find(e=>e.comment===name).content.trim());
 }
 assert.equal(migratePromptSettings(book).params.count,'2~3');
});
test('all module combinations remove virtual references and preserve fixed macros',()=>{
 const keys=['selfCheck','easterEgg','subtitle','easterEggDescription','nsfw'];
 for(let bits=0;bits<32;bits++)for(const orientation of ['','bg','bl','gl','intersex']){
 const c=defaultPromptSettings();keys.forEach((k,i)=>c.modules[k]=!!(bits&(1<<i)));c.orientation=orientation;
 const text=composePrompt(c);
 assert.ok(!text.includes('getglobalvar'));assert.ok(!/\{\{getvar::(?:自检|彩蛋数量|性向绘画|文生图)/.test(text));
 assert.equal(text.includes('(+1)'),c.modules.easterEgg);
 assert.equal(text.includes('## 自检'),c.modules.selfCheck);
 assert.equal(text.includes('<easter_egg>'),c.modules.easterEgg&&c.modules.easterEggDescription);
 assert.equal(text.includes('胡里花哨'),c.modules.subtitle);
 assert.equal(text.includes('15.NSFW:'),c.modules.nsfw);
 assert.ok(text.includes('{{setvar::cot_xml::star_cot}}'));assert.ok(text.includes('{{getvar::人格}}'));
 }
});
test('nested fixed macros survive validation and composition',()=>{
 let c=defaultPromptSettings();const snap=fixedMacroSnapshot(c);const id=snap.macros.find(m=>m.name==='人格').id;
 c=updateFixedMacros(c,snap,{[id]:'{{user}} {{getvar::other}}'});
 assert.ok(composePrompt(c).includes('{{setvar::人格::{{user}} {{getvar::other}}}}'));
 assert.throws(()=>updateFixedMacros(c,fixedMacroSnapshot(c),{[id]:'{{broken'}));
});
test('migration is read only and distinguishes conditional entries',()=>{
 const book={entries:structuredClone(promptTemplates)},before=JSON.stringify(book),c=migratePromptSettings(book);
 assert.equal(c.mode,'external');assert.equal(c.enabledById.nsfw,false);assert.equal(JSON.stringify(book),before);
});
test('single D0 ID always reflects latest synchronous configuration and host errors surface',()=>{
 const calls=[],settings={enabled:true,promptConfig:defaultPromptSettings()};let errors=0;
 const injection=createPromptInjection({settings,context:()=>({setExtensionPrompt:(...args)=>calls.push(args)}),onError:()=>errors++});
 injection.update();settings.promptConfig.fixed.人格='latest';injection.update();assert.ok(calls.at(-1)[1].includes('::latest}}'));
 settings.promptConfig.mode='external';injection.update();assert.equal(calls.at(-1)[1],'');settings.promptConfig.mode='builtin';settings.enabled=false;injection.update();assert.equal(calls.at(-1)[1],'');settings.enabled=true;injection.update();
 assert.ok(calls.every(c=>c[0]===PROMPT_ID&&JSON.stringify(c.slice(2))==='[1,0,false,0]'));
 assert.throws(()=>createPromptInjection({settings,context:()=>({}),onError:()=>errors++}).update());assert.equal(errors,1);
});
test('injected dialogue instructions follow the existing egg setting and the generation model',()=>{
 const settings={enabled:true,promptConfig:defaultPromptSettings(),profiles:[{model:'nai-diffusion-5-full'}],active:0};
 const injection=createPromptInjection({settings,context:()=>({setExtensionPrompt:()=>{}}),onError:()=>{}});
 settings.promptConfig.modules.easterEgg=true;
 assert.match(injection.update(),/对白默认使用简短英文，有特殊要求时可用中文或日文。[\s\S]*Text: 台词/);
 settings.profiles[0].model='nai-diffusion-4-5-full';
 const englishOnly=injection.update();
 assert.match(englishOnly,/对白默认使用简短英文。[\s\S]*Text: 台词/);
 assert.doesNotMatch(englishOnly,/有特殊要求时可用中文或日文/);
 settings.profiles[0].model='nai-diffusion-3';
 assert.doesNotMatch(injection.update(),/Text: 台词/);
 settings.profiles[0].model='nai-diffusion-5-full';
 settings.promptConfig.modules.easterEgg=false;
 assert.doesNotMatch(injection.update(),/Text: 台词/);
});
