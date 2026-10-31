// Connection settings contain endpoints and fingerprints only, never tokens.
const GENERATE_PATH='/ai/generate-image';
const ENCODE_PATH='/ai/encode-vibe';
const GENERATION_MODES=new Set(['auto','exact']);
const ENCODE_MODES=new Set(['derived','manual','disabled']);

export function migrateConnection(settings,{newInstallation=false}={}){
    let changed=false;
    const migrated=settings.naiConnection===undefined;
    if(migrated){settings.naiConnection='official';changed=true;}
    else if(settings.naiConnection!=='custom'&&settings.naiConnection!=='official'){settings.naiConnection='official';changed=true;}

    // Earlier releases filled empty URL fields on startup. Empty fields alone do
    // not identify an old custom setup; the selected connection or saved custom
    // endpoint/key fingerprint does.
    const hasLegacyCustom=settings.naiConnection==='custom'||Boolean(settings.customGenerationURL)||Boolean(settings.customEncodeURL)||Boolean(settings.customKeyHash);
    if(!GENERATION_MODES.has(settings.customGenerationURLMode)){
        settings.customGenerationURLMode=newInstallation||!hasLegacyCustom?'auto':'exact';changed=true;
    }
    if(!ENCODE_MODES.has(settings.customEncodeURLMode)){
        settings.customEncodeURLMode=newInstallation||!hasLegacyCustom?'derived':settings.customEncodeURL?'manual':'disabled';changed=true;
    }
    if(settings.customEndpointModesVersion!==1){settings.customEndpointModesVersion=1;changed=true;}

    for(const [key,value] of [['customGenerationURL',''],['customEncodeURL',''],['customKeyHash',''],['rememberCustomKey',false],['connectionRevision',0]]){
        if(settings[key]===undefined){settings[key]=value;changed=true;}
    }
    return changed||migrated;
}

function checkPercentEncoding(value,label){
    if(/%(?![\da-f]{2})/i.test(value))throw Error(`${label}包含无效的百分号编码`);
}

