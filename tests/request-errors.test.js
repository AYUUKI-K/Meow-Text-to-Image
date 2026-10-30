import test from 'node:test';
import assert from 'node:assert/strict';
import {httpRequestError,checkedFetch,inStage,errorTitle} from '../src/platform/request-errors.js';
import {retryGeneration} from '../src/generation/generation-retry.js';
test('opaque tavern 500 never guesses key occupancy and tells users where details exist',()=>{
    for(const body of ['', 'Internal Server Error','<html><body>gateway secret</body></html>']){
        const error=httpRequestError({source:'tavern-generation',status:500,body});
        assert.match(error.message,/酒馆生图接口.*终端日志.*HTTP 500/);assert.doesNotMatch(error.message,/占线|并发|gateway secret/);assert.equal(error.retryableGeneration,false);
    }
    assert.match(httpRequestError({source:'nai-generation',status:500}).message,/NovelAI.*内部错误/);
});
test('explicit upstream reasons are classified, extracted from nested JSON and preserve status',()=>{
    for(const [status,body,code] of [[401,'Unauthorized','auth'],[403,'Forbidden','permission'],[402,'','balance'],[422,'Invalid dimensions','parameters'],[429,'Too Many Requests','rate-limit'],[500,'Concurrent generation request','busy'],[500,'Not enough Anlas','balance']]){
        const e=httpRequestError({source:'nai-generation',status,body:JSON.stringify({error:{message:body}})});assert.equal(e.status,status);assert.equal(e.code,code);
    }
    assert.equal(httpRequestError({source:'nai-generation',status:500,body:'Not enough Anlas'}).retryableGeneration,false);
});
test('known keys and bearer tokens are redacted before displaying service details',()=>{
    const e=httpRequestError({source:'nai-generation',status:400,body:JSON.stringify({message:'Bad test-secret Authorization: Bearer private-token api_key=hidden-key'}),secrets:['test-secret']});
    assert.doesNotMatch(e.message,/test-secret|private-token|hidden-key/);assert.match(e.message,/已隐藏/);
});
test('network and timeout errors retain their names so queue and retry safety still work',async()=>{
    for(const name of ['TypeError','TimeoutError','AbortError'])await assert.rejects(checkedFetch('nai-generation','/fixture',{}, {fetchImpl:async()=>{throw Object.assign(Error('raw'),{name});}}),e=>e.name===name&&e.source==='nai-generation'&&e.message.includes('不确定'));
});
test('save and chat errors explicitly say generation already finished',async()=>{
    for(const source of ['image-save','chat-save'])await assert.rejects(inStage(source,async()=>{throw Error('500');}),e=>e.message.includes('图片已生成')&&errorTitle(e).includes('保存失败')&&e.status===undefined);
});
test('queue 500 and known authentication/credit errors do not trigger billable retry',async()=>{
    for(const input of [{source:'queue',status:500},{source:'tavern-generation',status:500,body:'Not enough Anlas'},{source:'nai-generation',status:500,body:'Invalid access token'},{source:'nai-generation',status:500,body:'Unauthorized'}]){
        let calls=0;await assert.rejects(retryGeneration({enabled:true,run:async()=>{calls++;throw httpRequestError(input);},sleep:async()=>{}}));assert.equal(calls,1);
    }
});
test('download, deletion and translation errors are labeled with the failing service',()=>{
    assert.match(httpRequestError({source:'image-delete',status:404}).message,/图片删除.*图片已不存在/);
    assert.match(httpRequestError({source:'translation-google',status:500}).message,/Google 翻译.*HTTP 500/);
    assert.match(httpRequestError({source:'queue',status:503}).message,/云端队列.*HTTP 503/);
});
test('tavern authentication failures do not automatically blame the NAI key',()=>{
    const error=httpRequestError({source:'tavern-generation',status:401});assert.match(error.message,/酒馆登录状态/);assert.equal(error.retryableGeneration,false);
});

test('HTTP 408 and 504 report an uncertain result instead of suggesting an ordinary busy retry',()=>{
    for(const source of ['tavern-generation','nai-generation','nai-encode'])for(const status of [408,504]){
        const error=httpRequestError({source,status});assert.equal(error.code,'timeout');assert.equal(error.retryableGeneration,false);assert.match(error.message,/结果尚不确定/);assert.match(error.message,new RegExp('HTTP '+status));
    }
});

test('409/423 status alone does not invent concurrency; explicit descriptions are preserved without retry',()=>{
 for(const status of [409,423]){
  for(const body of ['',status===409?'Conflict':'Locked']){
   const error=httpRequestError({source:'nai-generation',status,body});
   assert.equal(error.code,'http');assert.equal(error.retryableGeneration,false);assert.doesNotMatch(error.message,/并发|占线/);
  }
  const error=httpRequestError({source:'nai-generation',status,body:JSON.stringify({error:{message:'Concurrent generation request'}})});
  assert.equal(error.code,'busy');assert.equal(error.detail,'Concurrent generation request');assert.equal(error.retryableGeneration,false);
 }
});
