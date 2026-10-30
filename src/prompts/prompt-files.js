import {defaults,buildRequest} from '../core/core.js';
export const PROMPT_FILE_LIMIT=1024*1024;
export const PROMPT_BUNDLE_LIMIT=20*1024*1024;
export const PROMPT_BUNDLE_COUNT=100;
export const PREVIEW_DATA_LIMIT=700*1024;
const fields=['positive','positiveSuffix','negative'];
const textParameters=['model','sampler','scheduler'],numberParameters=['width','height','steps','scale','seed'];
function previewDimensions(mime,bytes){
    const u16=at=>bytes[at]*256+bytes[at+1],u32=at=>bytes[at]*16777216+bytes[at+1]*65536+bytes[at+2]*256+bytes[at+3];
    if(mime==='image/png'&&bytes.length>=24&&String.fromCharCode(...bytes.slice(12,16))==='IHDR')return [u32(16),u32(20)];
    if(mime==='image/jpeg')for(let at=2;at<bytes.length;){
        if(bytes[at++]!==255)break;while(bytes[at]===255)at++;const marker=bytes[at++];
        if(marker===0xda||marker===0xd9)break;
        if(marker===0xd8||marker>=0xd0&&marker<=0xd7)continue;
        const length=u16(at);if(length<2||at+length>bytes.length)break;
        if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&length>=7)return [u16(at+5),u16(at+3)];
        at+=length;
    }
    throw Error('例图格式无效');
}
function readParameters(source){
    if(!source||typeof source!=='object')throw Error('NAI 串文件缺少生成参数');
    const parameters={};
    for(const key of textParameters){if(typeof source[key]!=='string'||!source[key].trim()||source[key].length>128)throw Error('生成参数格式不正确');parameters[key]=source[key];}
    for(const key of numberParameters){const value=source[key];if(!['number','string'].includes(typeof value)||typeof value==='string'&&!value.trim()||!Number.isFinite(Number(value)))throw Error('生成参数格式不正确');parameters[key]=Number(value);}
    if(source.varietyBoost!==undefined&&typeof source.varietyBoost!=='boolean')throw Error('多样性参数格式不正确');
    parameters.varietyBoost=source.varietyBoost??false;
    for(const key of ['qualityPreset','ucPreset']){
        if(source[key]!==undefined&&(typeof source[key]!=='string'||source[key].length>40))throw Error('官网预设参数格式不正确');
        parameters[key]=source[key]??defaults[key];
    }
    buildRequest({...defaults,...parameters},'');
    return parameters;
}
export function readPreviewData(preview){
    if(preview===undefined)return;
    if(!preview||typeof preview!=='object'||!['image/png','image/jpeg'].includes(preview.mime)||typeof preview.data!=='string'||!preview.data.length||preview.data.length>PREVIEW_DATA_LIMIT||preview.data.length%4||!/^[A-Za-z0-9+/]+={0,2}$/.test(preview.data))throw Error('例图格式无效或过大');
    // Raster signatures only; URLs, SVG and arbitrary JSON fields never reach an image element.
    const bytes=atob(preview.data);
    const valid=preview.mime==='image/png'?bytes.startsWith('\x89PNG\r\n\x1a\n'):bytes.startsWith('\xff\xd8\xff');
    if(!valid)throw Error('例图格式无效');
    const [width,height]=previewDimensions(preview.mime,Uint8Array.from(bytes,char=>char.charCodeAt(0)));
    if(!width||!height||width>2048||height>2048)throw Error('例图尺寸无效');
    return {mime:preview.mime,data:preview.data};
}
export function promptFileData(profile,preview){
    const prompts={};for(const field of fields){if(typeof profile[field]!=='string')throw Error('提示词格式不正确');prompts[field]=profile[field];}
    const data={type:'miao-nai-prompts',version:2,name:String(profile.name||'导入配置'),prompts,parameters:readParameters(profile)};
    if(preview!==undefined)data.preview=readPreviewData(preview);return data;
}
export function promptFilename(name){
    const safe=String(name||'提示词').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').slice(0,64).replace(/[. ]+$/,'')||'提示词';
    return `喵喵NAI-${safe}.json`;
}
export function importPromptData(data,profiles=[]){
    if(!data||data.type!=='miao-nai-prompts'||![1,2].includes(data.version)||!data.prompts||fields.some(field=>typeof data.prompts[field]!=='string'))throw Error('请选择喵喵 NAI 串导出的 JSON 文件');
    const parameters=data.version===2?readParameters(data.parameters):{};
    const base=typeof data.name==='string'&&data.name.trim()?data.name.trim().slice(0,120):'导入配置';
    const names=new Set(profiles.map(profile=>profile.name));let name=base,n=2;while(names.has(name))name=`${base} (${n++})`;
    // Whitelist prompt and generation fields; never import Vibes or credentials.
    return {...structuredClone(defaults),...parameters,name,positive:data.prompts.positive,positiveSuffix:data.prompts.positiveSuffix,negative:data.prompts.negative,vibes:[],vibeEnabled:false};
}
export async function readPromptFile(file,profiles=[],{restorePreview}={}){
    if(file.size>PROMPT_FILE_LIMIT)throw Error('NAI 串文件不能超过 1 MB');
    let data;try{data=JSON.parse((await file.text()).replace(/^\uFEFF/,''));}catch{throw Error('无法读取 NAI 串文件，请选择有效的 JSON');}
    const profile=importPromptData(data,profiles),preview=readPreviewData(data.preview);
    if(preview){
        if(!restorePreview)throw Error('当前版本无法导入例图，请更新插件');
        profile.preview=await restorePreview(preview,profile);
    }
    return profile;
}
export function promptBundleData(items){
    if(!Array.isArray(items)||!items.length||items.length>PROMPT_BUNDLE_COUNT)throw Error('配置包需包含 1～100 个串');
    const profiles=items.map(item=>{
        const profile=importPromptData(item),preview=readPreviewData(item.preview),data=promptFileData(profile,preview);
        if(new Blob([JSON.stringify(data)]).size>PROMPT_FILE_LIMIT)throw Error('单个 NAI 串不能超过 1 MB');return data;
    });
    return {type:'miao-nai-prompt-bundle',version:1,profiles};
}
export async function readPromptFiles(file,profiles=[],{restorePreview}={}){
    if(file.size>PROMPT_BUNDLE_LIMIT)throw Error('配置包不能超过 20 MB');
    let data;try{data=JSON.parse((await file.text()).replace(/^\uFEFF/,''));}catch{throw Error('无法读取 NAI 串文件，请选择有效的 JSON');}
    const bundle=data?.type==='miao-nai-prompt-bundle';
    if(!bundle&&file.size>PROMPT_FILE_LIMIT)throw Error('NAI 串文件不能超过 1 MB');
    const entries=bundle?promptBundleData(data.version===1?data.profiles:null).profiles:[data],result=[],previews=[];
    // Validate the entire package before storing any preview or changing settings.
    for(const entry of entries){const profile=importPromptData(entry,[...profiles,...result]);previews.push(readPreviewData(entry.preview));result.push(profile);}
    if(previews.some(Boolean)&&!restorePreview)throw Error('当前版本无法导入例图，请更新插件');
    for(let i=0;i<result.length;i++)if(previews[i])result[i].preview=await restorePreview(previews[i],result[i]);
    return result;
}
