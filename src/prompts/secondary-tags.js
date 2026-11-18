import {delimiterPattern, maskReasoning, parseBodyBlocks} from '../core/core.js';
import {validateEndpoint} from '../novelai/nai-connection.js';
import {replySlot} from './secondary-presets.js';
import {createSecondaryMacroExpander} from './secondary-macros.js';
import {captureMacroValues, captureTemplate, drawingResponse, resolveCapture} from '../chat/secondary-placement.js';

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

export function buildSecondaryMessages({maxTags, preset, capture = {start:'image###',end:'###'}}, body, expand) {
    if (!preset || preset.pendingImport) throw Error('请先在「预设」中导入完整的电子幽灵 JSON');
    const render = text => expand ? expand(captureTemplate(text)) : resolveCapture(captureTemplate(text),capture).replace(replySlot, () => body);
    if (preset.entries) {
        return preset.entries.filter(entry => entry.enabled && entry.content.trim())
            .map(({role, content}) => ({role, content: render(content)}))
            .filter(message => message.content.trim());
    }
    return [
        {role: 'system', content: render(preset.instructions)},
        {role: 'system', content: `接下来的一条用户消息是待分析的小说正文。最多输出 ${maxTags} 个绘图标签，每张一行，严格使用 ${capture.start}绘图提示词${capture.end}；只输出绘图标签，完全闭合每一组。不要复述正文或输出思考过程。`},
        {role: 'user', content: render(preset.bodyTemplate)},
    ];
}

export async function requestSecondaryTags(connection, key, body, {signal, fetchImpl = fetch, macros, onPrepared} = {}) {
    const {url, model, maxTags} = connection;
    if (body.length > 60000) throw Error('正文超过副 API 的单楼长度上限');
    const capture = connection.capture ?? {start: 'image###', end: '###'};
    const expand = createSecondaryMacroExpander({...macros, values: {...macros?.values, ...captureMacroValues(capture), 正文: () => body}});
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
        const {drawings, errors} = drawingResponse(text, capture);
        if (!drawings.length) throw Error(errors[0] ?? '副 API 未返回可用的 <draw> 绘图条目');
        return drawings.slice(0, maxTags);
    }
    const tags = typeof text === 'string' && text.length <= 100000 ? extractSecondaryTags(text, maxTags, delimiterPattern(capture.start,capture.end)) : [];
    if (!tags.length) throw Error('副 API 未输出完整的绘图标签，请检查捕捉标签配置');
    return tags;
}
