import {sha256} from './browser-crypto.js';
import {decodeImage} from './image-export.js';

export const THUMBNAIL_FOLDER='miao-nai-thumbnails';
export function localImagePath(url,base=location.href){
    const source=new URL(url,base),host=new URL(base),path=decodeURIComponent(source.pathname);
    if(source.origin!==host.origin||!path.startsWith('/user/images/')||path.includes('\\')||path.split('/').some(part=>part==='.'||part==='..'))throw Error('请选择当前酒馆保存的图片');
    return path;
}
export async function thumbnailName(url,base){return `thumb-${await sha256(localImagePath(url,base))}.jpg`;}
export async function thumbnailURL(url,base){return `/user/images/${THUMBNAIL_FOLDER}/${await thumbnailName(url,base)}`;}
export function imageBlob(data){
    const raw=String(data).replace(/^data:image\/[\w.+-]+;base64,/,''),bytes=Uint8Array.from(atob(raw),char=>char.charCodeAt(0));
    return new Blob([bytes],{type:'image/png'});
}
export async function makeThumbnail(blob){
    const image=await decodeImage(blob),canvas=document.createElement('canvas');
    try{
        const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
        if(!width||!height)throw Error('图片尺寸无效');
        const scale=Math.min(1,384/Math.max(width,height));canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
        const context=canvas.getContext('2d');if(!context)throw Error('浏览器无法生成缩略图');
        context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
        return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?.type==='image/jpeg'?resolve(blob):reject(Error('缩略图生成失败')),'image/jpeg',0.76));
    }finally{image.close?.();canvas.width=canvas.height=0;}
}
export function blobBase64(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('图片读取失败'));reader.readAsDataURL(blob);});}
export function createThumbnails({fetchImage,saveImage,base=()=>location.href}){
    const pending=new Map();
    return {
        async ensure(url,source){
            const path=localImagePath(url,base());if(pending.has(path))return pending.get(path);
            const work=(async()=>{
                const name=await thumbnailName(url,base()),target=`/user/images/${THUMBNAIL_FOLDER}/${name}`;
                if(!source){const cached=await fetchImage(target);if(cached.ok)return target;const response=await fetchImage(path);if(!response.ok)throw Error('原图读取失败');source=await response.blob();}
                const thumb=await makeThumbnail(source);await saveImage(await blobBase64(thumb),THUMBNAIL_FOLDER,name.replace(/\.jpg$/,''),'jpg');return target;
            })();pending.set(path,work);
            try{return await work;}finally{pending.delete(path);}
        },
    };
}
export function bindThumbnail(image,url){
    image.dataset.originalUrl=url;image.loading='lazy';image.decoding='async';
    image.onerror=()=>{image.dataset.thumbnailState='missing';image.alt='缩略图未生成，可点开放大查看原图';};
    image.onload=()=>{image.dataset.thumbnailState='ready';};
    thumbnailURL(url).then(src=>{if(image.dataset.originalUrl===url){image.dataset.thumbnailUrl=src;image.src=src;}}).catch(()=>{image.dataset.thumbnailState='missing';image.alt='此图片暂不支持缩略图';});
}
