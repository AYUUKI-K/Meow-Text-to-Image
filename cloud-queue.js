import {randomId,sha256} from './browser-crypto.js';
import {queueJSON} from './queue-network.js';
import {stageError} from './request-errors.js';
export function validateQueueURL(value) {
    const url=new URL(value);
    if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)))throw new Error('队列地址需要 HTTPS 喵');
    if(url.username||url.password||url.search||url.hash)throw new Error('请填写队列服务的根地址');
    return url.href.replace(/\/$/,'');
}
export async function fingerprintKey(key) {
    return sha256(key.trim());
}
// Keep the next waiter responsive; distant jobs need fewer position queries.
export const queuePollMs=position=>Math.min(15000,5000+Math.max(0,position-1)*2500);
export async function runWithQueue({url,keyHash,greeting='',generationTimeoutMs,generate,onStatus=()=>{},canContinue=()=>true,onReleaseError=()=>{},fetchImpl=fetch,requestJSON=queueJSON,pollMs,heartbeatMs=60000,retryDelays=[1000,3000,5000],sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),now=Date.now}) {
    url=validateQueueURL(url);
    if(!/^[a-f0-9]{64}$/i.test(keyHash||''))throw new Error('请在本插件重新保存一次 NAI Key，用于自动识别队列；Key 不会发送给排队服务。');
    const cancelProof=await sha256(randomId()),cancelHash=await sha256(cancelProof);
    const identity={key_hash:keyHash,user_id:randomId(),task_id:randomId()};
    const call=async(path,extra={})=>{
        const cleanup=['/complete','/leave-queue'].includes(path),retries=retryDelays.length;
        // Queue operations are idempotent for this identity. Retrying them never
        // resubmits an image request, including when the join response was lost.
        for(let attempt=0;;attempt++){
            if(path==='/my-turn'&&finished)throw Error('队列任务已结束');
            if(!cleanup&&!canContinue())throw Error('原消息已变化，已退出待生成队列');
            try{
                return await requestJSON(url+path,{method:'POST',body:{...identity,...extra}},{fetchImpl,timeoutMs:cleanup?5000:15000});
            }catch(error){
                const transient=[429,500,502,503,504].includes(error.status)||['TypeError','TimeoutError','AbortError'].includes(error.name);
                if(!transient||attempt>=retries)throw error;
                if(!cleanup)onStatus(`队列连接重试 · ${attempt+1}/${retries}`);
                await sleep(Math.max(cleanup?Math.min(retryDelays[attempt],1000):retryDelays[attempt],Math.min(error.retryAfterMs||0,cleanup?5000:120000)));
            }
        }
    };
    let lockToken,heartbeat,renewing=false,uncertain=false,generationStarted=false,joined=false,joinAttempted=false,recoveries=0,finished=false,stateCheckedAt=now(),verifiedAt=0;
    const started=now();
    try {
        joinAttempted=true;
        let state=await call('/join-queue',{greeting:greeting.slice(0,15),cancel_hash:cancelHash});
        joined=true;
        while(true) {
            if(typeof state.your_turn!=='boolean'||(state.your_turn?(typeof state.lock_token!=='string'||!state.lock_token||state.lock_token.length>200):(!Number.isInteger(state.position)||state.position<1)))throw stageError('queue',Error('队列状态无效，请检查队列地址或稍后重试'));
            if(state.your_turn===true&&state.lock_token){lockToken=state.lock_token;verifiedAt=stateCheckedAt;}
            if(!canContinue())throw new Error('原消息已变化，已退出待生成队列');
            if(lockToken)break;
            const elapsed=Math.max(0,Math.floor((now()-started)/1000));
            onStatus(`云端排队 · 前面 ${state.position} 张 · 已等 ${elapsed<60?elapsed+'秒':Math.floor(elapsed/60)+'分'+elapsed%60+'秒'}`);
            await sleep(pollMs??queuePollMs(state.position));
            try{stateCheckedAt=now();state=await call('/my-turn');}
            catch(error){
                // Backgrounded phones may lose their waiting lease. No image
                // has been sent yet, so an idempotent rejoin is safe and bounded.
                if(error.status!==400||!/过期/.test(error.detail||'')||recoveries>=3)throw error;
                onStatus(`排号已过期，重新入队 · ${++recoveries}/3`);stateCheckedAt=now();state=await call('/join-queue',{cancel_hash:cancelHash});
            }
        }
        onStatus('正在生图');
        heartbeat=setInterval(async()=>{
            if(renewing)return;renewing=true;
            try {if(!finished)await call('/my-turn',{lock_token:lockToken});}catch {if(!finished)onStatus('排队连接暂时中断');}finally{renewing=false;}
        },heartbeatMs);
        const beforeSend=async()=>{
            if(!canContinue())throw Error('原消息已变化，已退出待生成队列');
            if(generationTimeoutMs!==undefined||now()-verifiedAt>15000){
                const checkedAt=now(),current=await call('/my-turn',{lock_token:lockToken,...(generationTimeoutMs!==undefined?{generation_timeout_ms:generationTimeoutMs}:{})});
                if(now()-checkedAt>15000||current.your_turn!==true||current.lock_token!==lockToken)throw stageError('queue',Error('排队权限已失效，未发送新的生图请求，请重新生成'));
                verifiedAt=checkedAt;
                if(generationTimeoutMs!==undefined&&Number.isFinite(current.generation_remaining_ms)){
                    const remaining=Math.min(generationTimeoutMs,current.generation_remaining_ms-(now()-checkedAt));
                    if(remaining<=0)throw stageError('queue',Error('排队权限已失效，未发送新的生图请求，请重新生成'));
                    return remaining;
                }
            }
        };
        try{generationStarted=true;return await generate({beforeSend});}
        catch(error){uncertain=!error.localGenerationTimeout&&(!error.source||['nai-generation','tavern-generation','nai-encode'].includes(error.source))&&(['AbortError','TimeoutError','TypeError'].includes(error.name)||[408,504].includes(error.status));throw error;}
    }catch(error){
        if(error.source==='queue'&&!generationStarted&&!error.message.includes('未发送新的生图请求'))error.message+='\n尚未取得排队权限，未发送新的生图请求。请检查当前浏览器能否访问队列地址。';
        throw error;
    }finally {
        clearInterval(heartbeat);
        finished=true;
        if((joined||joinAttempted)&&!uncertain){try {await call(lockToken?'/complete':'/leave-queue',lockToken?{lock_token:lockToken}:{cancel_proof:cancelProof});}catch(error){onReleaseError(error);}}
    }
}
