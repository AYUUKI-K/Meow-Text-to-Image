import test from 'node:test';
import assert from 'node:assert/strict';
import {exportPreview} from '../src/prompts/prompt-preview-transfer.js';

test('export reads only a managed local example and never follows imported remote image links',async()=>{
    let calls=0;const options={origin:'http://localhost:8000',fetchImpl:async()=>{calls++;throw Error('must not fetch');}};
    assert.equal(await exportPreview(undefined,options),undefined);
    for(const url of ['https://remote.example/user/images/miao-nai/sample-1792737847709.png','data:image/png;base64,AAAA','/user/files/key.json','/user/images/miao-nai/other.png'])await assert.rejects(exportPreview(url,options));
    assert.equal(calls,0);
    const local='/user/images/miao-nai/sample-1792737847709.png';
    await assert.rejects(exportPreview(local,{...options,fetchImpl:async url=>{assert.equal(url,local);return new Response('missing',{status:404});}}),/读取例图/);
    await assert.rejects(exportPreview(local,{...options,fetchImpl:async()=>new Response('<svg/>',{headers:{'Content-Type':'image/svg+xml'}})}),/例图格式/);
});
