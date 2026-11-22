import {promptTemplates} from '../prompts/prompt-templates.js';
import {promptText,withPromptOverride} from '../prompts/prompt-overrides.js';
import {treeById} from '../prompts/tree-defaults.js';
import {treeText,withTreeText} from '../prompts/tree-settings.js';
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
export function openPromptEditor({parent,settings,key,label,save,onSaved=()=>{}}){
    if(parent.querySelector('.miao-prompt-editor'))return;
    const tree=settings.promptConfig.version===2;
    const defaults=tree?treeById[key].slots:{body:promptTemplates[key].content};
    const initial=Object.fromEntries(Object.keys(defaults).map(slot=>[slot,tree?treeText(settings.promptConfig,key,slot):promptText(settings.promptConfig,key)]));
    const layer=node('div',undefined,'miao-prompt-editor'),card=node('section',undefined,'miao-prompt-editor-card');
    card.setAttribute('role','dialog');card.setAttribute('aria-modal','true');card.setAttribute('aria-label','编辑 · '+label);
    const heading=node('h3','编辑 · '+label),fields=node('div',undefined,'miao-prompt-editor-fields'),status=node('p','','miao-muted'),actions=node('div',undefined,'miao-actions'),inputs={};
    for(const slot of Object.keys(initial)){
        const title=tree?({prefix:'开头',body:'正文',suffix:'结尾'}[slot]):'模块原文';
        const wrap=node('label',undefined,'miao-prompt-editor-field'),input=node('textarea');input.value=initial[slot];input.setAttribute('aria-label',title);input.spellcheck=false;wrap.append(node('span',title),input);fields.append(wrap);inputs[slot]=input;
    }
    const first=Object.values(inputs)[0],previous=document.activeElement,blocked=[...parent.children].map(n=>[n,n.inert]);for(const [n] of blocked)n.inert=true;
    let busy=false,finished=false;
    const finish=()=>{if(finished)return;finished=true;observer.disconnect();parent.removeEventListener('close',finish);document.removeEventListener('keydown',keyHandler,true);parent.removeEventListener('cancel',cancel,true);viewport?.removeEventListener('resize',fit);viewport?.removeEventListener('scroll',fit);if(window.__TAURITAVERN_HANDLE_BACK__===back)window.__TAURITAVERN_HANDLE_BACK__=oldBack;layer.remove();for(const [n,inert] of blocked)n.inert=inert;if(previous?.isConnected)previous.focus();};
    const discard=()=>{if(!busy&&(Object.entries(inputs).every(([slot,input])=>input.value===initial[slot])||window.confirm('放弃当前未保存的修改？')))finish();};
    const cancel=e=>{e.preventDefault();e.stopImmediatePropagation();discard();};
    const keyHandler=e=>{if(e.key==='Escape')cancel(e);else if(e.key==='Tab'){const items=[...card.querySelectorAll('button:not(:disabled),textarea,summary')],first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first||!e.shiftKey&&document.activeElement===last){e.preventDefault();(e.shiftKey?last:first).focus();}}else if(e.key==='Enter')e.stopPropagation();};
    const button=(text,run)=>{const b=node('button',text,'miao-button');b.type='button';b.onclick=run;actions.append(b);return b;};
    const restore=button('恢复默认',()=>{if(!busy){for(const [slot,input] of Object.entries(inputs))input.value=defaults[slot];first.focus();}});
    const dismiss=button('取消',discard);
    const submit=button('保存',async()=>{
        if(busy)return;busy=true;submit.disabled=restore.disabled=dismiss.disabled=true;for(const input of Object.values(inputs))input.readOnly=true;
        try{
            const values=Object.fromEntries(Object.entries(inputs).map(([slot,input])=>[slot,input.value]));
            await save(tree?withTreeText(settings.promptConfig,key,values):withPromptOverride(settings.promptConfig,key,values.body));onSaved();finish();
        }catch(error){status.textContent=error.message;}
        finally{busy=false;submit.disabled=restore.disabled=dismiss.disabled=false;for(const input of Object.values(inputs))input.readOnly=false;}
    });
    card.append(heading,node('p',tree?'保存后更新 D0；恢复默认仅修改当前草稿。酒馆宏按原文保留，插件不解析变量。':'旧版兼容编辑；保存后继续使用原模块组装。','miao-muted'),fields,status,actions);layer.append(card);parent.append(layer);
    const viewport=window.visualViewport,fit=()=>{layer.style.setProperty('--miao-editor-height',Math.max(180,(viewport?.height||window.innerHeight)-Math.max(0,parent.getBoundingClientRect().top-(viewport?.offsetTop||0))-16)+'px');};fit();viewport?.addEventListener('resize',fit);viewport?.addEventListener('scroll',fit);
    const observer=new MutationObserver(()=>{if(!layer.isConnected)finish();});observer.observe(document.body,{childList:true,subtree:true});parent.addEventListener('close',finish);
    const oldBack=window.__TAURITAVERN_HANDLE_BACK__,back=()=>{discard();return true;};window.__TAURITAVERN_HANDLE_BACK__=back;
    parent.addEventListener('cancel',cancel,true);document.addEventListener('keydown',keyHandler,true);first.focus();return {element:layer};
}
