import {defaults} from './core.js';
export const PROMPT_FILE_LIMIT=1024*1024;
const fields=['positive','positiveSuffix','negative'];
export function promptFileData(profile){
    const prompts={};for(const field of fields){if(typeof profile[field]!=='string')throw Error('提示词格式不正确');prompts[field]=profile[field];}
    return {type:'miao-nai-prompts',version:1,name:String(profile.name||'导入配置'),prompts};
}
export function promptFilename(name){
    const safe=String(name||'提示词').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').slice(0,64).replace(/[. ]+$/,'')||'提示词';
    return `喵喵NAI-${safe}.json`;
}
export function importPromptData(data,profiles=[]){
    if(!data||data.type!=='miao-nai-prompts'||data.version!==1||!data.prompts||fields.some(field=>typeof data.prompts[field]!=='string'))throw Error('请选择喵喵 NAI 串导出的 JSON 文件');
    const base=typeof data.name==='string'&&data.name.trim()?data.name.trim().slice(0,120):'导入配置';
    const names=new Set(profiles.map(profile=>profile.name));let name=base,n=2;while(names.has(name))name=`${base} (${n++})`;
    // Only the three prompt fields are accepted. Vibes, keys and model settings
    // cannot enter the new profile through extra properties in the JSON.
    return {...structuredClone(defaults),name,positive:data.prompts.positive,positiveSuffix:data.prompts.positiveSuffix,negative:data.prompts.negative,vibes:[],vibeEnabled:false};
}
export async function readPromptFile(file,profiles=[]){
    if(file.size>PROMPT_FILE_LIMIT)throw Error('NAI 串文件不能超过 1 MB');
    let data;try{data=JSON.parse((await file.text()).replace(/^\uFEFF/,''));}catch{throw Error('无法读取 NAI 串文件，请选择有效的 JSON');}
    return importPromptData(data,profiles);
}
