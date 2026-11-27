import {bindButtonPress} from './button-press.js';
const node=(tag,text,cls)=>{const item=document.createElement(tag);if(text!==undefined)item.textContent=text;if(cls)item.className=cls;return item;};
const hints={人格:'填写预设中的人格名称，例如 ELLA。',对象:'填写对话对象称呼，例如 User。历史酒馆宏值可保留，但插件不解析。',彩蛋标签:'填写触发彩蛋的位置标记，例如 /meow_FM。',cot_xml:'填写预设的思考标签名称，例如 star_cot，不带尖括号。',张数:'填写希望生成的图片数量，例如 2~3。'};
export function createResourceMacrosView({read,save,onError}){
    const root=node('section',undefined,'miao-section'),status=node('p','正在读取基础配置…','miao-muted'),fields=node('div'),actions=node('div',undefined,'miao-actions');
    root.append(node('h3','基础配置'),status,fields,actions);
    let snapshot=null,controls=[],busy=false,saving=null;
    const button=(label,run)=>{const control=node('button',label,'miao-button');control.type='button';bindButtonPress(control,async()=>{if(busy)return;busy=true;lock();try{await run();}catch(error){onError(error);}finally{busy=false;lock();}});actions.append(control);return control;};
    const commit=()=>{
        if(saving)return saving;
        if(!snapshot)return;
        const values=Object.fromEntries(controls.map(({macro,input})=>[macro.id,input.value]));
        if(!snapshot.macros.some(macro=>values[macro.id]!==macro.value))return;
        busy=true;lock();
        saving=(async()=>{try{snapshot=await save(snapshot,values);status.textContent='已保存到世界书。';paint();}finally{busy=false;saving=null;lock();}})();return saving;
    };
    const saveButton=button('保存酒馆宏',commit),reload=button('重新读取配置',async()=>{snapshot=null;status.textContent='正在读取基础配置…';snapshot=await read();paint();});
    function lock(){saveButton.disabled=busy||!snapshot?.macros.length;reload.disabled=busy;for(const {input} of controls)input.disabled=busy;}
    function paint(){
        fields.replaceChildren();controls=[];
        if(!snapshot?.macros.length){status.textContent=snapshot?.world?`「${snapshot.world}」没有可编辑的 tag头 变量。`:'固定配置尚未初始化。';lock();return;}
        if(!status.textContent.startsWith('已保存'))status.textContent=snapshot.world;
        const advanced=node('details'),summary=node('summary','其他酒馆宏');advanced.append(summary);let extra=0;
        for(const macro of snapshot.macros){
            const wrap=node('label',undefined,'miao-field'),input=node(macro.value.includes('\n')?'textarea':'input');if(input.tagName==='INPUT')input.type='text';input.value=macro.value;input.setAttribute('aria-label',`${macro.name}（${macro.scope}）`);input.maxLength=16000;input.addEventListener('change',()=>{void commit().catch(onError);});input.addEventListener('input',()=>{status.textContent=`固定配置修改尚未保存。`;});
            wrap.append(node('span',macro.name+(macro.scope==='setglobalvar'?'（全局）':'')),input);fields.append(wrap);
            const hint=node('p',hints[macro.name]||`${macro.scope}::${macro.name}；空格及嵌套宏按原文保存。`,'miao-muted');
            if(hints[macro.name])fields.append(hint);else{advanced.append(wrap,hint);extra++;}
            controls.push({macro,input});
        }
        if(extra){summary.textContent=`其他酒馆宏（${extra} 项）`;fields.append(advanced);}lock();
    }
    void (async()=>{busy=true;lock();try{snapshot=await read();if(root.isConnected)paint();}catch(error){status.textContent='读取失败，可点击重新读取重试。';if(root.isConnected)onError(error);}finally{busy=false;lock();}})();
    return {element:root,commit};
}
