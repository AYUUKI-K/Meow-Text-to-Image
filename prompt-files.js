import {defaults,buildRequest} from './core.js';
export const PROMPT_FILE_LIMIT=1024*1024;
const fields=['positive','positiveSuffix','negative'];
const textParameters=['model','sampler','scheduler'],numberParameters=['width','height','steps','scale','seed'];
function readParameters(source){
    if(!source||typeof source!=='object')throw Error('NAI 串文件缺少生成参数');
    const parameters={};
    for(const key of textParameters){if(typeof source[key]!=='string'||!source[key].trim()||source[key].length>128)throw Error('生成参数格式不正确');parameters[key]=source[key];}
    for(const key of numberParameters){const value=source[key];if(!['number','string'].includes(typeof value)||typeof value==='string'&&!value.trim()||!Number.isFinite(Number(value)))throw Error('生成参数格式不正确');parameters[key]=Number(value);}
    if(source.varietyBoost!==undefined&&typeof source.varietyBoost!=='boolean')throw Error('多样性参数格式不正确');
    parameters.varietyBoost=source.varietyBoost??false;
    buildRequest({...defaults,...parameters},'');
    return parameters;
}
export function promptFileData(profile){
    const prompts={};for(const field of fields){if(typeof profile[field]!=='string')throw Error('提示词格式不正确');prompts[field]=profile[field];}
    return {type:'miao-nai-prompts',version:2,name:String(profile.name||'导入配置'),prompts,parameters:readParameters(profile)};
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
export async function readPromptFile(file,profiles=[]){
    if(file.size>PROMPT_FILE_LIMIT)throw Error('NAI 串文件不能超过 1 MB');
    let data;try{data=JSON.parse((await file.text()).replace(/^\uFEFF/,''));}catch{throw Error('无法读取 NAI 串文件，请选择有效的 JSON');}
    return importPromptData(data,profiles);
}
