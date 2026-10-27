import {bindButtonPress} from './button-press.js';
const pages=new WeakMap();

// Replace the contents of the existing host dialog; keep no hidden modal layer.
export function showPanelPage(content,{parent,kind='image',closeLabel='返回',onOpen}={}){
    const doc=content.ownerDocument,win=doc.defaultView,stack=pages.get(parent)||[];pages.set(parent,stack);
    const mount=parent.querySelector(':scope > .popup-body')||parent,previous=doc.activeElement;
    const oldNodes=[...mount.childNodes],fragment=doc.createDocumentFragment();
    const scroll=[...mount.querySelectorAll('*')].filter(el=>el.scrollTop||el.scrollLeft).map(el=>[el,el.scrollTop,el.scrollLeft]);
    const old={classes:parent.className,page:parent.getAttribute('data-panel-page'),controls:parent.getAttribute('data-controls-visible'),label:parent.getAttribute('aria-label'),sizes:['width','height'].map(key=>[key,parent.style.getPropertyValue(key),parent.style.getPropertyPriority(key)])};
    const rect=parent.getBoundingClientRect();for(const node of oldNodes)fragment.append(node);
    const types={image:['miao-image-viewer-dialog','图片预览'],parameters:['miao-image-parameters-dialog','图片参数'],icons:['miao-icon-picker-dialog','选择悬浮图标'],export:['miao-batch-export-dialog','批量保存图片']},type=types[kind]||types.parameters;
    parent.classList.remove(...Object.values(types).map(([name])=>name));
    parent.classList.add(type[0]);parent.dataset.panelPage=kind;parent.setAttribute('aria-label',type[1]);
    if(!parent.matches('.miao-settings-dialog')){
        parent.style.setProperty('width',`min(${rect.width}px,calc(100vw - 24px))`,'important');
        parent.style.setProperty('height',`min(${rect.height}px,calc(100dvh - 24px))`,'important');
    }
    const body=doc.createElement('div'),controls=doc.createElement('div'),close=doc.createElement('button');
    body.className='popup-content miao-panel-page-content';controls.className='miao-page-controls';close.className='miao-button';close.type='button';
    close.textContent=kind==='image'?'×':closeLabel;close.setAttribute('aria-label',kind==='image'?'关闭预览':closeLabel);
    controls.append(close);body.append(content);mount.append(body,controls);
    return new Promise((resolve,reject)=>{
        let done=false;const state={finish};stack.push(state);const previousBack=win.__TAURITAVERN_HANDLE_BACK__;
        const top=()=>stack.at(-1)===state;
        const back=()=>{if(!top())return previousBack?.();if(parent.querySelector('.miao-confirmation-layer'))parent.dispatchEvent(new win.Event('cancel',{cancelable:true}));else finish();return true;};
        function finish(error){
            if(done)return;while(!top())stack.at(-1).finish();done=true;
            observer.disconnect();doc.removeEventListener('keydown',key,true);parent.removeEventListener('cancel',cancel,true);parent.removeEventListener('close',closed);
            if(win.__TAURITAVERN_HANDLE_BACK__===back)win.__TAURITAVERN_HANDLE_BACK__=previousBack;
            body.remove();controls.remove();mount.append(fragment);parent.className=old.classes;
            for(const [attr,value] of Object.entries({'data-panel-page':old.page,'data-controls-visible':old.controls,'aria-label':old.label}))if(value===null)parent.removeAttribute(attr);else parent.setAttribute(attr,value);
            for(const [key,value,priority] of old.sizes)if(value)parent.style.setProperty(key,value,priority);else parent.style.removeProperty(key);
            stack.pop();if(!stack.length)pages.delete(parent);
            for(const [el,top,left] of scroll){el.scrollTop=top;el.scrollLeft=left;}
            if(previous?.isConnected&&!previous.closest('[inert]'))previous.focus({preventScroll:true});
            if(error)reject(error);else resolve(1);
        }
        const closed=()=>finish(),cancel=event=>{if(!top()||parent.querySelector('.miao-confirmation-layer'))return;event.preventDefault();event.stopImmediatePropagation();finish();};
        const key=event=>{
            if(!top()||parent.querySelector('.miao-confirmation-layer'))return;
            if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();finish();}
            else if(event.key==='Tab'){
                const items=[...mount.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(el=>el.getClientRects().length&&!el.closest('[hidden]'));
                const first=items[0],last=items.at(-1);
                if(!items.length||event.shiftKey&&doc.activeElement===first||!event.shiftKey&&doc.activeElement===last){event.preventDefault();(event.shiftKey?last:first)?.focus();}
            }
        };
        const observer=new win.MutationObserver(()=>{if(!parent.isConnected)finish();});observer.observe(doc.body,{childList:true,subtree:true});
        doc.addEventListener('keydown',key,true);parent.addEventListener('cancel',cancel,true);parent.addEventListener('close',closed);win.__TAURITAVERN_HANDLE_BACK__=back;
        bindButtonPress(close,()=>finish());
        try{onOpen?.({dlg:parent,completeAffirmative:()=>finish()});(content.querySelector('[data-initial-focus]')||close).focus({preventScroll:true});}catch(error){finish(error);}
    });
}
