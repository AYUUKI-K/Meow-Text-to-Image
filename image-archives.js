import {validateFolder,imageDay} from './core.js';
import {sha256} from './browser-crypto.js';
import {checkedFetch} from './request-errors.js';
import {hostFetch} from './host-fetch.js';

export function validateArchivePath(value){
    if(typeof value!=='string'||value.length>220)throw Error('归档目录无效');
    const parts=value.split('/');
    if(parts.length<1||parts.length>3||parts.some(part=>validateFolder(part)!==part||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(part)))throw Error('归档目录无效');
    return value;
}
export function archiveContext(context){
    const group=context.groupId!==undefined&&context.groupId!==null&&String(context.groupId)!=='';
    const character=context.characters?.[context.characterId],selectedGroup=context.groups?.find(item=>String(item.id)===String(context.groupId));
    return {cardId:group?'group:'+context.groupId:character?.avatar?'card:'+character.avatar:'',cardName:group?selectedGroup?.name||'群聊':character?.name||'',chatId:context.getCurrentChatId?.()};
}
export async function archiveFolder(root,mode,context){
    root=validateFolder(root);if(mode==='flat')return root;
    if(!['card','chat'].includes(mode)||!context?.cardId)throw Error('请先打开角色卡或群聊');
    const segment=async(label,id)=>{const name=String(label).normalize('NFKC').replace(/[^\p{L}\p{N}_ -]/gu,'_').trim().slice(0,40)||'未命名';return name+'--'+(await sha256(String(id))).slice(0,12);};
    const card=await segment(context.cardName,context.cardId);
    if(mode==='card')return validateArchivePath(root+'/'+card);
    if(context.chatId===undefined||context.chatId===null||!String(context.chatId).trim()||['undefined','null'].includes(String(context.chatId)))throw Error('请先打开聊天存档');
    return validateArchivePath(root+'/'+card+'/'+await segment(context.chatId,context.cardId+'\n'+context.chatId));
}
export const archiveLabel=folder=>folder.split('/').map(part=>part.replace(/--[a-f0-9]{12}$/,'')).join(' / ');
export function archiveImageURL(folder,name){
    validateArchivePath(folder);if(!imageDay(name))throw Error('不是可管理的生成图片');
    return '/user/images/'+folder.split('/').map(encodeURIComponent).join('/')+'/'+encodeURIComponent(name);
}
export function imageArchiveLocation(value,origin){
    const url=new URL(value,origin),base=new URL(origin),parts=url.pathname.split('/');
    if(url.origin!==base.origin||parts[1]!=='user'||parts[2]!=='images'||parts.length<5)throw Error('这张图片不在酒馆图片目录');
    const name=decodeURIComponent(parts.pop()),folder=parts.slice(3).map(decodeURIComponent).join('/');archiveImageURL(folder,name);return {folder,name};
}
export function createArchiveClient({getHeaders,isTT=()=>false,invoke=()=>globalThis.window?.__TAURITAVERN__?.invoke?.safeInvoke,fetchImpl=fetch}){
    let pending;
    const call=async(endpoint,body)=>{const response=await checkedFetch(endpoint==='delete'?'image-delete':endpoint==='save'?'image-save':'image-list','/api/plugins/miao-nai-image/images/'+endpoint,{method:'POST',headers:getHeaders(),body:JSON.stringify(body)},{fetchImpl:(url,options)=>hostFetch(url,options,{fetchImpl})});return response.json();};
    const native=async(command,args)=>{const fn=invoke();if(!fn)throw Error('当前 TT 缺少实体归档接口，请更新含归档适配的 TT 客户端');let timer;try{return await Promise.race([Promise.resolve().then(()=>fn(command,args)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('TT 归档请求超时，请检查目录后重试')),15000);})]);}finally{clearTimeout(timer);}};
    const requireBackend=async()=>{
        if(!pending)pending=(async()=>{
            if(isTT()){try{const status=await native('get_user_archive_capabilities');if(status?.version!==1)throw Error('unsupported');}catch{throw Error('当前 TT 缺少实体归档接口，请更新含归档适配的 TT 客户端');}}
            else {const response=await hostFetch('/api/plugins/miao-nai-image/health',{}, {fetchImpl});if(!response.ok||(await response.json()).archives!==1)throw Error('请安装或更新喵喵归档后端，并重启酒馆');}
        })().catch(error=>{pending=null;throw error;});return pending;
    };
    return {
        requireBackend,
        async save(data,folder,name){validateArchivePath(folder);archiveImageURL(folder,name);await requireBackend();const result=isTT()?await native('upload_user_archive_image',{imageBase64:data,folder,filename:name}):await call('save',{image:data,folder,name});return result.url||result.path;},
        async list(folder){validateArchivePath(folder);await requireBackend();return isTT()?native('list_user_archive_images',{folder}):call('list',{folder});},
        async folders(root){validateFolder(root);await requireBackend();return isTT()?native('list_user_archive_folders',{root}):call('folders',{root});},
        async remove(folder,name){archiveImageURL(folder,name);await requireBackend();if(isTT())await native('delete_user_image',{path:'user/images/'+folder+'/'+name});else await call('delete',{folder,name});},
    };
}
