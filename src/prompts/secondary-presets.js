export const replySlot = '{{正文}}';
export const SECONDARY_PRESET_FILE_LIMIT = 450000;
const type = 'miao-secondary-tag-preset';
const defaultId = 'electronic-ghost';
const missingDefault = Object.freeze({id: defaultId, name: '电子幽灵', pendingImport: true});
const initialLibrary = Object.freeze({activeId: defaultId, imports: Object.freeze([])});

function normalizePreset(preset) {
    const name = typeof preset?.name === 'string' ? preset.name.trim().slice(0, 80) : '';
    if (Array.isArray(preset?.entries)) {
        if (!name || !preset.entries.length || preset.entries.length > 1000) throw Error('副 API 预设条目无效');
        const entries = preset.entries.map(entry => {
            const {name, role, content, enabled} = entry ?? {};
            if (typeof name !== 'string' || typeof content !== 'string' ||
                !['system', 'user', 'assistant', null].includes(role) ||
                typeof enabled !== 'boolean' || enabled && content.trim() && !role) {
                throw Error('副 API 预设含无效条目');
            }
            return {name, role, content, enabled};
        });
        const sent = entries.filter(entry => entry.enabled && entry.content.trim());
        if (sent.reduce((count, entry) => count + entry.content.split(replySlot).length - 1, 0) !== 1) {
            throw Error('启用的预设条目须包含且仅包含一个 {{正文}}');
        }
        return {name, entries};
    }
    const instructions = typeof preset?.instructions === 'string' ? preset.instructions.trim() : '';
    if (!name || !instructions || instructions.length > 100000) throw Error('副 API 预设须有名称和有效指令');
    const bodyTemplate = preset.bodyTemplate ?? replySlot;
    if (typeof bodyTemplate !== 'string' || bodyTemplate.length > 4000 || bodyTemplate.split(replySlot).length !== 2) {
        throw Error('正文模板须包含且仅包含一个 {{正文}}');
    }
    return {name, instructions, bodyTemplate};
}

function readTavernPreset(data, fileName) {
    const prompts = data.prompts.filter(entry => typeof entry?.identifier === 'string');
    const byId = new Map(prompts.map(entry => [entry.identifier, entry]));
    const order = data.prompt_order.find(profile => String(profile?.character_id) === '100001')?.order ??
        (data.prompt_order.length === 1 ? data.prompt_order[0]?.order : null);
    if (!Array.isArray(order)) throw Error('酒馆预设缺少可用的默认条目顺序');
    const entries = [], seen = new Set();
    const append = (entry, enabled) => {
        if (!entry || seen.has(entry.identifier)) return;
        seen.add(entry.identifier);
        entries.push({
            name: entry.name ?? entry.identifier,
            content: entry.content ?? '',
            role: entry.role ?? null,
            enabled,
        });
    };
    for (const item of order) append(byId.get(item?.identifier), item?.enabled === true);
    for (const entry of prompts) append(entry, false);
    return normalizePreset({name: data.name || fileName.replace(/\.json$/i, '') || '酒馆预设', entries});
}

export function readSecondaryPreset(text, {fileName = ''} = {}) {
    if (text.length > SECONDARY_PRESET_FILE_LIMIT) throw Error('副 API 预设文件过大');
    let preset;
    try { preset = JSON.parse(text.replace(/^\uFEFF/, '')); }
    catch { throw Error('副 API 预设须为有效的 JSON 文件'); }
    if (preset?.type === type && (preset.version === 1 || preset.version === 2)) {
        if (preset.version === 2 && !Array.isArray(preset.entries)) throw Error('副 API 预设缺少条目');
        return normalizePreset(preset);
    }
    if (Array.isArray(preset?.prompts) && Array.isArray(preset.prompt_order)) return readTavernPreset(preset, fileName);
    throw Error('请选择喵喵文生图副 API 预设或酒馆预设 JSON');
}

export function secondaryPresetFile(preset) {
    if (preset.pendingImport) throw Error('请先导入电子幽灵原预设');
    const data = {type, version: preset.entries ? 2 : 1, ...normalizePreset(preset)};
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    if (blob.size > SECONDARY_PRESET_FILE_LIMIT) throw Error('副 API 预设文件过大');
    const suffix = preset.id === defaultId ? '-electronic-ghost' : '';
    return {blob, name: `meow-tag-preset${suffix}.json`};
}

export function secondaryPresets(library) {
    const original = library.electronicGhost;
    const electronicGhost = original ? {...original, id: defaultId} : missingDefault;
    return [electronicGhost, ...library.imports.map((preset, index) => ({...preset, id: `import-${index}`}))];
}

export function activeSecondaryPreset(library) {
    const presets = secondaryPresets(library);
    return presets.find(preset => preset.id === library.activeId) ?? presets[0];
}

export function addSecondaryPreset(library, input) {
    const preset = normalizePreset(input);
    if (preset.entries && /^电子幽灵/.test(preset.name)) return {...library, electronicGhost: preset, activeId: defaultId};
    const serialized = JSON.stringify(preset);
    const index = library.imports.findIndex(item => JSON.stringify(normalizePreset(item)) === serialized);
    if (index >= 0) return {...library, activeId: `import-${index}`};
    if (library.imports.length >= 50) throw Error('最多可导入 50 份副 API 预设');
    return {...library, activeId: `import-${library.imports.length}`, imports: [...library.imports, preset]};
}

export function readSecondaryLibrary(settings) {
    if (settings.secondaryTagPresets) return settings.secondaryTagPresets;
    const legacy = settings.secondaryTagAPI?.preset;
    return legacy?.instructions
        ? addSecondaryPreset(initialLibrary, {...legacy, name: legacy.name?.trim() || '已导入预设'})
        : initialLibrary;
}

export function listedSecondaryMacros(preset) {
    const literal = preset.entries
        ? preset.entries.filter(entry => entry.enabled).map(entry => entry.content).join('\n').replace(replySlot, '')
        : (preset.instructions ?? '') + '\n' + (preset.bodyTemplate ?? '').replace(replySlot, '');
    return [...new Set(literal.match(/\{\{[^{}\r\n]+\}\}|\{@[^@\r\n]+@\}/g) ?? [])];
}
