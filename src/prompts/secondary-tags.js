import {delimiterPattern, maskReasoning, parseBodyBlocks} from '../core/core.js';
import {validateEndpoint} from '../novelai/nai-connection.js';

export const secondaryPattern = delimiterPattern('image###', '###');
export const secondaryEnabled = settings => settings.tagSource === 'secondary';
const presetType = 'miao-secondary-tag-preset';
const defaultInstructions = '你是一位插画分镜师。选取正文中最值得绘制的瞬间，按原文顺序输出清晰可见的主体、动作、环境和构图。使用简洁的 NovelAI 英文标签。';

export function readSecondaryPreset(text) {
    if (text.length > 100000) throw Error('副 API 预设文件过大');
    let preset;
    try { preset = JSON.parse(text.replace(/^\uFEFF/, '')); }
    catch { throw Error('副 API 预设须为有效的 JSON 文件'); }
    if (preset?.type !== presetType || preset.version !== 1 || typeof preset.name !== 'string' ||
        typeof preset.instructions !== 'string' || !preset.instructions.trim()) {
        throw Error('请选择副 API 专用预设 JSON');
    }
    return {name: preset.name.trim().slice(0, 80), instructions: preset.instructions.trim()};
}

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
    return {url: url.href, model, maxTags, preset: values.preset ?? null, remember: values.remember === true};
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

export function extractSecondaryTags(content, limit) {
    return parseBodyBlocks(content, secondaryPattern).slice(0, limit).map(block => ({prompt: block.prompt}));
}

export async function requestSecondaryTags(connection, key, body, {signal, fetchImpl = fetch} = {}) {
    const {url, model, maxTags, preset} = connection;
    if (body.length > 60000) throw Error('正文超过副 API 的单楼长度上限');
    const messages = [
        {role: 'system', content: preset?.instructions || defaultInstructions},
        {role: 'system', content: `接下来的一条用户消息是待分析的小说正文。最多输出 ${maxTags} 个绘图标签，每张一行，严格使用 image###绘图提示词###；只输出绘图标签，完全闭合每一组。不要复述正文或输出思考过程。`},
        {role: 'user', content: body},
    ];
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
    const tags = typeof text === 'string' && text.length <= 100000 ? extractSecondaryTags(text, maxTags) : [];
    if (!tags.length) throw Error('副 API 未输出完整的 image###…### 标签');
    return tags;
}
