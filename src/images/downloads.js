import {checkedFetch} from '../platform/request-errors.js';

function downloadContext(windowImpl){
    if(!windowImpl)return null;
    try{const top=windowImpl.top;if(top?.document?.body&&top.URL?.createObjectURL)return top;}catch{/* Cross-origin parents are outside this plugin's download scope. */}
    return windowImpl;
}

export function downloadBrowserBlob(blob,name,{windowImpl=globalThis.window}={}){
    const context=downloadContext(windowImpl),documentImpl=context.document,urlAPI=context.URL;
    const url=urlAPI.createObjectURL(blob),link=documentImpl.createElement('a');link.href=url;link.download=name;link.hidden=true;
    try{documentImpl.body.append(link);link.click();}
    finally{link.remove();context.setTimeout(()=>urlAPI.revokeObjectURL(url),60000);}
}

// Ordinary browsers can hand an existing PNG straight to their download manager.
// Keep this synchronous so the actual user click is not lost behind a fetch.
export function downloadLocalPNG(image,{base=globalThis.location?.href,documentImpl,windowImpl=globalThis.window}={}){
    let url,current;
    try{current=new URL(base);url=new URL(image.url,current);}catch{return false;}
    if(!['http:','https:'].includes(url.protocol)||url.origin!==current.origin||url.username||url.password||!url.pathname.startsWith('/user/images/')||!url.pathname.toLowerCase().endsWith('.png'))return false;
    documentImpl??=downloadContext(windowImpl)?.document||globalThis.document;
    const link=documentImpl.createElement('a');link.href=url.href;link.download=image.name||'miao-image.png';link.hidden=true;
    documentImpl.body.append(link);
    try{link.click();}finally{link.remove();}
    return true;
}

export async function downloadImageSelection(images,{saveBlob,downloadURL,fetchImpl=fetch}){
    if(!images.length)throw Error('请先勾选图片');
    for(const image of images){
        if(downloadURL?.(image)===true)continue;
        let response;try{response=await checkedFetch('image-download',image.url,{}, {fetchImpl});}
        catch(error){error.message=image.name+' · '+error.message;throw error;}
        const result=await saveBlob(await response.blob(),image.name);
        if(result?.delivered===false)break;
    }
}
