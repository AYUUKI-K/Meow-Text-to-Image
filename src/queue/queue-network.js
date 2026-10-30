import {checkedFetch,stageError,httpRequestError} from '../platform/request-errors.js';
import {queueConnectionError} from './queue-diagnostics.js';
import {sha256} from '../platform/browser-crypto.js';
const responseStatuses=new WeakMap();
const invalidResponse=(message,response)=>Object.assign(stageError('queue',Error(message)),{code:'invalid-queue-response',status:responseStatuses.get(response)});

async function readJSON(url,options,{fetchImpl=fetch,timeoutMs=15000}={}){
    const controller=new AbortController();let timer,receivedStatus;
    const pending=(async()=>{
        const response=await checkedFetch('queue',url,{...options,signal:controller.signal},{fetchImpl});
        receivedStatus=response.status;
        let data;try{data=await response.json();}catch(error){const type=['SyntaxError','TypeError','TimeoutError','AbortError'].includes(error?.name)?error.name:'Error';throw Object.assign(invalidResponse('队列返回内容无效，请检查队列地址或代理（'+type+'）'),{status:response.status});}
        if(!data||typeof data!=='object'||Array.isArray(data))throw Object.assign(invalidResponse('队列返回内容无效，请检查队列地址或代理'),{status:response.status});
        responseStatuses.set(data,response.status);
        return data;
    })();
    try{return await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>{
        const error=stageError('queue',Object.assign(Error('timeout'),{name:'TimeoutError'}));
        if(receivedStatus){error.status=receivedStatus;error.message=error.message.replace('未取得 HTTP 响应',`HTTP ${receivedStatus}，响应正文读取超时`);}
        reject(error);controller.abort();
    },timeoutMs);})]);}finally{clearTimeout(timer);}
}
export function queueJSON(url,{method='GET',body}={}, options={}){
    const request={method,credentials:'omit',referrerPolicy:'no-referrer'};
    // JSON bytes with a CORS-safelisted media type avoid fragile OPTIONS requests.
    if(body!==undefined){request.headers={'Content-Type':'text/plain;charset=UTF-8'};request.body=JSON.stringify(body);}
    return readJSON(url,request,options);
}
// Ordinary ST already has /api/search/visit. It fetches a remote HTTPS resource
// using server-side network settings, without forwarding the user's credentials.
export function createQueueTransport({getHeaders=()=>({'Content-Type':'application/json'}),allowRelay=()=>true,fetchImpl=(...args)=>fetch(...args),timeoutMs=15000,now=Date.now}={}){
    const routes=new Map();
    const visit=(url,timeout=timeoutMs)=>readJSON('/api/search/visit',{method:'POST',credentials:'same-origin',headers:{...getHeaders(),'Content-Type':'application/json'},body:JSON.stringify({url,html:false})},{fetchImpl,timeoutMs:timeout});
    const throughServer=async(root,op,body,timeout)=>{
        if(op==='ping'){const result=await visit(root+'/ping',timeout);if(result.ready!==true||result.relay!==1)throw invalidResponse('SillyTavern 服务端转接不可用，请联系管理员更新队列服务',result);return result;}
        const input={key_hash:body.key_hash,user_id:body.user_id,task_id:body.task_id};
        for(const field of ['cancel_hash','cancel_proof','generation_timeout_ms','protocol','outcome','retry_after_ms','retry_protocol','attempt_no','attempt_id','rejection_status'])if(body[field]!==undefined)input[field]=body[field];
        // The raw lock token never enters a URL or the host's visited-URL log.
        if(body.lock_token&&(['complete','leave-queue','begin-generation','retry-generation','finish'].includes(op)||op==='my-turn'&&body.generation_timeout_ms!==undefined))input.release_proof=await sha256(body.lock_token+'\0release');
        const relay=new URL(root+'/relay');relay.searchParams.set('op',op);relay.searchParams.set('data',JSON.stringify(input));
        const result=await visit(relay.href,timeout);
        if(!Number.isInteger(result.relay_status)||result.relay_status<200||result.relay_status>599||!result.body||typeof result.body!=='object'||Array.isArray(result.body))throw Object.assign(stageError('queue',Error('SillyTavern 服务端转接返回无效队列内容，请联系管理员更新队列服务')),{status:responseStatuses.get(result)});
        if(result.relay_status>=400)throw httpRequestError({source:'queue',status:result.relay_status,body:JSON.stringify(result.body)});
        return result.body;
    };
    return async(url,options={},requestOptions={})=>{
        const budget=Math.min(timeoutMs,requestOptions.timeoutMs??timeoutMs),deadline=now()+budget,remaining=()=>Math.max(1,deadline-now());
        const target=new URL(url),op=target.pathname.split('/').at(-1),root=url.slice(0,url.lastIndexOf('/'));
        if(!['ping','join-queue','my-turn','complete','leave-queue','begin-generation','retry-generation','finish'].includes(op)||target.username||target.password||target.search||target.hash||target.protocol!=='https:'&&!(target.protocol==='http:'&&['localhost','127.0.0.1'].includes(target.hostname)))throw stageError('queue',Error('队列地址无效'));
        const route=routes.get(root);
        if(allowRelay()&&route?.relay){
            try{return await throughServer(root,op,options.body,Math.max(1,budget*2/3));}
            catch(error){
                if(!['TypeError','TimeoutError','AbortError'].includes(error.name)&&error.code!=='invalid-queue-response')throw error;
                let result;try{result=await queueJSON(url,options,{fetchImpl,timeoutMs:remaining()});}catch(direct){direct.message=queueConnectionError(op,direct,error).message;throw direct;}
                if(op==='ping'&&result.ready!==true)throw invalidResponse('队列未返回就绪状态，请检查地址',result);
                routes.delete(root);return result;
            }
        }
        try{const result=await queueJSON(url,options,{fetchImpl,timeoutMs:allowRelay()?Math.min(5000,Math.max(1,budget/3)):budget});if(op==='ping'&&result.ready!==true)throw invalidResponse('队列未返回就绪状态，请检查地址',result);return result;}
        catch(error){
            if(!allowRelay()||!['TypeError','TimeoutError','AbortError'].includes(error.name)&&error.code!=='invalid-queue-response')throw error;
            if(route?.failedAt!==undefined&&now()-route.failedAt<60000)throw route.error;
            let ping;
            try{ping=await visit(root+'/ping',Math.min(5000,Math.max(1,remaining()/2)));}
            catch(relay){const failed=queueConnectionError(op,error,relay);routes.set(root,{failedAt:now(),error:failed});throw failed;}
            if(ping.ready!==true||ping.relay!==1){const failed=queueConnectionError(op,error,invalidResponse('当前云端尚未支持转接，请联系管理员更新队列服务。',ping));routes.set(root,{failedAt:now(),error:failed});throw failed;}
            routes.set(root,{relay:true});
            if(op==='ping')return ping;
            try{return await throughServer(root,op,options.body,remaining());}catch(relay){const summary=queueConnectionError(op,error,relay);relay.message=summary.message;throw relay;}
        }
    };
}
