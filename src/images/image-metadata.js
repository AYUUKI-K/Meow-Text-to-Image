import {decodeImage} from './image-export.js';
// PNG text chunks: https://www.w3.org/TR/png-3/#11textinfo
const latin1=bytes=>Array.from(bytes,byte=>String.fromCharCode(byte)).join('');
const utf8=bytes=>new TextDecoder().decode(bytes);
async function inflate(bytes,format='deflate'){
    if(typeof DecompressionStream!=='function')throw Error('当前浏览器无法解压此元数据');
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format))).arrayBuffer());
}
function field(bytes,offset){
    const end=bytes.indexOf(0,offset);if(end<0)throw Error('元数据字段不完整');
    return {bytes:bytes.subarray(offset,end),next:end+1};
}
export async function readImageMetadata(blob){
    const bytes=new Uint8Array(await blob.arrayBuffer()),result={format:blob.type||'unknown',text:[],chunks:[]};
    if(![137,80,78,71,13,10,26,10].every((byte,i)=>bytes[i]===byte))return result;
    result.format='PNG';const data=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    for(let offset=8;offset<bytes.length;){
        if(offset+12>bytes.length)throw Error('PNG 数据块不完整');
        const length=data.getUint32(offset),type=latin1(bytes.subarray(offset+4,offset+8)),end=offset+12+length;
        if(end>bytes.length)throw Error('PNG 数据块长度无效');
        const payload=bytes.subarray(offset+8,end-4);result.chunks.push({type,length});
        if(type==='IHDR'){
            if(length!==13)throw Error('PNG 图片头无效');
            Object.assign(result,{width:data.getUint32(offset+8),height:data.getUint32(offset+12),bitDepth:payload[8],colorType:payload[9],compression:payload[10],filter:payload[11],interlace:payload[12]});
        }
        if(['tEXt','zTXt','iTXt'].includes(type)){
            const entry={type};result.text.push(entry);
            try{
                const keyword=field(payload,0);entry.keyword=latin1(keyword.bytes);let start=keyword.next,text;
                if(type==='tEXt')text=latin1(payload.subarray(start));
                else if(type==='zTXt'){
                    if(payload[start]!==0)throw Error('不支持的文本压缩方式');
                    text=latin1(await inflate(payload.subarray(start+1)));
                }else{
                    const compressed=payload[start++],method=payload[start++];
                    if(compressed>1||method!==0)throw Error('不支持的文本压缩方式');
                    const language=field(payload,start),translated=field(payload,language.next);
                    entry.language=latin1(language.bytes);entry.translatedKeyword=utf8(translated.bytes);
                    const content=payload.subarray(translated.next);text=utf8(compressed?await inflate(content):content);
                }
                entry.text=text;try{entry.parameters=JSON.parse(text);}catch{}
            }catch(error){entry.error=error.message;}
        }
        offset=end;if(type==='IEND')break;
    }
    return result;
}

// NovelAI's importer reads column-major alpha LSBs and a big-endian bit length.
export async function readStealthMetadata({data,width,height}){
    const capacity=width*height;if(capacity<152)return null;let offset=0;
    const byte=()=>{if(offset+8>capacity)throw Error('隐藏元数据不完整');let value=0;for(let bit=0;bit<8;bit++,offset++)value=(value<<1)|(data[4*((offset%height)*width+Math.floor(offset/height))+3]&1);return value;};
    const signature=String.fromCharCode(...Array.from({length:15},byte));
    if(!['stealth_pngcomp','stealth_pnginfo'].includes(signature))return null;
    const bits=(byte()*0x1000000+(byte()<<16)+(byte()<<8)+byte())>>>0;
    if(!bits||bits>capacity-offset||bits%8)throw Error('隐藏元数据长度无效');
    const bytes=Uint8Array.from({length:bits/8},byte);
    const text=signature==='stealth_pngcomp'?utf8(await inflate(bytes,bytes[0]===31&&bytes[1]===139?'gzip':'deflate')):utf8(bytes);
    return JSON.parse(text);
}

