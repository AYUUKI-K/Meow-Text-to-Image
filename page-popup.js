import {bindButtonPress} from './button-press.js';
const activeViewers=new WeakMap();

// TT content viewers use a page layer, avoiding the host's native modal lifecycle.
export function showPagePopup(content,{parent,onOpen,fillParent=false,closeLabel='完成'}={}){
    const doc=content.ownerDocument;
    // A second viewer replaces the first before capturing inert/scroll state.
    // Otherwise out-of-order closes can leave the entire page inert on TT.
    const scope=parent||doc;activeViewers.get(scope)?.();
    const win=doc.defaultView,previous=doc.activeElement;
    const make=(tag,cls)=>{const element=doc.createElement(tag);element.className=cls;return element;};
    const settings=content.matches('.miao-settings');
    const layer=make('div','miao-page-overlay'),card=make(settings?'dialog':'section',settings?'popup miao-page-popup miao-settings-dialog':'popup miao-page-popup miao-content-dialog');
    if(settings)card.setAttribute('open','');
    card.setAttribute('role','dialog');card.setAttribute('aria-modal','true');card.setAttribute('aria-label',settings?'喵喵文生图':content.querySelector('h3')?.textContent||'图片预览');card.tabIndex=-1;
    const body=make('div','popup-content'),controls=make('div','miao-page-controls'),close=make('button','miao-button');
    close.type='button';close.textContent=fillParent?'×':closeLabel;close.setAttribute('aria-label',closeLabel==='取消'?'取消选择':'关闭预览');controls.append(close);body.append(content);
    if(settings){const wrapper=make('div','popup-body');wrapper.append(body);card.append(wrapper);}else card.append(body,controls);layer.append(card);
    const mount=parent?.querySelector('.popup-body')||parent||doc.body,nested=mount!==doc.body;
    layer.dataset.nested=String(nested);
    // Keep Enter in a nested chooser/viewer from accepting the host settings dialog.
    if(nested)card.addEventListener('keydown',event=>event.stopPropagation());
    if(fillParent&&nested)layer.dataset.fillPanel='true';
    const blocked=nested?[...mount.children]:[...doc.body.children],inert=blocked.map(element=>[element,element.inert]);
    for(const [element] of inert)element.inert=true;
    const visibility=fillParent&&nested?blocked.map(element=>[element,element.style.visibility]):[];
    for(const [element] of visibility)element.style.visibility='hidden';
    const overflow=doc.body.style.overflow;if(!nested)doc.body.style.overflow='hidden';
    mount.append(layer);
    const viewport=win.visualViewport;
    const fit=()=>{if(nested)return;for(const [name,value] of Object.entries({left:viewport?.offsetLeft||0,top:viewport?.offsetTop||0,width:viewport?.width||win.innerWidth,height:viewport?.height||win.innerHeight}))layer.style.setProperty('--miao-page-'+name,value+'px');};
    fit();viewport?.addEventListener('resize',fit);viewport?.addEventListener('scroll',fit);win.addEventListener('resize',fit);
    return new Promise((resolve,reject)=>{
        let done=false;
        // Hardware back closes this viewer first; leave the host bridge intact afterward.
        const previousBack=win.__TAURITAVERN_HANDLE_BACK__;
        const back=()=>{if(!done&&layer.isConnected){if(card.querySelector('.miao-confirmation-layer'))card.dispatchEvent(new win.Event('cancel',{cancelable:true}));else finish();return true;}return previousBack?.();};
        const finish=error=>{
            if(done)return;done=true;observer.disconnect();doc.removeEventListener('keydown',key,true);parent?.removeEventListener('close',parentClosed);
            card.dispatchEvent(new win.Event('close'));
            activeViewers.delete(scope);
            viewport?.removeEventListener('resize',fit);viewport?.removeEventListener('scroll',fit);win.removeEventListener('resize',fit);
            if(win.__TAURITAVERN_HANDLE_BACK__===back)win.__TAURITAVERN_HANDLE_BACK__=previousBack;
            layer.remove();for(const [element,value] of visibility)element.style.visibility=value;for(const [element,value] of inert)element.inert=value;if(!nested)doc.body.style.overflow=overflow;
            if(previous?.isConnected&&!previous.closest('[inert]'))previous.focus({preventScroll:true});
            if(error)reject(error);else resolve(1);
        };
        const parentClosed=()=>finish();
        const key=event=>{
            if(activeViewers.has(card))return;
            if(card.querySelector('.miao-confirmation-layer'))return;
            if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();finish();}
            else if(event.key==='Tab'){
                const items=[...card.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(element=>!element.closest('[hidden]')&&element.getClientRects().length);
                const first=items[0],last=items.at(-1);
                if(!items.length||event.shiftKey&&(doc.activeElement===first||doc.activeElement===card)||!event.shiftKey&&doc.activeElement===last){event.preventDefault();(event.shiftKey?last:first)?.focus();}
            }
        };
        const observer=new win.MutationObserver(()=>{if(!layer.isConnected)finish();});observer.observe(doc.body,{childList:true,subtree:true});
        activeViewers.set(scope,()=>finish());
        win.__TAURITAVERN_HANDLE_BACK__=back;
        doc.addEventListener('keydown',key,true);parent?.addEventListener('close',parentClosed);bindButtonPress(close,()=>finish());
        try{onOpen?.({dlg:card,completeAffirmative:()=>finish()});(settings?content.querySelector('.miao-drawer-close'):content.querySelector('[data-initial-focus]')||close)?.focus({preventScroll:true});}catch(error){finish(error);}
    });
}
