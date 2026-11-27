import {promptTree, treeById, orientations} from './tree-defaults.js';
import {promptTemplates} from './prompt-templates.js';

export const paramNames = Object.freeze({persona:'人格', target:'对象', count:'张数', eggMarker:'彩蛋标签'});
const defaultParams={persona:'ELLA', target:'User', count:'2~3', eggMarker:'/meow_FM'};
const paramTextLimit=16000;
const validParamText=value=>typeof value==='string'&&value.length<=paramTextLimit;
export function defaultTreeSettings(mode = 'external') {
    return {version:2, mode, params:{...defaultParams},
        enabledById:Object.fromEntries(promptTree.filter(n => n.toggleable).map(n => [n.nodeId, n.defaultEnabled])),
        textOverridesById:{}, orientation:''};
}

function hasLegacyCustomizations(config) {
    return config?.version === 1 && Object.entries(config.overrides || {}).some(([key, text]) => text !== promptTemplates[key]?.content);
}

function restoreTreeParams(config) {
    if(Object.keys(paramNames).every(key=>validParamText(config.params?.[key])))return config;
    const params={...config.params};
    const invalidParams={...config.invalidParams};
    for(const [key,name] of Object.entries(paramNames)){
        const value=config.params?.[key];
        const earlier=config.legacyBackup?.config?.fixed?.[name];
        if(validParamText(value))params[key]=value;
        else if(key==='count'&&Number.isSafeInteger(value)&&value>0)params[key]=String(value);
        else{
            if(value!==undefined)invalidParams[key]=value;
            params[key]=validParamText(earlier)?earlier:defaultParams[key];
        }
    }
    return {...config,params,...(Object.keys(invalidParams).length?{invalidParams}:{})};
}

// Keep customized v1 records intact; shared drawing rules still read their schema.
export function migrateTreeSettings(config) {
    if (!config) return defaultTreeSettings();
    if (config.version === 2) return validateTreeSettings(restoreTreeParams(config));
    if (config.version !== 1) throw Error('不支持的提示词配置版本，原配置已保留');
    if (hasLegacyCustomizations(config)) return config;
    const next = defaultTreeSettings(config.mode);
    next.legacyBackup = {version:1, config:structuredClone(config)};
    for (const [key, name] of Object.entries(paramNames)) if (typeof config.fixed?.[name] === 'string') next.params[key] = config.fixed[name];
    const modules = {selfCheck:'selfcheck', easterEgg:'egg', subtitle:'output.subtitle', easterEggDescription:'egg.description', nsfw:'nsfw'};
    for (const [key, id] of Object.entries(modules)) if (typeof config.modules?.[key] === 'boolean') next.enabledById[id] = config.modules[key];
    next.orientation = String(config.orientation || '').toUpperCase();
    if (config.migration) next.migration = structuredClone(config.migration);
    return validateTreeSettings(restoreTreeParams(next));
}

export function validateTreeSettings(config) {
    if (config.version !== 2 || !['builtin','external'].includes(config.mode) || !orientations.includes(config.orientation)) throw Error('提示词配置无效');
    for (const [key,name] of Object.entries(paramNames)) {
        const value=config.params?.[key];
        if (typeof value!=='string') throw Error(`「${name}」需为文本`);
        if (value.length>paramTextLimit) throw Error(`「${name}」最多可填写 ${paramTextLimit} 字符`);
    }
    for (const [id, value] of Object.entries(config.enabledById || {})) if (!treeById[id]?.toggleable || typeof value !== 'boolean') throw Error('提示词开关无效');
    return config;
}
export function treeText(config, id, slot = 'body') {
    if (!treeById[id] || !Object.hasOwn(treeById[id].slots, slot)) throw Error('未知提示词正文');
    const value=config.textOverridesById?.[id]?.[slot];
    return typeof value==='string'&&value.length<=100000?value:treeById[id].slots[slot];
}
export function savedEnabled(config, id) {
    const node = treeById[id];
    if (!node) throw Error('未知提示词节点');
    return node.toggleable ? config.enabledById?.[id] ?? node.defaultEnabled : true;
}
export function effectiveEnabled(config, id) {
    const node = treeById[id];
    if (!savedEnabled(config, id)) return false;
    if (node.parentId && !effectiveEnabled(config, node.parentId)) return false;
    if (node.condition?.some(key => !effectiveEnabled(config, key))) return false;
    return node.kind !== 'choice-option' || config.orientation === node.choice;
}
