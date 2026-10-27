import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {readImageMetadata} from '../image-metadata.js';

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
