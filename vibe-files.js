import {importVibeData} from './vibe.js';

export const VIBE_FILE_LIMIT=18*1024*1024,VIBE_PACKAGE_LIMIT=64*1024*1024,VIBE_COUNT_LIMIT=128;
const supported=/\.(?:json|naiv4vibe|naiv4vibebundle)$/i;
export async function loadVibeZip(){
    if(!globalThis.JSZip)await import('/lib/jszip.min.js');
    if(!globalThis.JSZip)throw Error('ZIP 组件加载失败，请刷新后重试');
    return globalThis.JSZip;
}
const basename=name=>String(name).split(/[\\/]/).at(-1).replace(/\.[^.]+$/,'')||'Vibe';
function collect(data,name,items){
    const imported=importVibeData(data,name);
    if(items.length+imported.length>VIBE_COUNT_LIMIT)throw Error('一次最多导入 128 个 Vibe');
    items.push(...imported);
}
// Stream each entry with a shared budget, including archives with misleading size headers.
function readEntry(entry,budget){
    return new Promise((resolve,reject)=>{
        const chunks=[];let size=0,failed=false;
        const stream=entry.internalStream('uint8array');
        stream.on('data',chunk=>{
            if(failed)return;
            size+=chunk.length;budget.bytes+=chunk.length;
            if(size>VIBE_FILE_LIMIT||budget.bytes>VIBE_PACKAGE_LIMIT){failed=true;stream.pause();reject(Error('Vibe 解压内容超过限制（单文件 18 MB，整包 64 MB）'));return;}
            chunks.push(chunk);
        }).on('error',error=>{failed=true;reject(error);}).on('end',()=>{
            if(failed)return;
            const bytes=new Uint8Array(size);let offset=0;
            for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
            try{resolve(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch(error){reject(error);}
        }).resume();
    });
}
export async function readVibeFiles(files,{loadZip=loadVibeZip}={}){
    const items=[];let size=0;const budget={bytes:0};
    if(!files.length||files.length>VIBE_COUNT_LIMIT)throw Error('请选择 1～128 个 Vibe 文件');
    for(const file of files){
        size+=file.size;if(size>VIBE_PACKAGE_LIMIT)throw Error('导入文件合计不能超过 64 MB');
        if(/\.zip$/i.test(file.name)){
            const Zip=await loadZip(),archive=await Zip.loadAsync(await file.arrayBuffer());
            const entries=Object.values(archive.files).filter(entry=>!entry.dir&&!entry.name.startsWith('__MACOSX/')&&supported.test(entry.name));
            if(!entries.length||entries.length>VIBE_COUNT_LIMIT)throw Error('ZIP 需包含 1～128 个 Vibe / Bundle / JSON 文件');
            for(const entry of entries)collect(JSON.parse(await readEntry(entry,budget)),basename(entry.name),items);
        }else{
            if(file.size>VIBE_FILE_LIMIT)throw Error('单个文件不能超过 18 MB');
            budget.bytes+=file.size;if(budget.bytes>VIBE_PACKAGE_LIMIT)throw Error('导入内容合计不能超过 64 MB');
            if(supported.test(file.name))collect(JSON.parse(await file.text()),basename(file.name),items);
            else if(['image/png','image/jpeg','image/webp'].includes(file.type)){
                const bytes=new Uint8Array(await file.arrayBuffer());let binary='';
                for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
                collect({name:basename(file.name),image:btoa(binary)},basename(file.name),items);
            }else throw Error('请选择 ZIP、Vibe / Bundle / JSON 或 PNG/JPEG/WebP');
        }
    }
    return items;
}
export async function createVibePackage(items,{loadZip=loadVibeZip}={}){
    if(!items.length||items.length>VIBE_COUNT_LIMIT)throw Error('请选择 1～128 个 Vibe');
    const portable=items.map(item=>importVibeData(item)[0]),Zip=await loadZip(),archive=new Zip();let size=0;
    portable.forEach((item,index)=>{
        const text=JSON.stringify(item),bytes=new TextEncoder().encode(text).length;size+=bytes;
        if(bytes>VIBE_FILE_LIMIT||size>VIBE_PACKAGE_LIMIT)throw Error('Vibe 导出内容超过限制（单文件 18 MB，整包 64 MB），请减少勾选');
        const name=item.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').replace(/[. ]+$/,'').slice(0,80)||'Vibe';
        archive.file(`${String(index+1).padStart(3,'0')}-${name}.naiv4vibe`,text);
    });
    const blob=await archive.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:3},mimeType:'application/zip'});
    return {blob,name:`喵喵Vibe-${items.length}个.zip`};
}
