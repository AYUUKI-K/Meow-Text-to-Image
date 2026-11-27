import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultPromptSettings,defaultLegacyPromptSettings,migrateExternalPromptSettings,migratePromptSettings} from '../src/prompts/prompt-settings.js';
import {drawingOptions,withDrawingOptions,worldDrawingPolicy} from '../src/prompts/drawing-options.js';
import {promptTemplates} from '../src/prompts/prompt-templates.js';

test('external migration preserves v1 parameters, rules, and copies the original without changing it',()=>{
 const old=defaultLegacyPromptSettings();old.fixed.人格='{{user}}';old.fixed.彩蛋标签='/fixture';old.modules.selfCheck=false;old.modules.nsfw=true;old.orientation='gl';
 const original=structuredClone(old),config=migrateExternalPromptSettings(old);
 assert.deepEqual(old,original);
 assert.equal(config.mode,'external');assert.equal(config.params.persona,'{{user}}');assert.equal(config.params.eggMarker,'/fixture');
 assert.equal(config.orientation,'GL');assert.equal(config.enabledById.selfcheck,false);assert.equal(config.enabledById['output.subtitle'],true);
 assert.deepEqual(config.legacyBackup.config,original);assert.equal(config.legacyBackup.config.fixed.cot_xml,'star_cot');
 assert.equal(migrateExternalPromptSettings(config),config);
 const customized={...old,overrides:{main:'CUSTOM WHOLE BODY {{user}}'}};
 assert.deepEqual(migrateExternalPromptSettings(customized),{...customized,mode:'external'});
 assert.doesNotMatch(worldDrawingPolicy(migrateExternalPromptSettings(customized)),/CUSTOM WHOLE BODY/);
 const redundant={...old,overrides:{main:promptTemplates.main.content}};
 assert.equal(migrateExternalPromptSettings(redundant).version,2);
 assert.throws(()=>migrateExternalPromptSettings({...old,orientation:'bad'}));assert.deepEqual(old,original);
 const book={entries:structuredClone(promptTemplates)},before=structuredClone(book),external=migratePromptSettings(book);
 assert.equal(external.version,2);assert.equal(external.mode,'external');assert.deepEqual(book,before);
});

test('v2 migration preserves customization and allows rule changes even with retired template text',()=>{
 const config={...defaultPromptSettings(),mode:'builtin'};
 const oversized='X'.repeat(16001);
 config.params={persona:'KEPT_PERSONA',count:4,eggMarker:oversized};
 config.legacyBackup={version:1,config:{fixed:{对象:'{{user}}'}}};
 config.enabledById.egg=false;
 config.textOverridesById={composition:{body:'KEPT_COMPOSITION'},selfcheck:{suffix:''},'output.subtitle':{body:'KEPT_TITLE_STYLE'}};
 const before=structuredClone(config),restored=migrateExternalPromptSettings(config);
 assert.deepEqual(config,before);assert.equal(restored.mode,'external');
 assert.deepEqual(restored.params,{persona:'KEPT_PERSONA',target:'{{user}}',count:'4',eggMarker:'/meow_FM'});
 assert.deepEqual(restored.invalidParams,{eggMarker:oversized});
 assert.deepEqual(restored.enabledById,config.enabledById);
 assert.deepEqual(restored.textOverridesById,config.textOverridesById);
 assert.equal(migrateExternalPromptSettings(restored),restored);
 const next=withDrawingOptions(restored,{...drawingOptions(restored),title:true,count:'2~5'});
 assert.match(worldDrawingPolicy(next),/2~5 张/);
 assert.match(worldDrawingPolicy(next),/KEPT_TITLE_STYLE/);
 assert.doesNotMatch(worldDrawingPolicy(next),/KEPT_COMPOSITION/);
 assert.deepEqual(next.textOverridesById,config.textOverridesById);
});
