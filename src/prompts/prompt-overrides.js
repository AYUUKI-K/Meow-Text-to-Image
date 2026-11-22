import {promptTemplates} from './prompt-templates.js';
export function promptText(config,key){if(!Object.hasOwn(promptTemplates,key))throw Error('未知提示词模块');return config.overrides?.[key]??promptTemplates[key].content;}
export function withPromptOverride(config,key,text){
    if(!Object.hasOwn(promptTemplates,key))throw Error('未知提示词模块');
    if(typeof text!=='string'||text.length>100000)throw Error('提示词需为不超过 100000 字符的文本');
    let depth=0;for(let i=0;i<text.length-1;i++){const pair=text.slice(i,i+2);if(pair==='{{'){depth++;i++;}else if(pair==='}}'){if(!depth)throw Error('酒馆宏结束括号多余');depth--;i++;}}if(depth)throw Error('酒馆宏尚未闭合');
    const overrides={...config.overrides};if(text===promptTemplates[key].content)delete overrides[key];else overrides[key]=text;
    return {...config,overrides};
}