function endpointParts(value,label){
    validateEndpoint(value,{label});
    if(value.includes('#'))throw Error(`${label}不能包含 URL fragment`);
    checkPercentEncoding(value,label);
    const parsed=new URL(value);
    const match=/^(https?:\/\/[^/?#]*)/i.exec(value);
    const origin=match?.[1];
    if(!origin)throw Error(`${label}必须是有效的 HTTP/HTTPS 完整地址`);
    const rest=value.slice(origin.length),queryAt=rest.indexOf('?');
    return {parsed,origin,path:queryAt<0?rest:rest.slice(0,queryAt),query:queryAt<0?'':rest.slice(queryAt)};
}

function customModes(settings){
    const generationMode=GENERATION_MODES.has(settings.customGenerationURLMode)?settings.customGenerationURLMode:(settings.customGenerationURL?'exact':'auto');
    const encodeMode=ENCODE_MODES.has(settings.customEncodeURLMode)?settings.customEncodeURLMode:(settings.customEncodeURL?'manual':'disabled');
    return {generationMode,encodeMode};
}

function trimPath(path){return path.replace(/\/+$/,'');}
function hasGenerateSuffix(path){return /\/ai\/generate-image$/.test(trimPath(path));}
function apiBasePath(path){
    const clean=trimPath(path);
    return hasGenerateSuffix(clean)?clean.slice(0,-GENERATE_PATH.length):clean;
}
function relativeRoute(value,label){
    if(typeof value!=='string'||!value||value!==value.trim())throw Error(`${label}不能为空且不能包含首尾空格`);
    if(value.includes('#'))throw Error(`${label}不能包含 URL fragment`);
    checkPercentEncoding(value,label);
    if(/[\u0000-\u0020\\]/.test(value))throw Error(`${label}不能包含空格或反斜杠`);
    if(value.startsWith('?'))throw Error(`${label}必须包含路径`);
    if(value.split('?')[0].split('/').some(part=>part==='.'||part==='..'))throw Error(`${label}不能包含 . 或 .. 路径段`);
    return value;
}

function resolveManualEncode(value,generation){
    const label='Vibe 编码地址';
    if(/^https?:\/\//i.test(value))return endpointParts(value,label);
    if(/^[a-z][a-z\d+.-]*:/i.test(value))throw Error(`${label}必须是 HTTP/HTTPS 地址或路径`);
    relativeRoute(value,label);
    const origin=generation.parsed.origin;
    if(value.startsWith('/')){
        if(value.startsWith('//'))throw Error(`${label}不能使用协议相对地址`);
        const parsed=new URL(value,origin);
        if(parsed.origin!==origin)throw Error(`${label}必须保持在生图地址的站点根路径`);
        return {parsed,origin:parsed.origin,path:value.split('?')[0],query:value.includes('?')?value.slice(value.indexOf('?')):'' ,url:origin+value};
    }
    const base=apiBasePath(generation.path);
    const baseURL=generation.origin+base;
    const joined=`${baseURL}/${value}`;
    const parts=endpointParts(joined,label);
    return {...parts,url:joined};
}

/** Resolve user inputs once before saving or taking a task snapshot. */
export function resolveCustomEndpoints(settingsOrSnapshot){
    const settings=settingsOrSnapshot||{};
    const {generationMode,encodeMode}=customModes(settings);
    const input=settings.customGenerationURL||'';
    const rawGeneration=endpointParts(input,'自定义 API 地址');
    const cleanPath=trimPath(rawGeneration.path);
    const generationURL=generationMode==='exact'?input:
        `${rawGeneration.origin}${hasGenerateSuffix(cleanPath)?cleanPath:`${cleanPath}${GENERATE_PATH}`}${rawGeneration.query}`;
    const generation=endpointParts(generationURL,'实际生图 URL');

    let encodeURL='',encodeEnabled=false,encodeError='';
    if(encodeMode==='derived'){
        const path=trimPath(generation.path);
        const encodePath=hasGenerateSuffix(path)?path.slice(0,-GENERATE_PATH.length)+ENCODE_PATH:`${path}${ENCODE_PATH}`;
        encodeURL=generation.origin+encodePath;
        if(generation.query){
            encodeError='生图地址包含查询参数；为避免把生图参数误用于编码，自动编码已暂停，请改用手动地址。';
        }else encodeEnabled=true;
    }else if(encodeMode==='manual'){
        const manual=resolveManualEncode(settings.customEncodeURL||'',generation);
        encodeURL=manual.url||`${manual.origin}${manual.path}${manual.query}`;
        encodeEnabled=true;
    }
    const generationOrigin=generation.parsed.origin;
    const encodeOrigin=encodeURL?new URL(encodeURL).origin:'';
    return {generationURL,encodeURL,encodeEnabled,encodeError,generationMode,encodeMode,generationOrigin,encodeOrigin,crossOrigin:Boolean(encodeOrigin&&generationOrigin!==encodeOrigin)};
}

export function validateEndpoint(value,{optional=false,label='生图 URL'}={}){
    if(optional&&value==='')return '';
    if(typeof value!=='string')throw Error(`${label}必须是有效的 HTTP/HTTPS 完整地址`);
    let url;try{url=new URL(value);}catch{throw Error(`${label}必须是有效的 HTTP/HTTPS 完整地址`);}
    if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password||value!==value.trim()||!/^https?:\/\//i.test(value))throw Error(`${label}必须是 HTTP/HTTPS 完整地址，且不能包含用户名或密码`);
    // Validation must not normalize the user-supplied path, query or encoding.
    return value;
}

export function connectionSnapshot(settings){
    const naiConnection=settings.naiConnection==='custom'?'custom':'official';
    const base={naiConnection,keyHash:naiConnection==='custom'?settings.customKeyHash:settings.keyHash,connectionRevision:settings.connectionRevision||0};
    if(naiConnection!=='custom')return base;
    const modes=customModes(settings);let resolved,endpointError='';
    try{resolved=resolveCustomEndpoints({...settings,customGenerationURLMode:modes.generationMode,customEncodeURLMode:modes.encodeMode});}
    catch(error){endpointError=error.message;resolved={generationURL:'',encodeURL:'',encodeEnabled:false};}
    return {...base,customGenerationURL:settings.customGenerationURL||'',customEncodeURL:settings.customEncodeURL||'',
        customGenerationURLMode:modes.generationMode,customEncodeURLMode:modes.encodeMode,
        resolvedGenerationURL:resolved.generationURL,resolvedEncodeURL:resolved.encodeURL,encodeEnabled:resolved.encodeEnabled,encodeError:resolved.encodeError||'',endpointError};
}
export function assertConnection(settings,snapshot){
    const current=connectionSnapshot(settings);
    const changed=current.naiConnection!==snapshot.naiConnection||current.connectionRevision!==snapshot.connectionRevision||current.keyHash!==snapshot.keyHash;
    const endpointsChanged=snapshot.naiConnection==='custom'&&['customGenerationURL','customEncodeURL','customGenerationURLMode','customEncodeURLMode','resolvedGenerationURL','resolvedEncodeURL','encodeEnabled','encodeError','endpointError'].some(key=>current[key]!==snapshot[key]);
    if(changed||endpointsChanged)throw Error('连接配置或 NAI Key 已更换，请重新提交任务');
}
export function usesDirectGeneration(connection,isTT,vibes){return connection.naiConnection==='custom'||isTT||!!vibes?.length;}
export function onlineEncodingAvailable(settings){
    if(settings.naiConnection!=='custom')return true;
    try{return resolveCustomEndpoints(settings).encodeEnabled;}catch{return false;}
}

export async function saveCustomConnection({settings,vault,input,generationURL,encodeURL='',generationURLMode='auto',encodeURLMode='derived',fingerprint,save,confirmCrossOrigin}){
    if(!GENERATION_MODES.has(generationURLMode))throw Error('生图 URL 处理模式无效');
    if(!ENCODE_MODES.has(encodeURLMode))throw Error('Vibe 编码地址模式无效');
    const resolved=resolveCustomEndpoints({customGenerationURL:generationURL,customGenerationURLMode:generationURLMode,customEncodeURL:encodeURL,customEncodeURLMode:encodeURLMode});
    if(resolved.crossOrigin&&encodeURLMode==='manual'){
        if(typeof confirmCrossOrigin!=='function'||!await confirmCrossOrigin({generationOrigin:resolved.generationOrigin,encodeOrigin:resolved.encodeOrigin}))throw Error('Vibe 编码地址与生图地址不同；需要确认同一 Key 将发送到另一站点');
    }
    const key=String(input||'').trim()||await vault.get();
    if(!key)throw Error('请填写自定义接口 API Key');
    const hash=await fingerprint(key);
    await vault.set(key,!!settings.rememberCustomKey);
    if(settings.customGenerationURL!==generationURL||settings.customEncodeURL!==encodeURL||settings.customGenerationURLMode!==generationURLMode||settings.customEncodeURLMode!==encodeURLMode||settings.customKeyHash!==hash)settings.connectionRevision=(settings.connectionRevision||0)+1;
    settings.customGenerationURL=generationURL;settings.customEncodeURL=encodeURL;settings.customGenerationURLMode=generationURLMode;settings.customEncodeURLMode=encodeURLMode;settings.customEndpointModesVersion=1;settings.customKeyHash=hash;save();
}
