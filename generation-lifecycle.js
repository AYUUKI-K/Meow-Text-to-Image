import {withGenerationTimeout} from './generation-timeout.js';

// A wall clock can move backwards; some browser monotonic clocks stop during
// OS sleep. Use both elapsed clocks, never a remote device's absolute time.
export function elapsedClock({wall=Date.now,monotonic=()=>globalThis.performance?.now?.()??wall()}={}){
    const wallStart=wall(),monoStart=monotonic();let previous=0;
    return ()=>previous=Math.max(previous,wall()-wallStart,monotonic()-monoStart);
}

// I/O may ignore cancellation. Only a prepared closure escapes this budget;
// late preparation never owns a queue slot and cannot submit an NAI request.
export async function prepareGeneration(run,{timeoutMs=20000,canContinue=()=>true,now=elapsedClock(),signal}={}){
    const controller=new AbortController(),started=now();let timer;
    const check=()=>{
        if(controller.signal.aborted||now()-started>=timeoutMs)throw Error('生图准备超时或已取消，未发送 NAI 请求，请重新操作');
        if(!canContinue())throw Error('原消息已变化，已退出待生成队列');
    };
    let cancel;
    const cancelled=new Promise((_,reject)=>{cancel=()=>{controller.abort();reject(Error('生图准备超时或已取消，未发送 NAI 请求，请重新操作'));};});
    signal?.addEventListener('abort',cancel,{once:true});
    try{
        if(signal?.aborted)cancel();
        check();timer=setTimeout(cancel,timeoutMs);
        const result=await Promise.race([Promise.resolve().then(()=>run(controller.signal)),cancelled]);check();return result;
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}

// send() must invoke fetch synchronously before its first await. All key reads,
// serialization and host headers belong to prepare, not to this boundary.
export async function sendPrepared(prepared,{beforeSend,assertSend,onResponse,canContinue=()=>true,timeoutMs=30000}={}){
    const remaining=await beforeSend?.();
    const result=await withGenerationTimeout(signal=>{
        if(!canContinue())throw Error('原消息已变化，已退出待生成队列');
        assertSend?.();
        return prepared.send(signal);
    },{timeoutMs:remaining??timeoutMs,source:prepared.source});
    await onResponse?.();
    return prepared.postprocess?prepared.postprocess(result):result;
}
