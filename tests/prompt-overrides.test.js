import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultLegacyPromptSettings as defaultPromptSettings} from '../src/prompts/prompt-settings.js';
import {promptTemplates} from '../src/prompts/prompt-templates.js';
import {promptText,withPromptOverride} from '../src/prompts/prompt-overrides.js';
import {composePrompt} from '../src/prompts/prompt-composer.js';
test('overrides preserve defaults, other modules and arbitrary native macros',()=>{
 const original=defaultPromptSettings();let next=withPromptOverride(original,'main',promptText(original,'main')+'\n{{getvar::custom}}');
 assert.equal(original.overrides,undefined);assert.ok(composePrompt(next).includes('{{getvar::custom}}'));
 next=withPromptOverride(next,'header',promptText(next,'header')+'\n{{setvar::custom::{{user}}}}');assert.ok(composePrompt(next).includes('{{setvar::custom::{{user}}}}'));
 next=withPromptOverride(next,'main',promptTemplates.main.content);assert.equal(next.overrides.main,undefined);assert.ok(next.overrides.header);assert.deepEqual(next.fixed,original.fixed);assert.deepEqual(next.modules,original.modules);
 assert.throws(()=>withPromptOverride(next,'main','{{broken'));
});
