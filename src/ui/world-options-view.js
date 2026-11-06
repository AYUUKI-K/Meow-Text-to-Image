import {bindButtonPress} from './button-press.js';
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
export function createWorldOptionsView({read,save,onError}){
    const root=node('section',undefined,'miao-section miao-world-options'),body=node('div',undefined,'miao-world-option-list'),status=node('p','正在读取世界书…','miao-muted'),reload=node('button','重新读取世界书','miao-button');reload.type='button';
    root.append(node('h3','世界书选开'),status,body,reload);let snapshot,busy=false;
    async function commit(values){
        if(busy)return;busy=true;lock();
        try{snapshot=await save(snapshot,values);status.textContent='开关已保存到世界书';}catch(error){onError(error);}finally{busy=false;paint();}
    }
    function lock(){for(const control of root.querySelectorAll('input,select,button'))control.disabled=busy;}
    function paint(){
        body.replaceChildren();
        if(!snapshot?.world){status.textContent='尚未安装世界书，请先更新资源。';lock();return;}
        if(!status.textContent.startsWith('开关已保存'))status.textContent=`当前世界书：${snapshot.world}`;
        for(const item of snapshot.toggles){const label=node('label',undefined,'miao-switch-row'),input=node('input');input.type='checkbox';input.checked=item.enabled;input.setAttribute('aria-label',item.title.replace('[选开]',''));input.onchange=()=>void commit({[item.key]:input.checked});label.append(node('span',item.title.replace('[选开]','')),input);body.append(label);}
        if(snapshot.choices.length){
            const label=node('label',undefined,'miao-field'),select=node('select'),active=snapshot.choices.filter(item=>item.enabled);select.setAttribute('aria-label','世界书性向选项');
            const empty=node('option','不指定');empty.value='';select.append(empty);
            for(const item of snapshot.choices){const option=node('option',item.title.replace('[选一]',''));option.value=item.key;select.append(option);}
            if(active.length>1){const option=node('option','当前启用了多项，请重新选择');option.value='multiple';select.append(option);select.value='multiple';}else select.value=active[0]?.key||'';
            select.onchange=()=>{if(select.value==='multiple')return;void commit(Object.fromEntries(snapshot.choices.map(item=>[item.key,item.key===select.value])));};label.append(node('span','性向（选一）'),select);body.append(label);
        }
        lock();
    }
    async function refresh(){if(busy)return;busy=true;lock();try{snapshot=await read();}catch(error){status.textContent='读取失败，可重新读取。';onError(error);}finally{busy=false;if(snapshot)paint();else lock();}}
    bindButtonPress(reload,refresh);void refresh();return {element:root,refresh};
}
