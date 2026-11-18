export const replySlot = '{{正文}}';
export const SECONDARY_PRESET_FILE_LIMIT = 450000;
const type = 'miao-secondary-tag-preset';
const version = 1;
const builtins = Object.freeze([
    Object.freeze({
        id: 'default',
        name: '默认指令',
        instructions: '你是一位插画分镜师。选取正文中最值得绘制的瞬间，按原文顺序输出清晰可见的主体、动作、环境和构图。使用简洁的 NovelAI 英文标签。',
        bodyTemplate: replySlot,
    }),
    Object.freeze({
        id: 'electronic-ghost',
        name: '电子幽灵 · 副 API',
        instructions: [
            '你是尤瑞，一位擅长 NovelAI 标签的电子幽灵。为已经写完的剧情选择插画分镜。按正文顺序挑不同的关键瞬间，每张只写一个定格。',
            '用英文标签描述镜头可见的角色特征、动作、环境、光线和构图。多张图之间保持角色特征和画风一致。',
            '多人场景可用 Scene Composition: 公共场景和构图; Character 1 Prompt: 角色词 |centers:B3; Character 1 UC: 角色负面词; 其他角色依次编号。坐标为 A1 到 E5，仅在需要指定站位时填写。',
        ].join('\n\n'),
        bodyTemplate: '<剧情原文>\n'+replySlot+'\n</剧情原文>',
    }),
]);
const initialLibrary = Object.freeze({activeId: 'default', imports: Object.freeze([])});

function normalizePreset(preset) {
    const name = typeof preset?.name === 'string' ? preset.name.trim().slice(0, 80) : '';
    const instructions = typeof preset?.instructions === 'string' ? preset.instructions.trim() : '';
    if (!name || !instructions || instructions.length > 100000) throw Error('副 API 预设须有名称和有效指令');
    const bodyTemplate = preset.bodyTemplate ?? replySlot;
    if (typeof bodyTemplate !== 'string' || bodyTemplate.length > 4000 || bodyTemplate.split(replySlot).length !== 2) {
        throw Error('正文模板须包含且仅包含一个 {{正文}}');
    }
    return {name, instructions, bodyTemplate};
}

export function readSecondaryPreset(text) {
    if (text.length > SECONDARY_PRESET_FILE_LIMIT) throw Error('副 API 预设文件过大');
    let preset;
    try { preset = JSON.parse(text.replace(/^\uFEFF/, '')); }
    catch { throw Error('副 API 预设须为有效的 JSON 文件'); }
    if (preset?.type !== type || preset.version !== version) throw Error('请选择喵喵文生图的副 API 预设 JSON');
    return normalizePreset(preset);
}

export function secondaryPresetFile(preset) {
    const data = {type, version, ...normalizePreset(preset)};
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    if (blob.size > SECONDARY_PRESET_FILE_LIMIT) throw Error('副 API 预设文件过大');
    const suffix = preset.id === 'electronic-ghost' ? '-electronic-ghost' : preset.id === 'default' ? '-default' : '';
    return {blob, name: `meow-tag-preset${suffix}.json`};
}

export function secondaryPresets(library) {
    return [...builtins, ...library.imports.map((preset, index) => ({...preset, id: `import-${index}`}))];
}

export function activeSecondaryPreset(library) {
    return secondaryPresets(library).find(preset => preset.id === library.activeId) ?? builtins[0];
}

export function addSecondaryPreset(library, input) {
    const preset = normalizePreset(input);
    const existing = secondaryPresets(library).find(item =>
        item.name === preset.name && item.instructions === preset.instructions && item.bodyTemplate === preset.bodyTemplate);
    if (existing) return {...library, activeId: existing.id};
    if (library.imports.length >= 50) throw Error('最多可导入 50 份副 API 预设');
    return {activeId: `import-${library.imports.length}`, imports: [...library.imports, preset]};
}

export function readSecondaryLibrary(settings) {
    if (settings.secondaryTagPresets) return settings.secondaryTagPresets;
    const legacy = settings.secondaryTagAPI?.preset;
    return legacy?.instructions
        ? addSecondaryPreset(initialLibrary, {...legacy, name: legacy.name?.trim() || '已导入预设'})
        : initialLibrary;
}

export function listedSecondaryMacros(preset) {
    const literal = preset.instructions + '\n' + preset.bodyTemplate.replace(replySlot, '');
    return [...new Set(literal.match(/\{\{[^{}\r\n]+\}\}|\{@[^@\r\n]+@\}/g) ?? [])];
}
