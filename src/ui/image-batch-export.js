import {showPanelPage} from './panel-page.js';
import {bindButtonPress} from './button-press.js';

// iOS must receive one share operation, not a sequence of overlapping share sheets.
export async function showImageBatchExport({parent,images,prepareFile,saveFile,makeZip,navigatorImpl=navigator}){
    const doc=parent.ownerDocument,make=(tag,text,cls)=>{const element=doc.createElement(tag);if(text!==undefined)element.textContent=text;if(cls)element.className=cls;return element;};
    const root=make('section',undefined,'miao-batch-export'),header=make('header'),status=make('p','正在准备图片…','miao-muted'),actions=make('div',undefined,'miao-batch-export-actions'),list=make('div',undefined,'miao-batch-export-list');
    status.setAttribute('role','status');header.append(make('h3',`保存 ${images.length} 张图片`));root.append(header,status,actions,list);
    const popup=showPanelPage(root,{parent,kind:'export',closeLabel:'返回图库'});let busy=false;
    const button=(container,label,fn)=>{const control=make('button',label,'miao-button');control.type='button';container.append(control);bindButtonPress(control,async()=>{
        if(busy)return;busy=true;for(const b of root.querySelectorAll('button'))b.disabled=true;
        try{const delivered=await fn();if(root.isConnected)status.textContent=delivered?.delivered===false?'已取消保存':'已交给系统保存';}
        catch(error){if(root.isConnected)status.textContent=error.name==='AbortError'?'已取消保存':'保存失败：'+error.message;}
        finally{busy=false;for(const b of root.querySelectorAll('button'))b.disabled=false;}
    });return control;};
    (async()=>{
        const prepared=[];
        for(const image of images){if(!root.isConnected)return;const item=await prepareFile(image);if(!root.isConnected)return;prepared.push(item);status.textContent=`正在准备图片 ${prepared.length} / ${images.length}…`;}
        const files=prepared.map(item=>new File([item.blob],item.name,{type:item.blob.type}));
        let share=false;try{share=typeof navigatorImpl.share==='function'&&navigatorImpl.canShare?.({files});}catch{}
        if(share)button(actions,'分享全部图片',()=>navigatorImpl.share({files}));
        const zip=await makeZip(prepared);if(!root.isConnected)return;
        button(actions,`下载 ZIP（${files.length} 张）`,()=>saveFile(zip,`miao-images-${files.length}.zip`));
        status.textContent=share?'一次分享全部图片，或下载 ZIP；也可以逐张保存。':'当前系统不支持多图分享，可下载 ZIP 或逐张保存。';
        for(const item of prepared){const row=make('article'),image=make('img'),name=make('span',item.name);image.src=item.url;image.alt=item.name;image.loading='lazy';row.append(image,name);button(row,'保存图片',()=>saveFile(item.blob,item.name));list.append(row);}
    })().catch(error=>{if(root.isConnected)status.textContent='图片准备失败：'+error.message;});
    await popup;
}
