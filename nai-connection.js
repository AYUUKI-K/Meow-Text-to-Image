// Connection settings contain endpoints and fingerprints only, never tokens.
export function migrateConnection(settings){
    const migrated=settings.naiConnection===undefined;
    settings.naiConnection=settings.naiConnection==='custom'?'custom':'official';
    settings.customGenerationURL??='';settings.customEncodeURL??='';
    settings.customKeyHash??='';settings.rememberCustomKey??=false;
    settings.connectionRevision??=0;
    return migrated;
}
export function validateEndpoint(value,{optional=false,label='生图完整 URL'}={}){
    if(optional&&value==='')return '';
    let url;try{url=new URL(value);}catch{throw Error(`${label}必须是有效的 HTTP/HTTPS 完整地址`);}
    if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password||value!==value.trim()||!/^https?:\/\//i.test(value))throw Error(`${label}必须是 HTTP/HTTPS 完整地址，且不能包含用户名或密码`);
    // Validation must not normalize the user-supplied path, query or encoding.
    return value;
}
export function connectionSnapshot(settings){
    const naiConnection=settings.naiConnection==='custom'?'custom':'official';
    return {naiConnection,keyHash:naiConnection==='custom'?settings.customKeyHash:settings.keyHash,
        customGenerationURL:settings.customGenerationURL||'',customEncodeURL:settings.customEncodeURL||'',connectionRevision:settings.connectionRevision||0};
}
export function assertConnection(settings,snapshot){
    const current=connectionSnapshot(settings);
    if(current.naiConnection!==snapshot.naiConnection||current.connectionRevision!==snapshot.connectionRevision||current.keyHash!==snapshot.keyHash||snapshot.naiConnection==='custom'&&(current.customGenerationURL!==snapshot.customGenerationURL||current.customEncodeURL!==snapshot.customEncodeURL))throw Error('连接配置或 NAI Key 已更换，请重新提交任务');
}
export function usesDirectGeneration(connection,isTT,vibes){return connection.naiConnection==='custom'||isTT||!!vibes?.length;}
export function onlineEncodingAvailable(settings){return settings.naiConnection!=='custom'||!!settings.customEncodeURL;}
export async function saveCustomConnection({settings,vault,input,generationURL,encodeURL='',fingerprint,save}){
    validateEndpoint(generationURL);validateEndpoint(encodeURL,{optional:true,label:'Vibe 编码完整 URL'});
    const key=String(input||'').trim()||await vault.get();
    if(!key)throw Error('请填写自定义接口 API Key');
    const hash=await fingerprint(key);
    await vault.set(key,!!settings.rememberCustomKey);
    if(settings.customGenerationURL!==generationURL||settings.customEncodeURL!==encodeURL||settings.customKeyHash!==hash)settings.connectionRevision=(settings.connectionRevision||0)+1;
    settings.customGenerationURL=generationURL;settings.customEncodeURL=encodeURL;settings.customKeyHash=hash;save();
}
