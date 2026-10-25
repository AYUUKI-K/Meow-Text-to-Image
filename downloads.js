// Use the same browser Blob download as an image in the chat floor.
import {checkedFetch} from './request-errors.js';
export async function downloadImageSelection(images,{saveBlob,fetchImpl=fetch}){
    if(!images.length)throw Error('请先勾选图片');
    for(const image of images){
        let response;try{response=await checkedFetch('image-download',image.url,{}, {fetchImpl});}
        catch(error){error.message=image.name+' · '+error.message;throw error;}
        const result=await saveBlob(await response.blob(),image.name);
        if(result?.delivered===false)break;
    }
}
