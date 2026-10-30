import test from 'node:test';
import assert from 'node:assert/strict';
import {delimiterPattern} from '../src/core/core.js';
import {parseGenerationBody,generationCandidates,createEggMarkerCache} from '../src/profiles/easter-egg-selection.js';
const pattern=delimiterPattern('image###','###');
const parse=(text,marker='/content',format={})=>parseGenerationBody(text,pattern,format,marker);
test('literal standalone dynamic markers associate only with a complete final body tag',()=>{
    for(const marker of ['/meow_FM','/content','/[x].*']){
        const parsed=parse(`image###normal###\n${marker}\nimage###tail###`,marker);
        assert.equal(parsed.marked.prompt,'tail');assert.equal(generationCandidates(parsed,{eggEnabled:true}).at(-1).egg,true);
    }
    for(const text of ['narration /content\nimage###tail###','/content\n/content\nimage###tail###','image###/content###','/content\nother text\nimage###tail###'])assert.equal(parse(text).marked,null);
    for(const marker of ['',null])assert.equal(parse('image###one###',marker).marked,null);
});
test('all reasoning types, comments and custom formats share body filtering and offsets',()=>{
    for(const [prefix,suffix] of [['<think>','</think>'],['<analysis>','</analysis>'],['<imgthink>','</imgthink>'],['<imagethink>','</imagethink>'],['<!--','-->'],['<star_cot>','</star_cot>']]){
        const format={prefix:'<star_cot>',suffix:'</star_cot>'},text=`${prefix}\n/content\nimage###fake###${suffix}\nimage###real###\n/content\nimage###tail###`;
        const parsed=parse(text,'/content',format);assert.deepEqual(parsed.blocks.map(b=>b.prompt),['real','tail']);assert.equal(parsed.marked.start,text.indexOf('image###tail'));
        const open=parse(`${prefix}\n/content\nimage###fake###`,'/content',format);assert.deepEqual(open.blocks,[]);assert.equal(open.marked,null);
        assert.deepEqual(parse(`image###real###${prefix}\n/content\nimage###fake###${suffix}`,'/content',format).blocks.map(b=>b.prompt),['real']);
    }
});
test('streaming 1–4 tags releases ordinary candidates immediately and buffers exactly one until completion',()=>{
    for(let count=1;count<=4;count++){
        const sent=new Set(),selected=[];let text='';
        for(let i=0;i<count;i++){
            text+=`\nimage###scene${i}###`;
            for(const candidate of generationCandidates(parse(text),{streaming:true,eggEnabled:true}))if(!sent.has(candidate.block.start)){sent.add(candidate.block.start);selected.push(candidate.egg);}
            assert.equal(sent.size,i);
        }
        for(const candidate of generationCandidates(parse(text),{eggEnabled:true}))if(!sent.has(candidate.block.start)){sent.add(candidate.block.start);selected.push(candidate.egg);}
        assert.equal(sent.size,count);assert.deepEqual(selected,[...Array(count-1).fill(false),true]);
    }
    const parsed=parse('/content\nimage###tail###');assert.deepEqual(generationCandidates(parsed,{streaming:true,eggEnabled:true}),[]);
    assert.equal(generationCandidates(parse('image###one###'),{streaming:true}).length,1);
});
test('incomplete, changed and custom-delimited tags are re-evaluated from current visible body',()=>{
    assert.deepEqual(generationCandidates(parse('image###unfinished'),{eggEnabled:true}),[]);
    const parsed=parseGenerationBody('<think><pic>fake</pic></think><pic>one</pic>\n/content\n<pic>tail</pic>',delimiterPattern('<pic>','</pic>'),{},'/content');
    assert.deepEqual(parsed.blocks.map(b=>b.prompt),['one','tail']);assert.equal(parsed.marked.prompt,'tail');
    assert.equal(parse('image###first### image###modified').blocks.at(-1).prompt,'first');
});
test('macro cache refreshes on world changes and invalidation while session promises remain stable; failures have no default marker',async()=>{
    let world='a',value='/content',calls=0;
    const cache=createEggMarkerCache({key:()=>world,read:async()=>{calls++;return {macros:[{scope:'setvar',name:'彩蛋标签',value}]};}});
    const session=cache.read();assert.equal(await session,'/content');assert.equal(await cache.read(),'/content');assert.equal(calls,1);
    value='/new';cache.invalidate();assert.equal(await cache.read(),'/new');assert.equal(await session,'/content');world='b';await cache.read();assert.equal(calls,3);
    for(const read of [async()=>({macros:[]}),async()=>{throw Error('unavailable');},async()=>({macros:[{scope:'setvar',name:'彩蛋标签',value:'  '}]})])assert.equal(await createEggMarkerCache({key:()=>'',read}).read(),'');
    const repeated=createEggMarkerCache({key:()=>'',read:async()=>({macros:[{scope:'setvar',name:'彩蛋标签',value:'/old'},{scope:'setvar',name:'彩蛋标签',value:'/current'}]})});assert.equal(await repeated.read(),'/current');
});
