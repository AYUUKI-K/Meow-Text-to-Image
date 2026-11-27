import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {promptTemplates} from '../src/prompts/prompt-templates.js';
import {migratePromptSettings} from '../src/prompts/prompt-settings.js';
test('the restored worldbook keeps its native modules and old fixed settings can still migrate',()=>{
 const book=JSON.parse(fs.readFileSync(new URL('../assets/worldbook.json',import.meta.url)));
 const entries=Object.values(book.entries);
 for(const t of Object.values(promptTemplates))assert.ok(entries.some(e=>e.comment===t.comment));
 for(const name of ['自检[选开]','彩蛋[选开]','小标题[选开]','bg[选一]','bl[选一]','gl[选一]','双性[选一]','彩蛋解析[选开]','NSFW提示词']){
  assert.ok(entries.find(e=>e.comment===name).content.trim());
 }
 assert.equal(migratePromptSettings(book).params.count,'2~3');
});
test('migration is read only and distinguishes conditional entries',()=>{
 const book={entries:structuredClone(promptTemplates)},before=JSON.stringify(book),c=migratePromptSettings(book);
 assert.equal(c.mode,'external');assert.equal(c.enabledById.nsfw,false);assert.equal(JSON.stringify(book),before);
});
