import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHeaderMacros,worldMacros,patchWorldMacros} from '../world-macros.js';
import {mergeWorldEntries} from '../resources.js';
const book=content=>({entries:{8:{uid:8,comment:'tag头',content,order:499,disable:false},9:{uid:9,comment:'其他',content:'不要改动'}}});
const bundled=JSON.parse(await readFile(new URL('../assets/worldbook.json',import.meta.url),'utf8'));
test('bundled header exposes real local/global variables without evaluating them',()=>{
 const fields=worldMacros(bundled);assert.equal(fields.length,21);
 for(const name of ['人格','对象','彩蛋标签','cot_xml','张数'])assert.ok(fields.some(field=>field.name===name));
 assert.equal(fields.find(field=>field.name==='对象').value,'User');
 assert.equal(new Set(fields.map(field=>field.id)).size,fields.length);
});
test('nested, multiline and repeated assignments retain separate scopes and literal syntax',()=>{
 const content='before\n{{trim}}\n{{setvar::对象::{{user}}}}\n{{setglobalvar::对象::global\ntext}}\n{{setvar::对象::another}}after';
 const original=book(content),fields=worldMacros(original);assert.equal(fields.length,3);assert.equal(fields[0].value,'{{user}}');
 const next=patchWorldMacros(original,fields,{[fields[0].id]:'{{getvar::角色}}',[fields[2].id]:'B'});
 assert.equal(next.entries[8].content,content.replace('{{user}}','{{getvar::角色}}').replace('another','B'));
 assert.equal(original.entries[8].content,content);assert.deepEqual(next.entries[9],original.entries[9]);assert.equal(next.entries[8].order,499);
});
test('fresh-world merge preserves unrelated edits and rejects same-variable conflicts',()=>{
 const original=book('{{setvar::人格::ELLA}}\n{{setvar::对象::User}}'),fields=worldMacros(original);
 const external=structuredClone(original);external.entries[9].content='external note';external.entries[8].content=external.entries[8].content.replace('User','Alice');
 const next=patchWorldMacros(external,fields,{[fields[0].id]:'MyPersona'});assert.equal(next.entries[9].content,'external note');assert.match(next.entries[8].content,/Alice/);
 assert.throws(()=>patchWorldMacros(external,fields,{[fields[1].id]:'Bob'}),/重新读取/);
});
test('invalid values never write an unterminated or escaped outer macro',()=>{
 const original=book('{{setvar::人格::ELLA}}'),fields=worldMacros(original);
 for(const value of ['{{user','oops}}', 'x'.repeat(16001)])assert.throws(()=>patchWorldMacros(original,fields,{[fields[0].id]:value}));
 assert.throws(()=>parseHeaderMacros('{{setvar::x::oops'),/未闭合/);
 assert.equal(worldMacros(original)[0].value,'ELLA');
});
test('official upgrades preserve existing macro values while adding new macros and replacing other content',()=>{
 const previous=book('{{setvar::人格::Custom}}\n{{setvar::对象::{{user}}}}');
 const incoming=book('{{setvar::人格::Default}}\n{{setvar::对象::User}}\n{{setvar::新宏::new}}');incoming.entries[9].content='new instructions';
 const next=mergeWorldEntries(previous,incoming,{preserveMacros:true}),fields=worldMacros(next);
 assert.equal(fields[0].value,'Custom');assert.equal(fields[1].value,'{{user}}');assert.equal(fields[2].value,'new');assert.equal(next.entries[9].content,'new instructions');
 assert.equal(worldMacros(mergeWorldEntries(previous,incoming))[0].value,'Default');
});
test('worlds without a header remain usable and are not modified by optional preservation',()=>{
 const empty={entries:{}};assert.deepEqual(mergeWorldEntries(empty,empty,{preserveMacros:true}),empty);assert.deepEqual(worldMacros(empty),[]);
});
