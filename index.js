import {worldOptions,patchWorldOptions} from './src/resources/world-options.js';
import {planHistoryCleanup,isProtectedHistoryImage} from './src/images/image-cleanup.js';
import {createErrorView} from './src/ui/error-view.js';
import {summarizeError} from './src/platform/error-summary.js';
import {defaultPromptSettings,migrateExternalPromptSettings,migratePromptSettings} from './src/prompts/prompt-settings.js';
import {worldMacros,patchWorldMacros} from './src/resources/world-macros.js';
import {selectGenerationProfile,reconcileProfileSelection,eggDialogueLanguage} from './src/profiles/profile-selection.js';
import {parseGenerationBody,selectEggBlock,generationCandidates,createEggMarkerCache} from './src/profiles/easter-egg-selection.js';
import {prepareGeneration,sendPrepared} from './src/generation/generation-lifecycle.js';
import {generationTimeoutSeconds} from './src/generation/generation-timeout.js';
import {fingerprintKey,runWithQueue,validateQueueURL} from './src/queue/cloud-queue.js';
import {randomId} from './src/platform/browser-crypto.js';
import {createThumbnails,imageBlob,blobBase64,localImagePath,makeThumbnail} from './src/images/image-thumbnails.js';
import {createFavorites,validateFavorite,favoritesEnabled,FAVORITE_FOLDER,FAVORITE_IMAGE_LIMIT} from './src/prompts/prompt-favorites.js';
import {generationOptions,migrateGenerationOptions,migrateGenerationMode,runGenerationTask} from './src/generation/generation-options.js';
import {waitForGeneration} from './src/generation/generation-delay.js';
import {showPagePopup} from './src/ui/page-popup.js';
import {showSettingsWindow} from './src/ui/settings-window.js';
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
import {secondaryEnabled,manualSecondaryGeneration,secondaryConnection,secondaryChatURL,requestSecondaryModels,secondaryBody,requestSecondaryTags,secondaryPattern,inlineSecondaryPreset} from './src/prompts/secondary-tags.js';
import {assistantMessage,visibleAssistantMessage} from './src/chat/visible-message.js';
import {readSecondaryLibrary,activeSecondaryPreset,secondaryPresetFile,listedSecondaryMacros} from './src/prompts/secondary-presets.js';
import {readSecondaryTags,writeSecondaryTags,removeSecondarySwipe,secondaryBlocks,prepareSecondaryChat,secondaryProfiles} from './src/chat/secondary-tags.js';
import {captureMacroValues,expandRoleTags,numberedReply,roleList} from './src/chat/secondary-placement.js';
import {planSecondaryUpdate,saveSecondaryUpdate} from './src/chat/secondary-application.js';
import {drawingOptions,drawingNsfwRules,drawingSpecialization,limitDrawingCount,withDrawingOptions,worldDrawingPolicy} from './src/prompts/drawing-options.js';
import {exportPreview,previewPNG} from './src/prompts/prompt-preview-transfer.js';
import { getContext, extension_settings } from '../../../extensions.js';
import * as extensionAPI from '../../../extensions.js';
import { saveBase64AsFile } from '../../../utils.js';
import * as hostUtils from '../../../utils.js';
import {bindImageGesture,createFloatingEntry,bindImageZoom} from './src/ui/interactions.js';
import {persistHostSettings} from './src/platform/settings-save.js';
import {createPromptTranslator} from './src/prompts/translation.js';
import {mergeWorldEntries,mergeRegexRules,bundledWorldTargets,migrateWorldBindings,filterDrawingWorldEntries} from './src/resources/resources.js';
import { writeSecret, SECRET_KEYS } from '../../../secrets.js';
import { getCurrentUserHandle } from '../../../user.js';
import { callGenericPopup, POPUP_TYPE } from '../../../popup.js';
import * as wi from '../../../world-info.js';
import * as regexEngine from '../../regex/engine.js';
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
import {downloadImageSelection,downloadLocalPNG,downloadBrowserBlob} from './src/images/downloads.js';
import {blockSlot,promptIdentity,migrateSwipeImages,readSwipeImage,writeSwipeImage,moveSwipeImage,swipeImageRecords,removeSwipeImages} from './src/chat/swipe-history.js';
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
const connectionMigrated=migrateConnection(settings,{newInstallation});
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
const cardBindings=new WeakMap();
let chatObserver,chatRootObserver,observedChat,imageSaves=0;
let queue=Promise.resolve(), streamActive=false, timer, autoScheduled=false, generationChat=null, settingsHost=null,imageToolsEpoch=0;
let settingsPopup=null,pendingSettingsConfirm=null,autoSession=null,floatingDispose=()=>{},lastGestureReroll=0;
let secondarySession=null,secondaryJob=null;
let secondaryRequestPreview=null;
const secondaryWorldInfo=new WeakMap();
const knownSecondaryFloors=new WeakSet();
const save=()=>ctx().saveSettingsDebounced();
if(generationOptionsMigrated||connectionMigrated||generationModeMigrated)ctx().saveSettingsDebounced();
const enqueue=run=>{const job=queue.then(run);queue=job.catch(()=>{});return job;};
const persistSettings=()=>persistHostSettings({saveNow:async()=>{const host=await import('../../../../script.js');return host.saveSettings();},source:ctx().eventSource,event:ctx().eventTypes.SETTINGS_UPDATED});
const favorites=createFavorites({settings,persist:persistSettings});
const thumbnails=createThumbnails({fetchImage:url=>hostFetch(url),saveImage:saveBase64AsFile});
const imagePresentation=createImagePresentation({fetchImage:hostFetch});
const bindImage=(image,url,options)=>imagePresentation.bind(image,url,options);
async function saveGeneratedImage(data,folder,name){
    const url=await inStage('image-save',()=>saveBase64AsFile(data,folder,name,'png'));
    try{await thumbnails.ensure(url,imageBlob(data));}catch{notices.warning('原图已保存，缩略图未生成，可在图片页重试','喵喵文生图');}
    return url;
}

