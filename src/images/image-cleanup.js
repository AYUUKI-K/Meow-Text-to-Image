import {imageTimestamp} from '../core/core.js';
import {localImagePath} from './image-thumbnails.js';

export function protectedImagePaths({profiles=[],favorites=[],base}){
    const urls=[...profiles.map(profile=>profile.preview?.url),...favorites.flatMap(item=>item.images||[])];
    const paths=new Set();
    for(const url of urls)if(url){try{paths.add(localImagePath(url,base));}catch{/* Non-local references cannot be deleted by this tool. */}}
    return paths;
}
export function isProtectedHistoryImage(image,{profiles=[],favorites=[],base}={}){
    if(/^(?:sample|favorite)-/i.test(image.name)||image.folder?.split('/').includes('miao-nai-favorites'))return true;
    try{return protectedImagePaths({profiles,favorites,base}).has(localImagePath(image.url,base));}catch{return true;}
}
export function planHistoryCleanup(images,{days,now=Date.now(),profiles=[],favorites=[],base}={}){
    if(![1,3,7].includes(days)||!Number.isFinite(now))throw Error('请选择 1、3 或 7 天');
    const cutoff=now-days*86400000,protectedPaths=protectedImagePaths({profiles,favorites,base}),eligible=[],protectedImages=[];
    for(const image of images){
        const time=imageTimestamp(image.name);
        if(time===null||time>=cutoff)continue;
        let protectedImage=/^(?:sample|favorite)-/i.test(image.name)||image.folder?.split('/').includes('miao-nai-favorites');
        try{protectedImage ||= protectedPaths.has(localImagePath(image.url,base));}catch{protectedImage=true;}
        (protectedImage?protectedImages:eligible).push(image);
    }
    return {days,cutoff,images:eligible,protectedCount:protectedImages.length};
}
