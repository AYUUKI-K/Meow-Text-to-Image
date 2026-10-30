import {reconcileProfileSelection} from '../profiles/profile-selection.js';
import {createResourceMacrosView} from './resource-macros-view.js';
import {validateQueueURL} from '../queue/cloud-queue.js';
import {bindButtonPress} from './button-press.js';
import {readPromptFiles} from '../prompts/prompt-files.js';
import {ensureProfileIds,moveProfile,planProfileRemoval} from '../profiles/profile-previews.js';
import {browseArchive} from '../images/image-archives.js';
import {showArchivePicker} from './archive-picker.js';
import {sizePresets,pageItems,defaults,compareImagesNewest,supportsVarietyBoost} from '../core/core.js';
import {vibeModelKeys} from '../vibe/vibe.js';
import {createFavoritesView} from './favorites-view.js';
import {FAVORITE_FOLDER,favoritesEnabled} from '../prompts/prompt-favorites.js';
import {novelAIPresets,resolvePresetId} from '../novelai/novelai-presets.js';
import {fontAwesomeElement} from './fontawesome-icons.js';
import {onlineEncodingAvailable} from '../novelai/nai-connection.js';
const models=[['nai-diffusion-5-full','V5 Full'],['nai-diffusion-5-curated','V5 Curated'],['nai-diffusion-4-5-full','V4.5 Full'],['nai-diffusion-4-5-curated','V4.5 Curated'],['nai-diffusion-4-full','V4 Full'],['nai-diffusion-4-curated-preview','V4 Curated'],['nai-diffusion-3','V3 Anime'],['nai-diffusion-furry-3','V3 Furry']];
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const panelMemory=new WeakMap();
export function createSettingsPanel({settings,save,persistSettings,confirmDeleteProfiles,exportPromptFile,restorePromptPreview,refreshProfilePreview,getPreviewState,initialTab,initialFavorite,favorites,saveFavorite,removeFavorite,generateFavorite,sceneFromImage,collectImage,buildThumbnails,getResourceStatus,checkResources,theme,onTheme,onChange,onError,saveKey,saveCustomConnection,testImage,installDefaults,installWorld,installRegex,readResourceMacros,saveResourceMacros,listImages,deleteImages,changeFolder,saveCapture,queueStatus,openImage,downloadImages,bindImage,onExportFormatChange,chooseFloatingIcon,checkUpdate,installUpdate,refreshPage,listVibes,importVibeFiles,exportVibeFiles,encodeVibe,deleteVibe,renameVibe,directKeyStatus,clearDirectKey,setRememberDirectKey,closeSettings}) {
    const memory=panelMemory.get(settings)||{galleryTop:0};panelMemory.set(settings,memory);
    const root=node('section',undefined,'miao-settings');root.id='miao-nai-settings';
    const versionLabel=node('span','版本读取中…','miao-version');
    let activeTab=initialTab||(matchMedia('(max-width:680px), (max-height:500px)').matches?'overview':'generation'),fieldId=0,promptTab='positive',selectedVibeId=null,samplePromptDraft=memory.samplePromptDraft,sortingProfiles=false;
    const safe=fn=>async()=>{try{await fn();}catch(e){onError(e);}};
    const updateBox=node('div',undefined,'miao-update-status');updateBox.setAttribute('aria-live','polite');
    let paintResources=()=>{},paintPreviews=()=>{},renderEpoch=0,batchExport=false;const exportSelection=new Set();
    let batchVibes=false,vibeTransferBusy=false;const vibeSelection=new Set();
    const paintResourceEntries=()=>{const available=getResourceStatus().available;for(const entry of root.querySelectorAll('[data-resource-entry]')){entry.dataset.resourceUpdate=String(available);entry.querySelector('.miao-resource-hint')?.replaceChildren(available?'有更新':'');}paintResources();};
    let updateData=null,updateBusy=false,updateError='',updated=false;
    function paintUpdate(){
        updateBox.replaceChildren();
        if(updateBusy){updateBox.append(node('span','检查中…'));return;}
        if(updated){updateBox.append(node('span','更新完成…'));return;}
        if(updateError)updateBox.append(node('span',updateError));
        else updateBox.append(node('span',updateData?.isUpToDate===false?'发现新版本':updateData?'已是最新':''));
        action(updateBox,'检查并更新',async()=>{
            updateBusy=true;updateError='';paintUpdate();
            try{updateData=await checkUpdate(true);if(updateData.needsReload||updateData.isUpToDate===false){if(!updateData.needsReload)await installUpdate();updated=true;paintUpdate();await refreshPage();}}
            catch(error){updateError=error.message;updated=false;}
            finally{updateBusy=false;paintUpdate();}
        });
    }
    async function checkLatest(force=false){updateBusy=true;paintUpdate();try{updateData=await checkUpdate(force);}catch(error){updateError=error.message;}finally{updateBusy=false;paintUpdate();}}
    async function readVersion(){
        try{
            const response=await fetch(new URL('../../manifest.json',import.meta.url),{cache:'no-store'});
            if(!response.ok)throw Error('版本读取失败');
            const {version}=await response.json();
            versionLabel.textContent=typeof version==='string'&&version.trim()?`v${version.trim()}`:'版本未知';
        }catch{versionLabel.textContent='版本未知';}
    }
    function action(parent,label,fn,primary=false) {
        const b=node('button',label,`miao-button${primary?' miao-primary':''}`);b.type='button';
        const invoke=safe(async()=>{if(b.disabled)return;b.disabled=true;try{await fn();}finally{b.disabled=false;}});if(/^(删除|清理)/.test(label))bindButtonPress(b,invoke);else b.onclick=invoke;parent.append(b);return b;
    }
    function field(parent,label,value,change,{type='text',options,wide=false}={}) {
        const wrap=node('label',undefined,`miao-field${wide?' miao-wide':''}`);wrap.append(node('span',label));
        const control=node(options?'select':type==='textarea'?'textarea':'input');if(!options&&type!=='textarea')control.type=type;
        if(options)for(const [value,text] of options){const o=node('option',text);o.value=value;control.append(o);}
        control.id='miao-field-'+(++fieldId);wrap.htmlFor=control.id;
        control.value=value??'';
        if(type==='number'){control.step='any';control.inputMode='decimal';}
        const event=options?'change':'input';
        control.addEventListener(event,()=>{try{change(type==='number'?Number(control.value):control.value);}catch(e){onError(e);}});
        wrap.append(control);parent.append(wrap);return control;
    }
    function section(parent,title) {const box=node('section',undefined,'miao-section');box.append(node('h3',title));parent.append(box);return box;}
    function showPreparedFile(parent,result){
        parent.replaceChildren();parent.hidden=!result?.name;if(parent.hidden)return;
        const filename=field(parent,'文件名',result.name,()=>{});filename.readOnly=true;filename.onclick=()=>filename.select();
        const actions=node('div',undefined,'miao-actions');parent.append(actions);
        if(result.share)action(actions,'分享文件',result.share,true);
        action(actions,'保存文件',result.save);action(actions,'复制文件名',result.copy);parent.scrollIntoView({block:'nearest'});
    }
    async function profileVibes(parent,p){
        parent.append(node('p','读取中…','miao-muted'));
        try{
            const items=await listVibes();parent.replaceChildren();
            if(!items.length){parent.append(node('p','暂无 Vibe','miao-muted'));return;}
            for(const item of items){
                const row=node('div',undefined,'miao-vibe-choice'),label=node('label',undefined,'miao-switch-row'),check=node('input');check.type='checkbox';
                const variants=item.variants.filter(v=>v.model===vibeModelKeys[p.model]);
                let binding=(p.vibes||[]).find(v=>v.id===item.id);check.checked=!!binding;check.disabled=(!variants.length&&!binding)||(!binding&&p.vibeMode!=='random'&&(p.vibes||[]).length>=4);
                check.onchange=()=>{p.vibes??=[];if(check.checked&&p.vibeMode!=='random'&&p.vibes.length>=4){check.checked=false;onError(Error('最多同时启用 4 个 Vibe'));return;}if(check.checked)p.vibes.push({id:item.id,key:variants[0].key,strength:0.6});else p.vibes=p.vibes.filter(v=>v.id!==item.id);save();profileVibes(parent,p);};
                label.append(node('span',item.name),check);row.append(label);
                if(binding){
                    const grid=node('div',undefined,'miao-grid');row.append(grid);
                    const options=variants.map(v=>[v.key,`信息提取 ${v.information}`]);if(!variants.some(v=>v.key===binding.key))options.unshift([binding.key,'编码不匹配，请重新选择']);
                    field(grid,'编码',binding.key,v=>{binding.key=v;save();},{options});
                    const strength=field(grid,'参考强度',binding.strength,v=>{binding.strength=v;save();},{type:'number'});strength.min='0';strength.max='1';strength.step='0.05';
                }
                if(!variants.length)row.append(node('p','缺少当前模型编码','miao-muted'));
                parent.append(row);
            }
        }catch(error){parent.replaceChildren(node('p',error.message,'miao-muted'));}
    }
    async function deleteProfiles(ids){
        const initial=planProfileRemoval(settings,ids);
        if(!await confirmDeleteProfiles(initial.removed))return;
        const plan=planProfileRemoval(settings,ids),previous=settings.profiles,active=settings.active,policy={profileSelectionMode:settings.profileSelectionMode,randomProfileIds:[...settings.randomProfileIds],eggProfileEnabled:settings.eggProfileEnabled,eggProfileId:settings.eggProfileId},body=root.querySelector('.miao-panel-body'),wasInert=body.inert;
        const locked=[...root.querySelectorAll('.miao-save-button,.miao-drawer-back,.miao-tabs>button')].map(button=>[button,button.disabled]);
        body.inert=true;for(const [button] of locked)button.disabled=true;root.setAttribute('aria-busy','true');
        settings.profiles=plan.profiles;settings.active=plan.active;const warnings=reconcileProfileSelection(settings);
        try{
            await persistSettings();
            for(const id of ids)exportSelection.delete(id);
            render();for(const warning of warnings)onError(Error(warning));
        }catch(error){settings.profiles=previous;settings.active=active;Object.assign(settings,policy);save();throw error;}
        finally{body.inert=wasInert;for(const [button,disabled] of locked)button.disabled=disabled;root.removeAttribute('aria-busy');}
    }
    function render() {
        const profileFocus=root.contains(document.activeElement)?document.activeElement.dataset.profileFocus:undefined;
        const previousGallery=root.querySelector('.miao-sample-gallery');if(previousGallery)memory.galleryTop=previousGallery.scrollTop;
        const galleryTop=memory.galleryTop;
        const epoch=++renderEpoch,keep=root.dataset.section===activeTab,scroller=root.closest('.popup-content'),outerTop=scroller?.scrollTop,positions=new Map([...root.querySelectorAll('[data-scroll-key]')].map(item=>[item.dataset.scrollKey,{top:item.scrollTop,left:item.scrollLeft}]));
        paintResources=()=>{};paintPreviews=()=>{};ensureProfileIds(settings.profiles);reconcileProfileSelection(settings);root.replaceChildren();root.dataset.theme=theme();
        root.dataset.section=activeTab;
        root.dataset.favoritesEnabled=String(favoritesEnabled(settings));
        let commitPage=async()=>{},afterSave=()=>{};
        const header=node('header',undefined,'miao-header');const brand=node('div',undefined,'miao-brand');
        const back=node('button','‹','miao-drawer-back');back.type='button';back.setAttribute('aria-label','返回功能列表');back.hidden=activeTab==='overview';back.onclick=()=>{activeTab='overview';render();root.closest('.popup-content')?.scrollTo({top:0});};header.append(back);
        if(activeTab==='overview'){const title=node('div');title.append(node('h2','喵喵文生图'));brand.append(title);header.append(brand);}
        header.dataset.compact=String(activeTab!=='overview');
        if(activeTab!=='overview'){
            const saveButton=action(header,'保存',async()=>{saveButton.textContent='保存中…';try{await commitPage();await persistSettings();afterSave();const current=root.querySelector('.miao-save-button');if(current)current.textContent='已保存';}catch(error){const current=root.querySelector('.miao-save-button');if(current)current.textContent='保存';throw error;}});saveButton.classList.add('miao-save-button');
        }
        const close=node('button','×','miao-drawer-close');close.type='button';close.setAttribute('aria-label','关闭设置');close.onclick=safe(closeSettings);header.append(close);root.append(header);
        const tabs=node('nav',undefined,'miao-tabs');tabs.setAttribute('aria-label','设置分区');
        for(const [id,label] of [['generation','生成'],['config','配置'],['vibes','Vibe'],['resources','资源'],['images','图库'],['favorites','收藏']].filter(([id])=>id!=='favorites'||favoritesEnabled(settings))) {
            const b=node('button',label);b.type='button';b.dataset.active=String(activeTab===id);b.setAttribute('aria-pressed',String(activeTab===id));if(id==='resources')b.dataset.resourceEntry='true';b.onclick=()=>{activeTab=id;render();root.closest('.popup-content')?.scrollTo({top:0});};tabs.append(b);
        }root.append(tabs);
        const body=node('div',undefined,'miao-panel-body');body.dataset.scrollKey='panel-'+activeTab;root.append(body);
        const p=settings.profiles[settings.active];
        if(activeTab==='overview'){
            const overview=node('nav',undefined,'miao-overview');overview.setAttribute('aria-label','功能列表');body.append(overview);
            for(const [id,label,icon] of [
                ['generation','生成','sliders'],
                ['config','配置','layer-group'],
                ['vibes','Vibe','wand-magic-sparkles'],
                ['resources','资源','book'],
                ['images','图库','images'],
                ['favorites','收藏','bookmark'],
            ].filter(([id])=>id!=='favorites'||favoritesEnabled(settings))){
                const row=node('button',undefined,'miao-overview-row');row.type='button';if(id==='resources')row.dataset.resourceEntry='true';row.setAttribute('aria-label',label);
                const symbol=node('i',undefined,`fa-solid fa-${icon}`);symbol.setAttribute('aria-hidden','true');
                const copy=node('span',undefined,'miao-overview-copy');copy.append(node('strong',label));if(id==='resources')copy.append(node('small','','miao-resource-hint'));if(id==='config')copy.append(node('small',p.name));if(id==='vibes')copy.append(node('small',String(settings.vibeLibrary?.length||0)));const arrow=node('span','›','miao-overview-arrow');arrow.setAttribute('aria-hidden','true');row.append(symbol,copy,arrow);
                row.onclick=()=>{activeTab=id;render();root.closest('.popup-content')?.scrollTo({top:0});};overview.append(row);
            }
        } else if(activeTab==='generation') {
            const layout=node('div',undefined,'miao-generation-layout'),preferences=node('div',undefined,'miao-generation-column'),account=node('div',undefined,'miao-generation-column');layout.append(preferences,account);body.append(layout);
            const interaction=section(preferences,'操作');
            field(interaction,'悬浮入口',settings.floatingEntry?'floating':'menu',v=>{settings.floatingEntry=v==='floating';floatingRerollRow.hidden=floatingOptions.hidden=!settings.floatingEntry;save();onChange();},{options:[['menu','关闭'],['floating','开启']]});
            const floatingRerollRow=node('label',undefined,'miao-switch-row'),floatingRerollCheck=node('input');floatingRerollRow.hidden=!settings.floatingEntry;floatingRerollCheck.type='checkbox';floatingRerollCheck.checked=!!settings.floatingReroll;floatingRerollCheck.onchange=()=>{settings.floatingReroll=floatingRerollCheck.checked;save();onChange();};floatingRerollRow.append(node('span','双击悬浮球生成最新一层所有图片'),floatingRerollCheck);interaction.append(floatingRerollRow);
            const floatingOptions=node('div',undefined,'miao-floating-options');floatingOptions.hidden=!settings.floatingEntry;interaction.append(floatingOptions);
            const iconType=field(floatingOptions,'悬浮图标',settings.floatingIconType,v=>{settings.floatingIconType=v;paintIcon();save();onChange();},{options:[['default','默认图标'],['fontawesome','Font Awesome']]});
            const iconChoice=node('div',undefined,'miao-floating-icon-choice'),iconPreview=node('span',undefined,'miao-floating-icon-preview');floatingOptions.append(iconChoice);iconChoice.append(iconPreview);
            const paintIcon=()=>{iconType.value=settings.floatingIconType;iconChoice.hidden=settings.floatingIconType!=='fontawesome';iconPreview.replaceChildren(fontAwesomeElement(settings.floatingIcon),node('span',settings.floatingIcon.name.slice(3)));};
            action(iconChoice,'选择图标',async()=>{const selected=await chooseFloatingIcon(settings.floatingIcon);if(selected===undefined)return;if(selected===null)settings.floatingIconType='default';else{settings.floatingIcon=selected;settings.floatingIconType='fontawesome';}paintIcon();save();onChange();});paintIcon();
            const favoriteToggle=node('label',undefined,'miao-switch-row'),favoriteCheck=node('input');favoriteCheck.type='checkbox';favoriteCheck.checked=favoritesEnabled(settings);favoriteCheck.onchange=()=>{settings.promptFavoritesEnabled=favoriteCheck.checked;save();onChange('favorites');render();};favoriteToggle.append(node('span','启用收藏提示词'),favoriteCheck);interaction.append(favoriteToggle);
            const quiet=node('label',undefined,'miao-switch-row'),quietCheck=node('input');quietCheck.type='checkbox';quietCheck.checked=!!settings.hideNonErrorNotifications;quietCheck.onchange=()=>{settings.hideNonErrorNotifications=quietCheck.checked;save();};quiet.append(node('span','隐藏非报错通知'),quietCheck);interaction.append(quiet);
            field(interaction,'重新生图',String(settings.rerollClicks===3?3:2),v=>{settings.rerollClicks=Number(v);save();onChange();},{options:[['2','双击'],['3','三击']]});
            const main=section(preferences,'生成方式');
            field(main,'生成模式',settings.mode,v=>{settings.mode=v;settings.enabled=true;save();onChange(true);render();},{options:[['manual','手动'],['auto','回复后生成'],['stream','流式生成']]});
            const retry=node('label',undefined,'miao-switch-row'),retryCheck=node('input');retryCheck.type='checkbox';retryCheck.checked=!!settings.autoRetryEnabled;retryCheck.onchange=()=>{settings.autoRetryEnabled=retryCheck.checked;save();};retry.append(node('span','遇到限流自动重试'),retryCheck);main.append(retry);
            main.append(node('p','仅 HTTP 429 限流允许重试，最多 3 次；其他错误不自动重试。','miao-muted'));
            const connection=section(account,'连接 NovelAI');

            const custom=settings.naiConnection==='custom',epoch=renderEpoch;
            field(connection,'连接方式',custom?'custom':'official',value=>{settings.naiConnection=value;settings.connectionRevision=(settings.connectionRevision||0)+1;save();render();},{options:[['official','官方 NovelAI'],['custom','自定义 NovelAI 兼容接口']]});
            let generationURL,encodeURL;
            if(custom){
                connection.append(node('p','适用于 NovelAI 原生兼容接口。请填写完整请求地址。模型、Vibe、额度及调用频率以站点说明为准。使用公益站时，建议关闭自动生图和自动重试，少量提交任务，并按站方要求控制节奏。','miao-muted'));
                generationURL=field(connection,'生图完整 URL（必填）',settings.customGenerationURL,()=>{});
            }
            const key=field(connection,'API Key','',()=>{},{type:'password'});key.autocomplete='new-password';key.placeholder=custom?'输入完整 Bearer Token（不含 Bearer 前缀）':'输入你的 NovelAI Key';
            if(custom){
                encodeURL=field(connection,'Vibe 编码完整 URL（可选）',settings.customEncodeURL,()=>{});
                connection.append(node('p','在线编码需要另行配置完整端点；留空时仍可导入和使用已有编码的 Vibe。地址原样请求，不追加路径。','miao-muted'));
            }
            const rememberSetting=custom?'rememberCustomKey':'rememberDirectKey';
            const remember=node('label',undefined,'miao-switch-row'),rememberCheck=node('input');rememberCheck.type='checkbox';rememberCheck.checked=!!settings[rememberSetting];rememberCheck.onchange=safe(async()=>{try{await setRememberDirectKey(rememberCheck.checked);}finally{rememberCheck.checked=!!settings[rememberSetting];await updateKeyState();}});remember.append(node('span','记住 Key'),rememberCheck);connection.append(remember);

            const keyState=node('p','检查中…','miao-muted');keyState.setAttribute('role','status');account.append(keyState);
            const mask='••••••••••••';let directReady=false,keyRevision=0;
            key.addEventListener('focus',()=>{if(key.value===mask)key.value='';});
            key.addEventListener('blur',()=>{if(!key.value&&directReady)key.value=mask;});
            const updateKeyState=async()=>{const revision=++keyRevision,status=await directKeyStatus();if(epoch!==renderEpoch||revision!==keyRevision)return;directReady=status.ready;keyState.textContent=directReady?'Key 已就绪':status.serverSaved?'需重新填写直连 Key':'未设置 Key';if(document.activeElement!==key&&(!key.value||key.value===mask))key.value=directReady?mask:'';};safe(updateKeyState)();root.onKeyChanged=safe(updateKeyState);
            const saveConnection=async(notify=true)=>{try{const input=key.value===mask?'':key.value.trim();if(custom)await saveCustomConnection({input,generationURL:generationURL.value,encodeURL:encodeURL.value},{notify});else await saveKey(input,{notify});key.value='';}finally{await updateKeyState();}};
            const actions=node('div',undefined,'miao-actions');connection.append(actions);action(actions,custom?'保存自定义连接':'保存密钥',saveConnection,true);action(actions,'实际测试生图（可能消耗额度）',async()=>{await commitPage();return testImage();});
            connection.append(node('p','测试生图会实际调用当前接口，可能消耗额度。','miao-muted'));
            action(connection,'清除 Key',async()=>{await clearDirectKey();await updateKeyState();});
            commitPage=async()=>{if(custom||key.value.trim()&&key.value!==mask)await saveConnection(false);};
            const queue=section(account,'共享 Key 排队');
            account.insertBefore(queue,connection);
            const queueToggle=node('label',undefined,'miao-switch-row'),queueCheck=node('input');queueCheck.type='checkbox';queueCheck.checked=settings.cloudQueue;queueCheck.onchange=()=>{settings.cloudQueue=queueCheck.checked;save();};queueToggle.append(node('span','启用云端排队'),queueCheck);queue.append(queueToggle);
            queue.append(node('p','仅协调使用同一队列服务地址的 Mewo 请求。官网、其他插件或不同队列的请求不受保护，仍可能发生占线。','miao-muted'));
            field(queue,'队列服务地址',settings.queueUrl,v=>{settings.queueUrl=v.trim();save();}).placeholder='https://miao-image-queue.savlu329.workers.dev';
            const queueDocs=node('a','自行部署 Mewo 队列服务');queueDocs.href='https://github.com/AYUUKI-K/Mewo-Text-to-Image/blob/main/docs/QUEUE.md#cloudflare-workers-部署';queueDocs.target='_blank';queueDocs.rel='noopener noreferrer';queue.append(queueDocs);
            const status=node('p','尚未测试队列连接','miao-muted');queue.append(status);
            action(queue,'测试连接',async()=>{try{validateQueueURL(settings.queueUrl);await queueStatus();status.textContent='队列连接正常';}catch(error){status.textContent='队列连接失败';throw error;}});
        } else if(activeTab==='config') {
            const profiles=section(body,'编辑配置');profiles.classList.add('miao-profile-section');
            const strategy=section(body,'配置选择');strategy.classList.add('miao-profile-selection');body.insertBefore(strategy,profiles);
            field(strategy,'选择方式',settings.profileSelectionMode,value=>{settings.profileSelectionMode=value;save();render();},{options:[['single','单个配置'],['random','多个配置（每张图随机）']]});
            const multiple=settings.profileSelectionMode==='random';
            if(multiple){
                strategy.append(node('p','每张图片从已选配置中随机使用一个。','miao-muted'));
                if(settings.randomProfileIds.length<2){const warning=node('p','请至少选择 2 个配置；选择完成前，普通图片暂不能生成。','miao-profile-warning');warning.setAttribute('role','status');strategy.append(warning);}
            }
            const eggToggle=node('label',undefined,'miao-switch-row'),eggCheck=node('input');eggCheck.type='checkbox';eggCheck.checked=settings.eggProfileEnabled;
            eggCheck.onchange=()=>{settings.eggProfileEnabled=eggCheck.checked;if(eggCheck.checked&&!settings.eggProfileId)settings.eggProfileId=p.id;save();render();};eggToggle.append(node('span','为最后一张图（彩蛋）单独指定配置'),eggCheck);strategy.append(eggToggle);
            if(settings.eggProfileEnabled)field(strategy,'彩蛋使用配置',settings.eggProfileId,value=>{settings.eggProfileId=value;save();},{options:settings.profiles.map(profile=>[profile.id,profile.name])});
            const editing=node('p','当前编辑：'+p.name,'miao-profile-editing');profiles.append(editing);
            const actions=node('div',undefined,'miao-actions miao-profile-actions');profiles.append(actions);
            action(actions,'新增配置',()=>{let number=1;while(settings.profiles.some(profile=>profile.name===`新配置 ${number}`))number++;settings.profiles.push({...structuredClone(defaults),name:`新配置 ${number}`,vibes:[]});settings.active=settings.profiles.length-1;save();render();},true);
            action(actions,'复制配置',()=>{const copy={...structuredClone(p),name:p.name+' · 副本'};delete copy.id;delete copy.preview;settings.profiles.push(copy);settings.active=settings.profiles.length-1;save();render();});
            action(actions,'删除配置',()=>deleteProfiles([p.id])).disabled=settings.profiles.length===1;
            action(actions,batchExport?'完成多选':'多选管理',()=>{batchExport=!batchExport;render();});
            if(batchExport){
                const batch=node('div',undefined,'miao-profile-export'),toolbar=node('div',undefined,'miao-actions'),choices=node('div',undefined,'miao-profile-export-choices');choices.dataset.scrollKey='profile-export';batch.append(toolbar,choices);profiles.append(batch);
                const count=node('span',undefined,'miao-selection-count'),checks=[];count.setAttribute('role','status');const update=()=>{const total=settings.profiles.filter(profile=>exportSelection.has(profile.id)).length;count.textContent=`已选 ${total} / ${settings.profiles.length} 个串${total===settings.profiles.length?' · 至少保留一个':''}`;download.disabled=total===0;remove.disabled=total===0||total===settings.profiles.length;for(const check of checks)check.closest('label').dataset.selected=String(check.checked);};
                action(toolbar,'全选',()=>{for(const profile of settings.profiles)exportSelection.add(profile.id);for(const check of checks)check.checked=true;update();});
                action(toolbar,'取消全选',()=>{exportSelection.clear();for(const check of checks)check.checked=false;update();});
                const download=action(toolbar,'导出选中串',()=>runExport(settings.profiles.filter(profile=>exportSelection.has(profile.id))),true),remove=action(toolbar,'删除选中串',()=>deleteProfiles(settings.profiles.filter(profile=>exportSelection.has(profile.id)).map(profile=>profile.id)));remove.classList.add('miao-danger');batch.prepend(count);
                for(const profile of settings.profiles){const label=node('label',undefined,'miao-switch-row'),check=node('input');check.type='checkbox';check.checked=exportSelection.has(profile.id);label.dataset.selected=String(check.checked);check.setAttribute('aria-label','勾选配置 '+profile.name);check.onchange=()=>{if(check.checked)exportSelection.add(profile.id);else exportSelection.delete(profile.id);label.dataset.selected=String(check.checked);update();};label.append(check,node('span',profile.name));choices.append(label);checks.push(check);}update();
            }
            const orderButton=action(actions,sortingProfiles?'完成排序':'排序',()=>{sortingProfiles=!sortingProfiles;render();});orderButton.setAttribute('aria-expanded',String(sortingProfiles));orderButton.setAttribute('aria-controls','miao-profile-order');
            if(sortingProfiles){
                const order=node('div',undefined,'miao-profile-order');order.dataset.scrollKey='profile-order';order.id='miao-profile-order';order.setAttribute('role','list');order.setAttribute('aria-label','配置排序');profiles.append(order);
                settings.profiles.forEach((profile,index)=>{const row=node('div',undefined,'miao-order-row');row.dataset.profileId=profile.id;row.dataset.active=String(profile===p);row.setAttribute('role','listitem');row.append(node('span',profile.name));order.append(row);
                    for(const [offset,label,symbol] of [[-1,'上移','↑'],[1,'下移','↓']]){const control=action(row,symbol,()=>{if(!moveProfile(settings,profile.id,offset))return;save();render();const next=[...root.querySelectorAll('.miao-order-row')].find(item=>item.dataset.profileId===profile.id);(next?.querySelector(`[data-direction="${offset}"]:not(:disabled)`)||next?.querySelector('button:not(:disabled)'))?.focus();});control.dataset.direction=String(offset);control.setAttribute('aria-label',label+'配置 '+profile.name);control.title=label;control.disabled=offset<0?index===0:index===settings.profiles.length-1;}
                });
            }
            const samples=node('section',undefined,'miao-profile-samples'),sampleHeading=node('div',undefined,'miao-section-toolbar');sampleHeading.append(node('h3','当前配置例图'));
            const refreshSample=node('button','刷新例图','miao-button');refreshSample.type='button';sampleHeading.append(refreshSample);samples.append(sampleHeading);
            const enlargeSample=node('button','放大例图','miao-button');enlargeSample.type='button';enlargeSample.disabled=!p.preview?.url;sampleHeading.append(enlargeSample);
            enlargeSample.onclick=safe(async()=>{if(!p.preview?.url)return;enlargeSample.disabled=true;try{await openImage(p.preview.url);}finally{paintPreviews();}});
            const gallery=node('div',undefined,'miao-sample-gallery'),views=[];gallery.dataset.scrollKey='profile-gallery';gallery.setAttribute('role','group');gallery.setAttribute('aria-label','配置例图选择');strategy.insertBefore(gallery,eggToggle);profiles.append(samples);
            gallery.addEventListener('scroll',()=>{memory.galleryTop=gallery.scrollTop;},{passive:true});
            const paintNames=()=>{editing.textContent='当前编辑：'+p.name;for(const view of views){
                const selected=multiple?settings.randomProfileIds.includes(view.profile.id):view.profile===p;
                view.name.textContent=(selected?'♡ ':'')+view.profile.name;view.image.alt=view.profile.name+' 例图';
                view.tile.setAttribute('aria-label',(multiple?'选择生图配置 ':'选择配置 ')+view.profile.name);view.tile.setAttribute('aria-pressed',String(selected));
                view.edit?.setAttribute('aria-label','编辑配置 '+view.profile.name);
            }};
            for(const profile of settings.profiles){
                const card=node('article',undefined,'miao-sample-card'),tile=node('button',undefined,'miao-sample-tile');tile.type='button';tile.dataset.profileFocus='select:'+profile.id;card.dataset.editing=String(profile===p);card.dataset.multiple=String(multiple);
                const visual=node('div',undefined,'miao-sample-visual'),image=node('img'),empty=node('span','暂无例图','miao-muted'),status=node('small','','miao-sample-status'),editor=node('small','编辑中','miao-sample-editor');editor.hidden=!multiple||profile!==p;image.loading='lazy';visual.append(image,empty,status,editor);
                const name=node('span',undefined,'miao-sample-name');tile.append(visual,name);card.append(tile);gallery.append(card);
                bindButtonPress(tile,()=>{tile.focus({preventScroll:true});if(multiple){settings.randomProfileIds=settings.randomProfileIds.includes(profile.id)?settings.randomProfileIds.filter(id=>id!==profile.id):[...settings.randomProfileIds,profile.id];}else settings.active=settings.profiles.indexOf(profile);save();render();});
                let edit;if(multiple){edit=node('button',undefined,'miao-sample-edit');edit.type='button';edit.title=profile===p?'当前编辑':'编辑此配置';edit.dataset.profileFocus='edit:'+profile.id;if(profile===p)edit.setAttribute('aria-current','true');const icon=node('i',undefined,'fa-solid fa-pencil');icon.setAttribute('aria-hidden','true');edit.append(icon);card.append(edit);bindButtonPress(edit,()=>{edit.focus({preventScroll:true});settings.active=settings.profiles.indexOf(profile);save();render();});}
                image.onerror=()=>{image.hidden=true;empty.hidden=false;empty.textContent='图片不存在';};views.push({profile,tile,name,image,empty,status,edit});
            }
            paintNames();
            const promptDetails=node('details',undefined,'miao-sample-prompt');promptDetails.append(node('summary','例图提示词'));samples.append(promptDetails);
            const samplePrompt=field(promptDetails,'通用提示词',samplePromptDraft??settings.samplePrompt,value=>{samplePromptDraft=value;memory.samplePromptDraft=value;},{type:'textarea'});samplePrompt.setAttribute('aria-label','例图提示词');
            commitPage=async()=>{if(!samplePrompt.value.trim())throw Error('请填写例图提示词');settings.samplePrompt=samplePrompt.value.trim();samplePromptDraft=undefined;delete memory.samplePromptDraft;save();};
            afterSave=()=>{void refreshProfilePreview(p,{ifChanged:true});};
            refreshSample.onclick=safe(async()=>{if(getPreviewState(p).busy)return;await commitPage();await persistSettings();void refreshProfilePreview(p);});
            paintPreviews=()=>{for(const view of views){const state=getPreviewState(view.profile);view.image.hidden=!state.url;view.empty.hidden=!!state.url;if(state.url)bindImage(view.image,state.url,{lazy:true});view.status.textContent=state.status;view.status.hidden=!state.status;}const state=getPreviewState(p);enlargeSample.disabled=!state.url;refreshSample.disabled=state.busy;refreshSample.textContent=state.busy?state.status:'刷新例图';};paintPreviews();
            field(profiles,'配置名称',p.name,v=>{p.name=v;paintNames();save();});
            const modelOptions=models.some(([id])=>id===p.model)?models:[[p.model,p.model],...models];
            field(profiles,'NAI 模型',p.model,v=>{p.model=v;p.qualityPreset=resolvePresetId(v,'quality',p.qualityPreset);p.ucPreset=resolvePresetId(v,'uc',p.ucPreset);save();render();},{options:modelOptions});
            const workspace=node('div',undefined,'miao-config-workspace');body.append(workspace);
            const prompts=section(workspace,'提示词');
            const presetBox=node('div',undefined,'miao-prompt-presets');prompts.append(presetBox);
            const presetNames={standard:'Standard',light:'Light',heavy:'Heavy',furryFocus:'Furry Focus',humanFocus:'Human Focus',none:'None'};
            for(const [kind,key,label] of [['quality','qualityPreset','质量 Tags'],['uc','ucPreset','UC 负面预设']]){
                const id=resolvePresetId(p.model,kind,p[key]??defaults[key]);
                field(presetBox,label,id,value=>{p[key]=value;save();render();},{options:novelAIPresets(p.model,kind).map(item=>[item.id,presetNames[item.id]??item.name])});
            }
            const promptToolbar=node('div',undefined,'miao-section-toolbar'),transfer=node('div',undefined,'miao-actions');promptToolbar.append(prompts.querySelector('h3'),transfer);prompts.prepend(promptToolbar);
            const promptUpload=node('input');promptUpload.type='file';promptUpload.accept='.json,application/json';promptUpload.hidden=true;promptUpload.dataset.miaoPromptImport='true';prompts.append(promptUpload);
            const importPrompts=action(transfer,'导入 NAI 串',()=>promptUpload.click());
            const exportReady=node('div',undefined,'miao-prompt-export-ready');exportReady.hidden=true;prompts.append(exportReady);
            const runExport=async profiles=>{
                exportReady.replaceChildren();exportReady.hidden=true;
                showPreparedFile(exportReady,await exportPromptFile(profiles));
            };
            action(transfer,'导出 NAI 串',()=>runExport(p));
            promptUpload.onchange=safe(async()=>{const file=promptUpload.files?.[0];if(!file)return;importPrompts.disabled=true;try{
                const imported=await readPromptFiles(file,settings.profiles,{restorePreview:restorePromptPreview}),previous=settings.profiles[settings.active];ensureProfileIds(imported);
                const first=settings.profiles.length;settings.profiles.push(...imported);settings.active=first;
                try{await persistSettings();}catch(error){settings.profiles=settings.profiles.filter(profile=>!imported.includes(profile));settings.active=Math.max(0,settings.profiles.indexOf(previous));save();throw error;}
                render();
            }finally{promptUpload.value='';importPrompts.disabled=false;}});
            const promptTabs=node('div',undefined,'miao-prompt-tabs');promptTabs.setAttribute('role','tablist');promptTabs.setAttribute('aria-label','提示词类型');prompts.append(promptTabs);
            const fields=new Map(),tabs=new Map();
            const sync=()=>{for(const [key,control] of fields){control.parentElement.hidden=key!==promptTab;tabs.get(key).setAttribute('aria-selected',String(key===promptTab));}};
            for(const [key,label] of [['positive','前置正面'],['positiveSuffix','后置正面'],['negative','负面']]) {
                const tab=node('button',label);tab.type='button';tab.setAttribute('role','tab');tab.onclick=()=>{promptTab=key;sync();};promptTabs.append(tab);tabs.set(key,tab);
                const control=field(prompts,label+'提示词',p[key],v=>{p[key]=v;save();},{type:'textarea'});
                control.placeholder=key==='positive'?'风格、质量、画师':key==='positiveSuffix'?'可留空':'负面标签';fields.set(key,control);
            }sync();
            const params=section(workspace,'生成参数');
            const varietyToggle=node('label',undefined,'miao-switch-row'),varietyCheck=node('input');varietyCheck.type='checkbox';varietyCheck.disabled=!supportsVarietyBoost(p.model);varietyCheck.checked=!varietyCheck.disabled&&p.varietyBoost===true;
            varietyCheck.onchange=()=>{p.varietyBoost=varietyCheck.checked;save();};varietyToggle.append(node('span','多样性'),varietyCheck);params.append(varietyToggle);
            if(varietyCheck.disabled)params.append(node('p','当前模型不支持多样性','miao-muted'));
            const sizes=node('div',undefined,'miao-size-options');params.append(sizes);
            for(const preset of sizePresets){const b=action(sizes,preset.name,()=>{p.width=preset.width;p.height=preset.height;save();render();});b.append(node('small',`${preset.width}×${preset.height}`));b.classList.add('miao-size-preset');b.dataset.selected=String(p.width===preset.width&&p.height===preset.height);b.setAttribute('aria-pressed',b.dataset.selected);}
            const grid=node('div',undefined,'miao-grid');params.append(grid);
            for(const [key,label,type] of [['width','宽度','number'],['height','高度','number'],['steps','步数','number'],['scale','Guidance','number'],['seed','种子','number'],['sampler','采样器','text'],['scheduler','噪声表','text']]){const choices=key==='sampler'?[['k_euler_ancestral','Euler Ancestral'],['k_euler','Euler'],['k_dpmpp_2m','DPM++ 2M'],['k_dpmpp_2s_ancestral','DPM++ 2S Ancestral'],['k_dpmpp_sde','DPM++ SDE']]:key==='scheduler'?[['karras','Karras'],['native','Native'],['exponential','Exponential'],['polyexponential','Polyexponential']]:null;const options=choices&&!choices.some(([id])=>id===p[key])?[[p[key],p[key]],...choices]:choices;field(grid,label,p[key],v=>{p[key]=v;save();},{type,options,wide:key==='seed'});}
            const vibeToggle=node('label',undefined,'miao-switch-row'),vibeCheck=node('input');vibeCheck.type='checkbox';
            vibeCheck.disabled=!vibeModelKeys[p.model];vibeCheck.checked=!vibeCheck.disabled&&p.vibeEnabled!==false;
            vibeCheck.onchange=()=>{p.vibeEnabled=vibeCheck.checked;save();render();};vibeToggle.append(node('span','启用 Vibe'),vibeCheck);body.append(vibeToggle);
            if(vibeCheck.disabled)body.append(node('p','当前模型不支持 Vibe','miao-muted'));
            if(!vibeCheck.disabled&&p.vibeEnabled!==false){
                const vibes=section(body,'Vibe');
                field(vibes,'使用方式',p.vibeMode??'multiple',value=>{
                    if(value==='multiple'&&(p.vibes||[]).length>4){render();throw Error('当前候选超过 4 个，请先减少勾选，再切换「多个」');}
                    p.vibeMode=value;save();render();
                },{options:[['random','随机 1 个'],['multiple','多个（最多 4 个）']]});
                const choices=node('div',undefined,'miao-vibe-choices');vibes.append(choices);profileVibes(choices,p);
            }
        } else if(activeTab==='favorites') {
            const view=createFavoritesView({favorites,profiles:settings.profiles,activeProfileId:p.id,initialDraft:initialFavorite,saveFavorite,removeFavorite,generateFavorite,sceneFromImage,openImage,bindImage,onError});initialFavorite=undefined;body.append(view.element);commitPage=view.commit;
        } else if(activeTab==='vibes') {
            const manage=section(body,'Vibe');
            const guide=node('a','Vibe 文档');guide.href='https://github.com/AYUUKI-K/Mewo-Text-to-Image/blob/main/docs/VIBE.md';guide.target='_blank';guide.rel='noopener';manage.append(guide);
            const upload=node('input');upload.type='file';upload.accept='.zip,.naiv4vibe,.naiv4vibeBundle,.json,image/png,image/jpeg,image/webp';upload.multiple=true;upload.hidden=true;upload.dataset.miaoVibeImport='true';manage.append(upload);
            const actions=node('div',undefined,'miao-actions');manage.append(actions);
            manage.append(node('p','支持多选文件或导入 ZIP；可勾选多个 Vibe 打包导出。','miao-muted'));
            const status=node('p','','miao-muted');status.setAttribute('role','status');manage.append(status);
            const exportReady=node('div',undefined,'miao-prompt-export-ready');exportReady.hidden=true;manage.append(exportReady);
            const list=node('div',undefined,'miao-vibe-list');manage.append(list);
            let revision=0;
            const refresh=async()=>{
                const current=++revision,scrollTop=list.querySelector('[data-scroll-key]')?.scrollTop||0;
                list.replaceChildren(node('p','读取中…','miao-muted'));
                try{
                    const items=await listVibes();if(current!==revision||epoch!==renderEpoch)return;list.replaceChildren();
                    for(const id of vibeSelection)if(!items.some(item=>item.id===id))vibeSelection.delete(id);
                    if(!items.length)list.append(node('p','暂无 Vibe','miao-muted'));
                    if(batchVibes){
                        const batch=node('div',undefined,'miao-profile-export miao-vibe-export'),toolbar=node('div',undefined,'miao-actions'),choices=node('div',undefined,'miao-profile-export-choices');choices.dataset.scrollKey='vibe-export';
                        const count=node('span',undefined,'miao-selection-count'),checks=[];count.setAttribute('role','status');batch.append(count,toolbar,choices);list.append(batch);
                        const update=()=>{count.textContent=`已选 ${vibeSelection.size} / ${items.length} 个 Vibe`;download.disabled=!vibeSelection.size||vibeTransferBusy;for(const check of checks)check.closest('label').dataset.selected=String(check.checked);};
                        action(toolbar,'全选',()=>{for(const item of items)vibeSelection.add(item.id);for(const check of checks)check.checked=true;update();});
                        action(toolbar,'取消全选',()=>{vibeSelection.clear();for(const check of checks)check.checked=false;update();});
                        const download=action(toolbar,'导出选中 Vibe',async()=>{
                            if(vibeTransferBusy)return;
                            const ids=items.filter(item=>vibeSelection.has(item.id)).map(item=>item.id);vibeTransferBusy=true;status.textContent='正在打包 Vibe…';exportReady.hidden=true;importButton.disabled=true;
                            try{showPreparedFile(exportReady,await exportVibeFiles(ids));status.textContent=`已打包 ${ids.length} 个 Vibe`;}
                            catch(error){status.textContent=error.message;throw error;}
                            finally{vibeTransferBusy=false;importButton.disabled=false;if(epoch!==renderEpoch&&activeTab==='vibes')render();else await refresh();}
                        },true);
                        for(const item of items){const label=node('label',undefined,'miao-switch-row'),check=node('input');check.type='checkbox';check.checked=vibeSelection.has(item.id);check.setAttribute('aria-label','勾选 Vibe '+item.name);check.onchange=()=>{if(check.checked)vibeSelection.add(item.id);else vibeSelection.delete(item.id);update();};label.append(check,node('span',item.name));choices.append(label);checks.push(check);}update();choices.scrollTop=scrollTop;
                    }
                    if(items.length){if(!items.some(item=>item.id===selectedVibeId))selectedVibeId=items[0].id;field(list,'当前 Vibe',selectedVibeId,value=>{selectedVibeId=value;refresh();},{options:items.map(item=>[item.id,item.name])});}
                    for(const item of items.filter(item=>item.id===selectedVibeId)){
                        const card=node('section',undefined,'miao-vibe-item');
                        if(item.thumbnail){const image=node('img');image.src=item.thumbnail;image.alt=item.name;image.loading='lazy';card.append(image);}
                        field(card,'名称',item.name,()=>{}).addEventListener('change',safe(async()=>{await renameVibe({id:item.id,name:card.querySelector('input').value});await refresh();}));
                        const summary=node('p',item.variants.length?item.variants.map(v=>`${v.model} · ${v.information}`).join(' / '):'尚未编码','miao-muted');card.append(summary);
                        if(item.hasImage){
                            const grid=node('div',undefined,'miao-grid');card.append(grid);
                            let model=vibeModelKeys[p.model]?p.model:'nai-diffusion-4-5-full',information=1;
                            field(grid,'编码模型',model,v=>model=v,{options:models.filter(([id])=>vibeModelKeys[id])});
                            const amount=field(grid,'信息提取量',information,v=>information=v,{type:'number'});amount.min='0';amount.max='1';amount.step='0.05';
                            const encode=action(card,settings.naiConnection==='custom'?'在线编码并保存（可能消耗额度）':'编码并保存（2 Anlas）',async()=>{await encodeVibe({id:item.id,model,information});await refresh();});
                            encode.disabled=!onlineEncodingAvailable(settings);
                            if(encode.disabled)card.append(node('p','自定义连接未配置 Vibe 编码完整 URL，在线编码已禁用；仍可导入已有编码的 Vibe 文件。','miao-muted'));
                        }
                        action(card,'删除 Vibe',async()=>{if(await deleteVibe(item.id))await refresh();});list.append(card);
                    }
                }catch(error){list.replaceChildren(node('p',error.message,'miao-muted'));}
            };
            upload.onchange=safe(async()=>{
                const files=Array.from(upload.files||[]);upload.value='';if(!files.length||vibeTransferBusy)return;
                vibeTransferBusy=true;importButton.disabled=true;status.textContent='正在导入 Vibe…';
                try{const imported=await importVibeFiles(files);if(imported?.length)selectedVibeId=imported.at(-1).id;status.textContent=`已导入 ${imported.length} 个 Vibe`;}
                catch(error){status.textContent=error.message;throw error;}
                finally{vibeTransferBusy=false;importButton.disabled=false;if(epoch!==renderEpoch&&activeTab==='vibes')render();else await refresh();}
            });
            const importButton=action(actions,'导入 Vibe / 图片',()=>upload.click(),true);importButton.disabled=vibeTransferBusy;
            const batchButton=action(actions,batchVibes?'完成多选':'批量导出 Vibe',async()=>{batchVibes=!batchVibes;batchButton.textContent=batchVibes?'完成多选':'批量导出 Vibe';await refresh();});action(actions,'刷新列表',refresh);
            refresh();
        } else if(activeTab==='resources') {
            const resources=section(body,'世界书与正则');
            const status=node('div',undefined,'miao-notice');status.setAttribute('role','status');resources.append(status);
            paintResources=()=>{const state=getResourceStatus();status.replaceChildren(node('strong',state.available?`${state.latest.worldName} 可更新`:settings.installed?(state.error||state.checking?'资源已载入':'资源已是最新'):'内置资源未载入'),node('p',`当前：${settings.world||'未载入'}`));if(state.checking)status.append(node('p','检查中…'));else if(state.error)status.append(node('p','检查失败，可重试'));};paintResources();
            action(resources,'检查资源更新',()=>checkResources(true));
            action(resources,'更新资源',async()=>{await installDefaults();render();},true);
            const upload=(label,fn)=>{const file=node('input');file.type='file';file.accept='.json';file.hidden=true;file.onchange=safe(async()=>{if(file.files[0])await fn(file.files[0]);file.value='';render();});resources.append(file);action(resources,label,()=>file.click());};
            upload('导入世界书',installWorld);upload('导入正则',async f=>installRegex(JSON.parse(await f.text())));
            const macrosView=createResourceMacrosView({read:readResourceMacros,save:saveResourceMacros,onError});body.append(macrosView.element);
            const capture=section(body,'捕捉标签');

            const start=field(capture,'起始标签',settings.startTag,()=>{});start.placeholder='image###';
            const end=field(capture,'结束标签',settings.endTag,()=>{});end.placeholder='###';
            const sample=node('pre',undefined,'miao-capture-sample');
            const updateSample=()=>{sample.textContent=start.value+'\nprompt\n'+end.value;};start.addEventListener('input',updateSample);end.addEventListener('input',updateSample);updateSample();capture.append(sample);
            commitPage=async()=>{await macrosView.commit();if(start.value!==settings.startTag||end.value!==settings.endTag)await saveCapture(start.value,end.value);};


        }
        if(activeTab==='images') {
            const storage=section(body,'存储');
            const folder=field(storage,'存储目录',settings.folder,()=>{});folder.placeholder='miao-nai';
            field(storage,'导出格式',settings.exportFormat==='jpg'?'jpg':'png',value=>{settings.exportFormat=value;save();onExportFormatChange();},{options:[['png','PNG'],['jpg','JPG']]});
            commitPage=async()=>{if(folder.value!==settings.folder){await changeFolder(folder.value);render();}};
            const cleanup=section(body,'历史图片');
            let selectedFolder=settings.folder,selection=[],allImages=[],folderEpoch=0,resetGalleryHeight=false;
            const folders=node('nav',undefined,'miao-folder-browser');folders.setAttribute('aria-label','图片文件夹');
            const paintFolders=()=>{
                folders.replaceChildren();const view=browseArchive(allImages,selection);images=view.items;
                const enter=path=>{selection=path;page=0;resetGalleryHeight=true;selected.clear();selectedImages.clear();paintFolders();draw();};
                const picker=(label,value,kind,items)=>{
                    const trigger=node('button',label+'：'+value+' ▾','miao-button');trigger.type='button';folders.append(trigger);bindButtonPress(trigger,safe(async()=>{
                        trigger.setAttribute('aria-expanded','true');
                        try{await showArchivePicker({parent:root.closest('dialog'),title:label==='角色'?'选择角色分类':'选择聊天',items,selected:selection,onSelect:path=>{enter(path);root.querySelector('[data-archive-picker='+kind+']')?.focus({preventScroll:true});}});}
                        finally{trigger.setAttribute('aria-expanded','false');}
                    }));trigger.classList.add('miao-archive-trigger');trigger.dataset.archivePicker=kind;trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');
                };
                picker('角色',view.crumbs[0]?.label||'全部图片','cards',[{label:'全部图片',path:[],count:allImages.length},...browseArchive(allImages).children]);
                if(selection.length&& !selection[0].startsWith('@')){
                    const card=browseArchive(allImages,selection.slice(0,1));
                    picker('聊天',view.crumbs[1]?.label||'全部聊天','chats',[{label:'全部聊天',path:selection.slice(0,1),count:card.items.length},...card.children]);
                }
            };
            field(cleanup,'管理目录',selectedFolder,v=>{selectedFolder=v;selection=[];page=0;resetGalleryHeight=true;refresh();},{options:[...new Set([settings.folder,...settings.folders,FAVORITE_FOLDER])].map(v=>[v,v===FAVORITE_FOLDER?'收藏例图':v])});
            cleanup.append(folders);
            const controls=node('div',undefined,'miao-actions');cleanup.append(controls);
            const selected=new Set(),selectedImages=new Set();let images=[],page=0,multiSelect=false;
            const imageControls=node('div',undefined,'miao-history-selection');cleanup.append(imageControls);
            const selectionCount=node('span','已选 0 张','miao-muted');imageControls.append(selectionCount);
            const removeSelected=node('button','删除选中图片','miao-button');removeSelected.type='button';removeSelected.disabled=true;imageControls.append(removeSelected);
            bindButtonPress(removeSelected,safe(async()=>{if(removeSelected.disabled)return;removeSelected.disabled=true;try{if(await deleteImages(selectedFolder,[...selectedImages]))await refresh();}finally{updateSelection();}}));
            const downloadSelected=node('button','下载选中图片','miao-button');downloadSelected.type='button';downloadSelected.disabled=true;imageControls.insertBefore(downloadSelected,removeSelected);
            let downloading=false;
            downloadSelected.onclick=safe(async()=>{if(downloading)return;downloading=true;downloadSelected.textContent='正在下载…';updateSelection();try{await downloadImages(images.filter(image=>selectedImages.has(image.name)));}finally{downloading=false;downloadSelected.textContent='下载选中图片';updateSelection();}});
            action(imageControls,'取消选择',()=>{multiSelect=false;selectedImages.clear();selected.clear();draw();});
            const updateSelection=()=>{imageControls.hidden=!multiSelect;multiButton.hidden=multiSelect;selectionCount.textContent=`已选 ${selectedImages.size} 张`;removeSelected.disabled=!selectedImages.size;downloadSelected.disabled=downloading||!selectedImages.size;};
            const list=node('div',undefined,'miao-history-list');list.setAttribute('aria-live','polite');cleanup.append(list);

            let drawRevision=0;
            const draw=()=>{
                const top=body.scrollTop,height=resetGalleryHeight?0:list.getBoundingClientRect().height,revision=++drawRevision,fragment=document.createDocumentFragment();list.style.minHeight=(resetGalleryHeight?0:Math.max(parseFloat(list.style.minHeight)||0,height))+'px';resetGalleryHeight=false;updateSelection();cleanDates.hidden=!multiSelect;const counts=new Map();for(const image of images)counts.set(image.day,(counts.get(image.day)||0)+1);
                const paged=pageItems(images,page);page=paged.page;
                if(!images.length)fragment.append(node('p','暂无图片','miao-muted'));
                for(const day of [...new Set(paged.items.map(i=>i.day))]){
                    const group=node('section',undefined,'miao-date-group');
                    const row=node('div',undefined,'miao-date-row'),label=node('label'),check=node('input');check.type='checkbox';check.hidden=!multiSelect;check.checked=selected.has(day);check.onchange=()=>check.checked?selected.add(day):selected.delete(day);
                    label.append(check,node('span',day),node('small',`共 ${counts.get(day)} 张`));row.append(label);
                    action(row,'清理',async()=>{if(await deleteImages(selectedFolder,images.filter(i=>i.day===day).map(i=>i.name)))await refresh();});group.append(row);
                    const gallery=node('div',undefined,'miao-history-grid');
                    for(const image of paged.items.filter(i=>i.day===day)){
                        const tile=node('article',undefined,'miao-history-tile');tile.dataset.selected=String(selectedImages.has(image.name));
                        const link=node('a');link.setAttribute('role','button');link.tabIndex=0;bindButtonPress(link,safe(async()=>{if(multiSelect)return toggleImage();const scroller=root.querySelector('.miao-panel-body'),top=scroller.scrollTop;await openImage(image.url,image.name,images);if(root.isConnected){await refresh();scroller.scrollTop=top;}}));link.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();link.click();}});const thumb=node('img');thumb.alt=image.name;bindImage(thumb,image.url,{lazy:true});thumb.draggable=false;link.title=multiSelect?'选择图片':'放大查看';link.append(thumb);tile.append(link);
                        if(favoritesEnabled(settings))action(tile,'收藏提示词',()=>collectImage(image.url));
                        const toggleImage=()=>{if(selectedImages.has(image.name))selectedImages.delete(image.name);else selectedImages.add(image.name);checkbox.checked=selectedImages.has(image.name);tile.dataset.selected=String(checkbox.checked);updateSelection();};
                        const pick=node('label',undefined,'miao-history-pick'),checkbox=node('input');pick.hidden=!multiSelect;checkbox.type='checkbox';checkbox.checked=selectedImages.has(image.name);checkbox.setAttribute('aria-label','选择图片 '+image.name);checkbox.onchange=()=>{if(checkbox.checked)selectedImages.add(image.name);else selectedImages.delete(image.name);tile.dataset.selected=String(checkbox.checked);updateSelection();};pick.append(checkbox);tile.append(pick);
                        gallery.append(tile);
                    }
                    group.append(gallery);fragment.append(group);
                }
                const pager=node('nav',undefined,'miao-pager');pager.setAttribute('aria-label','图片分页');
                action(pager,'上一页',()=>{page--;draw();}).disabled=page===0;
                const position=node('span',`${page+1} / ${paged.pages} · ${images.length} 张`);position.setAttribute('aria-live','polite');pager.append(position);
                action(pager,'下一页',()=>{page++;draw();}).disabled=page+1===paged.pages;fragment.append(pager);list.replaceChildren(fragment);body.scrollTop=top;requestAnimationFrame(()=>{if(revision===drawRevision&&list.isConnected)body.scrollTop=top;});
            };
            const refresh=async()=>{
                const epoch=++folderEpoch,target=selectedFolder;list.setAttribute('aria-busy','true');selected.clear();selectedImages.clear();updateSelection();
                try{
                    const nextImages=await listImages(target);if(epoch!==folderEpoch)return false;allImages=nextImages.sort(compareImagesNewest);while(selection.length&&!browseArchive(allImages,selection).items.length)selection.pop();paintFolders();draw();list.removeAttribute('aria-busy');return true;
                }catch(error){if(epoch!==folderEpoch)return false;list.removeAttribute('aria-busy');onError(error);return false;}
            };
            const multiButton=action(controls,'多选',()=>{multiSelect=true;draw();});
            action(controls,'刷新列表',async()=>{
                const target=selectedFolder;
                if(!await refresh())return;
                const epoch=folderEpoch;
                const current=()=>epoch===folderEpoch&&target===selectedFolder&&activeTab==='images'&&cleanup.isConnected;
                const result=await buildThumbnails(target);
                if(!current())return;
                draw();
                if(result.failed)throw Error(`${result.failed} 张缩略图生成失败，请点击刷新列表重试。`);
            });
            const cleanDates=action(controls,'清理选中日期',async()=>{if(!selected.size)throw new Error('请先勾选需要清理的日期');if(await deleteImages(selectedFolder,images.filter(i=>selected.has(i.day)).map(i=>i.name)))await refresh();});
            refresh();
        }
        paintResourceEntries();
        const footer=node('footer',undefined,'miao-footer');footer.append(node('span','by 喵喵电波-NUE','miao-credit'),versionLabel,updateBox);root.append(footer);
        const restore=()=>{if(epoch!==renderEpoch)return;
            if(keep)for(const item of root.querySelectorAll('[data-scroll-key]')){const position=positions.get(item.dataset.scrollKey);if(position){item.scrollTop=position.top;item.scrollLeft=position.left;}}
            const gallery=root.querySelector('.miao-sample-gallery');if(gallery)gallery.scrollTop=galleryTop;
            if(keep&&scroller&&outerTop!==undefined)scroller.scrollTop=outerTop;
            if(profileFocus)[...root.querySelectorAll('[data-profile-focus]')].find(item=>item.dataset.profileFocus===profileFocus)?.focus({preventScroll:true});
        };restore();requestAnimationFrame(restore);
    }
    for(const event of ['input','change'])root.addEventListener(event,()=>{const button=root.querySelector('.miao-save-button');if(button&&!button.disabled)button.textContent='保存';});
    root.addEventListener('miao-key-changed',()=>root.onKeyChanged?.());
    root.addEventListener('miao-resources-changed',paintResourceEntries);
    root.addEventListener('miao-profile-previews',()=>paintPreviews());
    root.addEventListener('miao-open-section',event=>{const detail=typeof event.detail==='string'?{section:event.detail}:event.detail||{};if(detail.section==='resources'||detail.section==='favorites'&&favoritesEnabled(settings)){activeTab=detail.section;initialFavorite=detail.favorite;render();root.closest('.popup-content')?.scrollTo({top:0});}});
    render();readVersion();checkLatest(false);checkResources(false).catch(()=>{});return root;
}