export async function readGenerationMetadata(blob){
    const result=await readImageMetadata(blob);
    if(result.format!=='PNG'||result.text.some(entry=>entry.keyword==='Comment'&&entry.parameters))return result;
    let image,canvas;
    try{
        image=await decodeImage(blob);const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
        if(width*height>16777216)return result;
        canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d',{willReadFrequently:true});
        context.drawImage(image,0,0);const hidden=await readStealthMetadata(context.getImageData(0,0,width,height));
        if(hidden)for(const [keyword,value] of Object.entries(hidden)){
            const text=typeof value==='string'?value:JSON.stringify(value),entry={type:'stealth',keyword,text};try{entry.parameters=JSON.parse(text);}catch{}result.text.push(entry);
        }
    }catch(error){result.stealthError=error.message;}
    finally{image?.close?.();if(canvas)canvas.width=canvas.height=0;}
    return result;
}

const models={
    'nai-diffusion-5-full':['V5 Full',['657484A5','0ADF9AB7']],
    'nai-diffusion-5-curated':['V5 Curated',['DB276663']],
    'nai-diffusion-5-full-medium':['V5 Full Medium',['93F4BD30','70AB5786']],
    'nai-diffusion-4-5-full':['V4.5 Full',['4BDE2A90','1229B44F','B9F340FD','F3D95188']],
    'nai-diffusion-4-5-curated':['V4.5 Curated',['C02D4F98','5AB81C7C','B5A2A797']],
    'nai-diffusion-4-full':['V4 Full',['37442FCA','4F49EC75','CA4B7203','79F47848','F6302A9D']],
    'nai-diffusion-4-curated-preview':['V4 Curated',['7ABFFA2A','C1CCBA86','770A9E12']],
    'nai-diffusion-3':['V3 Anime',['B0BDF6C1','C1E1DE52','7BCCAA2C','1120E6A9','8BA2AF87']],
    'nai-diffusion-furry-3':['V3 Furry',['4BE8C60C','C8704949','37C2B166','F306816B','9CC2F394']],
};
const object=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
export function generationInfo(metadata,savedRecord){
    const text=Object.fromEntries((metadata.text||[]).map(entry=>[entry.keyword,entry.parameters??entry.text]));
    const embedded=object(text.Comment),saved=object(savedRecord?.request),parameters={...saved,...embedded};
    const source=typeof text.Source==='string'?text.Source:'',match=Object.entries(models).find(([,model])=>model[1].some(hash=>source.endsWith(' '+hash)));
    const modelId=embedded.model||match?.[0]||saved.model||'',model=models[modelId]?.[0]||modelId||source||'未记录';
    const prompt=embedded.v4_prompt?.caption?.base_caption??embedded.prompt??text.Description??saved.v4_prompt?.caption?.base_caption??saved.prompt??'',negative=embedded.v4_negative_prompt?.caption?.base_caption??embedded.uc??embedded.negative_prompt??saved.v4_negative_prompt?.caption?.base_caption??saved.negative_prompt??'';
    const positiveCharacters=parameters.v4_prompt?.caption?.char_captions||[],negativeCharacters=parameters.v4_negative_prompt?.caption?.char_captions||[];
    const characters=Array.from({length:Math.max(positiveCharacters.length,negativeCharacters.length)},(_,index)=>({positive:positiveCharacters[index]?.char_caption??'',negative:negativeCharacters[index]?.char_caption??'',centers:positiveCharacters[index]?.centers??negativeCharacters[index]?.centers}));
    const width=embedded.width??metadata.width??saved.width,height=embedded.height??metadata.height??saved.height;
    if(modelId)parameters.model=modelId;if(width!==undefined)parameters.width=width;if(height!==undefined)parameters.height=height;
    return {model,modelId,source,prompt,negative,characters,width,height,parameters,metadata:Object.fromEntries(Object.entries(text).filter(([key])=>!['Comment','Description','Source'].includes(key)))};
}
