// Local diagnostics, not HTTP status codes. Never log raw errors or requests.
export function naiRuntime(){
    const nav=globalThis.navigator,tt=!!globalThis.window?.__TAURITAVERN__;
    return {tt,ios:/iPad|iPhone|iPod/.test(nav?.userAgent||'')||nav?.platform==='MacIntel'&&nav?.maxTouchPoints>1};
}
export function reportNAIFailure(error,{phase,source,protocol,httpStatus,runtime=naiRuntime(),onDiagnostic=()=>{}}){
    if(error.responseBodyFailure)phase='body';
    const status=Number.isInteger(error.status)&&error.status>=100?error.status:Number.isInteger(error.responseStatus)&&error.responseStatus>=100?error.responseStatus:Number.isInteger(httpStatus)&&httpStatus>=100?httpStatus:null;
    const name=['TypeError','TimeoutError','AbortError'].includes(error.name)?error.name:'Error';
    const code=error.localGenerationTimeout?'MEWO_NAI_LOCAL_TIMEOUT':status&&phase==='fetch'?`MEWO_CUSTOM_HTTP_${status}`:phase==='body'?'MEWO_CUSTOM_RESPONSE_BODY':phase==='parse'?'MEWO_CUSTOM_IMAGE_FORMAT':phase==='prepared'?'MEWO_CUSTOM_PRE_SEND':name==='AbortError'?'MEWO_CUSTOM_ABORTED':runtime.tt&&runtime.ios&&protocol==='http:'?'MEWO_CUSTOM_IOS_HTTP_NO_RESPONSE':'MEWO_CUSTOM_NETWORK_NO_RESPONSE';
    error.diagnosticCode=code;
    error.message+=`\n诊断码：${code}`;
    if(status&&phase!=='fetch')error.message+=`\n已收到 HTTP ${status}；失败阶段：${phase}。`;
    if(phase==='fetch'&&!status){
        error.message+='\n未取得可读取的 HTTP 响应，HTTP 状态码不可用；不能据此判断站点是否已开始生图。';
        if(runtime.tt&&runtime.ios&&protocol==='http:')error.message+='\niOS TT 的 TestFlight 构建限制 WebView 明文 HTTP；请向站方确认 HTTPS 完整端点。此诊断码也不能单独排除 CORS 或网络故障。';
    }
    const entry={diagnosticCode:code,phase,source,httpStatus:status,errorType:name,host:runtime.tt?'TT':'browser',platform:runtime.ios?'iOS':'other',endpointProtocol:protocol==='http:'?'http':'https'};
    try{onDiagnostic(entry);}catch{/* Logging must never change retries or queue cleanup. */}
    return error;
}
