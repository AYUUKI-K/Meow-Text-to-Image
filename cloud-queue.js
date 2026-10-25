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
export async function runWithQueue({url,keyHash,greeting='',generate,onStatus=()=>{},canContinue=()=>true,onReleaseError=()=>{},fetchImpl=fetch,pollMs,heartbeatMs=60000,retryDelays=[1000,3000,5000],sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}) {
    url=validateQueueURL(url);
    if(!/^[a-f0-9]{64}$/i.test(keyHash||''))throw new Error('请在本插件重新保存一次 NAI Key，用于自动识别队列；Key 不会发送给排队服务。');
    const identity={key_hash:keyHash,user_id:randomId(),task_id:randomId()};
    const call=async(path,extra={})=>{
        const cleanup=['/complete','/leave-queue'].includes(path),retries=cleanup?Math.min(1,retryDelays.length):retryDelays.length;
        // Queue operations are idempotent for this identity. Retrying them never
        // resubmits an image request, including when the join response was lost.
        for(let attempt=0;;attempt++){
            if(!cleanup&&!canContinue())throw Error('原消息已变化，已退出待生成队列');
            try{
                return await queueJSON(url+path,{method:'POST',body:{...identity,...extra}},{fetchImpl,timeoutMs:cleanup?5000:15000});
            }catch(error){
                const transient=[429,500,502,503,504].includes(error.status)||['TypeError','TimeoutError','AbortError'].includes(error.name);
                if(!transient||attempt>=retries)throw error;
                onStatus(`队列连接重试 · ${attempt+1}/${retries}`);
                await sleep(Math.max(retryDelays[attempt],Math.min(error.retryAfterMs||0,120000)));
            }
        }
    };
    let lockToken,heartbeat,renewing=false,uncertain=false,generationStarted=false,joined=false;
    try {
        let state=await call('/join-queue',{greeting:greeting.slice(0,15)});
        joined=true;
        while(true) {
            if(typeof state.your_turn!=='boolean'||(state.your_turn?(typeof state.lock_token!=='string'||!state.lock_token||state.lock_token.length>200):(!Number.isInteger(state.position)||state.position<1)))throw stageError('queue',Error('队列状态无效，请检查队列地址或稍后重试'));
            if(state.your_turn===true&&state.lock_token)lockToken=state.lock_token;
            if(!canContinue())throw new Error('原消息已变化，已退出待生成队列');
            if(lockToken)break;
            onStatus(`云端排队 · 前面 ${state.position||1} 张`);
            await sleep(pollMs??queuePollMs(state.position));state=await call('/my-turn');
        }
        onStatus('正在生图');
        heartbeat=setInterval(async()=>{
            if(renewing)return;renewing=true;
            try {await call('/my-turn',{lock_token:lockToken});}catch {onStatus('排队连接暂时中断');}finally{renewing=false;}
        },heartbeatMs);
        try{generationStarted=true;return await generate();}
        catch(error){uncertain=['AbortError','TimeoutError','TypeError'].includes(error.name)||[408,504].includes(error.status);throw error;}
    }catch(error){
        if(error.source==='queue'&&!generationStarted)error.message+='\n尚未取得排队权限，未发送新的生图请求。请检查当前浏览器能否访问队列地址。';
        throw error;
    }finally {
        clearInterval(heartbeat);
        if(joined&&!uncertain){try {await call(lockToken?'/complete':'/leave-queue',lockToken?{lock_token:lockToken}:{});}catch(error){onReleaseError(error);}}
    }
}
