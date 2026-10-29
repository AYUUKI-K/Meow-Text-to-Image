import {elapsedClock} from './generation-lifecycle.js';
export const RETRY_INTERVAL_MS=10000;
export const MAX_GENERATION_RETRIES=3;
export const MAX_RETRY_AFTER_MS=120000;
export const isRetryableGeneration=error=>error?.retryableGeneration===true&&['tavern-generation','nai-generation'].includes(error.source)&&[409,423,429].includes(error.status)&&!['AbortError','TimeoutError','TypeError'].includes(error.name);
export function generationRetryDelay(error){
    const delay=Number(error.retryAfterMs)||0;
    // Never shorten a longer upstream requirement. Stop instead of capping it.
    if(delay>MAX_RETRY_AFTER_MS){error.message+='\n服务要求等待超过 120 秒，已停止自动重试，请稍后手动生成。';throw error;}
    return Math.max(RETRY_INTERVAL_MS,delay);
}
// Only explicit, completed image refusals qualify. Control RPC retries are separate.
export async function retryGeneration({run,enabled=false,canContinue=()=>true,onStatus=()=>{},onRetry=async()=>{},checkRetry=()=>{},sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),now=elapsedClock()}){
    const check=()=>{if(!canContinue())throw Error('原消息已变化，已退出待生成队列');checkRetry();};
    for(let attempt=0;;attempt++){
        check();
        try{return await run(attempt);}
        catch(error){
            if(!enabled||!isRetryableGeneration(error)||attempt>=MAX_GENERATION_RETRIES)throw error;
            const delayMs=generationRetryDelay(error),started=now();
            await onRetry(error,{attempt,nextAttempt:attempt+1,delayMs});check();
            let waited=0;
            while(Math.max(waited,now()-started)<delayMs){
                check();
                const remaining=delayMs-Math.max(waited,now()-started);
                onStatus(`等待重试 · ${Math.ceil(remaining/1000)} 秒 · 重试 ${attempt+1}/${MAX_GENERATION_RETRIES}`,error);
                const step=Math.min(1000,remaining);await sleep(step);waited+=step;
            }
            check();
            if(now()-started>=delayMs+10000)throw Error('重试等待已过期，未发送新的生图请求，请重新生成');
        }
    }
}
