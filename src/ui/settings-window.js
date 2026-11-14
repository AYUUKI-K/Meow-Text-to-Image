// A non-modal settings window can collapse without leaving the chat inert.
export function showSettingsWindow(content,{onOpen,onClosing,getPosition=()=>null,savePosition=()=>{}}={}){
    const doc=content.ownerDocument,win=doc.defaultView,previous=doc.activeElement;
    const dialog=doc.createElement('dialog'),body=doc.createElement('div'),box=doc.createElement('div');
    dialog.className='popup miao-settings-dialog miao-settings-window';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-label','喵喵文生图');dialog.setAttribute('aria-modal','false');
    body.className='popup-body';box.className='popup-content';box.append(content);body.append(box);dialog.append(body);doc.body.append(dialog);dialog.show();
    let down,dragged=false,collapsed=false,done=false,closing=false,initialized=false;
    const viewport=win.visualViewport,clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
    const bounds=()=>{const rect=dialog.getBoundingClientRect(),left=(viewport?.offsetLeft||0)+8,top=(viewport?.offsetTop||0)+8;return {left,top,right:Math.max(left,left+(viewport?.width||win.innerWidth)-16-rect.width),bottom:Math.max(top,top+(viewport?.height||win.innerHeight)-16-rect.height)};};
    const place=(left,top)=>{const b=bounds();dialog.style.setProperty('left',clamp(left,b.left,b.right)+'px','important');dialog.style.setProperty('top',clamp(top,b.top,b.bottom)+'px','important');};
    const fit=()=>{
        if(done)return;dialog.style.setProperty('--miao-panel-width',(viewport?.width||win.innerWidth)+'px');dialog.style.setProperty('--miao-panel-height',(viewport?.height||win.innerHeight)+'px');
        const b=bounds(),p=getPosition();
        if(!initialized){initialized=true;place(b.left+(b.right-b.left)*(Number.isFinite(p?.x)?clamp(p.x,0,1):0.5),b.top+(b.bottom-b.top)*(Number.isFinite(p?.y)?clamp(p.y,0,1):0.2));}
        else{const rect=dialog.getBoundingClientRect();place(rect.left,rect.top);}
    };
    const remember=()=>{const b=bounds(),rect=dialog.getBoundingClientRect();savePosition({x:b.right>b.left?(rect.left-b.left)/(b.right-b.left):0,y:b.bottom>b.top?(rect.top-b.top)/(b.bottom-b.top):0});};
    const paint=()=>{
        const toggle=content.querySelector('.miao-window-toggle'),label=collapsed?'展开窗口':'折叠窗口';
        if(toggle){toggle.setAttribute('aria-label',label);toggle.setAttribute('aria-expanded',String(!collapsed));if(toggle.textContent!==(collapsed?'＋':'−'))toggle.textContent=collapsed?'＋':'−';}
    };
    const setCollapsed=value=>{
        if(done||dialog.dataset.panelPage||dialog.querySelector('.miao-confirmation-layer'))return;
        collapsed=value;dialog.dataset.collapsed=String(value);
        for(const child of content.children)if(!child.matches('.miao-header'))child.inert=value;
        paint();fit();content.querySelector(value?'.miao-window-toggle':'.miao-window-handle')?.focus({preventScroll:true});
    };
    let resolve,reject;const result=new Promise((yes,no)=>{resolve=yes;reject=no;});
    const previousBack=win.__TAURITAVERN_HANDLE_BACK__;
    const finish=error=>{
        if(done)return;done=true;observer.disconnect();resize.disconnect();
        viewport?.removeEventListener('resize',fit);viewport?.removeEventListener('scroll',fit);win.removeEventListener('resize',fit);doc.removeEventListener('keydown',escape,true);
        if(win.__TAURITAVERN_HANDLE_BACK__===back)win.__TAURITAVERN_HANDLE_BACK__=previousBack;
        dialog.remove();if(previous?.isConnected&&!previous.closest('[inert]'))previous.focus({preventScroll:true});
        if(error)reject(error);else resolve(1);
    };
    const close=async()=>{if(done||closing)return;closing=true;try{if(await onClosing?.()===false)return;dialog.dispatchEvent(new win.Event('close'));finish();}catch(error){finish(error);}finally{closing=false;}};
    const back=()=>{if(dialog.dataset.panelPage)return previousBack?.();void close();return true;};
    const escape=event=>{if(event.key!=='Escape'||dialog.dataset.panelPage||event.target?.closest?.('dialog')!==dialog)return;if(dialog.querySelector('.miao-confirmation-layer'))return;event.preventDefault();event.stopImmediatePropagation();void close();};
    dialog.addEventListener('pointerdown',event=>{
        const handle=event.target.closest('.miao-window-handle');if(!handle||event.button>0||event.isPrimary===false)return;
        const rect=dialog.getBoundingClientRect();down={id:event.pointerId,x:event.clientX,y:event.clientY,left:rect.left,top:rect.top};dragged=false;
        try{handle.setPointerCapture?.(event.pointerId);}catch{/* Some WebViews release capture during layout changes. */}
    });
    dialog.addEventListener('pointermove',event=>{if(!down||event.pointerId!==down.id)return;const dx=event.clientX-down.x,dy=event.clientY-down.y;if(Math.hypot(dx,dy)>8)dragged=true;if(dragged){event.preventDefault();place(down.left+dx,down.top+dy);}});
    dialog.addEventListener('pointerup',event=>{if(!down||event.pointerId!==down.id)return;down=null;if(dragged){event.preventDefault();remember();}});
    dialog.addEventListener('pointercancel',()=>{down=null;dragged=true;fit();});
    dialog.addEventListener('click',event=>{if(!event.target.closest('.miao-window-handle'))return;if(dragged){event.preventDefault();dragged=false;return;}if(collapsed)setCollapsed(false);});
    dialog.addEventListener('keydown',event=>{
        if(!event.target.closest('.miao-window-handle')||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(event.key))return;
        event.preventDefault();const rect=dialog.getBoundingClientRect(),step=event.shiftKey?40:12;
        if(event.key==='Home'){const b=bounds();place(b.left,b.top);}else place(rect.left+(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0),rect.top+(event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0));remember();
    });
    dialog.addEventListener('cancel',event=>{event.preventDefault();if(!dialog.dataset.panelPage)void close();});dialog.addEventListener('close',()=>finish());
    const observer=new win.MutationObserver(()=>{if(!dialog.isConnected)finish();else paint();});observer.observe(doc.body,{childList:true,subtree:true});
    const resize=new win.ResizeObserver(fit);resize.observe(dialog);fit();paint();
    viewport?.addEventListener('resize',fit);viewport?.addEventListener('scroll',fit);win.addEventListener('resize',fit);doc.addEventListener('keydown',escape,true);win.__TAURITAVERN_HANDLE_BACK__=back;
    // Touch releases work even on TT versions which omit compatibility clicks.
    content.addEventListener('miao-toggle-window',()=>setCollapsed(!collapsed));
    const api={dlg:dialog,completeAffirmative:close,expand:()=>{setCollapsed(false);dialog.focus({preventScroll:true});}};
    try{onOpen?.(api);content.querySelector('.miao-window-handle')?.focus({preventScroll:true});}catch(error){finish(error);}
    return result;
}
