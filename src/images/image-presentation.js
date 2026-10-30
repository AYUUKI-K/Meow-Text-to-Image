import {sha256} from '../platform/browser-crypto.js';
import {prepareImageExport} from './image-export.js';

export const JPEG_FOLDER='miao-nai-jpg';

// Keep original archive URLs separate from the bytes offered by native image menus.
export function createImagePresentation({getFormat,fetchImage,saveJPEG,onError=()=>{},base=()=>location.href,documentImpl=globalThis.document,Observer=globalThis.IntersectionObserver,convert=prepareImageExport}){
    const ready=new Map(),pending=new Map(),bindings=new WeakMap();let active=0;const waiting=[];
    const run=async work=>{if(active>=2)await new Promise(resolve=>waiting.push(resolve));else active++;try{return await work();}finally{if(waiting.length)waiting.shift()();else active--;}};
    const jpeg=async url=>{
        if(ready.has(url))return ready.get(url);if(pending.has(url))return pending.get(url);
        const work=run(async()=>{
            const absolute=new URL(url,base());if(absolute.origin!==new URL(base()).origin)throw Error('请选择当前酒馆的图片');
            const name='jpg-'+await sha256(absolute.pathname),target=`/user/images/${JPEG_FOLDER}/${name}.jpg`;
            const cached=await fetchImage(target);
            if(cached.ok&&cached.headers.get('content-type')?.split(';')[0]==='image/jpeg'){
                const bytes=new Uint8Array(await (await cached.blob()).slice(0,2).arrayBuffer());if(bytes[0]===255&&bytes[1]===216)return target;
            }
            const response=await fetchImage(url);if(!response.ok)throw Error('原图读取失败：HTTP '+response.status);
            const {blob}=await convert(await response.blob(),name+'.png','jpg');return saveJPEG(blob,JPEG_FOLDER,name);
        });pending.set(url,work);
        try{const result=await work;ready.set(url,result);return result;}finally{pending.delete(url);}
    };
    const observer=Observer?new Observer(entries=>{for(const entry of entries){if(entry.target.isConnected===false){observer.unobserve(entry.target);continue;}if(entry.isIntersecting){observer.unobserve(entry.target);const binding=bindings.get(entry.target);if(binding)void present(entry.target,binding);}}}, {rootMargin:'240px'}):null;
    if(observer&&globalThis.MutationObserver&&documentImpl?.body){
        const images=node=>node.nodeType===1?[...(node.matches('img')?[node]:[]),...node.querySelectorAll('img')]:[];
        const changes=new MutationObserver(records=>{for(const record of records){for(const node of record.removedNodes)for(const image of images(node))observer.unobserve(image);for(const node of record.addedNodes)for(const image of images(node)){const binding=bindings.get(image);if(binding?.lazy&&binding.format==='jpg'&&image.dataset.miaoExportState==='loading')observer.observe(image);}}});
        changes.observe(documentImpl.body,{childList:true,subtree:true});
    }
    const present=async(image,binding)=>{
        if(bindings.get(image)!==binding||binding.format!=='jpg'||getFormat()!=='jpg')return;
        try{const src=await jpeg(binding.url);if(bindings.get(image)===binding&&getFormat()==='jpg'){image.src=src;image.dataset.miaoExportState='ready';}}
        catch(error){if(bindings.get(image)===binding&&getFormat()==='jpg'){image.dataset.miaoExportState='error';image.alt='JPG 转换失败，请刷新重试';onError(error);}}
    };
    const bind=(image,url,{lazy=false}={})=>{
        const format=getFormat()==='jpg'?'jpg':'png',old=bindings.get(image);
        if(old?.url===url&&old.format===format&&image.dataset.miaoExportState!=='error')return;
        observer?.unobserve(image);const binding={url,format,lazy};bindings.set(image,binding);image.dataset.miaoOriginalUrl=url;image.dataset.miaoImageFormat=format;image.dataset.miaoExportState=format==='png'||ready.has(url)?'ready':'loading';
        if(lazy){image.loading='lazy';image.decoding='async';}
        if(format==='png'){image.src=url;return;}
        // Never expose the PNG, even briefly, while a private JPG is being prepared.
        if(ready.has(url))image.src=ready.get(url);else image.removeAttribute('src');
        if(!ready.has(url)){if(lazy&&observer)observer.observe(image);else void present(image,binding);}
    };
    return {bind,jpeg,refresh(root=documentImpl){for(const image of root.querySelectorAll('img[data-miao-original-url]')){const old=bindings.get(image);if(old)bind(image,old.url,{lazy:old.lazy});}},
        async forget(url){try{await pending.get(url);}catch{}ready.delete(url);return `user/images/${JPEG_FOLDER}/jpg-${await sha256(new URL(url,base()).pathname)}.jpg`;},
        async file(image,format=getFormat()){
            let url=format==='jpg'?await jpeg(image.url):image.url,response=await fetchImage(url);
            if(format==='jpg'&&!response.ok){ready.delete(image.url);url=await jpeg(image.url);response=await fetchImage(url);}
            if(!response.ok)throw Error(image.name+' · HTTP '+response.status);
            const source=await response.blob(),mime=format==='jpg'?'image/jpeg':source.type.split(';')[0]||'image/png';
            return {url,blob:source.slice(0,source.size,mime),name:format==='jpg'?image.name.replace(/\.[^.]+$/,'')+'.jpg':image.name};
        }};
}
