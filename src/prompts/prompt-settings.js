import {promptTemplates} from './prompt-templates.js';
import {parseHeaderMacros,worldMacros} from '../resources/world-macros.js';
import {defaultTreeSettings,migrateTreeSettings,paramNames} from './tree-settings.js';
export const fixedNames=['人格','cot_xml','张数','对象','彩蛋标签'];
export const moduleNames=['selfCheck','easterEgg','subtitle','easterEggDescription','nsfw'];
export function defaultPromptSettings(){return defaultTreeSettings('external');}
export function migrateExternalPromptSettings(config){
    const next=migrateTreeSettings(config);
    return next.mode==='external'?next:{...next,mode:'external'};
}
export function defaultLegacyPromptSettings(mode='builtin'){
    return {version:1,mode,fixed:Object.fromEntries(parseHeaderMacros(promptTemplates.header.content).filter(m=>fixedNames.includes(m.name)).map(m=>[m.name,m.value])),modules:Object.fromEntries(moduleNames.map(k=>[k,!promptTemplates[k].disable&&promptTemplates[k].constant])),orientation:''};
}
export function migratePromptSettings(book){
    const config=defaultLegacyPromptSettings('external'),entries=Object.values(book?.entries||{});
    const shared=entries.some(entry=>entry.content?.includes('{{miao_drawing_policy}}'));
    for(const macro of worldMacros(book))if(macro.scope==='setvar'&&fixedNames.includes(macro.name)&&(!shared||macro.name!=='张数'))config.fixed[macro.name]=macro.value;
    if(shared){
        const next=defaultTreeSettings('external');
        for(const [key,name] of Object.entries(paramNames))next.params[key]=config.fixed[name];
        return migrateTreeSettings(next);
    }
    const modified=[];
    for(const [key,template] of Object.entries(promptTemplates)){
        const entry=entries.find(e=>e.comment===template.comment);
        if(!entry)continue;
        if(moduleNames.includes(key))config.modules[key]=!entry.disable&&entry.constant===true;
        if(['bg','bl','gl','intersex'].includes(key)&&!entry.disable&&entry.constant===true){if(config.orientation)throw Error('旧世界书启用了多个性向条目');config.orientation=key;}
        if(key!=='header'&&entry.content!==template.content)modified.push(template.comment);
    }
    config.migration={status:'read',modified};return migrateTreeSettings(config);
}
