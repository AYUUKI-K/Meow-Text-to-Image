import {delimiterPattern, maskReasoning, parseBodyBlocks} from '../core/core.js';
import {validateEndpoint} from '../novelai/nai-connection.js';
import {replySlot} from './secondary-presets.js';
import {createSecondaryMacroExpander} from './secondary-macros.js';
import {captureMacroValues, captureTemplate, drawingResponse, resolveCapture} from '../chat/secondary-placement.js';
import {drawingOutputRule} from './drawing-options.js';
import {parseHeaderMacros} from '../resources/world-macros.js';

export const secondaryPattern = delimiterPattern('image###', '###');
export const secondaryEnabled = settings => settings.tagSource === 'secondary';
export const inlineSecondaryPreset = preset => preset?.entries?.some(entry =>
    entry.enabled && entry.content.includes('<drawings>') && entry.content.includes('after=')) ?? false;

export function secondaryConnection(values) {
    const address = String(values.url ?? '').trim();
    validateEndpoint(address, {label: '副 API 地址'});
    const url = new URL(address);
    if (url.hash || url.search) throw Error('副 API 地址请使用不带查询参数或片段的 API 地址');
    const path = url.pathname.replace(/\/+$/, '');
    url.pathname = !path ? '/v1/chat/completions' : path.endsWith('/v1') ? path + '/chat/completions' : path;
    const model = String(values.model ?? '').trim();
    if (!model || model.length > 200) throw Error('请填写副 API 模型名');
    const maxTags = Number(values.maxTags ?? 3);
    if (!Number.isInteger(maxTags) || maxTags < 1 || maxTags > 8) throw Error('每楼图片上限须为 1～8 张');
    return {url: url.href, model, maxTags, remember: values.remember === true};
}

export function secondaryBody(text, mainPattern, format) {
    const visible = maskReasoning(text, format);
    const blocks = parseBodyBlocks(visible, mainPattern);
    let cursor = 0;
    const parts = [];
    for (const block of blocks) {
        parts.push(visible.slice(cursor, block.start));
        cursor = block.start + block.raw.length;
    }
    parts.push(visible.slice(cursor));
    return parts.join('\n').replace(/<\/?(?:content|message)>/gi, '').trim();
}

export function extractSecondaryTags(content, limit, pattern = secondaryPattern) {
    return parseBodyBlocks(content, pattern).slice(0, limit).map(block => ({prompt: block.prompt}));
}

function sharedTemplate(text, options) {
    if (!options) return text;
    const source = text.replace(/\{@([^@\r\n]+)@\}/g,'{{$1}}');
    const names = new Set(['张数','生图数量','彩蛋数量','小标题','彩蛋解析','性向绘画',
        '文生图NSFW1','文生图NSFW2','文生图NSFW3','文生图NSFW4']);
    if (!options.egg) for (const name of ['彩蛋','彩蛋自检','彩蛋要求']) names.add(name);
    if (!options.selfCheck) for (const name of ['自检','自检1','自检2','自检3']) names.add(name);
    let patched = source;
    for (const macro of parseHeaderMacros(source).reverse()) {
        if (names.has(macro.name.trim())) patched = patched.slice(0,macro.start)+patched.slice(macro.end);
    }
    return patched
        .replace(/\{\{get(?:global)?var::\s*(?:张数|生图数量)\s*\}\}\s*\+\s*1(?=\s*张)/g,options.count.text)
        .replace(/\{\{get(?:global)?var::\s*([^{}\r\n]+?)\s*\}\}/g,(raw, name) => {
            if (name === '张数'||name === '生图数量') return options.count.text;
            return names.has(name) ? '' : raw;
        })
        .replace(/\{\{\s*miao_image_count\s*\}\}/g,options.count.text);
}

function secondaryOutputRule(options, inline, capture, specializationInPreset) {
    const rule = [drawingOutputRule(options),'插图尽量分布在不同段落。'];
    if (options.selfCheck) rule.push('返回前检查位置编号、张数、角色宏和标签边界。');
    if (options.nsfwRules) rule.push(options.nsfwRules);
    if (options.specialization&&!specializationInPreset) rule.push(options.specialization);
    if (inline) {
        const escaped = value => value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        rule.push(`仅返回 <drawings> XML。每张图一个 <draw after="P02">。绘图提示词放在 <tags>${escaped(capture.start)}tag${escaped(capture.end)}</tags> 内。`);
        if (options.title) rule.push('每张图在 <draw> 内加一个 <title>，只写标题文字。');
        if (options.egg) rule.push('彩蛋所在的 <draw> 加 egg="true"。');
        if (options.egg && options.eggDescription) rule.push('彩蛋的 <draw> 用 <egg_description> 返回解析，其他插图不加。');
        rule.push('XML 文本中的 & 和尖括号按 XML 规则转义。');
    }
    return rule.join('\n');
}

