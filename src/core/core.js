import {applyNovelAIPresets,resolvePresetId,splitImageText,textRenderingLanguage} from '../novelai/novelai-presets.js';
import {parseStructuredScene} from '../novelai/character-prompts.js';
export const defaults = {name:'默认',positive:'best quality, masterpiece',positiveSuffix:'',negative:'lowres, bad anatomy, text, watermark',qualityPreset:'standard',ucPreset:'heavy',model:'nai-diffusion-4-5-full',sampler:'k_euler_ancestral',scheduler:'karras',width:512,height:512,steps:20,scale:5,seed:-1,varietyBoost:false,vibeMode:'multiple',vibeEnabled:true};
export function supportsVarietyBoost(model){return ['nai-diffusion-3','nai-diffusion-furry-3','nai-diffusion-4-full','nai-diffusion-4-curated-preview','nai-diffusion-4-5-full','nai-diffusion-4-5-curated'].includes(model);}
export function varietyBoostSigma(request){
    if(request.variety_boost!==true||!supportsVarietyBoost(request.model))return null;
    // Match SillyTavern's NovelAI endpoint, including its resolution scaling.
    return Math.sqrt(request.width*request.height/1011712)*(request.model.includes('nai-diffusion-4-5')?58:19);
}
export function normalizeProfile(profile) {
    const merged={...defaults,...profile};
    merged.positive=[merged.positive,merged.artists].filter(v=>typeof v==='string'&&v.trim()).map(v=>v.trim()).join(',\n');
    merged.positiveSuffix=typeof merged.positiveSuffix==='string'?merged.positiveSuffix:'';
    merged.qualityPreset=resolvePresetId(merged.model,'quality',merged.qualityPreset);
    merged.ucPreset=resolvePresetId(merged.model,'uc',merged.ucPreset);
    delete merged.artists;
    return merged;
}
export function imageURL(folder,name) {
    validateFolder(folder);
    if(!imageDay(name))throw new Error('不是可管理的生成图片');
    return `/user/images/${encodeURIComponent(folder)}/${encodeURIComponent(name)}`;
}
// The last floor must itself be an assistant reply. Never fall back to older tags.
export function latestImageMessage(chat) {
    const message = chat.at(-1);
    return message && !message.is_user && !message.is_system ? message : null;
}
export function canAutoGenerate(chat, message, mode, streaming = false) {
    return latestImageMessage(chat) === message && (mode === 'stream' || (mode === 'auto' && !streaming));
}
export function validateFolder(value) {
    if(typeof value!=='string'||!value.trim()||value.length>64||!/^[\p{L}\p{N}_ -]+$/u.test(value))throw new Error('目录名可用中英文、数字、空格、短横线和下划线，最多 64 字；不支持绝对路径');
    return value.trim();
}
export function imageTimestamp(filename) {
    const match=/^(?:miao|test|sample|favorite)-(\d{13})(?:-[\da-f-]+)?\.(?:png|jpg|webp)$/i.exec(filename);
    if(!match)return null;
    return Number(match[1]);
}
export function compareImagesNewest(a,b){return (imageTimestamp(b.name)??0)-(imageTimestamp(a.name)??0)||b.name.localeCompare(a.name);}
export function imageDay(filename) {
    const timestamp=imageTimestamp(filename);if(timestamp===null)return null;
    const date=new Date(timestamp);
    if(!Number.isFinite(date.getTime()))return null;
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function parseBlocks(text, pattern = delimiterPattern('image###','###')) {
    const regex = new RegExp(pattern, 'gi');
    return [...String(text).matchAll(regex)].filter(m => m[1]?.trim()).map((m, index) => ({index, raw:m[0], prompt:m[1].trim(), start:m.index}));
}
// Markdown may split lines into paragraphs, or consume a hash-only closing line.
// Keep offsets into the rendered text so a DOM Range replaces the original spot.
export function renderedBlockRange(text,raw,startTag,endTag){
    const exact=text.indexOf(raw);if(exact>=0)return {start:exact,end:exact+raw.length};
    const offsets=[];let compact='';
    for(let i=0;i<text.length;i++)if(!/\s/.test(text[i])){compact+=text[i];offsets.push(i);}
    const stripMarkdown=value=>String(value)
        .replace(/!\[([^\]]*)\]\([^)]*\)/g,'$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g,'$1')
        .replace(/<!--[\s\S]*?-->/g,'')
        .replace(/<\/?[A-Za-z][^>]*>/g,'')
        .replace(/`{1,3}|\*{2}|_{2}|~~/g,'');
    const find=value=>{
        const candidates=[String(value),stripMarkdown(value)];
        for(const candidate of candidates){
            const needle=candidate.replace(/\s/g,'');if(!needle)continue;
            const at=compact.indexOf(needle);if(at>=0)return {start:offsets[at],end:offsets[at+needle.length-1]+1};
        }
        return null;
    };
    const full=find(raw);if(full)return full;
    if(/^#{1,6}$/.test(endTag)&&raw.startsWith(startTag)&&raw.endsWith(endTag)){
        const body=find(raw.slice(0,-endTag.length));
        if(body){
            // Markdown may leave one or two hashes from a longer closing line.
            const tail=text.slice(body.end).match(/^\s*(#{1,6})(?=\s|$)/);
            if(tail&&tail[1].length<=endTag.length)body.end+=tail[0].length;
            return body;
        }
    }
    return null;
}
// Mask rather than remove: offsets still point into the original message.
export function maskReasoning(text, configured={}) {
    let value=String(text??'');
    // Instructions in comments can mention an opening reasoning tag literally.
    value=value.replace(/<!--[\s\S]*?(?:-->|$)/g,match=>match.replace(/[^\r\n]/g,' '));
    const pairs=[['<think>','</think>'],['<thinking>','</thinking>'],['<analysis>','</analysis>'],['<reasoning>','</reasoning>'],['<imgthink>','</imgthink>'],['<imagethink>','</imagethink>'],['<tag_think>','</tag_think>']];
    if(configured.prefix?.trim())pairs.unshift([configured.prefix,configured.suffix||'']);
    const normalized=value.replace(/<\/?tag_think>/gi,tag=>tag.toLowerCase());
    const searches=pairs.map(([prefix])=>prefix==='<tag_think>'?normalized:value);
    // Cache each next opening so every search advances through the text.
    const openings=pairs.map(([prefix],index)=>searches[index].indexOf(prefix));
    const parts=[];
    let cursor=0;
    while(cursor<value.length){
        let selected=-1,start=value.length;
        for(let i=0;i<pairs.length;i++){
            if(openings[i]>=0&&openings[i]<cursor)openings[i]=searches[i].indexOf(pairs[i][0],cursor);
            if(openings[i]>=0&&openings[i]<start){selected=i;start=openings[i];}
        }
        if(selected<0)break;
        const [prefix,suffix]=pairs[selected];
        const search=searches[selected];
        let end=value.length;
        if(suffix){
            let position=start+prefix.length,depth=1;
            let close=search.indexOf(suffix,position);
            let nested=prefix===suffix?-1:search.indexOf(prefix,position);
            // Only the outer pair controls depth; other tag types are opaque.
            while(close>=0){
                if(nested>=0&&nested<close){
                    depth++;position=nested+prefix.length;
                    nested=search.indexOf(prefix,position);
                    if(close<position)close=search.indexOf(suffix,position);
                }else{
                    position=close+suffix.length;
                    if(--depth===0){end=position;break;}
                    close=search.indexOf(suffix,position);
                    if(nested>=0&&nested<position)nested=search.indexOf(prefix,position);
                }
            }
        }
        parts.push(value.slice(cursor,start),value.slice(start,end).replace(/[^\r\n]/g,' '));
        cursor=end;
    }
    if(!parts.length)return value;
    parts.push(value.slice(cursor));
    value=parts.join('');
    return value;
}
export function pageItems(items,page=0,size=24){
    const pages=Math.max(1,Math.ceil(items.length/size)),current=Math.max(0,Math.min(pages-1,page));
    return {items:items.slice(current*size,(current+1)*size),page:current,pages,total:items.length};
}
export function parseBodyBlocks(text,pattern,format={}){
    const original=String(text??''),previous=parseBlocks(original,pattern);
    return parseBlocks(maskReasoning(original,format),pattern)
        .filter(b=>original.slice(b.start,b.start+b.raw.length)===b.raw)
        .map((b,bodyIndex)=>({...b,bodyIndex,index:previous.find(old=>old.start===b.start)?.index??b.index}));
}
export const sizePresets=[{name:'方图',width:1024,height:1024},{name:'竖图',width:832,height:1216},{name:'横图',width:1216,height:832}];
export function delimiterPattern(start,end) {
    if(typeof start!=='string'||typeof end!=='string'||!start||!end)throw new Error('起始标签和结束标签都要填写喵');
    const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    // Never use the closing portion of a NEW opening tag to close an older one.
    return `${escape(start)}((?:(?!${escape(start)})[\\s\\S])*?)${escape(end)}`;
}
export function buildRequest(profile, prompt) {
    const p = normalizeProfile(profile);
    for (const key of ['width','height']) if (!Number.isInteger(+p[key]) || +p[key]<64 || +p[key]>2048 || +p[key]%64) throw new Error('宽高须为 64～2048 的 64 倍数');
    if (+p.width * +p.height > 2097152) throw new Error('画布总像素不能超过 2097152');
    if (!Number.isInteger(+p.steps) || +p.steps<1 || +p.steps>50) throw new Error('步数须为 1～50');
    if (!Number.isFinite(+p.scale) || +p.scale<0 || +p.scale>10) throw new Error('Guidance 须为 0～10');
    if (!Number.isInteger(+p.seed) || +p.seed < -1 || +p.seed > 4294967295) throw new Error('种子须为 -1 或 0～4294967295');
    const canRenderText=textRenderingLanguage(p.model)!=='none';
    const split=value=>canRenderText?splitImageText(value):{tags:value,text:''};
    const body=split(prompt);
    const {scene,characters}=parseStructuredScene(body.tags);
    if(characters.length){
        const modelVersion=/^nai-diffusion-([45])(?:-|$)/.exec(p.model)?.[1];
        if(!modelVersion)throw Error('独立角色提示词需要 NovelAI V4、V4.5 或 V5 模型');
        const limit=modelVersion==='5'?22:6;
        if(characters.length>limit)throw Error(`当前模型最多支持 ${limit} 个独立角色`);
    }
    const parts=[split(p.positive),{tags:scene,text:body.text},split(p.positiveSuffix)];
    const positive=parts.map(({tags})=>tags.trim()).filter(Boolean).map(s=>s.endsWith(',')?s:`${s},`).join('\n');
    const imageText=parts.map(({text})=>text).filter(Boolean).join('\n\n');
    const negative=imageText&&p.negative===defaults.negative?p.negative.replace(', text,',','):p.negative;
    const prepared=applyNovelAIPresets(p,positive,negative,{textRendering:Boolean(imageText)});
    const caption=imageText?[prepared.prompt.trimEnd(),`Text: ${imageText}`].filter(Boolean).join('\n'):prepared.prompt;
    const request={prompt:caption,negative_prompt:prepared.negative,model:p.model,sampler:p.sampler,scheduler:p.scheduler,width:+p.width,height:+p.height,steps:+p.steps,scale:+p.scale,seed:+p.seed<0?Math.floor(Math.random()*4294967296):+p.seed,sm:false,sm_dyn:false,upscale_ratio:1,decrisper:false,variety_boost:p.varietyBoost===true&&supportsVarietyBoost(p.model)};
    if(characters.length)request.characters=characters;
    return request;
}
