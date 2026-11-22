import test from 'node:test';
import assert from 'node:assert/strict';
import {sizePresets,delimiterPattern,parseBlocks,parseBodyBlocks,renderedBlockRange,compareImagesNewest,pageItems} from '../src/core/core.js';
test('three standard sizes',()=>{
 assert.deepEqual(sizePresets.map(p=>[p.width,p.height]),[[1024,1024],[832,1216],[1216,832]]);
});

test('an unclosed opening never consumes the next opening as its closing hashes',()=>{
 const text='image###\n9.信息完整性\n10.扩展要求\nimage###sfw, 1boy, 1girl, school corridor###';
 assert.deepEqual(parseBodyBlocks(text).map(b=>b.prompt),['sfw, 1boy, 1girl, school corridor']);
 for(let length=0;length<text.length;length++)assert.equal(parseBodyBlocks(text.slice(0,length)).length,0,`stream offset ${length}`);
});

test('only complete closing tags generate, including when delivered one hash at a time',()=>{
 for(const ending of ['', '#','##'])assert.deepEqual(parseBodyBlocks('image###cat, sunlight'+ending),[]);
 assert.deepEqual(parseBodyBlocks('image###cat, sunlight###').map(b=>b.prompt),['cat, sunlight']);
});

test('worldbook imgthink self-check and all streamed prefixes are excluded',()=>{
 const planning='<imgthink>是否符合 image###[tag提示词]### 的结构\n9.信息完整性\n10.扩展要求\n11.NSFW环节要求</imgthink>';
 for(let length=0;length<=planning.length;length++)assert.deepEqual(parseBodyBlocks(planning.slice(0,length)),[],`planning offset ${length}`);
 const text=planning+'\nimage###sfw, 1boy, 1girl, school corridor###';
 assert.deepEqual(parseBodyBlocks(text).map(b=>b.prompt),['sfw, 1boy, 1girl, school corridor']);
 assert.equal(parseBodyBlocks(text)[0].start,text.lastIndexOf('image###'));
});

test('comment instructions mentioning imgthink do not hide the actual body',()=>{
 const text='<!-- 必须在content内进行<imgthink>思考 -->\n<imgthink>image###wrong###</imgthink>image###right###';
 assert.deepEqual(parseBodyBlocks(text).map(b=>b.prompt),['right']);
 assert.deepEqual(parseBodyBlocks('<!-- image###wrong###'),[]);
});

test('external preset Tag_think examples do not become images, even while streaming',()=>{
 const planning='<thinking>image###draft###</thinking><image><TAG_THINK>image###sample###</Tag_think>';
 const body='image###Scene Composition: sunny park; Character 1 Prompt: brown coat |centers:A1;###</image>';
 for(let length=0;length<=planning.length;length++)assert.deepEqual(parseBodyBlocks(planning.slice(0,length)),[]);
 const [block]=parseBodyBlocks(planning+body);
 assert.equal(block.start,planning.length);
 assert.equal(block.prompt,'Scene Composition: sunny park; Character 1 Prompt: brown coat |centers:A1;');
});

test('custom delimiter recovery also discards unfinished older openings',()=>{
 const pattern=delimiterPattern('<draw>','</draw>');
 assert.deepEqual(parseBodyBlocks('<draw>unfinished <draw>cat</draw>',pattern).map(b=>b.prompt),['cat']);
});

test('history mixes test and normal images strictly by timestamp, including across pages',()=>{
 const images=Array.from({length:30},(_,i)=>({name:`${i%2?'miao':'test'}-${1792737847709+i}.png`}));
 const sorted=images.toSorted(compareImagesNewest);
 assert.deepEqual([0,1].flatMap(p=>pageItems(sorted,p).items),images.toReversed());
 assert.equal(sorted[0].name,images.at(-1).name);
});

test('rendered placement survives paragraph splitting and markdown hash headings',()=>{
 const raw='image###\nsfw, 1boy,\n1girl, school corridor\n###';
 for(const closing of ['###','#','']){
  const text='正文前image###sfw, 1boy,1girl, school corridor'+closing+'正文后';
  const range=renderedBlockRange(text,raw,'image###','###');
  assert.ok(range);
  assert.equal(text.slice(0,range.start),'正文前');
  // A literal hash next to prose is not a standalone closing heading.
  assert.equal(text.slice(range.end),closing==='#'?'#正文后':'正文后');
 }
 const text='正文前image###sfw, 1boy,1girl, school corridor\n#\n正文后';
 const range=renderedBlockRange(text,raw,'image###','###');
 assert.equal(text.slice(range.end),'\n正文后');
 assert.equal(renderedBlockRange('只有正文，没有标签',raw,'image###','###'),null);
});
test('custom delimiters are literal, including regex metacharacters',()=>{
 for(const [start,end] of [['image###','###'],['<draw>','</draw>'],['[a](1)+','[/a]$'],['.*','?+']]){
  const pattern=delimiterPattern(start,end);
  assert.deepEqual(parseBlocks(`text ${start}cat${end} ${start}dog${end}`,pattern).map(b=>b.prompt),['cat','dog']);
  assert.equal(parseBlocks(start+'unfinished',pattern).length,0);
 }
 assert.throws(()=>delimiterPattern('','###'));assert.throws(()=>delimiterPattern('###',''));
});
test('streamed raw reasoning and host-separated reasoning capture only actual body',()=>{
 const reasoning='<analysis><think>image###fake###</analysis>';
 const body='正文<imgthink>image###draft###</imgthink>image###first### image###second###';
 const full=reasoning+body;
 for(let length=0;length<=full.length;length++){
  const received=full.slice(0,length),blocks=parseBodyBlocks(received);
  const expected=['first','second'].filter(prompt=>received.includes(`image###${prompt}###`));
  assert.deepEqual(blocks.map(b=>b.prompt),expected,`stream offset ${length}`);
  assert.deepEqual(blocks.map(b=>b.bodyIndex),expected.map((_,i)=>i));
  for(const block of blocks)assert.equal(received.slice(block.start,block.start+block.raw.length),block.raw);
 }
 const message={mes:body,extra:{reasoning:'image###independent-fake###'}};
 const original=structuredClone(message);
 const separated=parseBodyBlocks(message.mes),raw=parseBodyBlocks(full);
 assert.deepEqual(separated.map(b=>[b.prompt,b.bodyIndex]),raw.map(b=>[b.prompt,b.bodyIndex]));
 assert.deepEqual(separated.map(b=>b.start),raw.map(b=>b.start-reasoning.length));
 assert.deepEqual(message,original);
 assert.deepEqual(parseBodyBlocks('<think>image###fake###</think>image###real###').map(b=>b.prompt),['real']);
});
