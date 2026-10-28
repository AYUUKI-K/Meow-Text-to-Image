import {stageError} from './request-errors.js';
export function generationTimeoutSeconds(value){const number=Number(value);return Number.isFinite(number)&&number>=5&&number<=180?Math.round(number):30;}
// Includes response-body consumption even when a host bridge ignores AbortSignal.
export async function withGenerationTimeout(run,{timeoutMs=30000,source='nai-generation'}={}){
    const controller=new AbortController();let timer;
    try{return await Promise.race([Promise.resolve().then(()=>run(controller.signal)),new Promise((_,reject)=>{timer=setTimeout(()=>{
        const error=stageError(source,Object.assign(Error('timeout'),{name:'TimeoutError'}));
        error.message=`单张生图超过 ${timeoutMs/1000} 秒，已中止本地等待；NAI 可能仍在处理，不会自动重试。`;
        reject(error);controller.abort();
    },timeoutMs);})]);}finally{clearTimeout(timer);}
}
