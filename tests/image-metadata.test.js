import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync,gzipSync} from 'node:zlib';
import {readImageMetadata,readStealthMetadata,generationInfo} from '../src/images/image-metadata.js';

const chunk=(type,bytes)=>{const data=Buffer.from(bytes),length=Buffer.alloc(4);length.writeUInt32BE(data.length);return Buffer.concat([length,Buffer.from(type),data,Buffer.alloc(4)]);};
const png=(...chunks)=>{
    const header=Buffer.alloc(13);header.writeUInt32BE(1216);header.writeUInt32BE(832,4);header[8]=8;header[9]=6;
    return new Blob([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),...chunks,chunk('IEND',[])],{type:'image/png'});
};
test('PNG metadata preserves complete prompts, repeated keys and all generation fields',async()=>{
    const parameters={prompt:'scene, '.repeat(5000),uc:'negative',seed:4294967295,v4_prompt:{caption:{base_caption:'base',char_captions:[{char_caption:'character',centers:[{x:.2,y:.8}]}]}},unknown:{keep:true}};
    const result=await readImageMetadata(png(chunk('tEXt','Comment\0'+JSON.stringify(parameters)),chunk('tEXt','Software\0NovelAI'),chunk('tEXt','Software\0original')));
    assert.equal(result.width,1216);assert.equal(result.height,832);assert.equal(result.colorType,6);
    assert.deepEqual(result.text[0].parameters,parameters);assert.equal(result.text[0].text,JSON.stringify(parameters));
    assert.deepEqual(result.text.slice(1).map(entry=>entry.text),['NovelAI','original']);
    assert.equal(result.chunks.at(-1).type,'IEND');
});
test('PNG compressed Latin-1 and international text are decoded',async()=>{
    const value='完整提示词 🌸';
    const result=await readImageMetadata(png(
        chunk('zTXt',Buffer.concat([Buffer.from('Description\0\0'),deflateSync(Buffer.from([99,97,102,233]))])),
        chunk('iTXt',Buffer.concat([Buffer.from('Comment\0\x01\0zh\0'),Buffer.from('注释\0'),deflateSync(Buffer.from(value))])),
        chunk('iTXt',Buffer.concat([Buffer.from('Title\0\0\0\0\0'),Buffer.from(value)]))
    ));
    assert.equal(result.text[0].text,'café');assert.equal(result.text[1].text,value);
    assert.equal(result.text[1].language,'zh');assert.equal(result.text[1].translatedKeyword,'注释');assert.equal(result.text[2].text,value);
});
test('damaged text stays visible as an error without discarding other metadata',async()=>{
    const result=await readImageMetadata(png(chunk('zTXt','broken\0\x01bad'),chunk('tEXt','Title\0readable')));
    assert.match(result.text[0].error,/压缩/);assert.equal(result.text[1].text,'readable');
    const bytes=new Uint8Array(await png().arrayBuffer());
    await assert.rejects(readImageMetadata(new Blob([bytes.subarray(0,bytes.length-2)])),/不完整|长度/);
});
test('images without PNG metadata do not invent generation parameters',async()=>{
    const result=await readImageMetadata(new Blob(['plain image'],{type:'image/jpeg'}));
    assert.deepEqual(result,{format:'image/jpeg',text:[],chunks:[]});
});

test('generation info recognizes NovelAI model source and favors embedded data over saved settings',()=>{
 const comment={prompt:'full scene',uc:'',seed:0,steps:28,scale:7,sm:false,v4_prompt:{caption:{base_caption:'base scene',char_captions:[{char_caption:'character',centers:[{x:.2,y:.8}]}]}},v4_negative_prompt:{caption:{base_caption:'negative scene',char_captions:[{char_caption:'negative character'}]}},unknown:{keep:true}};
 const metadata={width:1024,height:1024,text:[{keyword:'Source',text:'NovelAI Diffusion V4.5 4BDE2A90'},{keyword:'Comment',parameters:comment},{keyword:'Software',text:'NovelAI'}]};
 const info=generationInfo(metadata,{profileId:'selected-profile',profileName:'实际生成配置',request:{model:'nai-diffusion-5-full',width:512,height:512,prompt:'outdated',seed:999}});
 assert.equal(info.profileId,'selected-profile');assert.equal(info.profileName,'实际生成配置');
 assert.equal(info.modelId,'nai-diffusion-4-5-full');assert.equal(info.model,'V4.5 Full');assert.equal(info.prompt,'base scene');assert.equal(info.negative,'negative scene');assert.equal(info.parameters.seed,0);assert.equal(info.parameters.sm,false);
 assert.equal(info.width,1024);assert.equal(info.parameters.width,1024);assert.equal(info.characters[0].negative,'negative character');assert.deepEqual(info.parameters.unknown,{keep:true});assert.equal(info.metadata.Software,'NovelAI');
 assert.equal(generationInfo({text:[]}).model,'未记录');assert.equal(generationInfo({text:[]},{request:{prompt:'saved',negative_prompt:'saved negative'}}).negative,'saved negative');
});
test('official stealth alpha metadata is decoded without file chunk output',async()=>{
 const value={Source:'NovelAI Diffusion V5 657484A5',Comment:JSON.stringify({prompt:'隐藏提示词 🌸',uc:'negative',seed:42})},packed=gzipSync(Buffer.from(JSON.stringify(value))),length=Buffer.alloc(4);length.writeUInt32BE(packed.length*8);
 const payload=Buffer.concat([Buffer.from('stealth_pngcomp'),length,packed]),width=256,height=256,data=new Uint8Array(width*height*4).fill(255);
 for(let offset=0;offset<payload.length*8;offset++){const bit=(payload[Math.floor(offset/8)]>>(7-offset%8))&1;data[4*((offset%height)*width+Math.floor(offset/height))+3]=254|bit;}
 const decoded=await readStealthMetadata({data,width,height});assert.deepEqual(decoded,value);
 const info=generationInfo({text:Object.entries(decoded).map(([keyword,text])=>{let parameters;try{parameters=JSON.parse(text);}catch{}return {keyword,text,parameters};})});
 assert.equal(info.model,'V5 Full');assert.equal(info.prompt,'隐藏提示词 🌸');assert.equal(info.parameters.seed,42);
 assert.equal(await readStealthMetadata({data:new Uint8Array(width*height*4),width,height}),null);
});
