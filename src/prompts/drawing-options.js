import {parseHeaderMacros} from '../resources/world-macros.js';
import {promptTemplates} from './prompt-templates.js';
import {effectiveEnabled, savedEnabled, treeText, validateTreeSettings} from './tree-settings.js';

export const drawingModules = Object.freeze({
    egg: ['egg', 'easterEgg'],
    title: ['output.subtitle', 'subtitle'],
    eggDescription: ['egg.description', 'easterEggDescription'],
    selfCheck: ['selfcheck', 'selfCheck'],
    nsfw: ['nsfw', 'nsfw'],
});
export const drawingOrientations = [['', '不指定'], ['BG', 'BG'], ['BL', 'BL'], ['GL', 'GL'], ['INTERSEX', '双性']];

export function drawingCount(value) {
    const match = /^\s*(\d+)\s*(?:[~～–—至-]\s*(\d+))?\s*$/.exec(String(value ?? ''));
    const min = Number(match?.[1]), max = Number(match?.[2] ?? match?.[1]);
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min < 1 || min > max) {
        throw Error('出图张数须为正整数或递增的范围，例如 2 或 2~3');
    }
    return {min, max, text: min === max ? String(min) : `${min}~${max}`};
}

function configuredCount(config) {
    return config?.version === 2 ? config.params?.count : config?.fixed?.张数;
}

export function drawingOptions(config) {
    let count;
    try { count = drawingCount(configuredCount(config)); }
    catch { count = drawingCount('2~3'); }
    const modules = Object.fromEntries(Object.entries(drawingModules).map(([key,[id, legacy]]) => [
        key, config?.version === 2 ? savedEnabled(config,id) : Boolean(config?.modules?.[legacy]),
    ]));
    return {count, ...modules, orientation: String(config?.orientation ?? '').toUpperCase()};
}

export function withDrawingOptions(config, values) {
    const count = drawingCount(values.count).text;
    if (!drawingOrientations.some(([value]) => value === values.orientation)) throw Error('性向特化无效');
    if (config.version === 2) {
        const enabledById = {...config.enabledById};
        for (const [key,[id]] of Object.entries(drawingModules)) enabledById[id] = Boolean(values[key]);
        return validateTreeSettings({...config, params:{...config.params,count}, enabledById, orientation:values.orientation});
    }
    const modules = {...config.modules};
    for (const [key,[,legacy]] of Object.entries(drawingModules)) modules[legacy] = Boolean(values[key]);
    return {...config, fixed:{...config.fixed,张数:count}, modules, orientation:values.orientation.toLowerCase()};
}

export function limitDrawingCount(count, max) {
    const limit = Math.min(count.max,max);
    return drawingCount(`${Math.min(count.min,limit)}~${limit}`);
}

export function drawingSpecialization(config, options) {
    if (!options.nsfw || !options.orientation) return '';
    const key = options.orientation.toLowerCase();
    if (config.version === 2) return treeText(config,`orientation.${key}`);
    const template = config.overrides?.[key] ?? promptTemplates[key]?.content ?? '';
    return parseHeaderMacros(template).find(macro=>macro.name==='性向绘画')?.value ?? '';
}

export function drawingNsfwRules(config, options) {
    if (!options.nsfw) return '';
    if (config.version === 2) return effectiveEnabled(config,'nsfw.rules') ? treeText(config,'nsfw.rules') : '';
    const template = config.overrides?.nsfw ?? promptTemplates.nsfw.content;
    return parseHeaderMacros(template).map(macro=>macro.value).join('\n');
}

export function drawingOutputRule(options) {
    const {count, egg, title, eggDescription} = options;
    return [
        `本楼全部配图共 ${count.text} 张，最多 ${count.max} 张。彩蛋计入总数。`,
        egg ? '彩蛋开启，在总数内预留一张彩蛋。' : '彩蛋关闭，不添加彩蛋。',
        title ? '小标题开启，为每张图写小标题。' : '小标题关闭，省略小标题。',
        egg && eggDescription ? '彩蛋解析开启，只为彩蛋附上一段解析。' : '彩蛋解析关闭，省略彩蛋解析。',
    ].join('\n');
}

export function sharedDrawingText(text) {
    return text.replace('正文目标张数','总出图张数')
        .replace('在本次正文图片完成后，额外构思一个小彩蛋图片','在本次出图总数内预留一个小彩蛋')
        .replace('- 正文仍须满足本轮配置的原定张数。\n- 彩蛋不计入正文的原定张数。\n- 全部输出数量为「正文图片数 + 1 张」。','- 彩蛋计入本轮出图总数。')
        .replace('画面的数量为本轮任务配置的正文图片数；如果彩蛋开启，则另外加一张。','画面的总数以本轮插件出图张数为准，包含彩蛋。')
        .replace('本次全部输出数量是否为「正文原定张数 + 1 张」？','本次全部输出张数是否符合配置，且已计入彩蛋？')
        .replace('本次输出是否满足配置的正文图片数，并在开启彩蛋时额外输出一张？','本次总出图数是否符合配置，且已计入彩蛋？')
        .replaceAll('{{getvar::张数}}+1张','{{getvar::张数}}张')
        .replaceAll('{{getvar::张数}}(+1)','{{getvar::张数}}');
}

export function worldDrawingPolicy(config) {
    const options = drawingOptions(config);
    const versionTwo = config?.version === 2;
    const title = versionTwo ? treeText(config,'output.subtitle') : '┈┈[绘画主题]┈┈';
    const description = versionTwo ? treeText(config,'egg.description') : '用 <easter_egg> 和 </easter_egg> 包住彩蛋解析。';
    const eggMarker = String((versionTwo ? config.params.eggMarker : config?.fixed?.彩蛋标签) ?? '').trim();
    return [
        drawingOutputRule(options),
        options.egg && versionTwo && sharedDrawingText(treeText(config,'egg')),
        options.title && `起始标签之前单独一行输出小标题，格式为 ${title}`,
        options.egg && eggMarker && `彩蛋 tag 前，单独一行输出 ${eggMarker}。`,
        options.egg && options.eggDescription && description,
        options.selfCheck && '出图前自检每张图的人物、姿势、构图和 tag 格式。',
        drawingNsfwRules(config,options),
        drawingSpecialization(config,options),
    ].filter(Boolean).join('\n');
}
