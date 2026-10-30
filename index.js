import {prepareGeneration,sendPrepared} from './src/generation/generation-lifecycle.js';
import {worldMacros,patchWorldMacros} from './src/resources/world-macros.js';
import {generationTimeoutSeconds} from './src/generation/generation-timeout.js';
import {fingerprintKey,runWithQueue,validateQueueURL} from './src/queue/cloud-queue.js';
import {randomId} from './src/platform/browser-crypto.js';
import {createThumbnails,imageBlob,blobBase64,localImagePath,makeThumbnail} from './src/images/image-thumbnails.js';
import {createFavorites,validateFavorite,favoritesEnabled,FAVORITE_FOLDER,FAVORITE_IMAGE_LIMIT} from './src/prompts/prompt-favorites.js';
import {generationOptions,migrateGenerationOptions,migrateGenerationMode,runGenerationTask} from './src/generation/generation-options.js';
import {waitForGeneration} from './src/generation/generation-delay.js';
import {showPagePopup} from './src/ui/page-popup.js';
import {showPanelPage} from './src/ui/panel-page.js';
import {showFloatingIconPicker} from './src/ui/icon-picker.js';
import {defaultFontAwesomeIcon,validFontAwesomeIcon} from './src/ui/fontawesome-icons.js';
import {createNotifications} from './src/ui/notifications.js';
import {createQueueTransport} from './src/queue/queue-network.js';
import {hostFetch} from './src/platform/host-fetch.js';
import {bindButtonPress} from './src/ui/button-press.js';
import {checkedFetch,inStage,errorTitle,redactErrorText} from './src/platform/request-errors.js';
import {prepareImageExport} from './src/images/image-export.js';
import {createImagePresentation} from './src/images/image-presentation.js';
import {showImageBatchExport} from './src/ui/image-batch-export.js';
import {readGenerationMetadata,generationInfo} from './src/images/image-metadata.js';
import {promptFileData,promptBundleData,promptFilename,PROMPT_FILE_LIMIT,PROMPT_BUNDLE_LIMIT} from './src/prompts/prompt-files.js';
import {editedTag} from './src/prompts/tag-edit.js';
import {exportPreview,previewPNG} from './src/prompts/prompt-preview-transfer.js';
import { getContext, extension_settings } from '../../../extensions.js';
import * as extensionAPI from '../../../extensions.js';
import { saveBase64AsFile } from '../../../utils.js';
import * as hostUtils from '../../../utils.js';
import {bindImageGesture,createFloatingEntry,bindImageZoom} from './src/ui/interactions.js';
import {persistHostSettings} from './src/platform/settings-save.js';
import {createPromptTranslator} from './src/prompts/translation.js';
import {WORLD_NAME,mergeWorldEntries,mergeRegexRules,bundledWorldTargets,migrateWorldBindings} from './src/resources/resources.js';
import { writeSecret, SECRET_KEYS } from '../../../secrets.js';
import { getCurrentUserHandle } from '../../../user.js';
import { callGenericPopup, POPUP_TYPE } from '../../../popup.js';
import * as wi from '../../../world-info.js';
import { getScriptsByType, saveScriptsByType, SCRIPT_TYPES } from '../../regex/engine.js';
import { createSettingsPanel } from './src/ui/ui.js';
import {createDirectClient} from './src/novelai/direct-client.js';
import {createKeyVault,saveCurrentKey} from './src/novelai/direct-key.js';
import {migrateConnection,connectionSnapshot,assertConnection,usesDirectGeneration,saveCustomConnection} from './src/novelai/nai-connection.js';
import {unzipNAIPNG} from './src/novelai/nai-response.js';
import {appendImageVersion,imageVersions,selectImageVersion,markImageVersionsDeleted} from './src/images/image-history.js';
import {selectVibes,profileVibeEnabled} from './src/vibe/vibe.js';
import {readVibeFiles,createVibePackage} from './src/vibe/vibe-files.js';
import {createExtensionUpdater} from './src/platform/updates.js';
import {createResourceUpdater} from './src/resources/resource-updates.js';
import {archiveContext,validateArchivePath,archiveImageURL,imageArchiveLocation,rememberImage,archiveItems} from './src/images/image-archives.js';
import {createProfilePreviews,ensureProfileIds,sampleSignature,SAMPLE_PROMPT} from './src/profiles/profile-previews.js';
import {downloadImageSelection} from './src/images/downloads.js';
import {migrateSwipeImages,readSwipeImage,writeSwipeImage,moveSwipeImage,swipeImageRecords,removeSwipeImages} from './src/chat/swipe-history.js';
import { defaults, parseBodyBlocks, maskReasoning, renderedBlockRange, buildRequest, latestImageMessage, canAutoGenerate, validateFolder, imageDay, imageURL, normalizeProfile, delimiterPattern } from './src/core/core.js';

await (window.__TAURITAVERN__?.ready??window.__TAURITAVERN_MAIN_READY__);
const isTT=()=>Boolean(window.__TAURITAVERN__);
const ID='miao_nai_image';
const base=new URL('.',import.meta.url);
const ctx=()=>getContext();
const requestQueue=createQueueTransport({getHeaders:()=>ctx().getRequestHeaders(),allowRelay:()=>!isTT()});
const updater=createExtensionUpdater({moduleURL:import.meta.url,getHeaders:()=>ctx().getRequestHeaders(),getGlobal:name=>extensionAPI.extensionTypes?.[name]==='global'});
const newInstallation=extension_settings[ID]==null;
const settings=extension_settings[ID] ??= {enabled:true,stream:false,pattern:'image###([\\s\\S]*?)###',profiles:[{...defaults}],active:0,installed:false};
const notices=createNotifications(settings,toastr);
const generationModeMigrated=migrateGenerationMode(settings);
settings.theme = 'auto';
settings.folder ??= 'miao-nai';
settings.folders ??= ['miao-nai'];
settings.imageArchive??={};
delete settings.archiveMode;
delete settings.libraryView;
settings.samplePrompt??=SAMPLE_PROMPT;
settings.profiles=settings.profiles.map(normalizeProfile);
const generationOptionsMigrated=migrateGenerationOptions(settings,{newInstallation});
const connectionMigrated=migrateConnection(settings);
settings.floatingReroll ??= false;
settings.floatingIconType=settings.floatingIconType==='fontawesome'?'fontawesome':'default';
if(!validFontAwesomeIcon(settings.floatingIcon))settings.floatingIcon={...defaultFontAwesomeIcon};
settings.exportFormat=settings.exportFormat==='jpg'?'jpg':'png';
settings.queueUrl ||= 'https://miao-image-queue.savlu329.workers.dev';
settings.keyHash ??= '';
settings.rememberDirectKey ??= false;
if(settings.startTag===undefined){
    const legacy=(settings.pattern||'').match(/^(.*?)\(\[\\s\\S\]\*\?\)(.*?)$/);
    settings.startTag=legacy?legacy[1].replace(/\\(.)/g,'$1'):'image###';
    settings.endTag=legacy?legacy[2].replace(/\\(.)/g,'$1'):'###';
}
settings.endTag ??= '###';
// The visible delimiters are authoritative, including for legacy saved patterns.
settings.pattern = delimiterPattern(settings.startTag,settings.endTag);
const running=new Map();
const attempted=new Set();
const cardBindings=new WeakMap();
let chatObserver,chatRootObserver,observedChat,imageSaves=0;
let queue=Promise.resolve(), streamActive=false, timer, autoScheduled=false, generationChat=null, settingsHost=null,imageToolsEpoch=0;
let settingsPopup=null,pendingSettingsConfirm=null,autoSession=null,floatingDispose=()=>{},lastGestureReroll=0;
const save=()=>ctx().saveSettingsDebounced();
if(generationOptionsMigrated||connectionMigrated||generationModeMigrated)save();
const enqueue=run=>{const job=queue.then(run);queue=job.catch(()=>{});return job;};
const persistSettings=()=>persistHostSettings({saveNow:async()=>{const host=await import('../../../../script.js');return host.saveSettings();},source:ctx().eventSource,event:ctx().eventTypes.SETTINGS_UPDATED});
const favorites=createFavorites({settings,persist:persistSettings});
const thumbnails=createThumbnails({fetchImage:url=>hostFetch(url),saveImage:saveBase64AsFile});
const imagePresentation=createImagePresentation({getFormat:()=>settings.exportFormat,fetchImage:url=>hostFetch(url),saveJPEG:async(blob,folder,name)=>saveBase64AsFile(await blobBase64(blob),folder,name,'jpg'),onError:error=>notices.error('JPG 转换失败：'+error.message,'图片预览')});
const bindImage=(image,url,options)=>imagePresentation.bind(image,url,options);
async function saveGeneratedImage(data,folder,name){
    const url=await inStage('image-save',()=>saveBase64AsFile(data,folder,name,'png'));
    try{await thumbnails.ensure(url,imageBlob(data));}catch{notices.warning('原图已保存，缩略图未生成，可在图片页重试','喵喵文生图');}
    return url;
}
const resourceUpdater=createResourceUpdater({settings,localBase:base,save,onChange:()=>settingsHost?.dispatchEvent(new Event('miao-resources-changed')),onAvailable:({latest})=>notices.info(`${latest.worldName} 可更新，点此查看`,'喵喵文生图',{escapeHtml:true,timeOut:10000,onclick:()=>openSettings('resources')})});
ensureProfileIds(settings.profiles);
const profilePreviews=createProfilePreviews({profiles:()=>settings.profiles,library:()=>settings.vibeLibrary,prompt:()=>settings.samplePrompt,onQueued:()=>notices.info('例图已加入生图队列','喵喵文生图'),enqueue,generate:requestImage,saveImage:(data,scope)=>saveGeneratedImage(data,scope.folder,`sample-${Date.now()}-${randomId()}`),persist:persistSettings,onChange:()=>settingsHost?.dispatchEvent(new Event('miao-profile-previews')),onError:error=>generationError(error)});
const directUser=getCurrentUserHandle(),directVault=createKeyVault(directUser);
const customVault=createKeyVault(JSON.stringify([directUser,'custom-novelai']));
const activeVault=()=>settings.naiConnection==='custom'?customVault:directVault;
const direct=createDirectClient({settings,save,onDiagnostic:entry=>console.error('[Mewo NAI]',JSON.stringify(entry)),getHeaders:()=>ctx().getRequestHeaders(),getKey:async(expectedKeyHash,connection)=>{
    if(getCurrentUserHandle()!==directUser)throw Error('酒馆用户已切换，请刷新页面后重试');
    assertConnection(settings,connection);
    const key=await (connection.naiConnection==='custom'?customVault:directVault).get();
    const actualHash=key?await fingerprintKey(key):'';
    if(expectedKeyHash&&actualHash!==expectedKeyHash)throw Error('NAI Key 已更换，请重新生成');
    if(key&&(!connection.keyHash||actualHash!==connection.keyHash))throw Error('直连 Key 与当前配置不匹配，请在本插件重新保存当前 Key');
    return key;
},unzipPNG:unzipNAIPNG});
function el(tag,text,cls) { const n=document.createElement(tag); if(text!==undefined)n.textContent=text; if(cls)n.className=cls; return n; }
async function showPopup(content,type,input='',options={}){
    if(type===POPUP_TYPE.TEXT&&content?.matches?.('.miao-image-viewer')){
        const parent=settingsPopup?.dlg?.isConnected?settingsPopup.dlg:settingsHost?.closest('dialog');
        return parent?showPanelPage(content,{...options,parent}):openSettings(undefined,undefined,{content,options});
    }
    if(isTT()&&type===POPUP_TYPE.TEXT&&content?.matches?.('.miao-settings,.miao-prompt-view,.miao-error-view'))return showPagePopup(content,{...options,parent:content.matches('.miao-settings')?undefined:settingsHost?.closest('dialog')});
    let dispose=()=>{};
    try{return await callGenericPopup(content,type,input,{...options,animation:'none',onOpen:popup=>{
        const dialog=popup.dlg;dialog.classList.add('miao-modal');
        const viewport=window.visualViewport;
        const fit=()=>{dialog.style.setProperty('--miao-vv-width',(viewport?.width||innerWidth)+'px');dialog.style.setProperty('--miao-vv-height',(viewport?.height||innerHeight)+'px');dialog.style.setProperty('--miao-vv-left',(viewport?.offsetLeft||0)+'px');dialog.style.setProperty('--miao-vv-top',(viewport?.offsetTop||0)+'px');};
        fit();viewport?.addEventListener('resize',fit);viewport?.addEventListener('scroll',fit);window.addEventListener('resize',fit);
        dispose=()=>{viewport?.removeEventListener('resize',fit);viewport?.removeEventListener('scroll',fit);window.removeEventListener('resize',fit);};
        options.onOpen?.(popup);
    }});}finally{dispose();}
}

