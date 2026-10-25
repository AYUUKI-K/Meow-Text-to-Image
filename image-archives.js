import {validateFolder,imageDay} from './core.js';

export function archiveContext(context){
    const group=context.groupId!==undefined&&context.groupId!==null&&String(context.groupId)!=='';
    const character=context.characters?.[context.characterId],selectedGroup=context.groups?.find(item=>String(item.id)===String(context.groupId));
    return {cardId:group?'group:'+context.groupId:character?.avatar?'card:'+character.avatar:'',cardName:group?selectedGroup?.name||'群聊':character?.name||'',chatId:String(context.getCurrentChatId?.()??'')};
}
// Nested paths are accepted only to keep images made by 1.3.0/1.3.1 accessible.
export function validateArchivePath(value){
    if(typeof value!=='string'||value.length>220)throw Error('图片目录无效');
    const parts=value.split('/');if(parts.length>3||parts.some(part=>validateFolder(part)!==part))throw Error('图片目录无效');return value;
}
export function archiveImageURL(folder,name){
    validateArchivePath(folder);if(!imageDay(name))throw Error('不是可管理的生成图片');return '/user/images/'+folder.split('/').map(encodeURIComponent).join('/')+'/'+encodeURIComponent(name);
}
export function imageArchiveLocation(value,origin){
    const url=new URL(value,origin),base=new URL(origin),parts=url.pathname.split('/');
    if(url.origin!==base.origin||parts[1]!=='user'||parts[2]!=='images'||parts.length<5)throw Error('这张图片不在酒馆图片目录');
    const name=decodeURIComponent(parts.pop()),folder=parts.slice(3).map(decodeURIComponent).join('/');archiveImageURL(folder,name);return {folder,name};
}
export function rememberImage(catalog,url,context,origin){
    let location;try{location=imageArchiveLocation(url,origin);}catch{return false;}
    if(!context?.cardId)return false;
    const key=archiveImageURL(location.folder,location.name),previous=catalog[key];
    // A copied/forked chat must not steal the ownership of an existing image.
    if(previous){if(previous.cardId===context.cardId&&previous.cardName!==context.cardName){previous.cardName=context.cardName;return true;}return false;}
    catalog[key]={...location,cardId:context.cardId,cardName:context.cardName||'未命名角色',chatId:String(context.chatId??'')};return true;
}
export function archiveItems(images,catalog){
    return images.map(image=>{const owner=catalog[archiveImageURL(image.folder,image.name)];return {...image,cardId:owner?.cardId||'',cardName:owner?.cardName||'未分类',chatId:owner?.chatId||'',kind:image.name.startsWith('sample-')?'sample':'image'};});
}
const cardKey=image=>image.kind==='sample'?'@samples':image.cardId||'@unclassified';
export function browseArchive(images,selection=[]){
    let items=images;const crumbs=[];
    if(selection.length){items=images.filter(image=>cardKey(image)===selection[0]);crumbs.push({label:selection[0]==='@samples'?'例图':items[0]?.cardName||'未分类',path:[selection[0]]});}
    if(selection.length>1){items=items.filter(image=>(image.chatId||'@unknown')===selection[1]);crumbs.push({label:selection[1]==='@unknown'?'未分类聊天':selection[1],path:selection.slice(0,2)});}
    const children=new Map();
    if(!selection.length)for(const image of items){const key=cardKey(image);if(!children.has(key))children.set(key,{label:key==='@samples'?'例图':image.cardName,path:[key],count:0});children.get(key).count++;}
    else if(selection.length===1&&!selection[0].startsWith('@'))for(const image of items){const key=image.chatId||'@unknown';if(!children.has(key))children.set(key,{label:image.chatId||'未分类聊天',path:[selection[0],key],count:0});children.get(key).count++;}
    return {items,children:[...children.values()].sort((a,b)=>a.label.localeCompare(b.label,'zh-CN')),crumbs};
}
