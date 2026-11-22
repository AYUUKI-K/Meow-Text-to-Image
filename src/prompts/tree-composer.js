import {treeById, treeRoots, validatePromptTree} from './tree-defaults.js';
import {effectiveEnabled, treeText, validateTreeSettings} from './tree-settings.js';

export function composeTreePrompt(config) {
    validatePromptTree(); validateTreeSettings(config);
    if (config.mode !== 'builtin') return '';
    const parts = [];
    function visit(id) {
        if (!effectiveEnabled(config, id)) return;
        const node = treeById[id];
        for (const slot of ['prefix', 'body']) if (Object.hasOwn(node.slots, slot)) parts.push(treeText(config, id, slot));
        if (id === 'task') {
            const p = config.params;
            parts.push(`绘图执行者：${p.persona}；对话对象：${p.target}；正文图张数：${p.count}${effectiveEnabled(config, 'egg') ? `；彩蛋分隔标记：${p.eggMarker}` : ''}。`);
        }
        node.children.forEach(visit);
        if (Object.hasOwn(node.slots, 'suffix')) parts.push(treeText(config, id, 'suffix'));
    }
    treeRoots.forEach(visit);
    return ['---', '<imageTag>', ...parts.filter(text => text !== ''), '</imageTag>', '---'].join('\n\n');
}
