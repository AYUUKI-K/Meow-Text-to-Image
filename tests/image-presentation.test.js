import test from 'node:test';
import assert from 'node:assert/strict';
import {createImagePresentation} from '../src/images/image-presentation.js';

const png = new Blob(['original PNG + prompt metadata'], {type:'image/png'});
const jpg = new Blob([Uint8Array.of(255,216,255,217)], {type:'image/jpeg'});
const source = {url:'/old.png', name:'old.png'};

test('display binds the original URL and performs no export work', () => {
    const presentation=createImagePresentation({fetchImage:()=>assert.fail('export fetch during display')});
    const element={dataset:{}};
    presentation.bind(element,source.url,{lazy:true});
    assert.equal(element.src,source.url);
    assert.equal(element.dataset.miaoOriginalUrl,source.url);
    assert.equal(element.loading,'lazy');
    presentation.bind(element,'/next.png');
    assert.equal(element.src,'/next.png');
});

test('JPG export converts the original on demand while a failed export leaves it visible', async () => {
    let failure=true, reads=0;
    const presentation=createImagePresentation({
        fetchImage:async url=>{
            assert.equal(url,source.url);reads++;
            return new Response(png,{headers:{'Content-Type':'image/png; charset=utf-8'}});
        },
        convert:async (blob,name,format)=>{
            assert.equal(blob.type,'image/png');
            if(format==='png')return {blob,name};
            if(failure)throw Error('fixture encoding failure');
            return {blob:jpg,name:'old.jpg'};
        },
    });
    const element={dataset:{}};
    presentation.bind(element,source.url);
    assert.equal(reads,0);
    await assert.rejects(presentation.file(source,'jpg'),/fixture encoding failure/);
    assert.equal(element.src,source.url);
    failure=false;
    assert.deepEqual(await presentation.file(source,'jpg'),{url:source.url,blob:jpg,name:'old.jpg'});
    const original=await presentation.file(source,'png');
    assert.equal(original.name,'old.png');
    assert.equal(await original.blob.text(),await png.text());
    assert.equal(reads,3);
    assert.equal(element.src,source.url);
});

test('older generated JPEG companions can still be removed with their originals', async () => {
    const presentation=createImagePresentation({base:()=> 'https://tavern.test/'});
    assert.match(await presentation.legacyJPEGPath(source.url),/^user\/images\/miao-nai-jpg\/jpg-[a-f0-9]{64}\.jpg$/);
});
