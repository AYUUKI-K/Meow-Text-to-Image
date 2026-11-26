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
export const mainDrawingTitleRule = '把小标题写在绘图标签块内的第一行。只写标题正文，以 ✦ 等装饰符号起头，下一行写画面 tag。';

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
    const titleStyle = config?.version === 2 ? treeText(config,'output.subtitle').replace(/┈+/g,'') :
        '带装饰符号和颜文字的一行绘画标题';
    return {count, ...modules, titleStyle, orientation: String(config?.orientation ?? '').toUpperCase()};
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
    if (limit <= 0) return {min:0,max:0,text:'0'};
    const min = Math.min(count.min,limit);
    return {min,max:limit,text:min===limit?String(limit):`${min}~${limit}`};
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

export function drawingOutputRule(options, {existingEggMarker = false} = {}) {
    const {count, egg, title, eggDescription, eggDialogue = 'english'} = options;
    const dialogue = eggDialogue === 'original' ? '对白默认使用简短英文，有特殊要求时可用中文或日文。' : '对白默认使用简短英文。';
    return [
        `本轮正文图 ${count.text} 张，普通图最多 ${count.max} 张。彩蛋不占正文图名额。`,
        egg ? `彩蛋开启，${existingEggMarker?'正文已有彩蛋标记时才':''}额外生成 1 张彩蛋图。` : '本轮不生成彩蛋图。',
        egg && '漫画彩蛋可用 4koma、comic strip、comic panel，按格序写清楚动作和反应。普通插图沿用原有绘图 tag 格式。',
        egg && (eggDialogue === 'none' ? '当前生图配置省略漫画彩蛋的画面文字。' :
            `漫画彩蛋默认配一两句简短对白，纯视觉笑点可省略。加 text、speech bubble，英文再加 english text。${dialogue}在彩蛋绘图标签块末尾另起一行写 Text: 台词，台词后紧接结束标签；不同台词之间空一行。Text: 之后只写需要画出来的文字。`),
        title ? '小标题开启，为每张图写小标题。' : '小标题关闭，省略小标题。',
        egg && eggDescription ? '彩蛋解析开启，只为彩蛋附上一段解析。' : '彩蛋解析关闭，省略彩蛋解析。',
    ].filter(Boolean).join('\n');
}

export function sharedDrawingText(text) {
    return text.replace('在本轮基础配置指定的彩蛋标记后输出彩蛋；彩蛋标记必须独占一行。','只有正文已经出现彩蛋标记时，才在该标记之后输出彩蛋图。保持原有标记。');
}

export function worldDrawingPolicy(config, eggDialogue) {
    const options = drawingOptions(config);
    const versionTwo = config?.version === 2;
    const description = versionTwo ? treeText(config,'egg.description') : '用 <easter_egg> 和 </easter_egg> 包住彩蛋解析。';
    const eggMarker = String((versionTwo ? config.params.eggMarker : config?.fixed?.彩蛋标签) ?? '').trim();
    return [
        drawingOutputRule({...options,eggDialogue}),
        options.egg && versionTwo && sharedDrawingText(treeText(config,'egg')),
        options.title && `${mainDrawingTitleRule} 标题风格：${options.titleStyle}。`,
        options.egg && eggMarker && `彩蛋 tag 前，单独一行输出 ${eggMarker}。`,
        options.egg && options.eggDescription && description,
        options.selfCheck && '出图前自检每张图的人物、姿势、构图和 tag 格式。',
        drawingNsfwRules(config,options),
        drawingSpecialization(config,options),
    ].filter(Boolean).join('\n');
}
