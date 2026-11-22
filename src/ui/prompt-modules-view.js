import {promptTemplates} from '../prompts/prompt-templates.js';
import {treeById, treeRoots} from '../prompts/tree-defaults.js';
import {effectiveEnabled, savedEnabled, withTreeEnabled} from '../prompts/tree-settings.js';
import {openPromptEditor} from './prompt-editor.js';
import {drawingModules} from '../prompts/drawing-options.js';
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const sharedIds=new Set(Object.values(drawingModules).flat());

export function createPromptModulesView({settings,save,onError,parent,expanded=new Set()}){
    const root=node('section',undefined,'miao-section miao-prompt-tree');
    root.append(node('h3',settings.promptConfig.version===2?'提示词条目':'旧版兼容编辑'));
    if(settings.promptConfig.version!==2){paintLegacy();return {element:root,refresh(){}};}
    const states=[];
    let busy=false;
    async function commit(next){
        if(busy)return;
        busy=true;for(const {toggle} of states)if(toggle)toggle.disabled=true;
        try{await save(next);}catch(error){onError(error);}finally{busy=false;paint();}
    }
    function paint(){
        for(const {item,status,toggle} of states){
            const config=settings.promptConfig,active=effectiveEnabled(config,item.nodeId);
            status.textContent=(Object.keys(config.textOverridesById?.[item.nodeId]||{}).length?'已自定义':'默认')+' · '+(active?'生效':savedEnabled(config,item.nodeId)?'受父级、条件或选择限制':'已关闭');
            if(item.condition)status.textContent+='（依赖'+item.condition.map(id=>treeById[id].label).join('、')+'）';
            if(toggle){toggle.checked=savedEnabled(config,item.nodeId);toggle.disabled=busy;}
        }
    }
    function append(id,container){
        const item=treeById[id],branch=node('div',undefined,'miao-tree-node');branch.dataset.nodeId=id;branch.dataset.displayId=item.displayId;
        const row=node('div',undefined,'miao-prompt-module');branch.append(row);container.append(branch);
        if(item.children.length){
            const expand=node('button',undefined,'miao-tree-expand miao-button');expand.type='button';expand.setAttribute('aria-label','展开'+item.label);
            const children=node('div',undefined,'miao-tree-children');children.id='miao-tree-'+id.replaceAll('.','-');expand.setAttribute('aria-controls',children.id);
            const fold=()=>{children.hidden=!expanded.has(id);expand.textContent=children.hidden?'▸':'▾';expand.setAttribute('aria-expanded',String(!children.hidden));expand.setAttribute('aria-label',(children.hidden?'展开':'收起')+item.label);};
            expand.onclick=()=>{if(expanded.has(id))expanded.delete(id);else expanded.add(id);fold();};row.append(expand);branch.append(children);fold();
            item.children.forEach(child=>append(child,children));
        }
        row.append(node('strong',item.displayId+' '+item.label));
        const status=node('span','','miao-muted miao-tree-status');row.append(status);
        let toggle;
        if(item.toggleable&&!sharedIds.has(id)){
            const wrap=node('label',undefined,'miao-prompt-switch');toggle=node('input');toggle.type='checkbox';toggle.setAttribute('role','switch');toggle.setAttribute('aria-label','启用'+item.label);wrap.append(toggle,node('span',undefined,'miao-prompt-switch-track'));row.append(wrap);
            toggle.onchange=()=>{void commit(withTreeEnabled(settings.promptConfig,id,toggle.checked));};
        }
        if(Object.keys(item.slots).length){
            const edit=node('button',undefined,'miao-button miao-tree-edit');edit.type='button';edit.setAttribute('aria-label','编辑'+item.label);edit.title='编辑'+item.label;const icon=node('i',undefined,'fa-solid fa-pencil');icon.setAttribute('aria-hidden','true');edit.append(icon);
            edit.onclick=()=>openPromptEditor({parent:parent(),settings,key:id,label:item.label,save,onSaved:paint});row.append(edit);
        }
        states.push({item,status,toggle});
    }
    treeRoots.forEach(id=>append(id,root));paint();return {element:root,refresh:paint};

    function paintLegacy(){
        // The original whole-module editor is intentionally kept for unmappable v1 overrides.
        for(const [key,label] of Object.entries(promptTemplates).map(([key,t])=>[key,t.comment])){
            const row=node('div',undefined,'miao-prompt-module'),status=node('span',Object.hasOwn(settings.promptConfig.overrides||{},key)?'已自定义':'默认','miao-muted');row.append(node('strong',label),status);
            if(Object.hasOwn(settings.promptConfig.modules,key)&&!sharedIds.has(key)){
                const toggle=node('input');toggle.type='checkbox';toggle.checked=settings.promptConfig.modules[key];toggle.setAttribute('aria-label','启用'+label);
                toggle.onchange=async()=>{toggle.disabled=true;try{await save({...settings.promptConfig,modules:{...settings.promptConfig.modules,[key]:toggle.checked}});}catch(error){toggle.checked=settings.promptConfig.modules[key];onError(error);}finally{toggle.disabled=false;}};row.append(toggle);
            }
            const edit=node('button',undefined,'miao-button miao-tree-edit');edit.type='button';edit.setAttribute('aria-label','编辑'+label);edit.title='编辑'+label;edit.append(node('i',undefined,'fa-solid fa-pencil'));
            edit.onclick=()=>openPromptEditor({parent:parent(),settings,key,label,save,onSaved:()=>{status.textContent=Object.hasOwn(settings.promptConfig.overrides||{},key)?'已自定义':'默认';}});row.append(edit);root.append(row);
        }
    }
}
