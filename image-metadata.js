// PNG text chunks: https://www.w3.org/TR/png-3/#11textinfo
const latin1=bytes=>Array.from(bytes,byte=>String.fromCharCode(byte)).join('');
const utf8=bytes=>new TextDecoder().decode(bytes);
async function inflate(bytes){
    if(typeof DecompressionStream!=='function')throw Error('当前浏览器无法解压此元数据');
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
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
