import {checkedFetch,stageError,httpRequestError} from './request-errors.js';
import {sha256} from './browser-crypto.js';
const invalidResponse=message=>Object.assign(stageError('queue',Error(message)),{code:'invalid-queue-response'});

async function readJSON(url,options,{fetchImpl=fetch,timeoutMs=15000}={}){
    const controller=new AbortController();let timer;
    const pending=(async()=>{
        const response=await checkedFetch('queue',url,{...options,signal:controller.signal},{fetchImpl});
        let data;try{data=await response.json();}catch{throw invalidResponse('队列返回内容无效，请检查队列地址或代理');}
        if(!data||typeof data!=='object'||Array.isArray(data))throw invalidResponse('队列返回内容无效，请检查队列地址或代理');
        return data;
    })();
    try{return await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>{
        reject(stageError('queue',Object.assign(Error('timeout'),{name:'TimeoutError'})));controller.abort();
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
        if(op==='ping'){const result=await visit(root+'/ping',timeout);if(result.ready!==true||result.relay!==1)throw invalidResponse('电脑转接不可用，请联系管理员更新队列服务');return result;}
        const input={key_hash:body.key_hash,user_id:body.user_id,task_id:body.task_id};
        for(const field of ['cancel_hash','cancel_proof'])if(body[field])input[field]=body[field];
        // The raw lock token never enters a URL or the host's visited-URL log.
        if(body.lock_token&&['complete','leave-queue'].includes(op))input.release_proof=await sha256(body.lock_token+'\0release');
        const relay=new URL(root+'/relay');relay.searchParams.set('op',op);relay.searchParams.set('data',JSON.stringify(input));
        const result=await visit(relay.href,timeout);
        if(!Number.isInteger(result.relay_status)||result.relay_status<200||result.relay_status>599||!result.body||typeof result.body!=='object'||Array.isArray(result.body))throw stageError('queue',Error('电脑转接返回无效队列内容，请联系管理员更新队列服务'));
        if(result.relay_status>=400)throw httpRequestError({source:'queue',status:result.relay_status,body:JSON.stringify(result.body)});
        return result.body;
    };
    return async(url,options={},requestOptions={})=>{
        const budget=Math.min(timeoutMs,requestOptions.timeoutMs??timeoutMs),deadline=now()+budget,remaining=()=>Math.max(1,deadline-now());
        const target=new URL(url),op=target.pathname.split('/').at(-1),root=url.slice(0,url.lastIndexOf('/'));
        if(!['ping','join-queue','my-turn','complete','leave-queue'].includes(op)||target.username||target.password||target.search||target.hash||target.protocol!=='https:'&&!(target.protocol==='http:'&&['localhost','127.0.0.1'].includes(target.hostname)))throw stageError('queue',Error('队列地址无效'));
        const route=routes.get(root);
        if(allowRelay()&&route?.relay){
            try{return await throughServer(root,op,options.body,Math.max(1,budget*2/3));}
            catch(error){
                if(!['TypeError','TimeoutError','AbortError'].includes(error.name)&&error.code!=='invalid-queue-response')throw error;
                const result=await queueJSON(url,options,{fetchImpl,timeoutMs:remaining()});
                if(op==='ping'&&result.ready!==true)throw invalidResponse('队列未返回就绪状态，请检查地址');
                routes.delete(root);return result;
            }
        }
        try{const result=await queueJSON(url,options,{fetchImpl,timeoutMs:allowRelay()?Math.min(5000,Math.max(1,budget/3)):budget});if(op==='ping'&&result.ready!==true)throw invalidResponse('队列未返回就绪状态，请检查地址');return result;}
        catch(error){
            if(!allowRelay()||!['TypeError','TimeoutError','AbortError'].includes(error.name)&&error.code!=='invalid-queue-response')throw error;
            if(route?.failedAt!==undefined&&now()-route.failedAt<60000)throw route.error;
            let ping;
            try{ping=await visit(root+'/ping',Math.min(5000,Math.max(1,remaining()/2)));}
            catch{const failed=stageError('queue',Error('手机直连队列失败，电脑转接也未连接成功。请检查手机网络、电脑代理，以及酒馆是否支持网页访问接口。'));routes.set(root,{failedAt:now(),error:failed});throw failed;}
            if(ping.ready!==true||ping.relay!==1){const failed=stageError('queue',Error('手机直连队列失败；电脑可以连接，但当前云端尚未支持转接，请联系管理员更新队列服务。'));routes.set(root,{failedAt:now(),error:failed});throw failed;}
            routes.set(root,{relay:true});
            return op==='ping'?ping:throughServer(root,op,options.body,remaining());
        }
    };
}