export function buildSecondaryMessages({maxTags, preset, output, capture = {start:'image###',end:'###'}}, body, expand) {
    if (!preset || preset.pendingImport) throw Error('请先在「预设」中导入完整的电子幽灵 JSON');
    const render = source => {
        const text = captureTemplate(sharedTemplate(source,output));
        return expand ? expand(text) : resolveCapture(text,capture).replace(replySlot, () => body);
    };
    if (preset.entries) {
        const messages = preset.entries.filter(entry => entry.enabled && entry.content.trim() &&
            (entry.name !== '彩蛋' || output?.egg !== false) && (entry.name !== '绘画自检' || output?.selfCheck !== false))
            .map(({role, content}) => ({role, content: render(content)}))
            .filter(message => message.content.trim());
        if (output) {
            const hasSpecializationSlot=preset.entries.some(entry=>entry.enabled&&entry.content.includes('{{miao_image_specialization}}'));
            const rule = secondaryOutputRule(output,inlineSecondaryPreset(preset),capture,hasSpecializationSlot);
            const lastSystem = messages.findLast(message => message.role === 'system');
            if (lastSystem) lastSystem.content += '\n\n' + rule;
            else messages.unshift({role:'system',content:rule});
        }
        return messages;
    }
    return [
        {role: 'system', content: render(preset.instructions)},
        {role: 'system', content: `接下来的一条用户消息是待分析的小说正文。最多输出 ${maxTags} 个绘图标签，每张一行，严格使用 ${capture.start}绘图提示词${capture.end}；只输出绘图标签，完全闭合每一组。不要复述正文或输出思考过程。${output?'\n'+drawingOutputRule(output):''}`},
        {role: 'user', content: render(preset.bodyTemplate)},
    ];
}

export async function requestSecondaryTags(connection, key, body, {signal, fetchImpl = fetch, macros, onPrepared} = {}) {
    const {url, model, maxTags} = connection;
    if (body.length > 60000) throw Error('正文超过副 API 的单楼长度上限');
    const capture = connection.capture ?? {start: 'image###', end: '###'};
    const expand = createSecondaryMacroExpander({...macros, values: {...macros?.values, ...captureMacroValues(capture), 正文: () => body,
        miao_image_specialization:()=>connection.output?.specialization??''}});
    const messages = buildSecondaryMessages(connection, body, expand);
    if (messages.reduce((length, message) => length + message.content.length, 0) > 160000) throw Error('副 API 展开后的请求内容过长');
    onPrepared?.(messages);
    let response, result;
    try {
        response = await fetchImpl(url, {
            method: 'POST', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal,
            headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + key},
            body: JSON.stringify({model, messages, stream: false}),
        });
    } catch {
        if (signal?.aborted) throw signal.reason;
        throw Error('副 API 连接失败，请检查网络及服务端跨域设置');
    }
    if (!response.ok) throw Error(`副 API 请求失败（HTTP ${response.status}）`);
    try { result = await response.json(); }
    catch { throw Error('副 API 未返回有效的 Chat Completions JSON'); }
    const choice = result?.choices?.[0];
    if (choice?.finish_reason === 'length') throw Error('副 API 输出被截断，请检查模型输出长度限制');
    const content = choice?.message?.content;
    const text = Array.isArray(content) ? content.filter(part => part?.type === 'text').map(part => part.text).join('\n') : content;
    if (inlineSecondaryPreset(connection.preset)) {
        if (typeof text !== 'string' || text.length > 100000) throw Error('副 API 绘图返回无效');
        const {drawings, errors} = drawingResponse(text, capture, connection.output);
        if (!drawings.length) throw Error(errors[0] ?? '副 API 未返回可用的 <draw> 绘图条目');
        const egg = drawings.findLast(drawing=>drawing.egg);
        for (const drawing of drawings) {
            if(!drawing.egg||drawing===egg)continue;
            delete drawing.egg;delete drawing.eggMarker;delete drawing.eggDescription;
        }
        return limitReturnedDrawings(drawings,maxTags);
    }
    const tags = typeof text === 'string' && text.length <= 100000 ? extractSecondaryTags(text, maxTags, delimiterPattern(capture.start,capture.end)) : [];
    if (!tags.length) throw Error('副 API 未输出完整的绘图标签，请检查捕捉标签配置');
    return tags;
}

function limitReturnedDrawings(drawings, maxTags) {
    if (drawings.length <= maxTags) return drawings;
    const selected = new Set(), anchors = new Set();
    const egg = drawings.findLast(drawing => drawing.egg);
    if (egg) {selected.add(egg);anchors.add(egg.anchor);}
    for (const drawing of drawings) {
        if (selected.size >= maxTags) break;
        if (/^P\d+$/.test(drawing.anchor) && !anchors.has(drawing.anchor)) {
            selected.add(drawing);
            anchors.add(drawing.anchor);
        }
    }
    for (const drawing of drawings) {
        if (selected.size >= maxTags) break;
        selected.add(drawing);
    }
    return drawings.filter(drawing => selected.has(drawing));
}
