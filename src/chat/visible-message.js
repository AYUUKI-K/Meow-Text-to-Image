export function assistantMessage(message) {
    return !!message && !message.is_user && !message.is_system && !['user','system','tool'].includes(message.role);
}

export function visibleAssistantMessage(chat, chatElement, viewportTop, viewportHeight) {
    if (!chatElement) return null;
    const chatRect=chatElement.getBoundingClientRect();
    const top=Math.max(chatRect.top,viewportTop),bottom=Math.min(chatRect.bottom,viewportTop+viewportHeight);
    if(top>=bottom)return null;
    const center=(top+bottom)/2;
    let selected=null,bestDistance=Infinity,bestHeight=0;
    for(const row of chatElement.querySelectorAll('.mes[mesid]')){
        const id=row.getAttribute('mesid');
        if(!/^\d+$/.test(id))continue;
        const message=chat[Number(id)];
        if(!assistantMessage(message))continue;
        const rect=row.getBoundingClientRect();
        const start=Math.max(top,rect.top),end=Math.min(bottom,rect.bottom);
        if(end<=start)continue;
        const distance=Math.max(start-center,center-end,0),height=end-start;
        if(distance<bestDistance||distance===bestDistance&&height>=bestHeight){
            selected=message;bestDistance=distance;bestHeight=height;
        }
    }
    return selected;
}