const errorDialogs=new Map();
async function errorPopup(error,{detail=false}={}) {
    const title=errorTitle(error),summary=redactErrorText(error.message||error).slice(0,2200);
    if(isTT()&&!detail){notices.error(summary,title,{escapeHtml:true,onclick:()=>{void errorPopup(error,{detail:true});}});return;}
    if(errorDialogs.has(summary))return errorDialogs.get(summary);
    const box=el('div',undefined,'miao-prompt-view miao-error-view');box.append(el('h3','喵喵文生图：'+title),el('p',summary.split('\n')[0]));
    const details=el('details'),copy=el('button','复制诊断摘要','menu_button');details.append(el('summary','错误详情'),el('pre',summary));
    copy.type='button';copy.onclick=()=>Promise.resolve().then(()=>navigator.clipboard.writeText(summary)).then(()=>{copy.textContent='已复制';}).catch(()=>{copy.textContent='复制失败，请手动选择详情';});box.append(details,copy);
    const pending=showPopup(box,POPUP_TYPE.TEXT);errorDialogs.set(summary,pending);
    try{return await pending;}finally{errorDialogs.delete(summary);}
}
const guard=fn=>(...args)=>Promise.resolve().then(()=>fn(...args)).catch(errorPopup);
async function confirmSettings(question,title='确认删除',{parent}={}){
    if(pendingSettingsConfirm)return false;
    if(!isTT()){
        const content=el('div');content.append(el('h3',title));
        if(typeof question==='string')content.append(el('p',question));else content.append(question);
        const pending=showPopup(content,POPUP_TYPE.CONFIRM,'',{okButton:'删除',cancelButton:'取消'});
        pendingSettingsConfirm=()=>{};
        try{return (await pending)===1;}finally{pendingSettingsConfirm=null;}
    }
    const settingsDialog=parent||settingsHost?.closest('dialog'),standalone=!settingsDialog;
    const dialog=settingsDialog||el('div',undefined,'miao-confirm-dialog');
    const body=standalone?el('div',undefined,'popup-body'):dialog.querySelector('.popup-body')||dialog;
    const content=standalone?el('div',undefined,'popup-content'):dialog.querySelector('.popup-content');
    const scrollPositions=[...content.querySelectorAll('[data-scroll-key]')].map(element=>[element,element.scrollTop,element.scrollLeft]);
    const restoreScroll=()=>{for(const [element,top,left] of scrollPositions)if(element.isConnected){element.scrollTop=top;element.scrollLeft=left;}};
    if(standalone){
        body.append(content);dialog.append(body);document.body.append(dialog);
    }
    const viewport=window.visualViewport;
    const fitConfirm=()=>{if(!standalone)return;for(const [name,value] of Object.entries({left:viewport?.offsetLeft||0,top:viewport?.offsetTop||0,width:viewport?.width||innerWidth,height:viewport?.height||innerHeight}))dialog.style.setProperty('--miao-confirm-'+name,value+'px');};
    fitConfirm();if(standalone){viewport?.addEventListener('resize',fitConfirm);viewport?.addEventListener('scroll',fitConfirm);window.addEventListener('resize',fitConfirm);}
    const layer=el('div',undefined,'miao-confirmation-layer'),card=el('section',undefined,'popup miao-confirmation-card');
    card.setAttribute('role','alertdialog');card.setAttribute('aria-modal','true');
    const heading=el('h3',title);heading.id='miao-confirmation-title';card.setAttribute('aria-labelledby',heading.id);card.append(heading);
    const message=el('div',undefined,'miao-confirmation-message');message.id='miao-confirmation-message';
    if(typeof question==='string')message.textContent=question;else message.append(question);
    card.setAttribute('aria-describedby',message.id);card.append(message);
    const actions=el('div',undefined,'miao-confirmation-actions'),cancel=el('button','取消','miao-button'),confirm=el('button','删除','miao-button miao-danger');
    cancel.type=confirm.type='button';cancel.dataset.action='cancel';confirm.dataset.action='confirm';actions.append(cancel,confirm);card.append(actions);layer.append(card);
    const previousFocus=document.activeElement,wasInert=content.inert;content.inert=true;dialog.dataset.miaoConfirming='true';body.append(layer);
    return new Promise((resolve,reject)=>{
        let done=false;
        const finish=(result,error)=>{
            if(done)return;done=true;pendingSettingsConfirm=null;
            dialog.removeEventListener('keydown',onKey,true);dialog.removeEventListener('cancel',onCancel,true);dialog.removeEventListener('close',onClose);
            layer.remove();content.inert=wasInert;delete dialog.dataset.miaoConfirming;
            if(standalone)dialog.remove();
            viewport?.removeEventListener('resize',fitConfirm);viewport?.removeEventListener('scroll',fitConfirm);window.removeEventListener('resize',fitConfirm);
            const focus=previousFocus?.isConnected&&!previousFocus.disabled?previousFocus:settingsHost?.querySelector('.miao-drawer-close');focus?.focus({preventScroll:true});restoreScroll();if(error)reject(error);else resolve(result);
        };
        const onKey=event=>{
            if(['Escape','Tab','Enter',' '].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();}
            if(event.key==='Escape')finish(false);
            else if(event.key==='Tab')(document.activeElement===cancel?confirm:cancel).focus();
            else if(event.key==='Enter'||event.key===' ')finish(document.activeElement===confirm);
        };
        const onCancel=event=>{event.preventDefault();event.stopImmediatePropagation();finish(false);},onClose=()=>finish(false);
        pendingSettingsConfirm=finish;bindButtonPress(cancel,()=>finish(false));bindButtonPress(confirm,()=>finish(true));
        dialog.addEventListener('keydown',onKey,true);dialog.addEventListener('cancel',onCancel,true);dialog.addEventListener('close',onClose);cancel.focus({preventScroll:true});restoreScroll();
    });
}
const generationError=error=>notices.error(redactErrorText(error.message||error),errorTitle(error,'生图失败'),{escapeHtml:true,timeOut:12000,onclick:()=>{void errorPopup(error,{detail:true});}});
function reasoningFormat(){const r=ctx().powerUserSettings?.reasoning||{};return {prefix:ctx().substituteParams?.(r.prefix||'')??r.prefix,suffix:ctx().substituteParams?.(r.suffix||'')??r.suffix};}
function blocks(message) { return parseBodyBlocks(message.mes,settings.pattern,reasoningFormat()); }
const blockSlot=block=>`body:${block.bodyIndex}:${block.prompt}`;
function identity(message,block) { return `${message.swipe_id??0}:${blockSlot(block)}`; }
function state(message,key) {
    const at=key.indexOf(':'),swipe=Number(key.slice(0,at)),slot=key.slice(at+1),prompt=promptIdentity(slot.replace(/^(?:body:)?\d+:/,''));
    const text=(message.swipe_id??0)===swipe?message.mes:message.swipes?.[swipe];
    const all=parseBodyBlocks(text,settings.pattern,reasoningFormat()),unique=all.filter(b=>promptIdentity(b.prompt)===prompt).length===1;
    const block=all.find(b=>blockSlot(b)===slot);
    return readSwipeImage(message,swipe,slot,unique,block?`${block.index}:${block.prompt}`:undefined);
}
function currentChat() { return String(ctx().getCurrentChatId()); }
const promptIdentity=prompt=>String(prompt).replace(/\s+/g,' ').trim();
function liveMessage(message,fallback){
    if(ctx().chat.includes(message))return message;
    const byId=message.miao_nai_image_id&&ctx().chat.find(m=>m.miao_nai_image_id===message.miao_nai_image_id);
    if(byId)return byId;
    if(!fallback)return null;
    const candidate=ctx().chat[fallback.messageIndex];
    if(!candidate||candidate.name!==fallback.name||!!candidate.is_user!==!!fallback.is_user||!!candidate.is_system!==!!fallback.is_system)return null;
    const text=(candidate.swipe_id??0)===fallback.swipe?candidate.mes:candidate.swipes?.[fallback.swipe];
    const matching=parseBodyBlocks(text,settings.pattern,reasoningFormat()).filter(b=>promptIdentity(b.prompt)===fallback.prompt);
    return matching[fallback.occurrence]?candidate:null;
}
function taskTarget(task,inactive=false){
    if(task.cancelled||currentChat()!==task.chat)return null;
    const message=liveMessage(task.message,task);if(!message)return null;
    const active=(message.swipe_id??0)===task.swipe;if(!active&&!inactive)return null;
    const text=active?message.mes:message.swipes?.[task.swipe];if(typeof text!=='string')return null;
    const block=parseBodyBlocks(text,settings.pattern,reasoningFormat()).filter(b=>promptIdentity(b.prompt)===task.prompt)[task.occurrence];
    return block?{message,block}:null;
}
function taskFor(message,block){
    return [...running.values()].find(task=>{const target=taskTarget(task);return target?.message===message&&target.block.start===block.start;});
}
function generate(message,block,{automatic=false}={}) {
    try{return startGeneration(message,block,{automatic});}catch(error){generationError(error);}
}
function tagEditor(message,block){
    const chat=currentChat(),swipe=message.swipe_id??0;
    return async prompt=>{
        const live=liveMessage(message);
        if(chat!==currentChat()||!live||(live.swipe_id??0)!==swipe)throw Error('聊天或分支已切换，请重新打开提示词');
        if(taskFor(live,block))throw Error('这个 tag 正在生图，请完成后再编辑');
        if(streamActive&&generationChat===chat&&live===latestImageMessage(ctx().chat))throw Error('请等待本次回复输出完成后再编辑');
        const next=editedTag(live.mes,block,prompt,settings.pattern,reasoningFormat());
        buildRequest(settings.profiles[settings.active],next.block.prompt);
        const record=state(live,identity(live,block)),oldText=live.mes;
        live.mes=next.text;if(live.swipes)live.swipes[swipe]=next.text;
        moveSwipeImage(live,swipe,blockSlot(block),blockSlot(next.block),record);
        try{await inStage('chat-save',()=>ctx().saveChat());}
        catch(error){if(live.mes===next.text){live.mes=oldText;if(live.swipes)live.swipes[swipe]=oldText;moveSwipeImage(live,swipe,blockSlot(next.block),blockSlot(block),record);}throw error;}
        if(chat!==currentChat()||(live.swipe_id??0)!==swipe)return;
        const root=document.querySelector(`#chat .mes[mesid="${ctx().chat.indexOf(live)}"] .mes_text`);
        const old=[...(root?.querySelectorAll('.miao-image-card')||[])].find(card=>card.dataset.miaoKey===`${swipe}:${blockSlot(block)}`);
        if(old){old._cancelGesture?.();old.replaceWith(makeCard(live,next.block));}
        renderAll();generate(live,next.block);
    };
}
function startGeneration(message,block,{automatic=false}={}) {
    message=liveMessage(message);if(!message)throw Error('原楼层已切换，请重新点击当前图片');
    const key=identity(message,block), chat=currentChat(), taskId=`${chat}:${ctx().chat.indexOf(message)}:${key}`;
    const existing=running.get(taskId)||taskFor(message,block);if(existing)return existing.promise;
    message.miao_nai_image_id??=randomId();
    const profile=settings.profiles[settings.active],profileName=profile.name;
    const request=buildRequest(profile,block.prompt);
    request.vibes=selectVibes(settings.profiles[settings.active],settings.vibeLibrary);
    const storage={root:validateFolder(settings.folder),context:archiveContext(ctx())};
    attempted.add(taskId);
    const task={status:'排队中',...generationOptions(settings),message,key,chat,messageIndex:ctx().chat.indexOf(message),name:message.name,is_user:!!message.is_user,is_system:!!message.is_system,swipe:message.swipe_id??0,prompt:promptIdentity(block.prompt),occurrence:blocks(message).filter(b=>promptIdentity(b.prompt)===promptIdentity(block.prompt)).findIndex(b=>b.start===block.start),previousRecord:state(message,key),toolsEpoch:imageToolsEpoch};
    const waiting=running.size>0||settings.cloudQueue;running.set(taskId,task);renderAll();
    if(waiting)notices.info('已加入生图队列','喵喵文生图');
    queue=queue.then(async()=>{
        let target=taskTarget(task);if((automatic&&!settings.enabled)||!target)return;
        if(automatic && !canAutoGenerate(ctx().chat,target.message,settings.mode,streamActive))return;
        const folder=storage.root;
        task.status='正在生图'; renderAll();
        const data=await requestImage(request,task,()=>{const target=taskTarget(task);return !!target&&(!automatic||canAutoGenerate(ctx().chat,target.message,settings.mode,streamActive));});
        const url=await saveGeneratedImage(data,folder,`miao-${Date.now()}-${randomId()}`);
        if(rememberImage(settings.imageArchive,url,storage.context,location.href))save();
        // Switching swipes does not invalidate an image already being generated.
        target=taskTarget(task,true);if(!target) { notices.info('图片已保存，但原消息已删除或修改：'+url); return; }
        writeSwipeImage(target.message,task.swipe,blockSlot(target.block),appendImageVersion(task.previousRecord,{url,request,tagPrompt:block.prompt,profileName,archive:storage.context,created:Date.now()}));
        // Show the result before waiting for ST's chat-save request.
        if(running.get(taskId)===task)running.delete(taskId);renderAll();
        if(task.previousRecord&&task.toolsEpoch===imageToolsEpoch&&(target.message.swipe_id??0)===task.swipe){
            const root=document.querySelector(`#chat .mes[mesid="${ctx().chat.indexOf(target.message)}"] .mes_text`);
            const card=[...(root?.querySelectorAll('.miao-image-card')||[])].find(n=>n.dataset.miaoKey===identity(target.message,target.block));
            if(card)card.querySelector('.miao-image-tools').hidden=false;
        }
        imageSaves++;try{await inStage('chat-save',()=>ctx().saveChat());}finally{imageSaves--;}
        notices.success('生图完成','喵喵文生图');
    }).catch(error=>{
        task.status='失败，点击重试'; task.error=String(error.message||error);
        generationError(error);
    }).finally(()=>{if(running.get(taskId)===task)running.delete(taskId);renderAll();});
    task.promise=queue;return task.promise;
}
function selectedChatImage(message,block){
    const record=state(message,identity(message,block)),versions=imageVersions(record),wanted=Math.min(record?.selected??versions.length-1,versions.length-1);
    return versions[versions[wanted]?.deleted?versions.findLastIndex(v=>!v.deleted):wanted];
}
async function openChatImage(message,block,url){
    const chat=currentChat(),swipe=message.swipe_id??0,all=blocks(message);
    const resolve=item=>{
        const live=liveMessage(message);
        if(currentChat()!==chat||!live||(live.swipe_id??0)!==swipe)throw Error('聊天或分支已切换，请重新打开当前图片');
        const target=blocks(live).filter(b=>promptIdentity(b.prompt)===item.prompt)[item.occurrence];
        if(!target)throw Error('原提示词已删除或修改，请重新打开当前图片');
        return {message:live,block:target};
    };
    const gallery=all.flatMap((b,index)=>{
        const image=selectedChatImage(message,b);if(!image?.url||image.deleted)return [];
        return [{url:image.url,name:`本楼层插图 ${index+1}`,prompt:promptIdentity(b.prompt),occurrence:all.filter(other=>promptIdentity(other.prompt)===promptIdentity(b.prompt)).findIndex(other=>other.start===b.start),start:b.start}];
    });
    const selected=gallery.find(item=>item.start===block.start);if(!selected)return;
    await openImage(url,undefined,gallery,{selected,navigationLabel:'本楼层图片',regenerate:async item=>{
        const target=resolve(item);await generate(target.message,target.block);
        // A completed request may belong to an inactive swipe. Never retarget it.
        try{const latest=resolve(item),image=selectedChatImage(latest.message,latest.block);if(image?.url&&!image.deleted)item.url=image.url;}catch{}
    }});
}
function makeCard(message,block) {
    const key=identity(message,block), card=el('div',undefined,'miao-image-card');
    card.dataset.theme=resolvedTheme();
    card.dataset.miaoKey=key;
    card.dataset.miaoPrompt=promptIdentity(block.prompt);
    card.dataset.miaoBodyIndex=String(block.bodyIndex);
    card.dataset.miaoOccurrence=String(blocks(message).filter(b=>promptIdentity(b.prompt)===promptIdentity(block.prompt)).findIndex(b=>b.start===block.start));
    const record=state(message,key);
    const task=taskFor(message,block);
    const versions=imageVersions(record),wanted=Math.min(record?.selected??versions.length-1,versions.length-1),selected=versions[wanted]?.deleted?versions.findLastIndex(v=>!v.deleted):wanted,current=versions[selected];
    const actions=el('div',undefined,'miao-image-tools');actions.hidden=true;
    const button=(label,fn,parent=actions)=>{const b=el('button',label,'miao-button');b.type='button';if(label==='删除')bindButtonPress(b,()=>guard(fn)());else b.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();guard(fn)();});parent.append(b);return b;};
    if(current?.url&&!current.deleted){
        const image=el('img');image.alt='生成的剧情插图';bindImage(image,current.url,{lazy:true});image.draggable=false;image.tabIndex=0;image.setAttribute('role','button');image.setAttribute('aria-label','单击图片显示选项，双击重新生成');
        const setRatio=(width,height)=>{if(width>0&&height>0&&Number.isFinite(width/height))card.style.setProperty('--miao-image-ratio',String(width/height));};
        setRatio(current.request?.width,current.request?.height);
        image.addEventListener('load',()=>setRatio(image.naturalWidth,image.naturalHeight));
        if(image.complete)setRatio(image.naturalWidth,image.naturalHeight);
        image.setAttribute('aria-label',`单击图片显示选项，${settings.rerollClicks===3?'三':'双'}击重新生成`);
        const cancelGesture=bindImageGesture(image,{getClicks:()=>settings.rerollClicks===3?3:2,
            onSingle:()=>{if(image.isConnected&&image.dataset.toolsEpoch===String(imageToolsEpoch))actions.hidden=!actions.hidden;},
            onReroll:()=>{const now=Date.now();if(task||now-lastGestureReroll<900)return;lastGestureReroll=now;actions.hidden=true;guard(()=>generate(message,block))();}});
        image.addEventListener('pointerdown',()=>{image.dataset.toolsEpoch=String(imageToolsEpoch);});
        image.addEventListener('click',()=>{image.dataset.toolsEpoch??=String(imageToolsEpoch);});
        card._cancelGesture=cancelGesture;
        image.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();actions.hidden=!actions.hidden;}});
        card.append(image);
        const available=versions.map((version,index)=>({version,index})).filter(({version})=>version.url&&!version.deleted);
        if(available.length>1){
            const navigation=el('nav',undefined,'miao-version-nav');navigation.setAttribute('aria-label','图片版本');actions.append(navigation);
            const switchTo=async offset=>{
                // Cards may outlive their captured record after chat state updates.
                const currentMessage=liveMessage(message);if(!currentMessage)return;
                const occurrence=Number(card.dataset.miaoOccurrence),matching=blocks(currentMessage).filter(item=>promptIdentity(item.prompt)===promptIdentity(block.prompt)),currentBlock=matching[occurrence];
                if(!currentBlock)return;
                const currentKey=identity(currentMessage,currentBlock),live=state(currentMessage,currentKey);if(!live||!selectImageVersion(live,offset))return;
                writeSwipeImage(currentMessage,currentMessage.swipe_id??0,blockSlot(currentBlock),live);
                const replacement=makeCard(currentMessage,currentBlock);replacement.querySelector('.miao-image-tools').hidden=false;
                card.replaceWith(replacement);await ctx().saveChat();
            };
            const prev=button('‹',()=>switchTo(-1),navigation);prev.setAttribute('aria-label','上一张');prev.title='上一张';
            const count=el('span',`${available.findIndex(item=>item.index===selected)+1} / ${available.length}`,'miao-version-count');count.setAttribute('aria-live','polite');navigation.append(count);
            const next=button('›',()=>switchTo(1),navigation);next.setAttribute('aria-label','下一张');next.title='下一张';
        }
        const operations=el('div',undefined,'miao-image-operations');actions.append(operations);
        button('提示词',()=>showPrompt(current.tagPrompt??block.prompt,current.request?.vibes,current.profileName,false,true,tagEditor(message,block)),operations).setAttribute('aria-label','查看提示词');
        if(favoritesEnabled(settings))button('收藏提示词',()=>openSettings('favorites',draftFromImage(current.url,current.tagPrompt??block.prompt,current.profileName)),operations).setAttribute('aria-label','收藏提示词与例图');
        operations.dataset.favorites=String(favoritesEnabled(settings));
        button('下载',()=>downloadImage(current.url),operations).setAttribute('aria-label','下载图片');button('放大',()=>openChatImage(message,block,current.url),operations).setAttribute('aria-label','放大查看');
        operations.dataset.hasDelete='true';
        const remove=button('删除',async()=>{
            if(remove.disabled)return;remove.disabled=true;
            try{
                const {folder,name}=imageArchiveLocation(current.url,location.href);await deleteImages(folder,[name]);
            }catch(error){notices.error(String(error.message||error),'删除失败',{escapeHtml:true});}
            finally{remove.disabled=false;}
        },operations);remove.setAttribute('aria-label','删除当前图');remove.title='删除当前图';
    }else if(!task){
        if(favoritesEnabled(settings))actions.classList.add('miao-empty-tools');
        actions.hidden=false;button(task?.status||'生成插图',()=>generate(message,block)).disabled=!!task;
        if(favoritesEnabled(settings))button('收藏提示词',()=>openSettings('favorites',{name:'提示词收藏',positive:block.prompt,images:[]}));
        button('查看提示词',()=>{const profile=settings.profiles[settings.active],enabled=profileVibeEnabled(profile);return showPrompt(block.prompt,enabled?(profile.vibes||[]).map(v=>({...v,name:settings.vibeLibrary?.find(item=>item.id===v.id)?.name||v.name||v.id})):[],profile.name,true,enabled,tagEditor(message,block));});
    }
    if(task){const progress=el('span',task.status,'miao-image-progress');progress.setAttribute('role','status');card.append(progress);}
    card.dataset.status=String(selected)+':'+versions.map(v=>v.url+':'+!!v.deleted).join('|')+':'+(task?.status||'')+':'+(settings.rerollClicks===3?3:2)+':favorites='+favoritesEnabled(settings);
    card.append(actions);
    cardBindings.set(card,{message,controls:[...card.querySelectorAll('img,button')]});
    return card;
}
function collectVisibleText(root) {
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const nodes=[];let text='',n;
    const customTag=reasoningFormat().prefix?.match(/^<([\w-]+)>$/)?.[1]?.toLowerCase();
    while((n=walker.nextNode())) { if(n.parentElement.closest('.miao-image-card,.mes_reasoning,.mes_reasoning_details,think,thinking,analysis,reasoning,imgthink,imagethink')||(customTag&&n.parentElement.closest(customTag)))continue; if(nodes.length)text+='\n';nodes.push({n,start:text.length});text+=n.textContent; }
    return {nodes,text};
}
function sourceText(value) {
    return String(value)
        .replace(/!\[([^\]]*)\]\([^)]*\)/g,'$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g,'$1')
        .replace(/<!--[\s\S]*?-->/g,'')
        .replace(/<\/?[A-Za-z][^>]*>/g,'')
        .replace(/`{1,3}|\*{2}|_{2}|~~/g,'')
        .replace(/\s/g,'').toLowerCase();
}
function insertionOffset(text,message,block) {
    const visible=[],offsets=[];
    for(let i=0;i<text.length;i++)if(!/\s/.test(text[i])){visible.push(text[i].toLowerCase());offsets.push(i);}
    const compact=visible.join('');
    if(!compact.length)return 0;
    const masked=maskReasoning(message.mes,reasoningFormat());
    const prefix=sourceText(masked.slice(0,block.start)),suffix=sourceText(masked.slice(block.start+block.raw.length));
    const seek=(expected,fromEnd,from=0)=>{
        for(let size=Math.min(96,expected.length);size>=1;size-=size>8?Math.min(8,size-8):1){
            const needle=fromEnd?expected.slice(-size):expected.slice(0,size),at=fromEnd?compact.lastIndexOf(needle):compact.indexOf(needle,from);
            if(size<8&&compact.indexOf(needle)!==compact.lastIndexOf(needle))continue;
            if(at>=0)return {at,end:at+needle.length};
        }
        return null;
    };
    const before=seek(prefix,true),after=seek(suffix,false,before?.end||0);
    if(before&&after&&before.end<=after.at)return offsets[before.end-1]+1;
    if(before)return offsets[before.end-1]+1;
    if(after)return offsets[after.at];
    return null;
}
function insertAtTextOffset(root,nodes,offset,node) {
    if(!nodes.length)return false;
    const target=nodes.find(item=>offset<=item.start+item.n.length)||nodes.at(-1);
    const local=Math.max(0,Math.min(target.n.length,offset-target.start));
    const range=document.createRange();range.setStart(target.n,local);range.collapse(true);range.insertNode(node);return true;
}
function replaceLiteral(root,literal,node,message,block) {
    const {nodes,text}=collectVisibleText(root);
    const visible=maskReasoning(text,reasoningFormat());
    let found=renderedBlockRange(visible,literal,settings.startTag,settings.endTag);
    if(!found){
        const decoded=document.createElement('textarea');decoded.innerHTML=literal;
        found=renderedBlockRange(visible,decoded.value,settings.startTag,settings.endTag);
    }
    // Use the host formatter for entities, emphasis and other Markdown changes.
    // Formatting a fragment cannot overwrite the original message text.
    if(!found&&typeof ctx().messageFormatting==='function'){
        const fragment=document.createElement('div');
        fragment.innerHTML=ctx().messageFormatting(literal,message.name,!!message.is_system,!!message.is_user,ctx().chat.indexOf(message));
        const formatted=collectVisibleText(fragment).text;
        if(formatted.trim())found=renderedBlockRange(visible,formatted,settings.startTag,settings.endTag);
    }
    if(found){
        const {start,end}=found,a=nodes.find(x=>x.start+x.n.length>start),b=nodes.find(x=>x.start+x.n.length>=end);
        if(a&&b){const range=document.createRange();range.setStart(a.n,start-a.start);range.setEnd(b.n,end-b.start);range.deleteContents();range.insertNode(node);return true;}
    }
    // Regex or Markdown may remove the captured text from the rendered DOM.
    // Anchor the button between the nearest surviving text before and after it.
    const offset=insertionOffset(text,message,block);
    const inserted=offset!==null&&insertAtTextOffset(root,nodes,offset,node);
    if(!inserted){
        const cards=[...root.querySelectorAll('.miao-image-card')],index=block.bodyIndex;
        const previous=cards.filter(card=>Number(card.dataset.miaoBodyIndex)<index).sort((a,b)=>Number(b.dataset.miaoBodyIndex)-Number(a.dataset.miaoBodyIndex))[0];
        const next=cards.filter(card=>Number(card.dataset.miaoBodyIndex)>index).sort((a,b)=>Number(a.dataset.miaoBodyIndex)-Number(b.dataset.miaoBodyIndex))[0];
        if(previous)previous.after(node);else if(next)next.before(node);
        else if(!text.trim())root.append(node);
        else return false;
    }
    return true;
}
function renderAll() {
    chatObserver?.disconnect();
    try{
    document.querySelectorAll('#chat .mes').forEach(mes=>{
        const index=mes.getAttribute('mesid');if(index===null||!/^\d+$/.test(index))return;
        const message=ctx().chat[Number(index)],root=mes.querySelector('.mes_text');
        if(!message||!root)return;
        // The host replaces .mes_text with its editor. Never insert cards into it.
        if(mes.querySelector('textarea.edit_textarea,#curEditTextarea')){
            mes.querySelectorAll('.miao-image-card').forEach(card=>{card._cancelGesture?.();card.remove();});return;
        }
        // Streaming markdown is continually rebuilt by ST. Generate in the
        // background and insert cards only after its final message render.
        if(streamActive&&generationChat===currentChat()&&message===latestImageMessage(ctx().chat))return;
        const found=blocks(message),existing=[...root.querySelectorAll('.miao-image-card')],used=new Set();
        for(const block of found) {
            const card=makeCard(message,block);
            const candidates=existing.filter(n=>!used.has(n)&&(n.dataset.miaoPrompt??n.dataset.miaoKey?.replace(/^\d+:(?:body:)?\d+:/,''))===card.dataset.miaoPrompt);
            const old=candidates.find(n=>n.dataset.miaoOccurrence===card.dataset.miaoOccurrence)||existing.find(n=>!used.has(n)&&n.dataset.miaoKey===card.dataset.miaoKey)||candidates[0];
            if(old) {
                used.add(old);
                old.dataset.theme=card.dataset.theme;
                const bound=cardBindings.get(old),controls=[...old.querySelectorAll('img,button')];
                const boundHere=bound?.message===message&&bound.controls.length===controls.length&&bound.controls.every(n=>old.contains(n));
                const sameImage=old.querySelector('img')?.getAttribute('src')===card.querySelector('img')?.getAttribute('src');
                const sameVersion=old.querySelector('.miao-version-count')?.textContent===card.querySelector('.miao-version-count')?.textContent;
                if(old.dataset.status!==card.dataset.status||old.dataset.miaoKey!==card.dataset.miaoKey||!boundHere||!sameImage||!sameVersion){
                    if(old.querySelector('img')&&!old.querySelector('.miao-image-tools')?.hidden&&card.querySelector('img'))card.querySelector('.miao-image-tools').hidden=false;
                    old.replaceWith(card);
                }
            } else replaceLiteral(root,block.raw,card,message,block);
        }
        for(const old of existing)if(!used.has(old))old.remove();
    });
    }finally{observeChat();}
}
function observeChat(){
    // Some hosts replace #chat or mount it after extensions have initialized.
    if(!chatRootObserver){
        chatRootObserver=new MutationObserver(()=>{
            const root=document.getElementById('chat');if(root===observedChat)return;
            chatObserver?.disconnect();observedChat=null;observeChat();scheduleRender(false);
        });
        chatRootObserver.observe(document.body,{childList:true,subtree:true});
    }
    const root=document.getElementById('chat');if(!root)return;
    if(!chatObserver)chatObserver=new MutationObserver(()=>scheduleRender(false));
    observedChat=root;chatObserver.observe(observedChat,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['src','mesid']});
}
async function installWorld(file,{targetName,activate=true,existing,preserveMacros=false}={}) {
    const data=JSON.parse(await file.text());if(!data.entries)throw new Error('世界书需要 entries 字段');
    const name=targetName||file.name.replace(/\.json$/i,'');
    const previous=existing??(wi.world_names.includes(name)?await wi.loadWorldInfo(name):{entries:{}});
    if(!previous)throw Error('无法读取原世界书，请重试');
    const merged=mergeWorldEntries(previous,data,{preserveMacros});
    const response=await fetch('/api/worldinfo/edit',{method:'POST',headers:ctx().getRequestHeaders(),body:JSON.stringify({name,data:merged})});
    if(!response.ok)throw Error(`世界书更新失败：HTTP ${response.status}`);
    wi.worldInfoCache?.set(name,merged);await wi.updateWorldInfoList();
    if(!wi.world_names.includes(name))throw new Error('世界书列表刷新失败');
    if(ctx().eventTypes.WORLDINFO_UPDATED)await ctx().eventSource.emit(ctx().eventTypes.WORLDINFO_UPDATED,name,merged);
    if(activate&&!wi.selected_world_info.includes(name))wi.onWorldInfoChange({state:'on',silent:'true'},name);
    settings.world=name;save();
}
async function readResourceMacros(){
    const world=[settings.world,...bundledWorldTargets(wi.world_names,settings.world)].find(name=>name&&wi.world_names.includes(name));
    if(!world)return {world:'',macros:[]};
    wi.worldInfoCache?.delete(world);
    const book=await wi.loadWorldInfo(world);if(!book)throw Error('无法读取插件世界书，请重试');
    return {world,macros:worldMacros(book)};
}
async function saveResourceMacros(snapshot,values){
    if(resourceInstallPromise)throw Error('资源正在更新，请稍后重新读取酒馆宏');
    if(!wi.world_names.includes(snapshot.world))throw Error('世界书已更名或删除，请重新读取酒馆宏');
    wi.worldInfoCache?.delete(snapshot.world);
    const book=await wi.loadWorldInfo(snapshot.world);if(!book)throw Error('无法读取原世界书，请重试');
    const next=patchWorldMacros(book,snapshot.macros,values);
    const response=await hostFetch('/api/worldinfo/edit',{method:'POST',headers:ctx().getRequestHeaders(),body:JSON.stringify({name:snapshot.world,data:next})});
    if(!response.ok)throw Error(`酒馆宏保存失败：HTTP ${response.status}`);
    wi.worldInfoCache?.set(snapshot.world,next);
    if(ctx().eventTypes.WORLDINFO_UPDATED)await ctx().eventSource.emit(ctx().eventTypes.WORLDINFO_UPDATED,snapshot.world,next);
    return {world:snapshot.world,macros:worldMacros(next)};
}
async function installRegex(rules) {
    const existing=getScriptsByType(SCRIPT_TYPES.GLOBAL,{allowedOnly:false});
    await saveScriptsByType(mergeRegexRules(existing,rules),SCRIPT_TYPES.GLOBAL);
}
async function migrateResourceBindings(oldNames,newName=WORLD_NAME){
    const c=ctx();
    for(const character of c.characters||[]){
        if(!oldNames.includes(character.data?.extensions?.world))continue;
        const response=await fetch('/api/characters/merge-attributes',{method:'POST',headers:c.getRequestHeaders(),body:JSON.stringify({avatar:character.avatar,data:{extensions:{world:newName}}})});
        if(!response.ok)throw Error(`世界书绑定更新失败：HTTP ${response.status}`);
        character.data.extensions.world=newName;
    }
    const characterWorld=document.getElementById('character_world');
    if(characterWorld&&oldNames.includes(characterWorld.value))characterWorld.value=newName;
    const previousChatWorld=c.chatMetadata?.world_info;
    const chatChanged=migrateWorldBindings({selected:wi.selected_world_info,worldInfo:wi.world_info,powerUser:c.powerUserSettings,chatMetadata:c.chatMetadata},oldNames,newName);
    settings.world=newName;
    settings.worldAliases={...Object.fromEntries(Object.entries(settings.worldAliases||{}).map(([old,next])=>[old,oldNames.includes(next)?newName:next])),...Object.fromEntries(oldNames.map(name=>[name,newName]))};
    if(chatChanged){
        try{if(!c.saveMetadata)throw Error('酒馆不支持保存聊天世界书绑定');if(await c.saveMetadata()===false)throw Error('聊天世界书绑定保存失败');}
        catch(error){c.chatMetadata.world_info=previousChatWorld;throw error;}
    }
    await persistSettings();
}
async function restoreResourceChatBinding(){
    const c=ctx(),name=c.chatMetadata?.world_info,next=settings.worldAliases?.[name];
    if(!next||next===name)return;
    if(!c.saveMetadata)throw Error('酒馆不支持保存聊天世界书绑定');
    c.chatMetadata.world_info=next;
    try{if(await c.saveMetadata()===false)throw Error('聊天世界书绑定保存失败');}
    catch(error){c.chatMetadata.world_info=name;throw error;}
}
let resourceInstallPromise=null;
function installDefaults(){
    if(!resourceInstallPromise)resourceInstallPromise=installResourcePack().finally(()=>{resourceInstallPromise=null;resourceUpdater.changed();});
    return resourceInstallPromise;
}
async function installResourcePack(){
    const {manifest,world,rules}=await resourceUpdater.load(),worldName=manifest.worldName;
    // Validate the entire pack before the first write.
    mergeWorldEntries({entries:{}},JSON.parse(world));mergeRegexRules([],rules);
    const targets=bundledWorldTargets(wi.world_names,settings.world,worldName);
    let existing={entries:{}};
    for(const name of targets.filter(name=>wi.world_names.includes(name))){
        const data=await wi.loadWorldInfo(name);if(!data)throw Error('无法读取原世界书，请重试');
        existing=mergeWorldEntries(existing,data,{preserveMacros:true});
    }
    await installWorld(new File([world],worldName+'.json',{type:'application/json'}),{targetName:worldName,existing,preserveMacros:true,activate:!targets.some(name=>wi.world_names.includes(name))});
    await installRegex(rules);
    const oldNames=targets.filter(name=>name!==worldName);
    if(oldNames.length){
        await migrateResourceBindings(oldNames,worldName);
        for(const name of oldNames){
            const response=await fetch('/api/worldinfo/delete',{method:'POST',headers:ctx().getRequestHeaders(),body:JSON.stringify({name})});
            if(!response.ok)throw Error(`旧版世界书替换失败：HTTP ${response.status}`);
            wi.worldInfoCache?.delete(name);
        }
        await wi.updateWorldInfoList();
        if(oldNames.some(name=>wi.world_names.includes(name)))throw Error('世界书列表刷新失败');
        const editor=document.getElementById('world_editor_select');
        const option=editor&&[...editor.options].find(option=>option.text===worldName);
        if(option){editor.value=option.value;editor.dispatchEvent(new Event('change',{bubbles:true}));}
    }
    settings.world=worldName;
    const previous={installed:settings.installed,resourceVersion:settings.resourceVersion,resourceRevision:settings.resourceRevision};
    settings.installed=true;settings.resourceVersion=manifest.version;settings.resourceRevision=manifest.revision;
    try{await persistSettings();}catch(error){Object.assign(settings,previous);throw error;}
    save();renderAll();notices.success(`${worldName} 已更新`,'喵喵文生图');
}
function resolvedTheme(){return 'host';}
function applyTheme() {
    document.querySelectorAll('.miao-settings,.miao-image-card').forEach(n=>n.dataset.theme=resolvedTheme());
}
async function testImage() {
    try{
    const request=buildRequest(settings.profiles[settings.active],'1girl, adult woman, white dress, flower garden, sunlight');
    request.vibes=selectVibes(settings.profiles[settings.active],settings.vibeLibrary);
    const folder=validateFolder(settings.folder),scope={...generationOptions(settings)};
    const url=await enqueue(async()=>{
        const data=await requestImage(request,scope);
        return saveGeneratedImage(data,folder,`test-${Date.now()}-${randomId()}`);
    });
    await openImage(url);
    }catch(error){generationError(error);}
}
function saveCapture(start,end) {
    const pattern=delimiterPattern(start,end);settings.startTag=start;settings.endTag=end;settings.pattern=pattern;save();renderAll();notices.success('捕捉标签已保存');
}
async function downloadImage(url,name='miao-image.png') {
    const format=settings.exportFormat;
    const file=await inStage('image-export',()=>imagePresentation.file({url,name},format));return saveFile(file.blob,file.name);
}
async function saveDownload(blob,name,format=settings.exportFormat){
    ({blob,name}=await inStage('image-export',()=>prepareImageExport(blob,name,format)));
    return saveFile(blob,name);
}
async function saveFile(blob,name){
    if(isTT()&&typeof hostUtils.download==='function')return hostUtils.download(blob,name,blob.type,{throwOnFailure:true});
    const objectURL=URL.createObjectURL(blob);
    const link=el('a');link.href=objectURL;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(objectURL),60000);
}
async function exportPromptFile(profile){
    // Snapshot before reading the image so edits during export cannot mix two configurations.
    const bundle=Array.isArray(profile),snapshots=structuredClone(bundle?profile:[profile]),items=[];
    if(!snapshots.length||snapshots.length>100)throw Error('配置包需包含 1～100 个串');
    for(const snapshot of snapshots){const preview=await exportPreview(snapshot.preview?.url);items.push(promptFileData(snapshot,preview));}
    const data=bundle?promptBundleData(items):items[0],blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),name=bundle?`喵喵NAI-配置包-${items.length}串.json`:promptFilename(data.name);
    if(blob.size>(bundle?PROMPT_BUNDLE_LIMIT:PROMPT_FILE_LIMIT))throw Error(bundle?'配置包不能超过 20 MB':'NAI 串文件不能超过 1 MB');
    return prepareFileDownload(blob,name);
}
function prepareFileDownload(blob,name){
    const ios=isTT()&&(window.__TAURITAVERN_HOST__?.platform==='ios'||/iPad|iPhone|iPod/.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
    if(!ios)return saveFile(blob,name);
    const file=new File([blob],name,{type:blob.type}),result={name,save:()=>saveFile(file,name),copy:async()=>{
        if(typeof hostUtils.copyText==='function')await hostUtils.copyText(name);else await navigator.clipboard.writeText(name);
        notices.success('文件名已复制');
    }};
    // Start Web Share from the prepared file's button to retain the required user gesture.
    try{if(typeof navigator.share==='function'&&navigator.canShare?.({files:[file]}))result.share=async()=>{
        try{await navigator.share({files:[file],title:name});}catch(error){if(error.name!=='AbortError')throw error;}
    };}catch{}
    return result;
}
async function downloadImages(images){
    const format=settings.exportFormat;
    const ios=window.__TAURITAVERN_HOST__?.platform==='ios'||/iPad|iPhone|iPod/.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1;
    if(ios&&images.length>1)return showImageBatchExport({parent:settingsPopup.dlg,images,prepareFile:image=>imagePresentation.file(image,format),saveFile,makeZip:async files=>{
        if(!globalThis.JSZip)await import('/lib/jszip.min.js');const zip=new JSZip();for(const file of files)zip.file(file.name,file.blob);return zip.generateAsync({type:'blob',compression:'STORE'});
    }});
    await downloadImageSelection(images,{saveBlob:(blob,name)=>saveDownload(blob,name,format)});
}
function imageRecord(url){
    const path=value=>{try{return localImagePath(value);}catch{return value;}};
    for(const message of ctx().chat)for(const {record} of swipeImageRecords(message))for(const version of imageVersions(record))if(path(version.url)===path(url))return version;
    for(const profile of settings.profiles)if(profile.preview?.url&&path(profile.preview.url)===path(url))return {profileName:profile.name,...profile.preview};
}
async function showImageParameters(item,image,parent){
    const box=el('section',undefined,'miao-image-parameters'),header=el('header',undefined,'miao-parameter-header'),copy=el('button','复制参数','miao-button');
    copy.type='button';copy.disabled=true;header.append(el('h3','图片参数'),copy);
    const status=el('p','正在读取原图…','miao-muted'),scroll=el('div',undefined,'miao-parameter-scroll');scroll.tabIndex=0;scroll.setAttribute('aria-label','图片参数内容');box.append(header,status,scroll);
    const popup=showPanelPage(box,{parent,kind:'parameters',closeLabel:'返回图片'});
    let complete;
    bindButtonPress(copy,async()=>{try{await navigator.clipboard.writeText(complete);status.textContent='已复制';}catch{status.textContent='复制失败，可长按或选中提示词复制';}});
    try{
        const response=await checkedFetch('image-download',item.url),blob=await response.blob();
        let metadata;try{metadata=await readGenerationMetadata(blob);}catch(error){metadata={error:error.message};}
        if(!box.isConnected)return;
        metadata.width??=image.naturalWidth;metadata.height??=image.naturalHeight;
        const info=generationInfo(metadata,imageRecord(item.url)),p=info.parameters,grid=el('dl',undefined,'miao-parameter-grid');scroll.append(grid);
        const value=(key,label,data)=>{if(data===undefined||data===null)return;const row=el('div'),output=el('dd',typeof data==='boolean'?(data?'开启':'关闭'):String(data));output.dataset.field=key;row.append(el('dt',label),output);grid.append(row);};
        value('model','模型',info.model);if(info.width&&info.height)value('size','尺寸',`${info.width} × ${info.height}`);
        for(const [key,label,data] of [['steps','步数',p.steps],['scale','Guidance',p.scale],['seed','种子',p.seed],['sampler','采样器',p.sampler],['schedule','噪声表',p.noise_schedule??p.scheduler],['cfg_rescale','CFG Rescale',p.cfg_rescale],['sm','SMEA',p.sm],['sm_dyn','SMEA Dyn',p.sm_dyn]])value(key,label,data);
        const prompt=(label,text,key)=>{const section=el('section'),pre=el('pre',text??'未记录');pre.dataset.field=key;section.append(el('h4',label),pre);scroll.append(section);};
        prompt('正面提示词',info.prompt,'prompt');prompt('负面提示词',info.negative,'negative');
        info.characters.forEach((character,index)=>{prompt(`角色 ${index+1} · 正面`,character.positive,`character-${index}-positive`);if(character.negative)prompt(`角色 ${index+1} · 负面`,character.negative,`character-${index}-negative`);if(character.centers)prompt(`角色 ${index+1} · 位置`,JSON.stringify(character.centers),`character-${index}-centers`);});
        if(info.source)prompt('模型来源',info.source,'source');
        const extra=el('details',undefined,'miao-parameter-extra');extra.append(el('summary','其他生成参数'));scroll.append(extra);
        extra.addEventListener('toggle',()=>{if(!extra.open||extra.querySelector('pre'))return;const omit=new Set(['prompt','uc','negative_prompt','v4_prompt','v4_negative_prompt','model','width','height','steps','scale','seed','sampler','noise_schedule','scheduler']);extra.append(el('pre',JSON.stringify({parameters:Object.fromEntries(Object.entries(p).filter(([key])=>!omit.has(key))),metadata:info.metadata},null,2)));});
        complete=JSON.stringify({model:info.modelId||info.model,source:info.source,width:info.width,height:info.height,prompt:info.prompt,uc:info.negative,...p},null,2);copy.disabled=false;
        status.textContent=metadata.error?'原图元数据读取失败，已显示现有生成记录':!info.prompt&&!info.negative?'图片未包含可识别的提示词信息':'';
    }catch(error){status.textContent='原图读取失败：'+error.message;}
    finally{await popup;}
}
async function openImage(url,name,gallery,options={}) {
    const view=el('div',undefined,'miao-image-viewer'),image=el('img');
    const items=gallery?.length?[...gallery]:[{url,name:name||decodeURIComponent(new URL(url,location.href).pathname.split('/').at(-1))}];
    let index=Math.max(0,items.findIndex(item=>options.selected?item===options.selected:item.url===url)),dispose=()=>{},close=()=>{},dialog,controlsVisible=false,deleting=false,regenerating=false;
    view.append(image);image.dataset.initialFocus='true';view.dataset.gallery=String(!!gallery);
    const setControls=visible=>{controlsVisible=visible;if(dialog)dialog.dataset.controlsVisible=String(visible);};
    const actions=el('nav',undefined,'miao-viewer-actions'),parameters=el('button','图片参数','miao-button'),remove=el('button','删除图片','miao-button miao-danger'),regenerate=el('button','重新生成','miao-button');
    actions.setAttribute('aria-label','图片操作');parameters.type=remove.type='button';actions.append(parameters,remove);view.append(actions);
    if(options.regenerate){regenerate.type='button';actions.prepend(regenerate);}
    const navigation=el('nav',undefined,'miao-gallery-navigation');navigation.setAttribute('aria-label',options.navigationLabel||'图库浏览');
    const previous=el('button','‹','miao-button'),next=el('button','›','miao-button'),position=el('span');
    previous.type=next.type='button';previous.setAttribute('aria-label','上一张');next.setAttribute('aria-label','下一张');position.setAttribute('aria-live','polite');
    navigation.append(previous,position,next);if(gallery?.length>1)view.append(navigation);
    const change=step=>{const target=index+step;if(deleting||regenerating||target<0||target>=items.length)return;index=target;paint();};
    const updateButtons=()=>{
        const busy=deleting||regenerating;
        parameters.disabled=regenerate.disabled=busy;regenerate.textContent=regenerating?'生成中…':'重新生成';
        previous.disabled=busy||index===0;next.disabled=busy||index===items.length-1;
        navigation.hidden=items.length<2;
        try{imageArchiveLocation(items[index].url,location.href);remove.disabled=busy;}catch{remove.disabled=true;}
    };
    const paint=()=>{
        dispose();image.alt=items[index].name||'图片预览';bindImage(image,items[index].url);
        position.textContent=`${index+1} / ${items.length}`;updateButtons();
        dispose=bindImageZoom(view,image,{onTap:()=>setControls(!controlsVisible),onPrevious:()=>change(-1),onNext:()=>change(1)});
    };
    bindButtonPress(previous,()=>change(-1));bindButtonPress(next,()=>change(1));paint();
    bindButtonPress(parameters,guard(()=>{if(!deleting&&!regenerating)return showImageParameters(items[index],image,dialog);}));
    bindButtonPress(regenerate,guard(async()=>{
        if(deleting||regenerating||!options.regenerate)return;
        regenerating=true;updateButtons();
        try{await options.regenerate(items[index]);}
        finally{regenerating=false;if(view.isConnected)paint();}
    }));
    bindButtonPress(remove,guard(async()=>{
        if(deleting||regenerating)return;deleting=true;updateButtons();
        try{
            const item=items[index],file=imageArchiveLocation(item.url,window.location.href);
            if(!await deleteImages(file.folder,[file.name],{parent:dialog}))return;
            if(!view.isConnected)return;
            items.splice(items.indexOf(item),1);if(!items.length){close();return;}index=Math.min(index,items.length-1);paint();
        }finally{
            deleting=false;if(view.isConnected)updateButtons();
        }
    }));
    view.addEventListener('keydown',event=>{if(event.key==='Tab')setControls(true);});
    try{await showPopup(view,POPUP_TYPE.TEXT,'',{wide:true,onOpen:popup=>{
        dialog=popup.dlg;dialog.classList.add('miao-image-viewer-dialog');setControls(false);
        const closeButton=dialog.querySelector('.miao-page-controls button');if(closeButton)closeButton.textContent='×';
        close=()=>{if(popup.completeAffirmative)popup.completeAffirmative();else popup.dlg.close();};
    }});}finally{dispose();}
}
async function queueStatus() {
    const url=validateQueueURL(settings.queueUrl);
    return requestQueue(url+'/ping');
}
async function requestImage(request,task,canContinue) {
    const scope=task||generationOptions(settings);
    const assertKey=()=>{if(getCurrentUserHandle()!==directUser)throw Error('酒馆用户已切换，请刷新页面后重试');assertConnection(settings,scope);};
    const timeoutMs=generationTimeoutSeconds(scope.generationTimeoutSeconds)*1000;
    request=structuredClone(request);
    const valid=()=>{assertKey();return canContinue?.()??true;};
    const onStatus=status=>{if(task){task.status=status;task.onStatus?.(status);renderAll();}};
    const directRoute=usesDirectGeneration(scope,isTT(),request.vibes);
    const run=async()=>{
        onStatus('准备中');
        const prepared=await prepareGeneration(async()=>{
            if(directRoute)return direct.prepareGenerate(request,{expectedKeyHash:scope.keyHash,connection:scope});
            const headers=ctx().getRequestHeaders(),body=JSON.stringify(request);
            return {source:'tavern-generation',send:signal=>checkedFetch('tavern-generation','/api/novelai/generate-image',{method:'POST',headers,body,signal}).then(response=>response.text()),postprocess:data=>{
                data=data.trim();if(!data||data.startsWith('{')||data.startsWith('<'))throw Error('酒馆生图接口未返回有效图片');return data;
            }};
        },{canContinue:valid});
        const generate=async controls=>{
            await waitForGeneration({canContinue:valid,onStatus});
            notices.info('正在生图','喵喵文生图');
            return sendPrepared(prepared,{...controls,canContinue:valid,timeoutMs});
        };
        return runGenerationTask({scope,generate,canContinue:valid,onStatus:retryStatus,
            queueOptions:{requestJSON:requestQueue,generationTimeoutMs:timeoutMs,
                onReleaseError:()=>notices.info('队列连接中断，占用将自动到期释放')}});
    };
    let notified=false;
    const retryStatus=(status,error)=>{
        onStatus(status);if(error&&!notified){notified=true;notices.info(`生图请求被明确拒绝（HTTP ${error.status}），等待本地自动重试`,'喵喵文生图');}
    };
    return run();
}
const translatePrompt=createPromptTranslator({getHeaders:()=>ctx().getRequestHeaders()});
async function showPrompt(prompt,vibes=[],profileName='',pending=false,vibeEnabled=true,onEdit){
    const view=el('section',undefined,'miao-prompt-view'),original=el('pre',prompt);view.append(el('h3','绘图提示词'),original);let popup;
    const metadata=el('div',undefined,'miao-prompt-metadata');metadata.append(el('span',(pending?'当前配置：':'配置：')+(profileName||'未记录')),el('span',(pending?'Vibe 候选：':'Vibe：')+(pending&&!vibeEnabled?'已关闭':vibes.length?vibes.map(v=>v.name||v.id).join('、'):pending?'未选择':'未使用')));view.append(metadata);
    const actions=el('div',undefined,'miao-translation-actions'),buttons=new Map();
    const providers=[['google','Google 翻译'],['bing','Microsoft 翻译']];
    for(const [provider,label] of providers){const button=el('button',label,'miao-button');button.type='button';button.dataset.translationProvider=provider;button.onclick=()=>runTranslation(provider);buttons.set(provider,button);actions.append(button);}
    const note=el('p','','miao-muted');note.setAttribute('role','status');note.hidden=true;
    const fallback=el('a','在 Google 翻译中打开');fallback.href='https://translate.google.com/?'+new URLSearchParams({sl:'auto',tl:'zh-CN',text:prompt,op:'translate'});fallback.target='_blank';fallback.rel='noopener noreferrer';fallback.hidden=true;
    const translated=el('pre');translated.hidden=true;translated.setAttribute('aria-live','polite');
    const runTranslation=async(provider)=>{const button=buttons.get(provider);if(button.disabled)return;for(const item of buttons.values())item.disabled=true;button.textContent='翻译中…';note.textContent='';note.hidden=fallback.hidden=translated.hidden=true;let failed=false;try{
        const result=await translatePrompt(prompt,(index,total)=>{button.textContent=total>1?`翻译中 ${index}/${total}`:'翻译中…';},{provider});
        translated.textContent=result;translated.hidden=false;
        note.textContent=providers.find(([name])=>name===provider)[1];note.hidden=false;
    }catch(error){failed=true;note.textContent=['TimeoutError','AbortError'].includes(error.name)?'翻译超时，请重试':error instanceof TypeError?'翻译连接失败，请重试':String(error.message||error);note.hidden=false;fallback.hidden=provider!=='google';
    }finally{for(const [name,label] of providers){const item=buttons.get(name);item.disabled=false;item.textContent=failed&&name===provider?'重试 '+label:label;}}};
    if(onEdit){
        const edit=el('button','编辑提示词','miao-button'),editor=el('div',undefined,'miao-tag-editor'),input=el('textarea'),controls=el('div',undefined,'miao-actions'),commit=el('button','保存并生成新图','miao-button'),cancel=el('button','取消编辑','miao-button'),error=el('p','','miao-muted');
        edit.type=commit.type=cancel.type='button';input.value=prompt;input.setAttribute('aria-label','编辑本次 tag 提示词');error.setAttribute('role','alert');editor.hidden=true;controls.append(commit,cancel);editor.append(input,controls,error);view.append(edit,editor);
        edit.onclick=()=>{editor.hidden=false;original.hidden=edit.hidden=actions.hidden=true;input.focus({preventScroll:true});};
        cancel.onclick=()=>{editor.hidden=true;original.hidden=edit.hidden=actions.hidden=false;error.textContent='';};
        commit.onclick=async()=>{if(commit.disabled)return;commit.disabled=cancel.disabled=true;error.textContent='';try{await onEdit(input.value);if(popup?.completeAffirmative)popup.completeAffirmative();else popup?.dlg.close();}catch(cause){error.textContent=String(cause.message||cause);}finally{commit.disabled=cancel.disabled=false;}};
    }
    view.append(actions,note,fallback,translated);await showPopup(view,POPUP_TYPE.TEXT,'',{wide:true,onOpen:value=>{popup=value;popup.dlg.classList.add('miao-content-dialog');}});
}
async function importVibeFiles(files){
    const items=await readVibeFiles(files);
    const result=await direct.import({data:{vibes:items}});
    try{await persistSettings();}catch(error){throw Error(`已写入 ${result.length} 个 Vibe，但列表保存失败，请点击设置「保存」后重试：${error.message}`);}
    notices.success(`已导入 ${result.length} 个 Vibe`);return result;
}
async function exportVibeFiles(ids){
    const {blob,name}=await createVibePackage(await direct.export(ids));
    return prepareFileDownload(blob,name);
}
function changeFolder(value) {
    settings.folder=validateFolder(value);
    if(!settings.folders.includes(settings.folder))settings.folders.push(settings.folder);
    save();
}
function sceneFromImage(url){
    for(const message of ctx().chat)for(const {slot,record} of swipeImageRecords(message))for(const version of imageVersions(record))if(version.url&&localImagePath(version.url)===localImagePath(url))return version.tagPrompt??slot.replace(/^(?:body:)?\d+:/,'');
    return '';
}
function draftFromImage(url,scenePrompt=sceneFromImage(url),profileName){
    return {name:profileName?`${profileName} · 场景收藏`:'场景收藏',positive:scenePrompt,images:[url]};
}
const favoriteUploads=new WeakMap();
async function saveFavorite(draft,files=[]){
    if(!favoritesEnabled(settings))throw Error('请先在「生成」页开启收藏提示词');
    validateFavorite(draft,location.href);
    if(draft.images.length+files.length>FAVORITE_IMAGE_LIMIT)throw Error(`每条收藏最多 ${FAVORITE_IMAGE_LIMIT} 张例图`);
    for(const file of files){if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('例图仅支持 PNG、JPG、WebP');if(file.size>18*1024*1024)throw Error('每张例图不能超过 18 MB');}
    const images=[...draft.images];
    for(const file of files){
        let url=favoriteUploads.get(file);
        if(!url){
            // Decode before storing so a corrupt upload cannot become a saved example.
            await makeThumbnail(file);
            const extension={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[file.type];
            const data=await blobBase64(file);url=await inStage('image-save',()=>saveBase64AsFile(data,FAVORITE_FOLDER,`favorite-${Date.now()}-${randomId()}`,extension));
            favoriteUploads.set(file,url);
            try{await thumbnails.ensure(url,file);}catch{notices.warning('例图已保存，缩略图未生成，可在图片页重试','喵喵文生图');}
        }
        images.push(url);
    }
    const result=await favorites.save({...draft,images});notices.success('收藏已保存','喵喵文生图');return result;
}
async function generateFavorite(item,profileId){
    if(!favoritesEnabled(settings))throw Error('请先在「生成」页开启收藏提示词');
    const favorite=favorites.list().find(value=>value.id===item.id);if(!favorite)throw Error('收藏已删除，请刷新列表');
    if('negative' in favorite||'positiveSuffix' in favorite)throw Error('请先编辑这条收藏，确认只保留模型场景词后保存');
    if(favorite.images.length>=FAVORITE_IMAGE_LIMIT)throw Error(`每条收藏最多 ${FAVORITE_IMAGE_LIMIT} 张例图，请先移除不需要的例图`);
    const profile=settings.profiles.find(profile=>profile.id===profileId);if(!profile)throw Error('配置已删除，请重新选择');
    const request=buildRequest(structuredClone(profile),favorite.positive);request.vibes=selectVibes(profile,settings.vibeLibrary);
    const scope={folder:validateFolder(settings.folder),...generationOptions(settings)},id=favorite.id,scene=favorite.positive;
    const valid=()=>{if(!favoritesEnabled(settings))throw Error('收藏功能已关闭，取消等待中的收藏生图');const current=favorites.list().find(item=>item.id===id);if(!current||current.positive!==scene)throw Error('收藏已删除或场景词已修改，取消本次生图');if(current.images.length>=FAVORITE_IMAGE_LIMIT)throw Error('收藏例图已满，请先移除部分例图');return true;};
    notices.info(`已加入生图队列 · ${profile.name}`,'喵喵文生图');
    return enqueue(async()=>{
        valid();const data=await requestImage(request,scope,valid);
        const url=await saveGeneratedImage(data,scope.folder,`miao-${Date.now()}-${randomId()}`);
        const current=favorites.list().find(item=>item.id===id);
        if(!current||current.positive!==scene){notices.info('收藏已删除或场景词已修改，原图仍保存在图片目录','喵喵文生图');return url;}
        try{if(await favorites.addImage(id,url))notices.success('生成完成，已加入这条收藏的例图','喵喵文生图');else notices.info('收藏已删除，原图仍保存在图片目录','喵喵文生图');}
        catch(error){throw Error('图片已保存，但加入收藏失败，可在图片页重新收藏：'+error.message);}
        return url;
    });
}
async function buildThumbnails(folder,onProgress=()=>{}){
    const urls=[...new Set([...(await listImages(folder)).map(image=>image.url),...settings.profiles.map(profile=>profile.preview?.url).filter(Boolean),...favorites.list().flatMap(item=>item.images)])];
    let done=0,failed=0;onProgress(done,urls.length);
    for(const url of urls){try{await thumbnails.ensure(url);}catch{failed++;}onProgress(++done,urls.length);}
    return {total:urls.length,failed};
}
async function imageAPI(endpoint,body) {
    const res=await checkedFetch(endpoint==='delete'?'image-delete':'image-list','/api/images/'+endpoint,{method:'POST',headers:ctx().getRequestHeaders(),body:JSON.stringify(body)},{fetchImpl:hostFetch});
    return res;
}
async function listImages(folder) {
    folder=validateArchivePath(folder);
    indexChatImages();
    const names=folder.includes('/')?[]:await (await imageAPI('list',{folder,sortField:'date',sortOrder:'desc'})).json();
    const images=names.filter(name=>typeof name==='string'&&imageDay(name)).map(name=>({folder,name,day:imageDay(name),url:archiveImageURL(folder,name)}));
    for(const item of Object.values(settings.imageArchive))if(item.folder.includes('/')&&(item.folder===folder||item.folder.startsWith(folder+'/'))&&imageDay(item.name))images.push({...item,day:imageDay(item.name),url:archiveImageURL(item.folder,item.name)});
    return archiveItems(images,settings.imageArchive);
}
function indexChatImages(){
    const context=archiveContext(ctx());let changed=false;
    for(const message of ctx().chat)for(const {record} of swipeImageRecords(message))for(const version of imageVersions(record))if(!version.deleted&&version.url)changed=rememberImage(settings.imageArchive,version.url,version.archive||record.archive||context,location.href)||changed;
    if(changed)save();
}
async function deleteImages(folder,names,{parent}={}) {
    folder=validateArchivePath(folder);
    const allowed=new Map((await listImages(folder)).map(item=>[item.name,item]));
    if(!names.length)return;
    if(names.some(name=>!allowed.has(name)))throw new Error('清理列表已变化，请刷新后重试');
    const protectedCount=names.filter(name=>favorites.protects(allowed.get(name).url)).length;
    names=names.filter(name=>!favorites.protects(allowed.get(name).url));
    if(protectedCount)notices.info(`已保留 ${protectedCount} 张收藏例图；移除收藏中的例图后才能删除`,'喵喵文生图');
    if(!names.length)return false;
    const question=el('div');question.append(el('p',`删除 ${names.length} 张图片？目录：${folder}`),el('p','永久删除后，聊天中引用的原图也将失效。'));
    const previews=el('div',undefined,'miao-history-grid');
    for(const name of names.slice(0,24)){const image=el('img');image.alt=name;bindImage(image,allowed.get(name).url,{lazy:true});previews.append(image);}
    if(names.length>24)question.append(el('p',`共 ${names.length} 张，下方预览前 24 张。`));
    question.append(previews);
    if(!await confirmSettings(question,'删除图片',{parent}))return false;
    const removed=[];let failure;
    for(const name of names) {
        if(favorites.protects(allowed.get(name).url))continue;
        try {await imageAPI('delete',{path:`user/images/${allowed.get(name).folder}/${name}`});removed.push(name);}
        catch(error){failure=error;break;}
    }
    const paths=removed.map(name=>`user/images/${allowed.get(name).folder}/${name}`);let changed=false;
    for(const name of removed)delete settings.imageArchive[archiveImageURL(allowed.get(name).folder,name)];if(removed.length)save();
    for(const message of ctx().chat)for(const {swipe,slot,record} of swipeImageRecords(message)) {
        if(markImageVersionsDeleted(record,paths)){changed=true;writeSwipeImage(message,swipe,slot,record);}
    }
    for(const p of settings.profiles)if(p.preview?.url){try{const loc=imageArchiveLocation(p.preview.url,location.href);if(paths.includes(`user/images/${loc.folder}/${loc.name}`)){delete p.preview;save();settingsHost?.dispatchEvent(new Event('miao-profile-previews'));}}catch{}}
    if(changed)await ctx().saveChat();renderAll();
    for(const name of removed){try{await imageAPI('delete',{path:await imagePresentation.forget(allowed.get(name).url)});}catch{}}
    if(removed.length)notices.success(`已清理 ${removed.length} 张图片`);
    if(failure)throw failure;
    return true;
}
async function openSettings(initialTab,initialFavorite,initialPage) {
    if(initialTab==='favorites'&&!favoritesEnabled(settings))throw Error('请先在「生成」页开启收藏提示词');
    if(!['resources','favorites'].includes(initialTab))initialTab=undefined;
    if(settingsPopup?.dlg?.isConnected||settingsHost?.isConnected){if(initialTab)settingsHost.dispatchEvent(new CustomEvent('miao-open-section',{detail:{section:initialTab,favorite:initialFavorite}}));return;}
    const panel=createSettingsPanel({settings,save,persistSettings,initialTab,initialFavorite,favorites,saveFavorite,generateFavorite,sceneFromImage,
        removeFavorite:async id=>{if(!await confirmSettings('删除这条收藏？图片文件会保留。','删除收藏'))return false;await favorites.remove(id);return true;},
        collectImage:url=>openSettings('favorites',draftFromImage(url)),buildThumbnails,
        getResourceStatus:()=>resourceUpdater.snapshot(),checkResources:force=>resourceUpdater.check(force),theme:resolvedTheme,onTheme:applyTheme,onError:errorPopup,
        confirmDeleteProfiles:profiles=>{const question=el('div'),list=el('ul',undefined,'miao-delete-profile-list');question.append(el('p',`删除选中的 ${profiles.length} 个串？`));for(const profile of profiles)list.append(el('li',profile.name));question.append(list,el('p','只移除配置，保留已保存的例图文件和聊天图片。'));return confirmSettings(question,`删除 ${profiles.length} 个串`);},
        refreshProfilePreview:(profile,options)=>profilePreviews.refresh(profile,{...options,scope:{folder:validateFolder(settings.folder),...generationOptions(settings)}}),getPreviewState:profile=>profilePreviews.state(profile),
        exportPromptFile,restorePromptPreview:async(preview,profile)=>{
            const data=await previewPNG(preview);ensureProfileIds([profile]);
            const url=await saveGeneratedImage(data,validateFolder(settings.folder),`sample-${Date.now()}-${randomId()}`);
            return {url,signature:sampleSignature(profile,settings.vibeLibrary,settings.samplePrompt),created:Date.now()};
        },
        onChange:async reason=>{
            if(reason!=='favorites'){autoSession=null;refreshFloating();}renderAll();
        },
        saveKey:async(input,{notify=true}={})=>{await saveCurrentKey({input,vault:directVault,settings,writeServerKey:key=>writeSecret(SECRET_KEYS.NOVEL,key),fingerprint:fingerprintKey,save});if(notify)notices.success(settings.rememberDirectKey?'NAI Key 已保存到酒馆和当前设备，刷新后可继续使用':'NAI Key 已保存，直连 Key 仅在当前页面暂存');},
        saveCustomConnection:async(values,{notify=true}={})=>{if(getCurrentUserHandle()!==directUser)throw Error('酒馆用户已切换，请刷新页面后重试');await saveCustomConnection({settings,vault:customVault,...values,fingerprint:fingerprintKey,save});if(notify)notices.success('自定义连接已保存');},
        testImage,installDefaults,installWorld,installRegex,readResourceMacros,saveResourceMacros,listImages,deleteImages,changeFolder,saveCapture,queueStatus,openImage,downloadImages,bindImage,onExportFormatChange:()=>imagePresentation.refresh(),
        chooseFloatingIcon:selected=>showFloatingIconPicker({parent:settingsPopup.dlg,selected}),
        checkUpdate:force=>updater.check(force),installUpdate:()=>updater.install(),refreshPage:()=>location.reload(),
        listVibes:()=>direct.list(),importVibeFiles,exportVibeFiles,
        directKeyStatus:async()=>{const vault=activeVault(),hash=connectionSnapshot(settings).keyHash,status=await vault.status(),key=await vault.get();return {...status,ready:Boolean(key&&hash&&await fingerprintKey(key)===hash),serverSaved:settings.naiConnection!=='custom'&&!!settings.keyHash};},clearDirectKey:async()=>{const custom=settings.naiConnection==='custom';await activeVault().clear();if(custom){settings.customKeyHash='';settings.connectionRevision++;save();}},
        closeSettings:()=>{if(pendingSettingsConfirm){pendingSettingsConfirm(false);return;}return settingsPopup?.completeAffirmative?settingsPopup.completeAffirmative():settingsPopup?.dlg.close();},
        setRememberDirectKey:async value=>{const custom=settings.naiConnection==='custom';await activeVault().remember(value);settings[custom?'rememberCustomKey':'rememberDirectKey']=value;save();},
        encodeVibe:async body=>{
            const connection=connectionSnapshot(settings),keyHash=connection.keyHash,cloudQueue=settings.cloudQueue,url=settings.queueUrl,snapshot=structuredClone(body),valid=()=>{if(getCurrentUserHandle()!==directUser)throw Error('酒馆用户已切换，请刷新页面后重试');assertConnection(settings,connection);return true;};
            return enqueue(async()=>{
                const prepared=await prepareGeneration(()=>direct.prepareEncode(snapshot,{expectedKeyHash:keyHash,connection}),{canContinue:valid});
                if(prepared.cached)return prepared.value;
                const generate=async controls=>{await waitForGeneration({canContinue:valid});return sendPrepared(prepared,{...controls,canContinue:valid,timeoutMs:180000});};
                return cloudQueue?runWithQueue({url,keyHash,requestJSON:requestQueue,generationTimeoutMs:180000,generate,canContinue:valid}):generate();
            });
        },renameVibe:body=>direct.rename(body),
        deleteVibe:async id=>{if(!await confirmSettings('删除这个 Vibe？所有配置中的引用也会移除。','删除 Vibe'))return false;await direct.delete(id);for(const p of settings.profiles)p.vibes=(p.vibes||[]).filter(v=>v.id!==id);save();return true;}});
    settingsHost=panel;
    try{await showPopup(panel,POPUP_TYPE.TEXT,'',{wide:true,okButton:'完成',onClosing:()=>{if(pendingSettingsConfirm){pendingSettingsConfirm(false);return false;}return true;},onOpen:popup=>{
        settingsPopup=popup;popup.dlg.classList.add('miao-settings-dialog');
        if(initialPage)showPanelPage(initialPage.content,{...initialPage.options,parent:popup.dlg}).finally(()=>{if(popup.completeAffirmative)popup.completeAffirmative();else popup.dlg.close();}).catch(errorPopup);
    }});}
    finally{pendingSettingsConfirm?.(false);settingsHost=null;settingsPopup=null;}
}
function mountMenu() {
    document.getElementById('miao-nai-settings')?.remove();
    if(document.getElementById('miao-nai-menu'))return;
    const item=el('div',undefined,'list-group-item flex-container flexGap5');item.id='miao-nai-menu';item.setAttribute('role','button');item.tabIndex=0;
    const icon=el('span',undefined,'extensionsMenuExtensionButton');icon.setAttribute('aria-hidden','true');
    icon.innerHTML='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11 3 3l6 4a13 13 0 0 1 6 0l6-4-1 8c3 9-19 14-16 0Z"/><path d="M8 12h.01M16 12h.01M11 15h2l-1 1-1-1ZM3 14l-2-1m2 4-2 1m20-4 2-1m-2 4 2 1"/></svg>';
    item.append(icon,el('span','喵喵文生图'));item.addEventListener('click',guard(openSettings));
    item.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();guard(openSettings)();}});
    const menu=document.getElementById('extensionsMenu');if(menu)menu.append(item);
}
function refreshFloating(){
    floatingDispose();floatingDispose=createFloatingEntry({settings,save,open:guard(openSettings),reroll:guard(()=>{
        if(streamActive&&generationChat===currentChat()){notices.info('请等待本次回复输出完成');return;}
        const message=latestImageMessage(ctx().chat),tags=message?blocks(message):[];
        if(!tags.length){notices.info('最新楼层没有可生成的 tag');return;}
        for(const block of tags)generate(message,block);
    }),icon:document.querySelector('#miao-nai-menu .extensionsMenuExtensionButton')?.innerHTML||'喵'});
}
function autoLatest() {
    if(!settings.enabled||!autoSession?.enabled||autoSession.chat!==currentChat())return;
    const message=latestImageMessage(ctx().chat);
    if(!message || !canAutoGenerate(ctx().chat,message,settings.mode,streamActive))return;
    for(const block of blocks(message)) {
        const id=`${currentChat()}:${ctx().chat.indexOf(message)}:${identity(message,block)}`;
        if(!autoSession.existing.has(`${ctx().chat.indexOf(message)}:${identity(message,block)}`)&&!attempted.has(id)&&!state(message,identity(message,block)))generate(message,block,{automatic:true});
    }
}
function scanStream() {
    if(!settings.enabled||settings.mode!=='stream'||!streamActive||generationChat!==currentChat())return;
    autoLatest();
}
function scheduleRender(automatic=false) {
    autoScheduled ||= automatic;
    clearTimeout(timer);timer=setTimeout(()=>guard(()=>{const auto=autoScheduled;autoScheduled=false;renderAll();if(auto)autoLatest();})(),80);
}
async function init() {
    mountMenu();refreshFloating();const c=ctx();save();
    await restoreResourceChatBinding();
    if(c.eventTypes.CHAT_LOADED)c.eventSource.on(c.eventTypes.CHAT_LOADED,guard(restoreResourceChatBinding));
    let migrated=false;for(const message of c.chat)migrated=migrateSwipeImages(message)||migrated;if(migrated)await c.saveChat();
    document.addEventListener('click',event=>{
        if(event.target.closest?.('.miao-image-card>img,.miao-image-tools'))return;
        imageToolsEpoch++;
        document.querySelectorAll('.miao-image-tools').forEach(tools=>{if(tools.closest('.miao-image-card')?.querySelector('img'))tools.hidden=true;});
        document.querySelectorAll('.miao-image-card').forEach(card=>card._cancelGesture?.());
    });
    for(const name of ['CHAT_LOADED','MORE_MESSAGES_LOADED','USER_MESSAGE_RENDERED','MESSAGE_RECEIVED','CHARACTER_MESSAGE_RENDERED','MESSAGE_UPDATED','MESSAGE_SWIPED','MESSAGE_EDITED'])if(c.eventTypes[name])c.eventSource.on(c.eventTypes[name],messageId=>{
        // Final rendering and swipe navigation must release any stale stream lock.
        if(name==='MESSAGE_SWIPED'||name==='CHARACTER_MESSAGE_RENDERED'&&Number(messageId)===ctx().chat.length-1){streamActive=false;generationChat=null;}
        if(name==='CHARACTER_MESSAGE_RENDERED'&&Number(messageId)===ctx().chat.length-1){autoLatest();autoSession=null;}
        scheduleRender(false);
    });
    if(c.eventTypes.MESSAGE_SWIPE_DELETED)c.eventSource.on(c.eventTypes.MESSAGE_SWIPE_DELETED,async({messageId,swipeId})=>{
        const message=ctx().chat[messageId];if(!message)return;
        for(const task of running.values())if(liveMessage(task.message,task)===message&&task.swipe>=swipeId)task.cancelled=true;
        removeSwipeImages(message,swipeId);await ctx().saveChat();scheduleRender(false);
    });
    c.eventSource.on(c.eventTypes.CHAT_CHANGED,()=>{streamActive=false;generationChat=null;autoSession=null;scheduleRender(false);setTimeout(()=>guard(indexChatImages)(),0);});
    for(const name of ['CHAT_LOADED','MORE_MESSAGES_LOADED'])if(c.eventTypes[name])c.eventSource.on(c.eventTypes[name],()=>setTimeout(()=>guard(indexChatImages)(),0));
    c.eventSource.on(c.eventTypes.GENERATION_STARTED,(type,options,dryRun)=>{
        // Quiet prompts and prompt previews do not render a chat reply and may
        // never emit GENERATION_ENDED. They must not hide the last floor's cards.
        if(dryRun||type==='quiet'||type==='impersonate')return;
        streamActive=false;generationChat=currentChat();
        autoSession={chat:currentChat(),enabled:settings.enabled&&settings.mode!=='manual',existing:new Set(ctx().chat.flatMap((m,i)=>blocks(m).map(b=>`${i}:${identity(m,b)}`)))};
    });
    c.eventSource.on(c.eventTypes.GENERATION_ENDED,()=>{const same=generationChat===currentChat();streamActive=false;generationChat=null;renderAll();if(same)autoLatest();});
    if(c.eventTypes.GENERATION_STOPPED)c.eventSource.on(c.eventTypes.GENERATION_STOPPED,()=>{streamActive=false;generationChat=null;scheduleRender(false);});
    c.eventSource.on(c.eventTypes.STREAM_TOKEN_RECEIVED,()=>{if(generationChat===currentChat())streamActive=true;setTimeout(()=>guard(()=>{scanStream();renderAll();})(),0);});
    for(const event of ['SECRET_WRITTEN','SECRET_DELETED','SECRET_ROTATED'])if(c.eventTypes[event])c.eventSource.on(c.eventTypes[event],key=>{if(key===SECRET_KEYS.NOVEL){settings.keyHash='';save();settingsHost?.dispatchEvent(new Event('miao-key-changed'));}});
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change',applyTheme);
    if(settings.enabled&&!settings.installed)await installDefaults();indexChatImages();renderAll();autoLatest();
    resourceUpdater.check().catch(()=>{});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)resourceUpdater.check().catch(()=>{});});
    setInterval(()=>{if(!document.hidden)resourceUpdater.check().catch(()=>{});},900000);
}
jQuery(()=>guard(init)());
