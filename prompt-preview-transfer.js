import {decodeImage} from './image-export.js';
import {readPreviewData,PREVIEW_DATA_LIMIT} from './prompt-files.js';
import {imageArchiveLocation,archiveImageURL} from './image-archives.js';
import {hostFetch} from './host-fetch.js';

async function thumbnail(blob,type){
    const image=await decodeImage(blob),canvas=document.createElement('canvas');
    try{
        const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
        if(!width||!height||width>4096||height>4096)throw Error('例图尺寸无效');
        const scale=Math.min(1,512/Math.max(width,height));canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
        const context=canvas.getContext('2d');if(!context)throw Error('浏览器无法读取例图');
        context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
        const url=canvas.toDataURL(type,0.85),data=url.slice(url.indexOf(',')+1);
        if(!url.startsWith(`data:${type};base64,`)||type==='image/jpeg'&&data.length>PREVIEW_DATA_LIMIT)throw Error('例图过大，无法导出');
        return {mime:type,data};
    }finally{image.close?.();canvas.width=canvas.height=0;}
}
export async function exportPreview(url,{origin=location.href,fetchImpl=fetch}={}){
    if(!url)return;
    const {folder,name}=imageArchiveLocation(url,origin);
    const response=await hostFetch(archiveImageURL(folder,name),{}, {fetchImpl});
    if(!response.ok)throw Error('无法读取例图，请刷新例图后重试');
    const blob=await response.blob();if(blob.size>8*1024*1024||!['image/png','image/jpeg','image/webp'].includes(blob.type.split(';')[0]))throw Error('例图格式无效或过大');
    // Re-encode to omit original metadata and avoid exporting a machine-local image URL.
    return thumbnail(blob,'image/jpeg');
}
export async function previewPNG(preview){
    const {mime,data}=readPreviewData(preview),bytes=Uint8Array.from(atob(data),char=>char.charCodeAt(0));
    return (await thumbnail(new Blob([bytes],{type:mime}),'image/png')).data;
}
