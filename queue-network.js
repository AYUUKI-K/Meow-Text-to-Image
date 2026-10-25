import {checkedFetch,stageError} from './request-errors.js';

export async function queueJSON(url,{method='GET',body}={}, {fetchImpl=fetch,timeoutMs=15000}={}){
    const controller=new AbortController();let timer;
    const pending=(async()=>{
        const options={method,credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal};
        // JSON bytes with a CORS-safelisted media type avoid fragile OPTIONS requests.
        if(body!==undefined){options.headers={'Content-Type':'text/plain;charset=UTF-8'};options.body=JSON.stringify(body);}
        const response=await checkedFetch('queue',url,options,{fetchImpl});
        let data;try{data=await response.json();}catch{throw stageError('queue',Error('队列返回内容无效，请检查队列地址或代理'));}
        if(!data||typeof data!=='object'||Array.isArray(data))throw stageError('queue',Error('队列返回内容无效，请检查队列地址或代理'));
        return data;
    })();
    try{return await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>{
        reject(stageError('queue',Object.assign(Error('timeout'),{name:'TimeoutError'})));controller.abort();
    },timeoutMs);})]);}finally{clearTimeout(timer);}
}
