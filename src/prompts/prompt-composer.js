import {promptText} from './prompt-overrides.js';
import {parseHeaderMacros} from '../resources/world-macros.js';
import {fixedMacroSnapshot,moduleNames} from './prompt-settings.js';
import {composeTreePrompt} from './tree-composer.js';
export function composePrompt(config){
    if(config.version===2)return composeTreePrompt(config);
    if(config.version!==1)throw Error('不支持的提示词配置版本');
    if(config.mode!=='builtin')return '';
    return composeLegacyPrompt(config);
}
// Compatibility only: custom v1 modules remain usable until explicit tree adoption.
function composeLegacyPrompt(config){
    const virtual=new Set(parseHeaderMacros(promptText({...config,overrides:{}},'header')).filter(m=>!['人格','对象','张数','cot_xml','彩蛋标签'].includes(m.name)).map(m=>`${m.scope==='setvar'?'getvar':'getglobalvar'}::${m.name}`));
    const variables=new Map(),bodies=[];
    const enabled=moduleNames.filter(k=>config.modules[k]&&(k!=='easterEggDescription'||config.modules.easterEgg));
    if(config.orientation){if(!['bg','bl','gl','intersex'].includes(config.orientation))throw Error('无效性向选项');enabled.push(config.orientation);}
    for(const key of enabled){
        const text=promptText(config,key),macros=parseHeaderMacros(text);
        for(const m of macros)variables.set(`${m.scope==='setvar'?'getvar':'getglobalvar'}::${m.name}`,m.value);
        let body=text;for(const m of [...macros].reverse())body=body.slice(0,m.start)+body.slice(m.end);
        if(body.trim()&&body.trim()!=='{{trim}}')bodies.push(body);
    }
    const fixed=new Set(fixedMacroSnapshot(config).macros.map(m=>m.name));
    function expand(text,path=[]){return text.replace(/\{\{(getvar|getglobalvar)::([^{}]+)\}\}/g,(raw,scope,name)=>{
        if(scope==='getvar'&&fixed.has(name))return raw;
        const key=`${scope}::${name}`;if(path.includes(key))throw Error('提示词模块存在循环引用');
        return variables.has(key)?expand(variables.get(key),[...path,key]):virtual.has(key)?'':raw;
    });}
    let header=promptText(config,'header');for(const m of [...parseHeaderMacros(header)].reverse().filter(m=>fixed.has(m.name)||virtual.has(`${m.scope==='setvar'?'getvar':'getglobalvar'}::${m.name}`)))header=header.slice(0,m.start)+header.slice(m.end);
    const assignments=fixedMacroSnapshot(config).macros.map(m=>`{{${m.scope}::${m.name}::${m.value}}}`).join('\n');
    return header+'\n'+assignments+'\n'+expand(promptText(config,'main'))+'\n'+bodies.map(b=>expand(b)).join('\n')+promptText(config,'footer');
}
