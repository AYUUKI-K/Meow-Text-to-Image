import {promptTree, treeById, orientations} from './tree-defaults.js';
import {promptTemplates} from './prompt-templates.js';

export const paramNames = Object.freeze({persona:'人格', target:'对象', count:'张数', eggMarker:'彩蛋标签'});
export function defaultTreeSettings(mode = 'builtin') {
    return {version:2, mode, params:{persona:'ELLA', target:'User', count:'2~3', eggMarker:'/meow_FM'},
        enabledById:Object.fromEntries(promptTree.filter(n => n.toggleable).map(n => [n.nodeId, n.defaultEnabled])),
        textOverridesById:{}, orientation:''};
}

export function hasLegacyCustomizations(config) {
    return config?.version === 1 && Object.entries(config.overrides || {}).some(([key, text]) => text !== promptTemplates[key]?.content);
}

// A custom v1 document cannot be split losslessly. Keep its usable composer and editor
// until the user explicitly chooses the tree; retain the entire original configuration.
export function migrateTreeSettings(config, {adoptTree = false} = {}) {
    if (!config) return defaultTreeSettings();
    if (config.version === 2) { validateTreeSettings(config); return config; }
    if (config.version !== 1) throw Error('不支持的提示词配置版本，原配置已保留');
    if (hasLegacyCustomizations(config) && !adoptTree) return config;
    const next = defaultTreeSettings(config.mode);
    next.legacyBackup = {version:1, config:structuredClone(config)};
    for (const [key, name] of Object.entries(paramNames)) if (typeof config.fixed?.[name] === 'string') next.params[key] = config.fixed[name];
    const modules = {selfCheck:'selfcheck', easterEgg:'egg', subtitle:'output.subtitle', easterEggDescription:'egg.description', nsfw:'nsfw'};
    for (const [key, id] of Object.entries(modules)) if (typeof config.modules?.[key] === 'boolean') next.enabledById[id] = config.modules[key];
    next.orientation = String(config.orientation || '').toUpperCase();
    if (config.migration) next.migration = structuredClone(config.migration);
    validateTreeSettings(next);
    return next;
}

export function validateTreeSettings(config) {
    if (config.version !== 2 || !['builtin','external'].includes(config.mode) || !orientations.includes(config.orientation)) throw Error('提示词配置无效');
    for (const key of Object.keys(paramNames)) {
        if (typeof config.params?.[key] !== 'string' || config.params[key].length > 16000) throw Error('任务参数需为不超过 16000 字符的文本');
    }
    for (const [id, value] of Object.entries(config.enabledById || {})) if (!treeById[id]?.toggleable || typeof value !== 'boolean') throw Error('提示词开关无效');
    for (const [id, slots] of Object.entries(config.textOverridesById || {})) {
        if (!treeById[id] || !slots || typeof slots !== 'object' || Array.isArray(slots)) throw Error('未知提示词条目');
        for (const [slot, text] of Object.entries(slots)) validateText(id, slot, text);
    }
    if (!treeText(config, 'selfcheck', 'prefix').trimEnd().endsWith('<imgthink>') || !treeText(config, 'selfcheck', 'suffix').trimStart().startsWith('</imgthink>')) throw Error('自检开头须以 <imgthink> 结尾，结尾须以 </imgthink> 开始，以保持成对');
    return config;
}
function validateText(id, slot, text) {
    if (!treeById[id] || !Object.hasOwn(treeById[id].slots, slot)) throw Error('未知提示词正文');
    if (typeof text !== 'string' || text.length > 100000) throw Error('提示词需为不超过 100000 字符的文本');
    if (/<\/?imageTag\b/i.test(text)) throw Error('imageTag 外壳由插件固定提供，请勿写入条目正文');
}
export function treeText(config, id, slot = 'body') {
    if (!treeById[id] || !Object.hasOwn(treeById[id].slots, slot)) throw Error('未知提示词正文');
    return config.textOverridesById?.[id]?.[slot] ?? treeById[id].slots[slot];
}
export function withTreeText(config, id, values) {
    const overrides = {...config.textOverridesById}, slots = {...overrides[id]};
    for (const [slot, text] of Object.entries(values)) {
        validateText(id, slot, text);
        if (text === treeById[id].slots[slot]) delete slots[slot]; else slots[slot] = text;
    }
    if (Object.keys(slots).length) overrides[id] = slots; else delete overrides[id];
    return validateTreeSettings({...config, textOverridesById:overrides});
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
export function withTreeEnabled(config, id, enabled) {
    if (!treeById[id]?.toggleable || typeof enabled !== 'boolean') throw Error('该条目不可切换');
    return validateTreeSettings({...config, enabledById:{...config.enabledById, [id]:enabled}});
}
export function promptWarnings(config) {
    if (config.version !== 2) return [];
    const warnings = [];
    if (Object.values(config.params).some(value => /\{\{/.test(value)) || Object.values(config.textOverridesById || {}).some(slots => Object.values(slots).some(value => /\{\{/.test(value)))) warnings.push('内容含酒馆宏：插件按原文保留，不解析变量；最终行为取决于宿主与预设。');
    if (config.legacyBackup?.config?.fixed?.cot_xml) warnings.push('旧 cot_xml 已保存在兼容备份；新结构不注入该变量，依赖它的外部预设兼容性尚未验证。');
    if (config.textOverridesById?.['output.format']?.body !== undefined) warnings.push('图片标签结构已自定义，请核对实际输出与捕捉标签。');
    return warnings;
}
