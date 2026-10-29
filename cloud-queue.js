import {queueCapabilities,queueProtocol} from './queue-protocol.js';
import {elapsedClock} from './generation-lifecycle.js';
import {randomId,sha256} from './browser-crypto.js';
import {queueJSON} from './queue-network.js';
import {stageError} from './request-errors.js';
import {retryGeneration,isRetryableGeneration} from './generation-retry.js';
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
export async function runWithQueue({url,keyHash,greeting='',generationTimeoutMs,generate,twoPhase=true,autoRetry=false,onStatus=()=>{},canContinue=()=>true,onReleaseError=()=>{},fetchImpl=fetch,requestJSON=queueJSON,pollMs,heartbeatMs=60000,retryDelays=[1000,3000,5000],sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),now=elapsedClock()}) {
    url=validateQueueURL(url);
    if(!/^[a-f0-9]{64}$/i.test(keyHash||''))throw new Error('请在本插件重新保存一次 NAI Key，用于自动识别队列；Key 不会发送给排队服务。');
    const cancelProof=await sha256(randomId()),cancelHash=await sha256(cancelProof);
    const identity={key_hash:keyHash,user_id:randomId(),task_id:randomId(),...(twoPhase?{protocol:queueProtocol,retry_protocol:1}:{})};
    const call=async(path,extra={})=>{
        const cleanup=['/complete','/leave-queue','/finish'].includes(path),retries=retryDelays.length;
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
    let lockToken,heartbeat,renewing=false,uncertain=false,preparationStarted=false,naiSendAttempted=false,responseReceived=false,released=false,sendBudget=15000,beginConfirmed=false,joined=false,joinAttempted=false,recoveries=0,finished=false,stateCheckedAt=now(),verifiedAt=0;
    const started=now();let attemptNo=0,attemptId,retryDeadline=Infinity,explicitlyRejected=false;
    const attemptFields=()=>twoPhase?{attempt_no:attemptNo,...(attemptId?{attempt_id:attemptId}:{})}:{};
    try {
        if(twoPhase){
            const service=await requestJSON(url+'/ping',{}, {fetchImpl,timeoutMs:15000});
            if(service.maintenance===true)throw stageError('queue',Error('队列维护中，暂不接受新任务；未发送新的生图请求'));
            if(service.ready!==true||!queueCapabilities.every(cap=>service.capabilities?.includes(cap)))throw stageError('queue',Error('队列服务尚未支持两阶段及原位重试安全许可，请先更新 Worker；未发送新的生图请求'));
        }
        joinAttempted=true;
        let state=await call('/join-queue',{greeting:greeting.slice(0,15),cancel_hash:cancelHash,...(twoPhase?{protocol:queueProtocol}:{})});
        joined=true;
        while(true) {
            if(typeof state.your_turn!=='boolean'||(state.your_turn?(typeof state.lock_token!=='string'||!state.lock_token||state.lock_token.length>200):(!Number.isInteger(state.position)||state.position<1)))throw stageError('queue',Error('队列状态无效，请检查队列地址或稍后重试'));
            if(state.your_turn===true&&state.lock_token){lockToken=state.lock_token;verifiedAt=stateCheckedAt;}
            if(!canContinue())throw new Error('原消息已变化，已退出待生成队列');
            if(lockToken)break;
            const elapsed=Math.max(0,Math.floor((now()-started)/1000));
            if(state.status==='cooldown')onStatus(`上游限流冷却中 · ${Math.ceil(state.cooldown_remaining_ms/1000)} 秒 · 本任务已等 ${elapsed}秒`);
            else onStatus(`云端排队 · 前面 ${state.position} 张 · 本任务已等 ${elapsed<60?elapsed+'秒':Math.floor(elapsed/60)+'分'+elapsed%60+'秒'}`);
            await sleep(pollMs??queuePollMs(state.position));
            try{stateCheckedAt=now();state=await call('/my-turn');}
            catch(error){
                // New tasks stop when their identity expires. Retain the old
                // pre-send recovery only for the explicit legacy client path.
                if(twoPhase||error.status!==400||!/过期/.test(error.detail||'')||recoveries>=3)throw error;
                onStatus(`排号已过期，重新入队 · ${++recoveries}/3`);stateCheckedAt=now();state=await call('/join-queue',{cancel_hash:cancelHash,...(twoPhase?{protocol:queueProtocol}:{})});
            }
        }
        onStatus('准备提交');
        heartbeat=setInterval(async()=>{
            if(renewing)return;renewing=true;
            try {if(!finished)await call('/my-turn',{lock_token:lockToken});}catch {if(!finished)onStatus('排队连接暂时中断');}finally{renewing=false;}
        },heartbeatMs);
        const beforeSend=async()=>{
            if(beginConfirmed||naiSendAttempted)throw stageError('queue',Error('该任务已授权，不得重复发送'));
            if(!canContinue())throw Error('原消息已变化，已退出待生成队列');
            if(twoPhase){
                if(now()>=retryDeadline)throw stageError('queue',Error('重试许可已过期，未发送新的生图请求'));
                const checkedAt=now(),current=await call('/begin-generation',{lock_token:lockToken,attempt_no:attemptNo,generation_timeout_ms:generationTimeoutMs??30000});
                beginConfirmed=true;verifiedAt=checkedAt;
                if(current.your_turn!==true||current.lock_token!==lockToken||current.phase!=='possibly-sent'||current.retry_protocol!==1||current.attempt_no!==attemptNo||typeof current.attempt_id!=='string'||!current.attempt_id||!Number.isFinite(current.send_window_ms)||!Number.isFinite(current.generation_remaining_ms))throw stageError('queue',Error('发送许可无效，未发送新的生图请求'));
                attemptId=current.attempt_id;
                sendBudget=Math.min(current.send_window_ms,current.generation_remaining_ms);
                if(now()-verifiedAt<0||now()-verifiedAt>=sendBudget)throw stageError('queue',Error('发送窗口已过期，未发送新的生图请求，请重新生成'));
                return Math.min(generationTimeoutMs??30000,current.generation_remaining_ms-(now()-verifiedAt));
            }
            if(generationTimeoutMs!==undefined||now()-verifiedAt>15000){
                const checkedAt=now(),current=await call('/my-turn',{lock_token:lockToken,...(generationTimeoutMs!==undefined?{generation_timeout_ms:generationTimeoutMs}:{})});
                if(now()-checkedAt>15000||current.your_turn!==true||current.lock_token!==lockToken)throw stageError('queue',Error('排队权限已失效，未发送新的生图请求，请重新生成'));
                verifiedAt=checkedAt;
                if(generationTimeoutMs!==undefined&&Number.isFinite(current.generation_remaining_ms)){
                    const remaining=Math.min(generationTimeoutMs,current.generation_remaining_ms-(now()-checkedAt));
                    sendBudget=Math.min(15000,current.generation_remaining_ms);
                    if(remaining<=0)throw stageError('queue',Error('排队权限已失效，未发送新的生图请求，请重新生成'));
                    return remaining;
                }
            }
        };
        const assertSend=()=>{
            onStatus('正在生成');
            if(naiSendAttempted||finished||!canContinue()||twoPhase&&!beginConfirmed||now()-verifiedAt<0||now()-verifiedAt>=sendBudget)throw stageError('queue',Error('排队权限已失效，未发送新的生图请求，请重新生成'));
            explicitlyRejected=false;naiSendAttempted=true;
        };
        const onResponse=async()=>{
            responseReceived=true;clearInterval(heartbeat);finished=true;
            if(!released){released=true;try{await call(twoPhase?'/finish':'/complete',{lock_token:lockToken,...attemptFields(),...(twoPhase?{outcome:'success'}:{})});}catch(error){onReleaseError(error);}}
        };
        try{
            preparationStarted=true;
            return await retryGeneration({enabled:twoPhase&&autoRetry,canContinue,onStatus,sleep,now,
                checkRetry:()=>{if(now()>=retryDeadline)throw stageError('queue',Error('重试许可已过期，未发送新的生图请求'));},
                onRetry:async(error,{delayMs})=>{
                    if(!naiSendAttempted||responseReceived||!isRetryableGeneration(error))throw error;
                    explicitlyRejected=true;
                    const checkedAt=now(),current=await call('/retry-generation',{lock_token:lockToken,...attemptFields(),rejection_status:error.status,retry_after_ms:Math.ceil(delayMs)});
                    if(current.your_turn!==true||current.lock_token!==lockToken||current.phase!=='retry-wait'||current.attempt_no!==attemptNo||current.attempt_id!==attemptId||!Number.isFinite(current.retry_remaining_ms)||!Number.isFinite(current.hard_remaining_ms))throw stageError('queue',Error('重试许可无效，未发送新的生图请求'));
                    retryDeadline=checkedAt+current.hard_remaining_ms;
                    // No POST is active now. A cancellation can immediately finish this refusal.
                    naiSendAttempted=false;
                },
                run:async attempt=>{
                    if(attempt>0){
                        // Confirm server eligibility without adding another ten-second delay.
                        const checkedAt=now(),current=await call('/my-turn',{lock_token:lockToken});
                        if(current.lock_token!==lockToken||current.phase!=='retry-wait'||current.attempt_no!==attemptNo||current.attempt_id!==attemptId||!Number.isFinite(current.retry_remaining_ms)||!Number.isFinite(current.hard_remaining_ms))throw stageError('queue',Error('重试许可已失效，未发送新的生图请求'));
                        retryDeadline=Math.min(retryDeadline,checkedAt+current.hard_remaining_ms);
                        if(current.retry_remaining_ms>0)await sleep(current.retry_remaining_ms);
                        if(!canContinue()||now()>=retryDeadline)throw stageError('queue',Error('重试许可已过期，未发送新的生图请求'));
                        attemptNo=attempt;attemptId=undefined;beginConfirmed=false;naiSendAttempted=false;responseReceived=false;
                    }
                    return generate({beforeSend,assertSend,onResponse},attempt);
                }});
        }
        catch(error){
            explicitlyRejected=explicitlyRejected||naiSendAttempted&&!responseReceived&&[400,401,402,403,409,422,423,429].includes(error.status)&&['nai-generation','tavern-generation','nai-encode'].includes(error.source);
            uncertain=twoPhase?naiSendAttempted&&!responseReceived&&!explicitlyRejected:!responseReceived&&!error.localGenerationTimeout&&(!error.source||['nai-generation','tavern-generation','nai-encode'].includes(error.source))&&(['AbortError','TimeoutError','TypeError'].includes(error.name)||[408,504].includes(error.status));throw error;
        }
    }catch(error){
        if(error.source==='queue'&&!preparationStarted&&!error.message.includes('未发送新的生图请求'))error.message+='\n尚未取得排队权限，未发送新的生图请求。请检查当前浏览器能否访问队列地址。';
        throw error;
    }finally {
        clearInterval(heartbeat);
        finished=true;
        if((joined||joinAttempted)&&!released){
            try{
                if(twoPhase&&beginConfirmed){
                    const outcome=responseReceived?'success':naiSendAttempted?(uncertain?'uncertain':'rejected'):'not-sent';
                    if(outcome==='uncertain')onStatus('本地已停止等待，云端保护中');
                    const cleanup=call('/finish',{lock_token:lockToken,...attemptFields(),outcome});
                    // Show the completed refusal immediately, even if finish's
                    // acknowledgement is offline. Cleanup still uses bounded
                    // RPC retries; the durable deadline independently recovers.
                    if(explicitlyRejected||!naiSendAttempted&&retryDeadline<Infinity)void cleanup.catch(error=>{try{onReleaseError(error);}catch{}});
                    else await cleanup;
                }else if(!uncertain)await call(lockToken?'/complete':'/leave-queue',lockToken?{lock_token:lockToken}:{cancel_proof:cancelProof});
            }catch(error){onReleaseError(error);}
        }
    }
}
