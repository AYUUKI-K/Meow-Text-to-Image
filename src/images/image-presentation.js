import {sha256} from '../platform/browser-crypto.js';
import {prepareImageExport} from './image-export.js';

export function createImagePresentation({fetchImage,base=()=>location.href,convert=prepareImageExport}){
    return {
        bind(image,url,{lazy=false}={}){
            if(lazy){image.loading='lazy';image.decoding='async';}
            if(image.dataset.miaoOriginalUrl===url)return;
            image.dataset.miaoOriginalUrl=url;
            image.src=url;
        },
        async file({url,name},format){
            const response=await fetchImage(url);
            if(!response.ok)throw Error(name+' · HTTP '+response.status);
            const source=await response.blob();
            const mime=source.type.split(';')[0]||'image/png';
            return {url,...await convert(source.slice(0,source.size,mime),name,format)};
        },
        // Remove any JPEG previews created by older releases when their originals are deleted.
        async legacyJPEGPath(url){
            return `user/images/miao-nai-jpg/jpg-${await sha256(new URL(url,base()).pathname)}.jpg`;
        },
    };
}
