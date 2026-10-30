const labels={
    'tavern-generation':'酒馆生图接口','nai-generation':'NovelAI 生图','nai-encode':'Vibe 编码',queue:'云端队列',
    'image-save':'图片保存','chat-save':'聊天记录保存','image-list':'图片列表','image-delete':'图片删除','image-download':'图片下载','image-export':'图片导出',
    'vibe-file':'Vibe 文件','translation-google':'Google 翻译','translation-bing':'Microsoft 翻译',
};
export function redactErrorText(value,secrets=[]){
    let text=String(value||'');for(const secret of secrets)if(secret)text=text.split(secret).join('[已隐藏]');
    return text.replace(/https?:\/\/[^\s"'<>]+/gi,'[地址已隐藏]').replace(/\b(?:sk-|nai-)[A-Za-z0-9_-]{16,}/g,'[已隐藏]').replace(/\bBearer\s+[^\s"'<>]+/gi,'Bearer [已隐藏]').replace(/((?:api[_ -]?key|access[_ -]?token|authorization|secret|password|cookie|token)\s*["']?\s*[:=]\s*["']?)[^\s"',;<>}]+/gi,'$1[已隐藏]');
}
export function responseDetail(body,secrets=[]){
    let value=String(body||'').trim();
    if(!value||/<(?:!doctype|html|head|body)\b/i.test(value))return '';
    try{
        const data=JSON.parse(value);
        const pick=v=>typeof v==='string'?v:v&&typeof v==='object'?(pick(v.message)||pick(v.detail)||pick(v.error)):'';
        value=pick(data);
    }catch{}
    if(/^(?:internal\s*server\s*error|bad gateway|service unavailable|gateway timeout|error|http\s*\d+|\d{3})\.?$/i.test(value))return '';
    return redactErrorText(value,secrets).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').slice(0,500);
}
export function parseRetryAfter(value,now=Date.now()){
    if(!value?.trim())return 0;
    const seconds=Number(value),delay=Number.isFinite(seconds)?seconds*1000:Date.parse(value)-now;
    return Number.isFinite(delay)&&delay>0?delay:0;
}
export function httpRequestError({source,status,body='',secrets=[],retryAfterMs=0,custom=false,summary=''}){
    const label=labels[source]||source||'请求',detail=custom&&/^\s*(?:403\s*)?forbidden\s*$/i.test(responseDetail(body,secrets))?'':responseDetail(body,secrets),generation=['tavern-generation','nai-generation','nai-encode'].includes(source);
    let reason='请求失败，请稍后重试',code='http';
    let upstreamCode='';try{const data=JSON.parse(body);upstreamCode=[data?.code,data?.type,data?.error?.code,data?.error?.type].filter(value=>typeof value==='string').join(' ');}catch{}
    const quotaExhausted=/insufficient[_ -]?quota|quota[_ -]?exceeded|quota.{0,30}(?:exhaust|exceed)|(?:额度|配额).{0,8}(?:耗尽|用尽|超限|不足)|permanent.{0,15}(?:limit|quota)|(?:daily|monthly|billing|hard).{0,25}(?:limit|quota)|(?:日|月|总|账号|账户).{0,10}(?:额度|配额).{0,10}(?:耗尽|用尽|超限|不足)/i.test(detail+' '+upstreamCode);
    if(generation){
        if([408,504].includes(status)){reason='请求超时，生成结果尚不确定，请先检查再重试';code='timeout';}
        else if(status===429&&quotaExhausted){reason='账号配额已用尽或达到额度限制，请检查站点额度要求；不会自动重试';code='quota';}
        else if(/(?:insufficient|not enough).{0,35}(?:anlas|credits|balance)|(?:anlas|credits|balance).{0,35}(?:insufficient|not enough)|余额不足|额度不足/i.test(detail)){reason='账号额度不足，请检查 Anlas 余额';code='balance';}
        else if(/invalid (?:access )?token|invalid api.?key|expired token/i.test(detail)||status===401&&source!=='tavern-generation'){reason='Key 验证失败，请重新填写并保存 Key';code='auth';}
        else if(status===401||/\bunauthorized\b|authentication failed/i.test(detail)){reason=source==='tavern-generation'?'身份验证失败，请检查酒馆登录状态和 NAI Key':'Key 验证失败，请重新填写并保存 Key';code='auth';}
        else if(/invalid (?:width|height|dimensions?|steps|seed|sampler|noise schedule|model|parameters?)|unsupported model|尺寸无效|参数无效|不支持.{0,8}模型/i.test(detail)||custom&&/(?:reference|vibe|参考).{0,50}(?:最多|超限|上限|至多|at most|maximum|limit|exceed)|too many (?:reference|vibe)/i.test(detail)){reason='生成参数被拒绝，请检查模型、尺寸或 Vibe';code='parameters';}
        else if(/access denied|permission denied|forbidden|insufficient permissions?|权限不足|无权访问|account.{0,15}(?:disabled|banned|suspended)/i.test(detail)){reason='访问被拒绝，请检查账号权限';code='permission';}
        else if(/concurren(?:t|cy)|already generating|generation.{0,20}in progress|并发|正在生成|占线|任务进行中/i.test(detail)){reason='服务提示有并发任务，请等待已有任务结束';code='busy';}
        else if(status===403){reason='访问被拒绝，请检查账号权限及网络';code='permission';}
        else if(status===402){reason='生成被拒绝，请检查账号额度';code='balance';}
        else if(status===429||/too many requests|rate.?limit|限流|请求.{0,10}频繁/i.test(detail)){reason='请求过于频繁或并发受限，请稍后重试';code='rate-limit';}
        else if(/server.{0,15}busy|overloaded|queue.{0,15}(?:full|busy)|capacity.{0,15}(?:limit|exceed)|服务繁忙|排队|队列已满/i.test(detail)){reason='服务暂时繁忙，请稍后重试';code='busy';}
        else if(status===400||status===422){reason='生成参数被拒绝，请检查模型、尺寸或 Vibe';code='parameters';}
        else if(status===500){reason=source==='tavern-generation'&&!detail?'酒馆未返回具体原因，请查看运行酒馆的终端日志':'服务返回内部错误，请稍后重试';code='server';}
        else if([502,503,504].includes(status)){reason='服务或代理暂时不可用，请检查网络或稍后重试';code='unavailable';}
    }else{
        if(status===401||status===403)reason='访问被拒绝，请检查酒馆登录状态或服务权限';
        else if(status===404)reason=source==='image-download'||source==='image-delete'?'图片已不存在，请刷新图片列表':'接口或资源不存在，请检查地址及酒馆版本';
        else if(status===429)reason='请求过于频繁，请稍后重试';
        else if(status>=500)reason='服务处理失败，请检查该服务的日志或稍后重试';
    }
    if(generation&&[500,502,503].includes(status))reason+='；生成结果不确定，不会自动重试，请先检查结果';
    const error=Error(`${label}：${reason}（HTTP ${status}）${detail?'\n服务返回：'+detail:''}`);
    if(custom){
        error.message=`自定义接口${status<500?'拒绝了本次请求':'请求失败'}（HTTP ${status}）。`+(detail?'\n站点返回：'+detail:'\n站点未提供具体原因，请检查凭证、账号权限及模型、尺寸、步数和 Vibe 数量等要求。');
        if(detail)error.message+='\n请核对站点文档中的凭证、权限及参数要求。';
        if(summary)error.message+='\n本次请求：'+redactErrorText(summary,secrets);
        if([408,500,502,503,504].includes(status))error.message+='\n生成结果不确定，不会自动重试，请先检查结果。';
    }
    // Unknown server/proxy failures may already have started a billable job.
    // Only recoverable HTTP 429 rate-limit/concurrency refusals may be submitted again.
    const retryableGeneration=['tavern-generation','nai-generation'].includes(source)&&status===429&&['rate-limit','busy'].includes(code)&&!/quota|balance|credit|billing|auth|token|permission|forbidden|model|parameter|invalid|unsupported/i.test(upstreamCode)&&!/<(?:!doctype|html|head|body)\b/i.test(body)&&!/unknown|ambiguous|结果不确定|未知/i.test(detail);
    const serviceCode=redactErrorText(upstreamCode,secrets).slice(0,150);
    if(serviceCode)error.message+='\n服务代码：'+serviceCode;
    return Object.assign(error,{source,status,code,detail,serviceCode,retryAfterMs,retryableGeneration});
}
export function stageError(source,error,secrets=[]){
    if(error?.source)return error;
    const name=error?.name||'Error',label=labels[source]||source;
    let reason;
    if(source==='image-save')reason='图片已生成，但保存到酒馆失败；请先检查存储，避免重复生图扣费';
    else if(source==='chat-save')reason='图片已生成，但聊天记录保存失败，请检查酒馆连接';
    else if(source==='queue'&&['TimeoutError','AbortError','TypeError'].includes(name))reason=name==='TypeError'?'连接队列服务失败，请检查当前浏览器的网络或代理':'队列连接超时或被中断，请稍后重试';
    else if(['TimeoutError','AbortError'].includes(name))reason='请求超时或被中断；结果尚不确定，请先检查再重试';
    else if(name==='TypeError')reason='连接失败，请检查网络或代理；结果尚不确定，不会自动重试';
    else reason=responseDetail(error?.message||error,secrets)||'操作失败';
    const detail=['image-save','chat-save'].includes(source)?responseDetail(error?.message,secrets):'';
    const wrapped=Error(`${label}：${reason}${['TypeError','TimeoutError','AbortError'].includes(name)?'（未取得 HTTP 响应）':''}${detail?'\n服务返回：'+detail:''}`);wrapped.name=name;wrapped.source=source;wrapped.code='stage';wrapped.detail=responseDetail(error?.message,secrets);
    if(wrapped.detail&&!['image-save','chat-save'].includes(source)&&wrapped.detail!==reason)wrapped.message+='\n原因：'+wrapped.detail;
    return wrapped;
}
export async function inStage(source,run){try{return await run();}catch(error){throw stageError(source,error);}}
export async function checkedFetch(source,url,options={}, {fetchImpl=fetch,secrets=[],custom=false,summary=''}={}){
    let response;try{response=await fetchImpl(url,options);}catch(error){const wrapped=stageError(source,error,secrets);if(custom&&wrapped.name==='TypeError')wrapped.message+='；自定义接口可能受浏览器跨域（CORS）或 HTTPS 页面访问 HTTP 的混合内容限制，请检查站点配置及浏览器控制台';throw wrapped;}
    if(!response.ok){let body;try{body=await response.text();}catch(error){const wrapped=stageError(source,error,secrets);wrapped.status=response.status;wrapped.message=wrapped.message.replace('（未取得 HTTP 响应）',`（HTTP ${response.status}，响应正文读取失败）`);if(custom){wrapped.responseStatus=response.status;wrapped.responseBodyFailure=true;}throw wrapped;}throw httpRequestError({source,status:response.status,body,secrets,custom,summary,retryAfterMs:parseRetryAfter(response.headers.get('Retry-After'))});}
    return response;
}
export function errorTitle(error,fallback='操作失败'){return error?.source?(labels[error.source]||fallback)+'失败':fallback;}
