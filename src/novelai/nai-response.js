import {responseDetail,redactErrorText} from '../platform/request-errors.js';

const pngSignature=[137,80,78,71,13,10,26,10];
const startsWith=(bytes,signature)=>signature.every((value,index)=>bytes[index]===value);
export async function unzipNAIPNG(bytes,{loadZip=async()=>{if(!globalThis.JSZip)await import('/lib/jszip.min.js');return globalThis.JSZip;}}={}){
    const zip=await loadZip(),archive=await zip.loadAsync(bytes),image=Object.values(archive.files).find(file=>!file.dir&&/\.png$/i.test(file.name));
    if(!image)throw Error('NAI 返回结果中没有 PNG 图片');
    return image.async('base64');
}
export function bytesBase64(bytes){let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(binary);}
// Called after the response/queue release boundary. Parse errors never retry.
export async function parseNAIImage(bytes,{unzipPNG,secrets=[]}={}){
    bytes=new Uint8Array(bytes);
    if(!bytes.length)throw Error('生图接口返回空响应，未获得图片');
    if(startsWith(bytes,pngSignature))return bytesBase64(bytes);
    if([[80,75,3,4],[80,75,5,6],[80,75,7,8]].some(signature=>startsWith(bytes,signature))){
        try{return await unzipPNG(bytes);}catch{throw Error('生图接口返回的 ZIP 损坏或没有 PNG 图片');}
    }
    const text=new TextDecoder().decode(bytes).trim();
    if(/^[\[{]/.test(text)){
        const detail=responseDetail(text,secrets);
        throw Error('生图接口返回 JSON，未获得图片'+(detail?'：'+detail:''));
    }
    if(/^</.test(text))throw Error('生图接口返回 HTML，未获得图片，请检查完整端点地址及站点说明');
    throw Error('生图接口返回未知格式，预期为 PNG 或 ZIP');
}
export function payloadSecrets(body){
    // Redact echoed prompts, source images and Vibe encodings as well as tokens.
    const values=[];
    const collect=value=>{if(typeof value==='string'&&value)values.push(value,JSON.stringify(value).slice(1,-1));else if(Array.isArray(value))value.forEach(collect);else if(value&&typeof value==='object')Object.values(value).forEach(collect);};
    collect(body.input);collect(body.image);
    for(const [name,value] of Object.entries(body.parameters||{}))if(/prompt|image|encoding/i.test(name))collect(value);
    return [...new Set(values)].sort((a,b)=>b.length-a.length);
}
export function requestSummary(request,secrets=[]){
    const numeric=value=>Number.isFinite(Number(value))?Number(value):'?';
    return redactErrorText(`模型 ${String(request.model||'未知').replace(/[\r\n\x00-\x1f]/g,'').slice(0,80)}；尺寸 ${numeric(request.width)}×${numeric(request.height)}；步数 ${numeric(request.steps)}；Vibe 数量 ${request.vibes?.length||0}`,secrets);
}
