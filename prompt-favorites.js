import {randomId} from './browser-crypto.js';
import {localImagePath} from './image-thumbnails.js';

export const FAVORITE_FOLDER='miao-nai-favorites';
export const FAVORITE_IMAGE_LIMIT=8;
export const favoritesEnabled=settings=>settings.promptFavoritesEnabled===true;
export function favoriteDraft(value={}){
    // This positive field is the scene text from the model, never a profile's style prefix.
    return {id:value.id,name:value.name||'',positive:value.positive||'',images:[...(value.images||[])],created:value.created};
}
export function validateFavorite(value,base){
    const item=favoriteDraft(value);for(const key of ['name','positive'])item[key]=String(item[key]).trim();
    if(!item.name)throw Error('请填写收藏名称');
    if(!item.positive)throw Error('请填写模型输出的场景提示词');
    item.images=[...new Set(item.images.map(url=>localImagePath(url,base)))];
    if(item.images.length>FAVORITE_IMAGE_LIMIT)throw Error(`每条收藏最多 ${FAVORITE_IMAGE_LIMIT} 张例图`);
    return item;
}
export function protectedFavoriteImages(favorites,base){return new Set(favorites.flatMap(item=>item.images.map(url=>localImagePath(url,base))));}
export function createFavorites({settings,persist,base=()=>location.href}){
    settings.promptFavorites??=[];
    let queue=Promise.resolve();
    const mutate=fn=>{const job=queue.then(async()=>{const before=structuredClone(settings.promptFavorites);try{const result=fn();await persist();return result;}catch(error){settings.promptFavorites=before;throw error;}});queue=job.catch(()=>{});return job;};
    return {
        list:()=>settings.promptFavorites,
        save:value=>mutate(()=>{const item=validateFavorite(value,base()),now=Date.now(),previous=settings.promptFavorites.find(old=>old.id===item.id);item.id=previous?.id||randomId();item.created=previous?.created||now;item.updated=now;const at=settings.promptFavorites.indexOf(previous);if(at<0)settings.promptFavorites.unshift(item);else settings.promptFavorites[at]=item;return item;}),
        remove:id=>mutate(()=>{settings.promptFavorites=settings.promptFavorites.filter(item=>item.id!==id);}),
        addImage:(id,url)=>mutate(()=>{const item=settings.promptFavorites.find(item=>item.id===id);if(!item)return false;if(item.images.length>=FAVORITE_IMAGE_LIMIT)throw Error(`每条收藏最多 ${FAVORITE_IMAGE_LIMIT} 张例图，请先移除不需要的例图`);item.images=[...new Set([...item.images,localImagePath(url,base())])];item.updated=Date.now();return true;}),
        protects:url=>protectedFavoriteImages(settings.promptFavorites,base()).has(localImagePath(url,base())),
    };
}