const resourceUpdater=createResourceUpdater({settings,localBase:base,save,onChange:()=>{eggMarkerCache.invalidate();settingsHost?.dispatchEvent(new Event('miao-resources-changed'));},onAvailable:({latest})=>notices.info(`${latest.worldName} 可更新，点此查看`,'喵喵文生图',{escapeHtml:true,timeOut:10000,onclick:()=>openSettings('resources')})});
ensureProfileIds(settings.profiles);
for(const warning of reconcileProfileSelection(settings))notices.warning(warning,'配置选择');
const configuredEggMarker=()=>settings.promptConfig?.version===2?settings.promptConfig.params?.eggMarker:settings.promptConfig?.fixed?.彩蛋标签;
const eggMarkerCache=createEggMarkerCache({
    read:async()=>secondaryEnabled(settings)?configuredEggMarker()||'':(await readWorldMacroSettings()).macros
        .findLast(m=>m.scope==='setvar'&&m.name==='彩蛋标签')?.value||'',
    key:()=>secondaryEnabled(settings)?JSON.stringify(['secondary',configuredEggMarker()]):JSON.stringify(['world',settings.world,wi.world_names]),
});
const profilePreviews=createProfilePreviews({profiles:()=>settings.profiles,library:()=>settings.vibeLibrary,prompt:()=>settings.samplePrompt,onQueued:()=>notices.info('例图已加入生图队列','喵喵文生图'),enqueue,generate:requestImage,saveImage:(data,scope)=>saveGeneratedImage(data,scope.folder,`sample-${Date.now()}-${randomId()}`),persist:persistSettings,onChange:()=>settingsHost?.dispatchEvent(new Event('miao-profile-previews')),onError:error=>generationError(error)});
const directUser=getCurrentUserHandle(),directVault=createKeyVault(directUser);
const customVault=createKeyVault(JSON.stringify([directUser,'custom-novelai']));
const secondaryVaults=new Map();
function secondaryVault(url){
    if(!secondaryVaults.has(url))secondaryVaults.set(url,createKeyVault(JSON.stringify([directUser,'secondary-tags',url]),{tabStorage:()=>sessionStorage}));
    return secondaryVaults.get(url);
}
async function listSecondaryModels({url,key}){
    if(getCurrentUserHandle()!==directUser)throw Error('酒馆用户已切换，请刷新页面后重试');
    const address=secondaryChatURL(url).href;
    const credential=key.trim()||await secondaryVault(address).get();
    if(getCurrentUserHandle()!==directUser)throw Error('酒馆用户已切换，请刷新页面后重试');
    return requestSecondaryModels(address,credential);
}
const activeVault=()=>settings.naiConnection==='custom'?customVault:directVault;
const direct=createDirectClient({settings,save,onDiagnostic:entry=>console.error('[Meow NAI]',JSON.stringify(entry)),getHeaders:()=>ctx().getRequestHeaders(),getKey:async(expectedKeyHash,connection)=>{
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
    if(type===POPUP_TYPE.TEXT&&content?.matches?.('.miao-settings'))return showSettingsWindow(content,{...options,getPosition:()=>settings.windowPosition,savePosition:value=>{settings.windowPosition=value;save();}});
    if(type===POPUP_TYPE.TEXT&&content?.matches?.('.miao-image-viewer')){
        settingsPopup?.focus?.();
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
    const title=errorTitle(error),info=summarizeError(error),summary=info.diagnostic;
    if(isTT()&&!detail){notices.error(info.brief,title,{escapeHtml:true,onclick:()=>{void errorPopup(error,{detail:true});}});return;}
    if(errorDialogs.has(summary))return errorDialogs.get(summary);
    const box=createErrorView(error,{title:'喵喵文生图：'+title,copyText:text=>typeof hostUtils.copyText==='function'?hostUtils.copyText(text):navigator.clipboard.writeText(text)});
    const pending=showPopup(box,POPUP_TYPE.TEXT);errorDialogs.set(summary,pending);
    try{return await pending;}finally{errorDialogs.delete(summary);}
}
const guard=fn=>(...args)=>Promise.resolve().then(()=>fn(...args)).catch(errorPopup);
async function confirmSettings(question,title='确认删除',{parent,confirmLabel='删除'}={}){
    if(pendingSettingsConfirm)return false;
    if(!isTT()){
        const content=el('div');content.append(el('h3',title));
        if(typeof question==='string')content.append(el('p',question));else content.append(question);
        const pending=showPopup(content,POPUP_TYPE.CONFIRM,'',{okButton:confirmLabel,cancelButton:'取消'});
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
    const actions=el('div',undefined,'miao-confirmation-actions'),cancel=el('button','取消','miao-button'),confirm=el('button',confirmLabel,'miao-button miao-danger');
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
const generationError=error=>notices.error(summarizeError(error).brief,errorTitle(error,'生图失败'),{escapeHtml:true,timeOut:9000,onclick:()=>{void errorPopup(error,{detail:true});}});
function reasoningFormat(){const r=ctx().powerUserSettings?.reasoning||{};return {prefix:ctx().substituteParams?.(r.prefix||'')??r.prefix,suffix:ctx().substituteParams?.(r.suffix||'')??r.suffix};}
function blocks(message,swipe=message.swipe_id??0) {
    const text=(message.swipe_id??0)===swipe?message.mes:message.swipes?.[swipe];
    if(typeof text!=='string')return [];
    const main=parseBodyBlocks(text,settings.pattern,reasoningFormat());
    return [...main,...secondaryBlocks(message,swipe,text,main.length)];
}
function identity(message,block) { return `${message.swipe_id??0}:${blockSlot(block)}`; }
function generationIdentity(message,block,chat=currentChat()) {
    message.miao_nai_image_id??=randomId();
    return `${chat}:${message.miao_nai_image_id}:${identity(message,block)}`;
}
function state(message,key) {
    const at=key.indexOf(':'),swipe=Number(key.slice(0,at)),slot=key.slice(at+1),prompt=promptIdentity(slot.replace(/^(?:body:)?\d+:/,''));
    if(slot.startsWith('secondary:'))return readSwipeImage(message,swipe,slot);
    const all=blocks(message,swipe).filter(b=>!b.secondary),unique=all.filter(b=>promptIdentity(b.prompt)===prompt).length===1;
    const block=all.find(b=>blockSlot(b)===slot);
    return readSwipeImage(message,swipe,slot,unique,block?`${block.index}:${block.prompt}`:undefined);
}
function currentChat() { return String(ctx().getCurrentChatId()); }
const roleKey='miao_nai_image_role_bindings';
const captureSettings=()=>({start:settings.startTag,end:settings.endTag});
function roleBindingSnapshot(){
    const host=ctx(),scope=archiveContext(host);
    return {scope,metadata:host.chatMetadata,text:host.chatMetadata?.[roleKey]??'',available:!!(host.chatMetadata&&scope.chatId&&host.saveMetadata)};
}
async function saveRoleBindings(snapshot,text){
    roleList(text);
    const {metadata,scope,available}=roleBindingSnapshot();
    if(!available||metadata!==snapshot.metadata||scope.cardId!==snapshot.scope.cardId||scope.chatId!==snapshot.scope.chatId){
        throw Error('角色卡或存档已切换，请重新打开设置');
    }
    const previous=metadata[roleKey];
    if(text.trim())metadata[roleKey]=text;
    else delete metadata[roleKey];
    try{if(await ctx().saveMetadata()===false)throw Error('保存失败');}
    catch{
        if(previous===undefined)delete metadata[roleKey];else metadata[roleKey]=previous;
        throw Error('无法保存当前存档的角色 tag');
    }
    notices.success('当前存档的角色 tag 已保存');
}
const matchingBlocks=(available,target)=>available.filter(block=>!!block.secondary===!!target.secondary&&promptIdentity(block.prompt)===promptIdentity(target.prompt));
function liveMessage(message,fallback){
    if(ctx().chat.includes(message))return message;
    // A known message ID must not fall back to a new message at the old index.
    if(message.miao_nai_image_id)return ctx().chat.find(m=>m.miao_nai_image_id===message.miao_nai_image_id)||null;
    if(!fallback||fallback.secondary)return null;
    const candidate=ctx().chat[fallback.messageIndex];
    if(!candidate||candidate.name!==fallback.name||!!candidate.is_user!==!!fallback.is_user||!!candidate.is_system!==!!fallback.is_system)return null;
    const matching=matchingBlocks(blocks(candidate,fallback.swipe),fallback);
    return matching[fallback.occurrence]?candidate:null;
}
function taskTarget(task,inactive=false){
    if(task.cancelled||currentChat()!==task.chat)return null;
    const message=liveMessage(task.message,task);if(!message)return null;
    const active=(message.swipe_id??0)===task.swipe;if(!active&&!inactive)return null;
    const available=blocks(message,task.swipe).filter(b=>!!b.secondary===!!task.secondary);
    const block=matchingBlocks(available,task)[task.occurrence];
    if(!block||block.start!==task.blockStart||block.raw!==task.blockRaw)return null;
    if(task.requiresFinalEggTag&&available.at(-1)?.start!==block.start)return null;
    return {message,block};
}
function taskFor(message,block){
    return [...running.values()].find(task=>{const target=taskTarget(task);return target?.message===message&&target.block.start===block.start;});
}
function generate(message,block,{automatic=false,egg,requiresFinalEggTag=false}={}) {
    const chat=currentChat(),swipe=message.swipe_id??0;
    const start=()=>{
        const live=liveMessage(message);
        if(chat!==currentChat()||!live||(live.swipe_id??0)!==swipe)throw Error('聊天或分支已切换，请重新生成');
        const current=blocks(live).find(b=>b.start===block.start&&b.raw===block.raw);
        if(!current)throw Error('原 tag 已删除或修改，请重新生成');
        return startGeneration(live,current,{automatic,egg:egg===true,requiresFinalEggTag});
    };
    if(block.secondary&&egg===undefined){
        requiresFinalEggTag=block.egg==null;
        egg=settings.eggProfileEnabled&&(block.egg??(blocks(message).filter(b=>b.secondary).at(-1)?.start===block.start));
    }
    if(egg!==undefined||!settings.eggProfileEnabled){try{return start();}catch(error){generationError(error);return;}}
    return eggMarkerCache.read().then(marker=>{
        const parsed=parseGenerationBody(liveMessage(message)?.mes??'',settings.pattern,reasoningFormat(),marker);
        const selection=selectEggBlock(parsed,{implicitEgg:!secondaryEnabled(settings)&&drawingOptions(settings.promptConfig).egg});
        egg=selection.block?.start===block.start;requiresFinalEggTag=egg&&selection.implicit;
        return start();
    }).catch(generationError);
}
function tagEditor(message,block){
    const chat=currentChat(),swipe=message.swipe_id??0;
    return async prompt=>{
        const live=liveMessage(message);
        if(chat!==currentChat()||!live||(live.swipe_id??0)!==swipe)throw Error('聊天或分支已切换，请重新打开提示词');
        if(taskFor(live,block))throw Error('这个 tag 正在生图，请完成后再编辑');
        if(streamActive&&generationChat===chat&&live===latestImageMessage(ctx().chat))throw Error('请等待本次回复输出完成后再编辑');
        const oldTags=readSecondaryTags(live,swipe);
        let next,updatedTags;
        if(block.secondary){
            if(oldTags[block.secondaryIndex]?.prompt!==block.prompt)throw Error('原 tag 已变化，请重新打开提示词');
            const edit=editedTag(block.raw,{...block,start:0},prompt,secondaryPattern,reasoningFormat());
            next={block:{...block,prompt:edit.block.prompt,raw:edit.text}};
            updatedTags=oldTags.map((tag,index)=>index===block.secondaryIndex?{...tag,prompt:edit.block.prompt}:tag);
        }else next=editedTag(live.mes,block,prompt,settings.pattern,reasoningFormat());
        buildRequest(settings.profiles[settings.active],next.block.prompt);
        const record=state(live,identity(live,block)),oldText=live.mes;
        if(block.secondary)writeSecondaryTags(live,swipe,updatedTags);
        else{live.mes=next.text;if(live.swipes)live.swipes[swipe]=next.text;}
        moveSwipeImage(live,swipe,blockSlot(block),blockSlot(next.block),record);
        try{await inStage('chat-save',()=>ctx().saveChat());}
        catch(error){
            if(block.secondary&&readSecondaryTags(live,swipe)===updatedTags){
                writeSecondaryTags(live,swipe,oldTags);moveSwipeImage(live,swipe,blockSlot(next.block),blockSlot(block),record);
            }else if(!block.secondary&&live.mes===next.text){
                live.mes=oldText;if(live.swipes)live.swipes[swipe]=oldText;moveSwipeImage(live,swipe,blockSlot(next.block),blockSlot(block),record);
            }
            throw error;
        }
        if(chat!==currentChat()||(live.swipe_id??0)!==swipe)return;
        const root=document.querySelector(`#chat .mes[mesid="${ctx().chat.indexOf(live)}"] .mes_text`);
        const old=[...(root?.querySelectorAll('.miao-image-card')||[])].find(card=>card.dataset.miaoKey===`${swipe}:${blockSlot(block)}`);
        if(old){old._cancelGesture?.();old.replaceWith(makeCard(live,next.block));}
        renderAll();
        if(settings.mode!=='manual'||imageVersions(record).some(version=>version.url&&!version.deleted))generate(live,next.block);
    };
}
function startGeneration(message,block,{automatic=false,egg=false,requiresFinalEggTag=false}={}) {
    message=liveMessage(message);if(!message)throw Error('原楼层已切换，请重新点击当前图片');
    const key=identity(message,block), chat=currentChat(), taskId=generationIdentity(message,block,chat);
    const existing=running.get(taskId)||taskFor(message,block);if(existing)return existing.promise;
    const {profile,profileId,profileName,source:profileSource}=selectGenerationProfile(settings,{egg});
    requiresFinalEggTag=profileSource==='egg'&&requiresFinalEggTag;
    const request=buildRequest(profile,expandRoleTags(block.prompt,roleList(roleBindingSnapshot().text)));
    request.vibes=selectVibes(profile,settings.vibeLibrary);
    const storage={root:validateFolder(settings.folder),context:archiveContext(ctx())};
    if(autoSession?.chat===chat)autoSession.attempted.add(taskId);
    const task={profileId,profileName,profileSource,requiresFinalEggTag,profile,request,blockStart:block.start,blockRaw:block.raw,status:'排队中',...generationOptions(settings),message,key,chat,messageIndex:ctx().chat.indexOf(message),name:message.name,is_user:!!message.is_user,is_system:!!message.is_system,swipe:message.swipe_id??0,prompt:promptIdentity(block.prompt),secondary:!!block.secondary,occurrence:matchingBlocks(blocks(message),block).findIndex(b=>b.start===block.start),previousRecord:state(message,key),toolsEpoch:imageToolsEpoch};
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
        writeSwipeImage(target.message,task.swipe,blockSlot(target.block),appendImageVersion(task.previousRecord,{url,request,tagPrompt:block.prompt,profileId,profileName,archive:storage.context,created:Date.now()}));
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
        const target=matchingBlocks(blocks(live),item)[item.occurrence];
        if(!target)throw Error('原提示词已删除或修改，请重新打开当前图片');
        return {message:live,block:target};
    };
    const gallery=all.flatMap((b,index)=>{
        const image=selectedChatImage(message,b);if(!image?.url||image.deleted)return [];
        return [{url:image.url,name:`本楼层插图 ${index+1}`,prompt:promptIdentity(b.prompt),secondary:!!b.secondary,occurrence:matchingBlocks(all,b).findIndex(other=>other.start===b.start),start:b.start}];
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
    card.dataset.miaoSource=block.secondary?'secondary':'main';
    card.dataset.miaoBodyIndex=String(block.bodyIndex);
    card.dataset.miaoOccurrence=String(matchingBlocks(blocks(message),block).findIndex(b=>b.start===block.start));
    if(block.title)card.append(el('div',block.title,'miao-image-caption'));
    const record=state(message,key);
    const task=taskFor(message,block);
    const versions=imageVersions(record),wanted=Math.min(record?.selected??versions.length-1,versions.length-1),selected=versions[wanted]?.deleted?versions.findLastIndex(v=>!v.deleted):wanted,current=versions[selected];
    const actions=el('div',undefined,'miao-image-tools');actions.hidden=true;
    const button=(label,fn,parent=actions)=>{const b=el('button',label,'miao-button');b.type='button';if(label==='删除')bindButtonPress(b,()=>guard(fn)());else b.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();guard(fn)();});parent.append(b);return b;};
    if(current?.url&&!current.deleted){
        const image=el('img');image.alt='生成的剧情插图';bindImage(image,current.url,{lazy:true});image.draggable=false;image.tabIndex=0;image.setAttribute('role','button');
        const setRatio=(width,height)=>{if(width>0&&height>0&&Number.isFinite(width/height))card.style.setProperty('--miao-image-ratio',String(width/height));};
        setRatio(current.request?.width,current.request?.height);
        image.addEventListener('load',()=>setRatio(image.naturalWidth,image.naturalHeight));
        if(image.complete)setRatio(image.naturalWidth,image.naturalHeight);
        image.setAttribute('aria-label',`单击图片显示选项，再单击放大，${settings.rerollClicks===3?'三':'双'}击重新生成`);
        const activateImage=()=>{if(actions.hidden)actions.hidden=false;else guard(()=>openChatImage(message,block,current.url))();};
        const cancelGesture=bindImageGesture(image,{getClicks:()=>settings.rerollClicks===3?3:2,
            onSingle:()=>{if(image.isConnected&&image.dataset.toolsEpoch===String(imageToolsEpoch))activateImage();},
            onReroll:()=>{const now=Date.now();if(task||now-lastGestureReroll<900)return;lastGestureReroll=now;actions.hidden=true;guard(()=>generate(message,block))();}});
        image.addEventListener('pointerdown',()=>{image.dataset.toolsEpoch=String(imageToolsEpoch);});
        image.addEventListener('click',()=>{image.dataset.toolsEpoch??=String(imageToolsEpoch);});
        card._cancelGesture=cancelGesture;
        image.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();if(!event.repeat){cancelGesture();activateImage();}}});
        card.append(image);
        const available=versions.map((version,index)=>({version,index})).filter(({version})=>version.url&&!version.deleted);
        if(available.length>1){
            const navigation=el('nav',undefined,'miao-version-nav');navigation.setAttribute('aria-label','图片版本');actions.append(navigation);
            const switchTo=async offset=>{
                // Cards may outlive their captured record after chat state updates.
                const currentMessage=liveMessage(message);if(!currentMessage)return;
                const occurrence=Number(card.dataset.miaoOccurrence),currentBlock=matchingBlocks(blocks(currentMessage),block)[occurrence];
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
        button('下载',()=>downloadImage(current.url),operations).setAttribute('aria-label','下载图片');button('放大',()=>openChatImage(message,block,current.url),operations).setAttribute('aria-label','放大查看');
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
        button('查看提示词',()=>{
            const profile=settings.profiles[settings.active],enabled=profileVibeEnabled(profile);
            const policy=settings.profileSelectionMode==='random'||settings.eggProfileEnabled?`普通图：${settings.profileSelectionMode==='random'?'生成时从随机池选取 1 个配置':profile.name}${settings.eggProfileEnabled?'；最后一张：'+(settings.profiles.find(p=>p.id===settings.eggProfileId)?.name||'需重新选择'):''}`:'';
            return showPrompt(block.prompt,enabled?(profile.vibes||[]).map(v=>({...v,name:settings.vibeLibrary?.find(item=>item.id===v.id)?.name||v.name||v.id})):[],profile.name,true,enabled,tagEditor(message,block),policy);
        });
    }
    if(task){const progress=el('span',task.status,'miao-image-progress');progress.setAttribute('role','status');card.append(progress);}
    card.dataset.status=String(selected)+':'+versions.map(v=>v.url+':'+!!v.deleted).join('|')+':'+(task?.status||'')+':'+(settings.rerollClicks===3?3:2)+':favorites='+favoritesEnabled(settings);
    card.append(actions);
    cardBindings.set(card,{message,block,controls:[...card.querySelectorAll('img,button')]});
    return card;
}
function collectVisibleText(root) {
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const nodes=[];let text='',n;
    const customTag=reasoningFormat().prefix?.match(/^<([\w-]+)>$/)?.[1]?.toLowerCase();
    while((n=walker.nextNode())) { if(n.parentElement.closest('.miao-image-card,.mes_reasoning,.mes_reasoning_details,think,thinking,analysis,reasoning,imgthink,imagethink,tag_think')||(customTag&&n.parentElement.closest(customTag)))continue; if(nodes.length)text+='\n';nodes.push({n,start:text.length});text+=n.textContent; }
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
            const candidates=existing.filter(n=>!used.has(n)&&(n.dataset.miaoSource||'main')===card.dataset.miaoSource&&(n.dataset.miaoPrompt??n.dataset.miaoKey?.replace(/^\d+:(?:body:)?\d+:/,''))===card.dataset.miaoPrompt);
            const old=candidates.find(n=>n.dataset.miaoOccurrence===card.dataset.miaoOccurrence)||existing.find(n=>!used.has(n)&&n.dataset.miaoKey===card.dataset.miaoKey)||candidates[0];
            if(old) {
                used.add(old);
                old.dataset.theme=card.dataset.theme;
                const bound=cardBindings.get(old),controls=[...old.querySelectorAll('img,button')];
                const boundHere=bound?.message===message&&bound.block.start===block.start&&bound.block.raw===block.raw&&bound.block.egg===block.egg&&bound.block.title===block.title&&
                    bound.controls.length===controls.length&&bound.controls.every(n=>old.contains(n));
                const sameImage=old.querySelector('img')?.getAttribute('src')===card.querySelector('img')?.getAttribute('src');
                const sameVersion=old.querySelector('.miao-version-count')?.textContent===card.querySelector('.miao-version-count')?.textContent;
                if(old.dataset.status!==card.dataset.status||old.dataset.miaoKey!==card.dataset.miaoKey||!boundHere||!sameImage||!sameVersion){
                    if(old.querySelector('img')&&!old.querySelector('.miao-image-tools')?.hidden&&card.querySelector('img'))card.querySelector('.miao-image-tools').hidden=false;
                    old.replaceWith(card);
                }
            } else if(block.secondary)root.append(card);
            else replaceLiteral(root,block.raw,card,message,block);
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
let promptConfigSaving=false;
async function savePromptConfig(next){
    if(promptConfigSaving)throw Error('提示词配置正在保存，请稍后重试');
    promptConfigSaving=true;
    const previous=settings.promptConfig;
    settings.promptConfig=next;
    try{await persistSettings();eggMarkerCache.invalidate();}
    catch(error){if(settings.promptConfig===next)settings.promptConfig=previous;throw error;}
    finally{promptConfigSaving=false;}
}
let savingSecondarySettings=false;
async function saveSecondarySettings(source,values,library){
    if(savingSecondarySettings)throw Error('副 API 设置正在保存');
    savingSecondarySettings=true;
    const previous=settings.tagSource,previousConnection=settings.secondaryTagAPI;
    const previousLibrary=settings.secondaryTagPresets;
    let restoreKey;
    try{
        if(getCurrentUserHandle()!==directUser)throw Error('酒馆用户已切换，请刷新页面后重试');
        if(values){
            const next=secondaryConnection(values),vault=secondaryVault(next.url);
            delete next.maxTags;
            const previousKey=await vault.get(),input=values.key.trim(),key=input||previousKey;
            if(!key)throw Error('请填写此副 API 地址的 Key');
            const {persistent}=await vault.status();
            if(!input&&persistent&&previousConnection?.url===next.url&&previousConnection.remember===next.remember)next.remember=true;
            await vault.set(key,next.remember);
            restoreKey=()=>vault.set(previousKey,persistent);
            settings.secondaryTagPresets??=readSecondaryLibrary(settings);
            settings.secondaryTagAPI=next;
        }
        if(library)settings.secondaryTagPresets=library;
        settings.tagSource=source;
        await persistSettings();
        autoSession=null;secondarySession=null;secondaryJob?.controller.abort();
        if(previous!==source)refreshFloating();
        renderAll();
    }catch(error){
        settings.tagSource=previous;settings.secondaryTagAPI=previousConnection;settings.secondaryTagPresets=previousLibrary;
        await restoreKey?.().catch(()=>{});
        throw error;
    }finally{savingSecondarySettings=false;}
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
    settings.world=name;eggMarkerCache.invalidate();save();
}
function resourceWorldName(){return [settings.world,...bundledWorldTargets(wi.world_names,settings.world)].find(name=>name&&wi.world_names.includes(name));}
async function readWorldBook(world=resourceWorldName()){
    if(!world)return {world:'',book:{entries:{}}};
    wi.worldInfoCache?.delete(world);const book=await wi.loadWorldInfo(world);
    if(!book)throw Error('无法读取世界书，请重新读取');return {world,book};
}
async function writeWorldBook(world,book){
    await checkedFetch('world-save','/api/worldinfo/edit',{method:'POST',headers:ctx().getRequestHeaders(),body:JSON.stringify({name:world,data:book})},{fetchImpl:hostFetch});
    wi.worldInfoCache?.set(world,book);await wi.updateWorldInfoList();
    if(!wi.world_names.includes(world))throw Error('世界书列表刷新失败');
    if(ctx().eventTypes.WORLDINFO_UPDATED)await ctx().eventSource.emit(ctx().eventTypes.WORLDINFO_UPDATED,world,book);
    eggMarkerCache.invalidate();
}
async function readWorldMacroSettings(){
    const {world,book}=await readWorldBook();
    return {world,macros:worldMacros(book)};
}
async function saveWorldMacroSettings(snapshot,values){
    if(resourceInstallPromise)throw Error('资源正在更新，请稍后重新读取酒馆宏');
    if(!wi.world_names.includes(snapshot.world))throw Error('世界书已更名或删除，请重新读取酒馆宏');
    const {book}=await readWorldBook(snapshot.world);
    const next=patchWorldMacros(book,snapshot.macros,values);
    await writeWorldBook(snapshot.world,next);
    return {world:snapshot.world,macros:worldMacros(next)};
}
async function saveDrawingRules(values){
    await savePromptConfig(withDrawingOptions(settings.promptConfig,values));
    secondaryJob?.controller.abort();
}
async function readWorldOptions(){const {world,book}=await readWorldBook();return {world,...worldOptions(book)};}
async function saveWorldOptions(snapshot,values){
    if(resourceInstallPromise)throw Error('资源正在更新，请稍后重新读取');
    if(!snapshot?.world||!wi.world_names.includes(snapshot.world))throw Error('世界书不存在，请先更新资源');
    const {book}=await readWorldBook(snapshot.world);await writeWorldBook(snapshot.world,patchWorldOptions(book,snapshot,values));return readWorldOptions();
}
async function installRegex(rules) {
    const {getScriptsByType,saveScriptsByType,SCRIPT_TYPES}=regexEngine;
    const existing=getScriptsByType(SCRIPT_TYPES.GLOBAL,{allowedOnly:false});
    await saveScriptsByType(mergeRegexRules(existing,rules),SCRIPT_TYPES.GLOBAL);
}
async function saveChatWorldBinding(context,name,next){
    const metadata=context.chatMetadata;
    if(!context.saveMetadata)throw Error('酒馆不支持保存聊天世界书绑定');
    metadata.world_info=next;
    try{if(await context.saveMetadata()===false)throw Error('聊天世界书绑定保存失败');}
    catch(error){if(metadata.world_info===next)metadata.world_info=name;throw error;}
}
async function restoreResourceChatBinding(){
    const context=ctx(),name=context.chatMetadata?.world_info,next=settings.worldAliases?.[name];
    if(!next||next===name||!wi.world_names.includes(next))return;
    await saveChatWorldBinding(context,name,next);
}
let resourceInstallPromise=null;
function installDefaults(){
    if(!resourceInstallPromise)resourceInstallPromise=installResourcePack().finally(()=>{resourceInstallPromise=null;resourceUpdater.changed();});
    return resourceInstallPromise;
}
async function installResourcePack(){
    const {manifest,world,rules}=await resourceUpdater.load(),selectedWorld=resourceWorldName();
    const userNamedWorld=selectedWorld&&!/^\[喵喵\]文生图\s*2\.\d+(?:\.\d+)?$/.test(selectedWorld),worldName=userNamedWorld?selectedWorld:manifest.worldName;
    const incoming=JSON.parse(world);mergeWorldEntries({entries:{}},incoming);mergeRegexRules([],rules);
    const targets=userNamedWorld?[worldName]:bundledWorldTargets(wi.world_names,settings.world,worldName),installed=targets.filter(name=>wi.world_names.includes(name));
    let existing={entries:{}};
    for(const name of installed){const {book}=await readWorldBook(name);existing=mergeWorldEntries(existing,book,{preserveMacros:true,preserveOptions:true});}
    const merged=mergeWorldEntries(existing,incoming,{preserveMacros:true,preserveOptions:true});
    await writeWorldBook(worldName,merged);await installRegex(rules);
    const oldNames=installed.filter(name=>name!==worldName),c=ctx();
    for(const character of c.characters||[]){
        if(!oldNames.includes(character.data?.extensions?.world))continue;
        await checkedFetch('world-bindings','/api/characters/merge-attributes',{method:'POST',headers:c.getRequestHeaders(),body:JSON.stringify({avatar:character.avatar,data:{extensions:{world:worldName}}})},{fetchImpl:hostFetch});
        character.data.extensions.world=worldName;
    }
    const characterWorld=document.getElementById('character_world');
    if(characterWorld&&oldNames.includes(characterWorld.value))characterWorld.value=worldName;
    const oldChatWorld=c.chatMetadata?.world_info;
    if(oldNames.includes(oldChatWorld))await saveChatWorldBinding(c,oldChatWorld,worldName);
    migrateWorldBindings({selected:wi.selected_world_info,worldInfo:wi.world_info,powerUser:c.powerUserSettings},oldNames,worldName);
    if(oldNames.length)await wi.updateWorldInfoList();
    if(!installed.length&&!wi.selected_world_info.includes(worldName)){
        wi.onWorldInfoChange({state:'on',silent:'true'},worldName);
        wi.world_info.globalSelect=[...wi.selected_world_info];
    }
    const previous={world:settings.world,worldAliases:settings.worldAliases,installed:settings.installed,resourceVersion:settings.resourceVersion,resourceRevision:settings.resourceRevision};
    settings.world=worldName;settings.worldAliases={...Object.fromEntries(Object.entries(settings.worldAliases||{}).map(([name,next])=>[name,oldNames.includes(next)?worldName:next])),...Object.fromEntries(oldNames.map(name=>[name,worldName]))};settings.installed=true;settings.resourceVersion=manifest.version;settings.resourceRevision=manifest.revision;
    try{await persistSettings();}catch(error){Object.assign(settings,previous);throw error;}
    resourceUpdater.changed();renderAll();notices.success(`${worldName} 与正则已更新，原宏和开关已保留`,'资源更新');
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
async function downloadImage(url,name) {
    if(!name){try{name=decodeURIComponent(new URL(url,location.href).pathname.split('/').at(-1))||'miao-image.png';}catch{name='miao-image.png';}}
    const format=settings.exportFormat;
    if(format!=='jpg'&&!isTT()&&downloadLocalPNG({url,name}))return;
    const file=await inStage('image-export',()=>imagePresentation.file({url,name},format));return saveFile(file.blob,file.name);
}
async function saveDownload(blob,name,format=settings.exportFormat){
    ({blob,name}=await inStage('image-export',()=>prepareImageExport(blob,name,format)));
    return saveFile(blob,name);
}
async function saveFile(blob,name){
    if(isTT()&&typeof hostUtils.download==='function')return hostUtils.download(blob,name,blob.type,{throwOnFailure:true});
    return downloadBrowserBlob(blob,name);
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
    await downloadImageSelection(images,{downloadURL:format!=='jpg'&&!isTT()?image=>downloadLocalPNG(image):undefined,saveBlob:(blob,name)=>saveDownload(blob,name,format)});
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
        value('profile','配置',info.profileName);value('model','模型',info.model);if(info.width&&info.height)value('size','尺寸',`${info.width} × ${info.height}`);
        for(const [key,label,data] of [['steps','步数',p.steps],['scale','Guidance',p.scale],['seed','种子',p.seed],['sampler','采样器',p.sampler],['schedule','噪声表',p.noise_schedule??p.scheduler],['cfg_rescale','CFG Rescale',p.cfg_rescale],['sm','SMEA',p.sm],['sm_dyn','SMEA Dyn',p.sm_dyn]])value(key,label,data);
        const prompt=(label,text,key)=>{const section=el('section'),pre=el('pre',text??'未记录');pre.dataset.field=key;section.append(el('h4',label),pre);scroll.append(section);};
        prompt('正面提示词',info.prompt,'prompt');prompt('负面提示词',info.negative,'negative');
        info.characters.forEach((character,index)=>{prompt(`角色 ${index+1} · 正面`,character.positive,`character-${index}-positive`);if(character.negative)prompt(`角色 ${index+1} · 负面`,character.negative,`character-${index}-negative`);if(character.centers)prompt(`角色 ${index+1} · 位置`,JSON.stringify(character.centers),`character-${index}-centers`);});
        if(info.source)prompt('模型来源',info.source,'source');
        const extra=el('details',undefined,'miao-parameter-extra');extra.append(el('summary','其他生成参数'));scroll.append(extra);
        extra.addEventListener('toggle',()=>{if(!extra.open||extra.querySelector('pre'))return;const omit=new Set(['prompt','uc','negative_prompt','v4_prompt','v4_negative_prompt','model','width','height','steps','scale','seed','sampler','noise_schedule','scheduler']);extra.append(el('pre',JSON.stringify({parameters:Object.fromEntries(Object.entries(p).filter(([key])=>!omit.has(key))),metadata:info.metadata},null,2)));});
        complete=JSON.stringify({profileId:info.profileId,profileName:info.profileName,model:info.modelId||info.model,source:info.source,width:info.width,height:info.height,prompt:info.prompt,uc:info.negative,...p},null,2);copy.disabled=false;
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
    const directRoute=usesDirectGeneration(scope,isTT(),request.vibes,request.characters);
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
async function showPrompt(prompt,vibes=[],profileName='',pending=false,vibeEnabled=true,onEdit,selectionNote=''){
    const view=el('section',undefined,'miao-prompt-view'),original=el('pre',prompt);view.append(el('h3','绘图提示词'),original);let popup;
    const metadata=el('div',undefined,'miao-prompt-metadata');if(selectionNote)metadata.append(el('span',selectionNote),el('span','Vibe 随实际选中的配置确定'));else metadata.append(el('span',(pending?'当前配置：':'配置：')+(profileName||'未记录')),el('span',(pending?'Vibe 候选：':'Vibe：')+(pending&&!vibeEnabled?'已关闭':vibes.length?vibes.map(v=>v.name||v.id).join('、'):pending?'未选择':'未使用')));view.append(metadata);
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
        const saveLabel=pending&&settings.mode==='manual'?'保存提示词':'保存并生成新图';
        const edit=el('button','编辑提示词','miao-button'),editor=el('div',undefined,'miao-tag-editor'),input=el('textarea'),controls=el('div',undefined,'miao-actions'),commit=el('button',saveLabel,'miao-button'),cancel=el('button','取消编辑','miao-button'),error=el('p','','miao-muted');
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
    for(const message of ctx().chat)for(const {slot,record} of swipeImageRecords(message))for(const version of imageVersions(record))if(version.url&&localImagePath(version.url)===localImagePath(url))return version.tagPrompt??slot.replace(/^(?:(?:body|secondary):)?\d+:/,'');
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
async function cleanOldImages(folder,days,visibleImages){
    const visible=new Set(visibleImages.map(image=>image.url)),current=(await listImages(folder)).filter(image=>visible.has(image.url));
    const plan=planHistoryCleanup(current,{days,profiles:settings.profiles,favorites:favorites.list(),base:location.href});
    if(!plan.images.length){notices.info('没有符合条件的历史图片；收藏和例图会保留','历史清理');return false;}
    return deleteImages(folder,plan.images.map(image=>image.name),{preserveSamples:true,days});
}
async function deleteImages(folder,names,{parent,preserveSamples=false,days}={}) {
    folder=validateArchivePath(folder);
    const listing=await listImages(folder),allowed=new Map();
    for(const item of listing){if(names.includes(item.name)&&allowed.has(item.name)&&allowed.get(item.name).url!==item.url)throw Error('存在不同目录的同名图片，请进入具体目录后清理');allowed.set(item.name,item);}
    if(!names.length)return;
    if(names.some(name=>!allowed.has(name)))throw new Error('清理列表已变化，请刷新后重试');
    names=[...new Set(names)];
    const protectedImage=image=>favorites.protects(image.url)||preserveSamples&&isProtectedHistoryImage(image,{profiles:settings.profiles,favorites:favorites.list(),base:location.href});
    const protectedCount=names.filter(name=>protectedImage(allowed.get(name))).length;
    names=names.filter(name=>!protectedImage(allowed.get(name)));
    if(protectedCount)notices.info(`已保留 ${protectedCount} 张收藏或配置例图`,'喵喵文生图');
    if(!names.length)return false;
    const question=el('div');question.append(el('p',`删除 ${names.length} 张图片？目录：${folder}`),el('p','永久删除后，聊天中引用的原图也将失效。'));
    if(preserveSamples)question.append(el('p',`范围：当前分类中超过 ${days}×24 小时的图片。收藏提示词、收藏图片和配置例图保留。`));
    const previews=el('div',undefined,'miao-history-grid');
    for(const name of names.slice(0,24)){const image=el('img');image.alt=name;bindImage(image,allowed.get(name).url,{lazy:true});previews.append(image);}
    if(names.length>24)question.append(el('p',`共 ${names.length} 张，下方预览前 24 张。`));
    question.append(previews);
    if(!await confirmSettings(question,'删除图片',{parent}))return false;
    const removed=[];let failure;
    for(const name of names) {
        if(protectedImage(allowed.get(name)))continue;
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
    for(const name of removed){try{await imageAPI('delete',{path:await imagePresentation.legacyJPEGPath(allowed.get(name).url)});}catch{}}
    if(removed.length)notices.success(`已清理 ${removed.length} 张图片`);
    if(failure)throw failure;
    return true;
}
async function openSettings(initialTab,initialFavorite,initialPage) {
    if(initialTab==='favorites'&&!favoritesEnabled(settings))throw Error('请先在「生成」页开启收藏提示词');
    if(!['resources','favorites'].includes(initialTab))initialTab=undefined;
    if(settingsPopup?.dlg?.isConnected||settingsHost?.isConnected){settingsPopup?.focus?.();if(initialTab)settingsHost.dispatchEvent(new CustomEvent('miao-open-section',{detail:{section:initialTab,favorite:initialFavorite}}));return;}
    const panel=createSettingsPanel({settings,save,persistSettings,initialTab,initialFavorite,favorites,saveFavorite,generateFavorite,sceneFromImage,
        confirmCustomVibeOrigin:({generationOrigin,encodeOrigin})=>confirmSettings(`在线编码将使用同一个 API Key。生图站点：${generationOrigin}\n编码站点：${encodeOrigin}\n只有在你信任该编码站点时才继续保存。`,'确认跨站点 Vibe 编码',{confirmLabel:'确认并保存'}),
        removeFavorite:async id=>{if(!await confirmSettings('删除这条收藏？图片文件会保留。','删除收藏'))return false;await favorites.remove(id);return true;},
        collectImage:url=>openSettings('favorites',draftFromImage(url)),buildThumbnails,
        getResourceStatus:resourceUpdater.snapshot,checkResources:resourceUpdater.check,theme:resolvedTheme,onTheme:applyTheme,onError:errorPopup,
        confirmDeleteProfiles:profiles=>{const question=el('div'),list=el('ul',undefined,'miao-delete-profile-list');question.append(el('p',`删除选中的 ${profiles.length} 个串？`));for(const profile of profiles)list.append(el('li',profile.name));question.append(list,el('p','只移除配置，保留已保存的例图文件和聊天图片。'));return confirmSettings(question,`删除 ${profiles.length} 个串`);},
        refreshProfilePreview:(profile,options)=>profilePreviews.refresh(profile,{...options,scope:{folder:validateFolder(settings.folder),...generationOptions(settings)}}),getPreviewState:profile=>profilePreviews.state(profile),
        exportPromptFile,restorePromptPreview:async(preview,profile)=>{
            const data=await previewPNG(preview);ensureProfileIds([profile]);
            const url=await saveGeneratedImage(data,validateFolder(settings.folder),`sample-${Date.now()}-${randomId()}`);
            return {url,signature:sampleSignature(profile,settings.vibeLibrary,settings.samplePrompt),created:Date.now()};
        },
        onChange:async reason=>{
            if(reason!=='favorites'){
                autoSession=null;
                if(secondaryJob&&!secondaryJob.current())secondaryJob.controller.abort();
                refreshFloating();
            }
            renderAll();
        },
        saveKey:async(input,{notify=true}={})=>{await saveCurrentKey({input,vault:directVault,settings,writeServerKey:key=>writeSecret(SECRET_KEYS.NOVEL,key),fingerprint:fingerprintKey,save});if(notify)notices.success(settings.rememberDirectKey?'NAI Key 已保存到酒馆和当前设备，刷新后可继续使用':'NAI Key 已保存，直连 Key 仅在当前页面暂存');},
        saveCustomConnection:async(values,{notify=true}={})=>{if(getCurrentUserHandle()!==directUser)throw Error('酒馆用户已切换，请刷新页面后重试');await saveCustomConnection({settings,vault:customVault,...values,fingerprint:fingerprintKey,save});if(notify)notices.success('自定义连接已保存');},
        saveSecondarySettings,listSecondaryModels,saveDrawingRules,readWorldOptions,saveWorldOptions,readWorldMacroSettings,saveWorldMacroSettings,readRoleBindings:roleBindingSnapshot,saveRoleBindings,testImage,installDefaults,installWorld,installRegex,listImages,deleteImages,cleanOldImages,changeFolder,saveCapture,queueStatus,openImage,downloadImages,bindImage,
        secondaryKeyAvailable:()=>settings.secondaryTagAPI?.url?secondaryVault(settings.secondaryTagAPI.url).get().then(Boolean):false,
        saveSecondaryPresets:library=>saveSecondarySettings('secondary',undefined,library),
        exportSecondaryPreset:preset=>{const {blob,name}=secondaryPresetFile(preset);return prepareFileDownload(blob,name);},
        lastSecondaryRequest:preset=>{
            const last=secondaryRequestPreview,message=last?.message;
            return last?.chat===currentChat()&&ctx().chat.includes(message)&&last.text===message.mes&&
                last.swipe===(message.swipe_id??0)&&last.preset===preset.id?last.messages:null;
        },
        chooseFloatingIcon:selected=>showFloatingIconPicker({parent:settingsPopup.dlg,selected}),
        checkUpdate:force=>updater.check(force),installUpdate:async()=>{await persistSettings();return updater.install();},refreshPage:()=>location.reload(),
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
    floatingDispose();floatingDispose=createFloatingEntry({settings,save,open:guard(openSettings),
        extractVisibleTags:manualSecondaryGeneration(settings)?guard(extractVisibleReplyTags):undefined,reroll:guard(()=>{
        if(settings.mode==='manual')return;
        if(streamActive&&generationChat===currentChat()){notices.info('请等待本次回复输出完成');return;}
        const message=latestImageMessage(ctx().chat),tags=message?blocks(message):[];
        if(!tags.length){notices.info('最新楼层没有可生成的 tag');return;}
        for(const block of tags)generate(message,block);
    }),icon:document.querySelector('#miao-nai-menu .extensionsMenuExtensionButton')?.innerHTML||'喵'});
}
async function extractVisibleReplyTags(){
    if(!settings.enabled||!manualSecondaryGeneration(settings))return;
    const host=ctx(),viewport=window.visualViewport;
    const message=visibleAssistantMessage(host.chat,document.getElementById('chat'),viewport?.offsetTop??0,viewport?.height??window.innerHeight);
    if(!message){notices.info('请滚动到要出词的 AI 楼层','喵喵文生图');return;}
    const index=host.chat.indexOf(message),processor=host.streamingProcessor;
    const text=message.mes?.trim();
    if(!text||text==='...'||(processor?.messageId===index&&processor.isFinished===false)||
        (message===latestImageMessage(host.chat)&&streamActive&&generationChat===currentChat())){
        notices.info('请等待本楼回复完成','喵喵文生图');return;
    }
    if(secondaryJob&&!secondaryJob.controller.signal.aborted){
        notices.info('副 API 正在出词，请稍候','喵喵文生图');return;
    }
    if(blocks(message).length){notices.info('本楼已有绘图提示词','喵喵文生图');return;}
    if(!settings.secondaryTagAPI)throw Error('请在「资源」页配置副 API');
    await runSecondaryTags(message,{manual:true});
}
async function autoLatest() {
    const session=autoSession;
    if(secondaryEnabled(settings)||!settings.enabled||!session?.enabled||session.chat!==currentChat())return;
    const message=latestImageMessage(ctx().chat),swipe=message?.swipe_id??0;
    if(!message||!canAutoGenerate(ctx().chat,message,settings.mode,generationChat===currentChat()))return;
    const output=drawingOptions(settings.promptConfig);
    const marker=await session.marker;
    if(autoSession!==session||session.chat!==currentChat()||latestImageMessage(ctx().chat)!==message||(message.swipe_id??0)!==swipe)return;
    // Re-read live text after waiting for macros; never enqueue stale candidates.
    const parsed=parseGenerationBody(message.mes,settings.pattern,reasoningFormat(),marker);
    const streaming=generationChat===currentChat();
    const eggEnabled=!!parsed.marked||output.egg&&(!streaming||settings.eggProfileEnabled);
    let ordinaryCount=0;
    for(const {block,egg,requiresFinalEggTag} of generationCandidates(parsed,{streaming,eggEnabled,implicitEgg:output.egg&&settings.eggProfileEnabled})) {
        if(!egg&&ordinaryCount++>=output.count.max)continue;
        const id=generationIdentity(message,block);
        if(!session.existing.has(`${ctx().chat.indexOf(message)}:${identity(message,block)}`)&&!session.attempted.has(id)&&!state(message,identity(message,block)))generate(message,block,{automatic:true,egg:settings.eggProfileEnabled&&egg,requiresFinalEggTag});
    }
}
async function secondaryPromptText(host,message,preset){
    const slots=new Set(listedSecondaryMacros(preset).map(raw=>raw.slice(2,-2).trim()));
    const format=reasoningFormat();
    const profiles=secondaryProfiles(host,message,{
        includePersona:slots.has('用户人设'),includeCharacter:slots.has('角色设定'),
        clean:source=>maskReasoning(source,format),
    });
    const result=await prepareSecondaryChat(host.chat,message,{
        includeContext:slots.has('上下文'),
        includeUser:slots.has('用户需求'),
        clean:source=>secondaryBody(source,settings.pattern,format),
        applyRegex:async rows=>{
            const {getRegexedString,getRegexedStringBatchAsync,regex_placement}=regexEngine;
            const requests=rows.map(({item,depth})=>({
                // Suppress private reasoning even if a user's rule removes its markup.
                rawString:maskReasoning(item.mes,format),
                placement:item.is_user?regex_placement.USER_INPUT:regex_placement.AI_OUTPUT,
                params:{isPrompt:true,depth},
            }));
            try{
                if(typeof getRegexedStringBatchAsync==='function')return await getRegexedStringBatchAsync(requests);
                return requests.map(({rawString,placement,params})=>getRegexedString(rawString,placement,params));
            }catch{throw Error('副 API 应用酒馆正则失败，请检查启用的规则');}
        },
    });
    return {...result,values:{...result.values,...profiles}};
}
function secondaryRawBody(text,pattern,format){
    let visible=maskReasoning(text,format);
    const ignored=parseBodyBlocks(text,pattern,format);
    for(const block of ignored.reverse()){
        visible=visible.slice(0,block.start)+block.raw.replace(/[^\r\n]/g,' ')+visible.slice(block.start+block.raw.length);
    }
    return visible.replace(/<\/?(?:content|message)>/gi,tag=>' '.repeat(tag.length));
}
async function refreshSecondaryMessage(message){
    const host=ctx(),index=host.chat.indexOf(message);
    if(index<0)return;
    if(typeof host.updateMessageBlock==='function'){
        try{await host.updateMessageBlock(index,message);return;}catch{}
    }
    if(ctx().chat[index]!==message)return;
    const root=document.querySelector(`#chat .mes[mesid="${index}"] .mes_text`);
    if(root&&typeof host.messageFormatting==='function')root.innerHTML=host.messageFormatting(message.mes,message.name,false,false,index);
}
async function runSecondaryTags(message,{manual=false}={}){
    const connection=settings.secondaryTagAPI,chat=currentChat(),swipe=message.swipe_id??0,text=message.mes;
    const matchesTarget=()=>{
        const messages=ctx().chat;
        return manual===manualSecondaryGeneration(settings)&&assistantMessage(message)&&
            (manual?messages.includes(message):message===latestImageMessage(messages));
    };
    if(secondaryJob?.controller.signal.aborted)secondaryJob=null;
    if(!settings.enabled||!secondaryEnabled(settings)||!connection||(!manual&&secondarySession)||secondaryJob||!matchesTarget())return;
    const library=settings.secondaryTagPresets,preset=activeSecondaryPreset(readSecondaryLibrary(settings));
    const inline=inlineSecondaryPreset(preset),capture=captureSettings(),initialBlocks=inline?blocks(message):[];
    const promptConfig=settings.promptConfig,output=drawingOptions(promptConfig);
    const binding=roleBindingSnapshot();
    if(!text?.trim())return;
    const controller=new AbortController();
    let expectedText=text;
    const current=()=>{
        if(!settings.enabled||!secondaryEnabled(settings)||settings.secondaryTagAPI!==connection||settings.secondaryTagPresets!==library||getCurrentUserHandle()!==directUser||
            settings.promptConfig!==promptConfig||capture.start!==settings.startTag||capture.end!==settings.endTag||chat!==currentChat()||
            !matchesTarget()||(message.swipe_id??0)!==swipe||message.mes!==expectedText)return false;
        const latest=roleBindingSnapshot();
        return latest.scope.cardId===binding.scope.cardId&&latest.scope.chatId===binding.scope.chatId&&latest.text===binding.text;
    };
    const job={controller,message,swipe,current,manual};
    secondaryJob=job;
    renderAll();
    const timeout=setTimeout(()=>controller.abort(Error('副 API 出词超过 150 秒')),150000);
    const cancelled=new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(controller.signal.reason),{once:true}));
    try{
        const roleTags=roleList(binding.text);
        const request=async()=>{
            const host=ctx();
            const marker=inline?await eggMarkerCache.read():'';
            if(!current()||controller.signal.aborted)return;
            const existingEgg=inline?parseGenerationBody(text,settings.pattern,reasoningFormat(),marker).marked:null;
            const existingOrdinary=inline?initialBlocks.length-Number(!!existingEgg):readSecondaryTags(message,swipe).length;
            const remaining=output.count.max-existingOrdinary;
            if(remaining<1&&(!inline||!output.egg||existingEgg))return;
            const {body,values}=await secondaryPromptText(host,message,preset);
            if(!current()||controller.signal.aborted)return;
            if(!body)throw Error('应用酒馆正则后没有可用正文，请检查出站正则');
            const key=await secondaryVault(connection.url).get();
            if(!current()||controller.signal.aborted)return;
            if(!key)throw Error('请在「资源」页保存副 API Key');
            const world=secondaryWorldInfo.get(message);
            values.世界书触发=()=>world?.chat===chat&&world.swipe===swipe&&world.text===text?world.content:'';
            const macros={
                values,
                substitute:host.substituteParams?.bind(host),
                legacy:host.powerUserSettings?.experimental_macro_engine===false,
                readVariable:name=>{
                    for(const [scope,store] of [
                        [host.variables?.local,host.chatMetadata?.variables],
                        [host.variables?.global,extension_settings.variables?.global],
                    ]){
                        if(scope?.has?.(name))return scope.get(name);
                        if(Object.hasOwn(store??{},name))return store[name];
                    }
                    if(preset.entries&&['角色启用列表','通用角色启用列表','通用服装启用列表'].includes(name))return '';
                },
            };
            const prepared=inline?numberedReply(body,secondaryRawBody(text,settings.pattern,reasoningFormat()),marker):{text:body};
            const anchors=prepared.anchors;
            if(inline&&!prepared.text)throw Error('没有可定位的正文段落');
            const available=inline?Math.min(remaining,anchors.paragraphs.length):remaining;
            const count=limitDrawingCount({min:Math.max(0,output.count.min-existingOrdinary),max:output.count.max},available);
            const requestOutput={...output,count,
                egg:inline&&output.egg&&!!anchors.egg&&!existingEgg,
                eggDialogue:eggDialogueLanguage(settings),
                specialization:drawingSpecialization(promptConfig,output),nsfwRules:drawingNsfwRules(promptConfig,output)};
            if(!current()||controller.signal.aborted)return;
            if(!count.max&&!requestOutput.egg){
                if(inline&&!anchors.paragraphs.length&&remaining>0)throw Error('出站正则处理后的正文无法对应到存档段落');
                return;
            }
            notices.info('副 API 正在生成绘图 tag…','喵喵文生图');
            const tags=await requestSecondaryTags({...connection,maxTags:count.max,preset,capture,output:requestOutput},key,prepared.text,{
                signal:controller.signal,macros,roleTags,
                onPrepared:messages=>{
                    if(!current()||controller.signal.aborted)throw new DOMException('Cancelled','AbortError');
                    secondaryRequestPreview={chat,message,text,swipe,preset:preset.id,messages};
                },
            });
            return {tags,anchors,count};
        };
        const returned=await Promise.race([request(),cancelled]);
        if(!returned||!current()||controller.signal.aborted)return;
        let roleError;
        const tags=returned.tags.filter(({prompt})=>{
            try{expandRoleTags(prompt,roleTags);return true;}
            catch(error){roleError??=error;return false;}
        });
        if(!tags.length&&roleError)throw roleError;
        if(roleError)notices.warning(`已跳过使用未知角色调用的图。${roleError.message}`,'副 API 出词');
        const {anchors,count}=returned;
        const previousTags=readSecondaryTags(message,swipe);
        const plan=planSecondaryUpdate({
            text,drawings:tags,anchors,count,pattern:settings.pattern,format:reasoningFormat(),originalBlocks:initialBlocks,previousTags,
        });
        if(!plan.inserted.length&&!plan.sidecar.length){
            if(inline)throw Error('副 API 未返回可回填或保留的绘图 tag');
            return;
        }
        expectedText=plan.text;
        try{
            await saveSecondaryUpdate(message,swipe,plan,{
                readImage:slot=>state(message,`${swipe}:${slot}`),saveChat:()=>ctx().saveChat(),
            });
        }catch(error){expectedText=text;throw error;}
        if(!current())return;
        if(secondaryRequestPreview?.message===message)secondaryRequestPreview.text=plan.text;
        if(plan.inserted.length)await refreshSecondaryMessage(message);
        if(!current())return;
        if(inline){
            if(plan.inserted.length)notices.success(manual?'提示词已写入，点「生成插图」出图':`已写入 ${plan.inserted.length} 个绘图 tag`,'喵喵文生图');
            if(plan.sidecar.length)notices.warning(`${plan.sidecar.length} 个提示词已保留在本楼出图卡片`,'副 API 出词');
            if(plan.skipped)notices.warning(`${plan.skipped} 个 tag 段号无效、重复或超过张数上限，已跳过。`,'副 API 出词');
            else if(plan.ordinary<count.min)notices.warning(`副 API 只返回了 ${plan.ordinary} 张正文图，本轮至少请求了 ${count.min} 张。`,'副 API 出词');
            if(output.title&&plan.missingTitles)notices.warning(`${plan.missingTitles} 张图的副 API 返回缺少小标题。`,'副 API 出词');
        }else notices.success(manual?'提示词已写入，点「生成插图」出图':`已生成 ${plan.sidecar.length} 个绘图 tag`,'喵喵文生图');
        if(!manual&&!controller.signal.aborted){
            for(const {block,egg} of plan.inserted)generate(message,block,{automatic:true,egg:settings.eggProfileEnabled&&egg});
            if(plan.sidecar.length){
                const end=previousTags.length+plan.sidecar.length;
                for(const block of blocks(message).filter(block=>block.secondary&&block.secondaryIndex>=previousTags.length&&block.secondaryIndex<end)){
                    const legacyEgg=!inline&&block.secondaryIndex===end-1;
                    generate(message,block,{automatic:true,egg:settings.eggProfileEnabled&&legacyEgg,requiresFinalEggTag:legacyEgg});
                }
            }
        }
    }catch(error){
        if(current()&&error?.name!=='AbortError')notices.error(error.message||'副 API 出词失败','副 API 出词失败',{escapeHtml:true});
    }finally{
        clearTimeout(timeout);
        if(secondaryJob===job)secondaryJob=null;
        renderAll();
    }
}

function secondaryReady(){
    return settings.enabled&&secondaryEnabled(settings)&&!!settings.secondaryTagAPI;
}
function stoppedSecondaryStream(host,messageId){
    const processor=host.streamingProcessor;
    return processor?.messageId===messageId&&(processor.isStopped||processor.abortController?.signal?.aborted);
}
function isNewSecondaryReply(session,message){
    if(message!==session.message)return true;
    return ['swipe','continue'].includes(session.type)&&
        (message.mes!==session.text||(message.swipe_id??0)!==session.swipe);
}
function scheduleSecondaryFinish(session){
    if(!session||session.scheduled)return;
    session.scheduled=true;
    // Give a stop event from the same host turn a chance to cancel this reply.
    setTimeout(()=>{
        session.scheduled=false;
        if(secondarySession!==session)return;
        const host=ctx(),message=latestImageMessage(host.chat);
        if(session.chat!==currentChat()||session.signal?.aborted||stoppedSecondaryStream(host,host.chat.length-1)){
            secondarySession=null;return;
        }
        const processor=host.streamingProcessor;
        if(processor?.messageId===host.chat.length-1&&processor.isFinished===false)return;
        if(session.streaming&&!session.finalReply)return;
        const text=message?.mes?.trim();
        if(!message||message.role==='tool'||!text||text==='...')return;
        if(session.finalReply&&session.finalReply!==message)return;
        if(!isNewSecondaryReply(session,message))return;
        // ENDED may happen while the host is still publishing the new floor.
        // Keep the session available until a valid reply is present.
        secondarySession=null;
        knownSecondaryFloors.add(message);
        secondaryWorldInfo.set(message,{chat:session.chat,text:message.mes,swipe:message.swipe_id??0,content:session.worldInfo??''});
        if(!manualSecondaryGeneration(settings))void runSecondaryTags(message);
    },0);
}
function receiveSecondaryReply(event,messageId,type){
    const host=ctx(),index=Number(messageId);
    const message=host.chat[index];
    if(!message||message!==latestImageMessage(host.chat)||message.role==='tool')return;
    const stopped=stoppedSecondaryStream(host,index);
    if(['first_message','quiet','impersonate'].includes(type)||stopped){
        knownSecondaryFloors.add(message);
        if(stopped)secondarySession=null;
        return;
    }
    if(!secondarySession){
        const finalRender=event==='CHARACTER_MESSAGE_RENDERED'&&['normal','regenerate','reply','swipe','continue','appendFinal'].includes(type);
        if(event!=='MESSAGE_RECEIVED'&&!finalRender)return;
        const known=knownSecondaryFloors.has(message);
        knownSecondaryFloors.add(message);
        if(known||!secondaryReady())return;
        if(secondaryJob&&!secondaryJob.manual)secondaryJob.controller.abort();
        secondarySession={chat:currentChat(),type};
    }
    if(secondarySession.chat!==currentChat()||!isNewSecondaryReply(secondarySession,message))return;
    // Untyped render events also occur during streaming and swipe navigation.
    if(event==='CHARACTER_MESSAGE_RENDERED'&&!type&&secondarySession.finalReply!==message)return;
    secondarySession.finalReply=message;
    knownSecondaryFloors.add(message);
    scheduleSecondaryFinish(secondarySession);
}
function scanStream() {
    if(!settings.enabled||secondaryEnabled(settings)||settings.mode!=='stream'||!streamActive||generationChat!==currentChat())return;
    autoLatest();
}
function scheduleRender(automatic=false) {
    autoScheduled ||= automatic;
    clearTimeout(timer);timer=setTimeout(()=>guard(()=>{const auto=autoScheduled;autoScheduled=false;renderAll();if(auto)autoLatest();})(),80);
}
async function init() {
    const c=ctx();
    for(const message of c.chat)knownSecondaryFloors.add(message);
    if(c.eventTypes.WORLDINFO_ENTRIES_LOADED)c.eventSource.on(c.eventTypes.WORLDINFO_ENTRIES_LOADED,groups=>{
        if(!settings.enabled||!secondaryEnabled(settings)||!groups)return;
        const lists=[groups.globalLore,groups.characterLore,groups.chatLore,groups.personaLore];
        const filtered=filterDrawingWorldEntries(lists,settings.world);
        // The host keeps the original arrays after emitting the event.
        for(const [index,entries] of lists.entries()){
            if(!Array.isArray(entries)||entries.length===filtered[index].length)continue;
            const remaining=filtered[index];
            entries.length=remaining.length;
            for(let i=0;i<remaining.length;i++)entries[i]=remaining[i];
        }
    });
    const sharedMacros={
        ...captureMacroValues({get start(){return settings.startTag;},get end(){return settings.endTag;}}),
        miao_image_count:()=>drawingOptions(settings.promptConfig).count.text,
        miao_drawing_policy:()=>worldDrawingPolicy(settings.promptConfig,eggDialogueLanguage(settings)),
    };
    for(const [name,handler] of Object.entries(sharedMacros)){
        if(c.powerUserSettings?.experimental_macro_engine!==false&&typeof c.macros?.register==='function')c.macros.register(name,{handler});
        else c.registerMacro?.(name,handler);
    }
    if(c.eventTypes.WORLDINFO_UPDATED)c.eventSource.on(c.eventTypes.WORLDINFO_UPDATED,()=>eggMarkerCache.invalidate());
    if(!settings.promptConfig){
        try{
            const name=[settings.world,...bundledWorldTargets(wi.world_names,settings.world)].find(n=>n&&wi.world_names.includes(n));
            const book=name?await wi.loadWorldInfo(name):null;
            if(name&&!book)throw Error('无法读取旧世界书');
            settings.promptConfig=book&&!newInstallation?migratePromptSettings(book):defaultPromptSettings();
        }catch{
            settings.promptConfig=defaultPromptSettings();settings.promptConfig.migration={status:'failed'};
            notices.warning('无法读取旧世界书的出图规则，请在资源页检查设置。','提示词');
        }
        try{await persistSettings();}catch{notices.warning('提示词配置未能保存，请在资源页重新保存。','提示词');}
    }else{
        try{
            const previous=settings.promptConfig,next=migrateExternalPromptSettings(previous);
            if(next!==previous){
                // Keep the migrated settings usable even if the host cannot persist them yet.
                settings.promptConfig=next;
                await persistSettings();
            }
        }catch{notices.warning('提示词迁移或保存失败，可在资源页重试保存。','提示词');}
    }
    mountMenu();refreshFloating();save();
    const previousLimit=settings.secondaryTagAPI?.maxTags;
    if (Number.isInteger(previousLimit)&&previousLimit>0) {
        const options=drawingOptions(settings.promptConfig);
        const previousConnection=settings.secondaryTagAPI;
        settings.secondaryTagAPI={...previousConnection};
        delete settings.secondaryTagAPI.maxTags;
        try{
            if(previousLimit!==3&&options.count.text==='2~3'){
                await savePromptConfig(withDrawingOptions(settings.promptConfig,{...options,count:`${Math.min(2,previousLimit)}~${previousLimit}`}));
            }else await persistSettings();
        }catch{settings.secondaryTagAPI=previousConnection;}
    }
    if(c.eventTypes.WORLD_INFO_ACTIVATED)c.eventSource.on(c.eventTypes.WORLD_INFO_ACTIVATED,entries=>{
        if(secondarySession?.chat!==currentChat()||!Array.isArray(entries))return;
        const [lore]=filterDrawingWorldEntries([entries],settings.world);
        secondarySession.worldInfo=lore.filter(entry=>typeof entry?.content==='string').map(entry=>entry.content).join('\n\n').slice(0,12000);
    });

    let migrated=false;for(const message of c.chat)migrated=migrateSwipeImages(message)||migrated;if(migrated)await c.saveChat();
    document.addEventListener('click',event=>{
        if(event.target.closest?.('.miao-image-card>img,.miao-image-tools'))return;
        imageToolsEpoch++;
        document.querySelectorAll('.miao-image-tools').forEach(tools=>{if(tools.closest('.miao-image-card')?.querySelector('img'))tools.hidden=true;});
        document.querySelectorAll('.miao-image-card').forEach(card=>card._cancelGesture?.());
    });
    for(const name of ['CHAT_LOADED','MORE_MESSAGES_LOADED','USER_MESSAGE_RENDERED','MESSAGE_RECEIVED','CHARACTER_MESSAGE_RENDERED','MESSAGE_UPDATED','MESSAGE_SWIPED','MESSAGE_EDITED'])if(c.eventTypes[name])c.eventSource.on(c.eventTypes[name],(messageId,type)=>{
        if(name==='CHAT_LOADED'||name==='MORE_MESSAGES_LOADED')for(const message of ctx().chat)knownSecondaryFloors.add(message);
        if(name==='MESSAGE_RECEIVED'||name==='CHARACTER_MESSAGE_RENDERED')receiveSecondaryReply(name,messageId,type);
        // Final rendering and swipe navigation must release any stale stream lock.
        if(name==='MESSAGE_SWIPED'||name==='CHARACTER_MESSAGE_RENDERED'&&Number(messageId)===ctx().chat.length-1){streamActive=false;generationChat=null;}
        if(name==='CHARACTER_MESSAGE_RENDERED'&&Number(messageId)===ctx().chat.length-1){const session=autoSession;void autoLatest().finally(()=>{if(autoSession===session&&!generationChat)autoSession=null;});}
        if(secondaryJob&&!secondaryJob.current())secondaryJob.controller.abort();
        scheduleRender(false);
    });
    if(c.eventTypes.MESSAGE_SWIPE_DELETED)c.eventSource.on(c.eventTypes.MESSAGE_SWIPE_DELETED,async({messageId,swipeId})=>{
        const message=ctx().chat[messageId];if(!message)return;
        for(const task of running.values())if(liveMessage(task.message,task)===message&&task.swipe>=swipeId)task.cancelled=true;
        if(secondaryJob?.message===message&&secondaryJob.swipe>=swipeId)secondaryJob.controller.abort();
        removeSecondarySwipe(message,Number(swipeId));
        removeSwipeImages(message,swipeId);await ctx().saveChat();scheduleRender(false);
    });
    c.eventSource.on(c.eventTypes.CHAT_CHANGED,()=>{
        for(const message of ctx().chat)knownSecondaryFloors.add(message);
        settingsHost?.dispatchEvent(new Event('miao-role-scope-changed'));
        streamActive=false;generationChat=null;autoSession=null;secondarySession=null;secondaryRequestPreview=null;secondaryJob?.controller.abort();
        scheduleRender(false);setTimeout(()=>{
            void guard(restoreResourceChatBinding)();
            void guard(indexChatImages)();
        },0);
    });
    for(const name of ['CHAT_LOADED','MORE_MESSAGES_LOADED'])if(c.eventTypes[name])c.eventSource.on(c.eventTypes[name],()=>setTimeout(()=>guard(indexChatImages)(),0));
    c.eventSource.on(c.eventTypes.GENERATION_STARTED,(type,options,dryRun)=>{
        // Quiet prompts and prompt previews do not render a chat reply and may
        // never emit GENERATION_ENDED. They must not hide the last floor's cards.
        if(dryRun||type==='quiet'||type==='impersonate')return;
        if(secondaryJob&&!secondaryJob.manual)secondaryJob.controller.abort();
        secondarySession=null;
        if(secondaryReady()){
            const message=latestImageMessage(ctx().chat);
            secondarySession={chat:currentChat(),type,message,text:message?.mes,swipe:message?.swipe_id??0,signal:options?.signal};
        }
        streamActive=false;generationChat=currentChat();
        const mainAuto=settings.enabled&&settings.mode!=='manual'&&!secondaryEnabled(settings);
        autoSession={chat:currentChat(),enabled:mainAuto,attempted:new Set(),marker:mainAuto?eggMarkerCache.read():Promise.resolve(''),existing:new Set(ctx().chat.flatMap((m,i)=>blocks(m).map(b=>`${i}:${identity(m,b)}`)))};
    });
    c.eventSource.on(c.eventTypes.GENERATION_ENDED,()=>{
        const same=generationChat===currentChat();streamActive=false;generationChat=null;
        const host=ctx();
        if(stoppedSecondaryStream(host,host.chat.length-1)){
            const message=latestImageMessage(host.chat);if(message)knownSecondaryFloors.add(message);
            secondarySession=null;
        }else scheduleSecondaryFinish(secondarySession);
        renderAll();if(same)autoLatest();
    });
    if(c.eventTypes.GENERATION_STOPPED)c.eventSource.on(c.eventTypes.GENERATION_STOPPED,()=>{
        const same=generationChat===currentChat();streamActive=false;generationChat=null;secondarySession=null;
        const message=latestImageMessage(ctx().chat);if(message)knownSecondaryFloors.add(message);
        scheduleRender(false);if(same&&settings.eggProfileEnabled)void autoLatest();
    });
    c.eventSource.on(c.eventTypes.STREAM_TOKEN_RECEIVED,()=>{
        if(generationChat===currentChat())streamActive=true;
        if(secondarySession?.chat===currentChat())secondarySession.streaming=true;
        setTimeout(()=>guard(()=>{scanStream();renderAll();})(),0);
    });
    for(const event of ['SECRET_WRITTEN','SECRET_DELETED','SECRET_ROTATED'])if(c.eventTypes[event])c.eventSource.on(c.eventTypes[event],key=>{if(key===SECRET_KEYS.NOVEL){settings.keyHash='';save();settingsHost?.dispatchEvent(new Event('miao-key-changed'));}});
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change',applyTheme);
    void guard(restoreResourceChatBinding)();
    if(settings.enabled&&!settings.installed)await installDefaults();indexChatImages();renderAll();autoLatest();
    resourceUpdater.check().catch(()=>{});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)resourceUpdater.check().catch(()=>{});});
    setInterval(()=>{if(!document.hidden)resourceUpdater.check().catch(()=>{});},900000);



}
jQuery(()=>guard(init)());
