import {delimiterPattern, maskReasoning, parseBodyBlocks} from '../core/core.js';
import {validateEndpoint} from '../novelai/nai-connection.js';
import {replySlot} from './secondary-presets.js';
import {createSecondaryMacroExpander} from './secondary-macros.js';
import {captureMacroValues, captureTemplate, drawingResponse, resolveCapture} from '../chat/secondary-placement.js';
import {drawingOutputRule} from './drawing-options.js';
import {parseHeaderMacros} from '../resources/world-macros.js';
import {hostFetch} from '../platform/host-fetch.js';
import {parseStructuredScene} from '../novelai/character-prompts.js';
import {splitImageText} from '../novelai/novelai-presets.js';

export const secondaryPattern = delimiterPattern('image###', '###');
export const secondaryEnabled = settings => settings.tagSource === 'secondary';
export const imageGenerationMode = settings => secondaryEnabled(settings) && settings.mode === 'stream' ? 'auto' : settings.mode;
export const inlineSecondaryPreset = preset => preset?.entries?.some(entry =>
    entry.enabled && entry.content.includes('<drawings>') && entry.content.includes('after=')) ?? false;

export function secondaryChatURL(value) {
    const address = String(value ?? '').trim();
    validateEndpoint(address, {label: '副 API 地址'});
    const url = new URL(address);
    if (url.hash || url.search) throw Error('副 API 地址请使用不带查询参数或片段的 API 地址');
    const path = url.pathname.replace(/\/+$/, '');
    url.pathname = !path ? '/v1/chat/completions' : path.endsWith('/v1') ? path + '/chat/completions' : path;
    return url;
}

export function secondaryConnection(values) {
    const url = secondaryChatURL(values.url);
    const model = String(values.model ?? '').trim();
    if (!model || model.length > 200) throw Error('请填写副 API 模型名');
    const maxTags = Number(values.maxTags ?? 3);
    if (!Number.isInteger(maxTags) || maxTags < 1 || maxTags > 8) throw Error('每楼图片上限须为 1～8 张');
    return {url: url.href, model, maxTags, remember: values.remember === true};
}

export async function requestSecondaryModels(chatURL, key, {fetchImpl = fetch} = {}) {
    const url = secondaryChatURL(chatURL);
    const suffix = '/chat/completions';
    if (!url.pathname.endsWith(suffix)) throw Error('当前副 API 路径无法推导模型列表地址，请手动填写模型名');
    if (!key) throw Error('请先填写副 API Key');
    url.pathname = url.pathname.slice(0, -suffix.length) + '/models';
    let result;
    try {
        result = await hostFetch(url.href, {
            method: 'GET', headers: {Authorization: 'Bearer ' + key},
            credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer',
        }, {
            timeoutMs: 12000,
            fetchImpl: async (address, options) => {
                const response = await fetchImpl(address, options);
                return {status: response.status, ok: response.ok, data: response.ok ? await response.json().catch(() => null) : null};
            },
        });
    } catch { throw Error('副 API 模型列表连接失败或超时，请检查地址、网络和跨域设置'); }
    const {status, ok, data} = result;
    if (status === 401 || status === 403) throw Error(`副 API 拒绝读取模型列表（HTTP ${status}），请检查 Key 和权限`);
    if (status === 404 || status === 405) throw Error(`副 API 未提供模型列表（HTTP ${status}），可以手动填写模型名`);
    if (!ok) throw Error(`获取副 API 模型失败（HTTP ${status}）`);
    if (!Array.isArray(data?.data)) throw Error('副 API 返回的模型列表格式无法识别，可以手动填写模型名');
    const models = new Set();
    for (const item of data.data) {
        const id = typeof item?.id === 'string' ? item.id.trim() : '';
        if (id && id.length <= 200) models.add(id);
    }
    if (!models.size) throw Error('副 API 没有返回可用的模型，请检查账号权限或手动填写模型名');
    return [...models];
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
    return parseBodyBlocks(content, pattern).slice(0, limit).map(block => ({prompt: flattenSecondaryPrompt(block.prompt)}));
}

export function flattenSecondaryPrompt(prompt) {
    if(!/(?:^|[;,；\r\n])\s*(?:Scene\s+Composition|Character\s+\d+\s+(?:Prompt|UC))\s*[:：]/i.test(prompt))return prompt;
    const {tags, text} = splitImageText(prompt);
    const {scene, characters} = parseStructuredScene(tags.replace(/\|\s*centers?\s*[:：][^;；\r\n]*/gi,''));
    const flat=characters.length ? [scene.replace(/,\s*$/, ''), ...characters.map(character=>`(${character.prompt})`)].join(', ') : scene;
    return text?`${flat}\nText: ${text}`:flat;
}

const flatTagExample = 'sfw, 1boy, 1girl, soft thick paint, medium close-up, cafe, window light, masterpiece, best quality, (1.2::Character Name(Series Name)::, offering a cup), (girlA:1.2, white hair, short hair, blue eyes, tan sweater, reaching out), looking at each other';
const fandomRule = '未绑定的著名同人或 ACGN 角色，使用世界书的 (1.2::角色英文名(作品出处)::, 本段动作或表情) 结构。姓名和作品处于同一组权重内；省略默认发色、瞳色和服装，正文明确出现换装、战损等变化时才补相应 tag。原创角色按正文写外貌，各角色单独使用带权重的括号组。';

const escapeXMLText = value => value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const drawingFormatHeading = '仅用 <drawings> 返回配图。';

function drawingExample({title=true,egg=true,eggDescription=true,eggDialogue='english',count={max:2},roleName,
    capture={start:'{{miao_image_start}}',end:'{{miao_image_end}}'}}={}){
    const draw=(attributes,heading,tags)=>[
        `  <draw ${attributes}>`,
        title && `    <title>${heading}</title>`,
        `    <tags>${escapeXMLText(capture.start+tags+capture.end)}</tags>`,
        egg&&eggDescription&&attributes==='egg="true"'&&'    <egg_description>今天的茶是胜利品。</egg_description>',
        '  </draw>',
    ].filter(Boolean).join('\n');
    const ordinary = [
        draw('after="P01" quote="推开窗户"','✦·窗边晨光·(｡•ᴗ•｡)·✦',roleName
            ? `sfw, 1girl, windowsill, morning light, (girlA:1.2, $${roleName}$, school uniform, smile, standing, opening window)`
            : 'sfw, windowsill, morning light, opening window'),
        draw('after="P03" quote="拿起茶杯"','✧·杯中茶香·(≧▽≦)·✧','sfw, teacup, holding cup, soft lighting'),
    ];
    const comic='4koma, comic strip, chibi, first panel reaching for a cup, last panel finding the cup empty';
    const eggTags=eggDialogue==='none'?comic:`${comic}, text, speech bubble, english text\nText: Where's my tea?`;
    return [
        '<drawings>',
        ...ordinary.slice(0,count.max),
        egg&&draw('egg="true"','☆·茶杯大冒险·(๑˃ᴗ˂)☆',eggTags),
        '</drawings>',
    ].filter(Boolean).join('\n');
}

// Adapt older Electronic Ghost imports at request time, leaving their stored instructions intact.
export function secondaryTagTemplate(text) {
    return removeLegacyRoleDirections(text.replace(/Scene Composition:\s*morning light, windowsill;Character 1 Prompt:\$角色名\$, looking outside\|centers:B3;/g,flatTagExample)
        .replace(/Scene Composition:\.\.\.;Character X Prompt:\.\.\.\|centers:坐标;Character X UC:\.\.\.;/g,flatTagExample)
        .replaceAll('sfw, 1boy, 1girl, close-up, warm light, (1.2::name A(series)::, dark hair, sitting), (name B:1.2, light hair, looking at another), indoor',flatTagExample)
        .replace(/^ *- 每个角色必须有坐标[^\n]*$/gm,'   - 每个角色的词放在各自的括号内，场景与角色组用逗号连接。')
        .replace(/^只返回一个 <drawings>。每张图用一个 <draw[^\n]*\n<drawings>[\s\S]*?<\/drawings>/,'仅用 <drawings> 返回配图。普通图按段尾编号落图，彩蛋使用独立条目。\n'+drawingExample())
        .replace(/^示例只说明字段。[^\n]*/m,'示例只说明字段。实际张数、小标题、彩蛋和解析以本轮插件设置为准。开启小标题时，每张图都必须返回各自的 title。')
        .replace(/3\.你需要思考:如果角色是著名ACGN角色[^\n]*/,'3. '+fandomRule)
        .replace('- 原创作画：每张图片都是独一无二的，必须完整、逐字逐句地以“角色DNA“描述角色','- 原创角色按正文写可见的发型、瞳色、身形和衣着。著名角色和已绑定角色按各自规则写。')
        .replace('* 根据正文分别描写出镜角色的外貌，并补充当下的动作和表情。','* 按本轮角色规则写各角色的身份组，并补充当下的动作和表情。')
        .replace('-   当主体超过一人时，必须使用 **大括号 `{}`** 将每个角色的描述独立包裹。','- 多人出镜时，每个角色的描述用圆括号分别包裹。')
        .replace('-   **格式**: `{角色1全套描述}, {角色2全套描述}, ...`','- 格式：(角色1的 tag), (角色2的 tag)')
        .replace('- if: 原创角色 → 使用 girl / boy + 详细外貌tag(发色+发型+瞳色+眼型+特征等)','- 未绑定的原创角色使用 girl / boy 及各自的外貌 tag。')
        .replace('- 包裹必须包含详细的：(外貌 + 性别 + 服装 + 表情 + 动作)','- 角色组包含本轮规定的身份写法，并补充当前表情、动作与可见状态。只为未绑定的原创角色填写完整外貌。')
        .replace('主角：详细描述所有细节','主角：遵从本轮身份规则。已绑定角色保留调用记号，并补充本段的动作与表情。')
        .replace('- 每个角色必须加权重','- 人物组可按需加权。已绑定人物的调用记号原样保留。')
        .replace('你必须在思考阶段明确列出{{miao_image_count}}张个有效的段尾编号，否则视为任务失败。','从有编号的段落中按本轮数量 {{miao_image_count}} 选出相应的有效段尾编号。')
        .replace('每个插入点需明确：动作、构图、坐标','每个插入点须有本段发生的动作、构图和原文短语；不得借用末段情节。')
        .replace(/- 数量：每张图片Tag≥Tag≥90个个（逗号分隔计数）\n[^\n]*/,'- 围绕本段可见画面选择有效 tag，保留有用的构图、光影、动作和角色区别。')
        .replace(/8\. \*\*UC动态排除项检查\*\*：[\s\S]*?(?=9\. \*\*)/,'8. 检查画面可见范围，省略与本段无关的细节。\n\n')
        .replace(/9\. \*\*防吞噬检查\*\*：[\s\S]*?(?=10\. \*\*)/,'9. 核对每张图的标签边界。仅返回配图 XML。\n\n')
        .replace('## 1.Scene Composition','## 1.公共场景词')
        .replace('## 2.Character Prompt','## 2.人物括号组')
        .replace('<title>窗边晨光</title>','<title>✦·窗边晨光·(｡•ᴗ•｡)·✦</title>')
        .replace('一个角色仅可用1个Character X槽位，严禁合并','一个角色仅使用独立的一组括号，严禁合并')
        .replace('且必须分别输出 Character 1~Character 4','且每个角色分别使用自己的括号组')
        .replace('总张数按插件设置的 {{miao_image_count}} 执行，彩蛋占其中一张','正文图按插件设置的 {{miao_image_count}} 执行，彩蛋独立加一张')
        .replace('本次全部出图数量为 {{miao_image_count}} 张，彩蛋计入其中','本次正文图为 {{miao_image_count}} 张，彩蛋额外生成一张')
        .replace('如启用了彩蛋，使用最后一段的编号作为落图位置。','彩蛋使用 egg="true"，插件跟随正文已有彩蛋位置放置。'));
}

function removeLegacyRoleDirections(text) {
    return text
        .replace(/<绑定角色>\s*\{\{角色启用列表\}\}\s*<\/绑定角色>\s*/g,'')
        .replaceAll('2. 画面出现已绑定角色时，使用 $角色名$ 调用其外貌 tag。','2. 按正文为每位出镜角色写对应的外貌、动作和表情。')
        .replaceAll('**第二层：角色调用**','**第二层：角色描述**')
        .replaceAll('画面有已绑定角色时，在对应角色的提示词中写 $角色名$。其余角色可根据正文描述外貌，按需要补充动作和表情。','根据正文分别描写出镜角色的外貌，并补充当下的动作和表情。')
        .replace(/^.*\{\$xiao ya.*$/gm,'- 示例：(white hair, school uniform, closed eyes), (dark hair, suit, looking at another)')
        .replaceAll('绑定角色的提示词保留 $角色名$，由插件在发给 NAI 前展开。','')
        .replaceAll('出镜的绑定角色必须在该角色的提示词中写 $角色名$，保留名字原样。保持 $角色名$ 到返回结果。插件会在发送给 NAI 前把它替换成对应的固定 tag。','')
        .replaceAll('绑定角色用 $角色名$，动作、表情、姿势可单独加 tag。','每位角色的动作、表情、姿势分别写入各自的括号组。')
        .replace(/^.*- 出镜的已绑定角色使用对应的 \$角色名\$[ \t]*$/gm,'')
        .replace(/^.*- 画面中的绑定角色在其对应提示词内用 \$角色名\$ 调用。[ \t]*$/gm,'')
        .replaceAll('已绑定角色出镜时，使用 $角色名$。','');
}

function sharedTemplate(text, options) {
    if (!options) return text;
    const source = secondaryTagTemplate(text).replace(/\{@([^@\r\n]+)@\}/g,'{{$1}}');
    const names = new Set(['张数','生图数量','彩蛋数量','小标题','彩蛋解析','性向绘画',
        '文生图NSFW1','文生图NSFW2','文生图NSFW3','文生图NSFW4']);
    if (!options.egg) for (const name of ['彩蛋','彩蛋自检','彩蛋要求']) names.add(name);
    if (!options.selfCheck) for (const name of ['自检','自检1','自检2','自检3']) names.add(name);
    let patched = source;
    for (const macro of parseHeaderMacros(source).reverse()) {
        if (names.has(macro.name.trim())) patched = patched.slice(0,macro.start)+patched.slice(macro.end);
    }
    return patched
        .replace(/\{\{get(?:global)?var::\s*(?:张数|生图数量)\s*\}\}\s*\+\s*1(?=\s*张)/g,options.count.text+(options.egg?' + 1':''))
        .replace(/\{\{get(?:global)?var::\s*([^{}\r\n]+?)\s*\}\}/g,(raw, name) => {
            if (name === '张数'||name === '生图数量') return options.count.text;
            return names.has(name) ? '' : raw;
        })
        .replace(/\{\{\s*miao_image_count\s*\}\}/g,options.count.text);
}

function secondaryOutputRule(options, inline, capture, {specializationInPreset = false, roleText = '', roleSlot = false} = {}) {
    const rule = [drawingOutputRule(options),'插图尽量分布在不同段落。',
        '每张图使用一段逗号分隔的 NovelAI tag。公共场景词在前，每个角色的特征和动作各放进一组括号，最后接共享动作或氛围。保留有效权重。省略字段名、独立负面词、坐标和分号分栏。',
        '公共场景词依次写 sfw 或 nsfw、画面人数、质感、构图、地点、时间与光影。角色组分别写本段可见的状态、表情、视线和动作。多人互动可在对应的角色组内成对使用 source#、target#，相互动作使用 mutual#。',
        `格式示例：${flatTagExample}`,fandomRule];
    if (roleText) {
        const bindings = roleText.split('\n').map(line => line.replace(/^(.+?) = /, (_, name) => `$${name}$ = `));
        rule.push('当前存档的固定特征对照表。等号右侧是左侧调用记号已经代表的完整特征，只供辨认和避免重复。最终绘图 tag 只抄左侧记号。\n'+bindings.join('\n'));
        rule.push('逐张核对出镜人物。每位在绑定表中且确实出镜的角色都必须在自己的括号组里写一次 $角色名$，照抄对照表左侧的实际名字和两个 $。角色组按 (girlA:1.2, $角色名$, school uniform, smile, standing) 排列。权重放在人物标识上，记号保持原样。');
        rule.push('绑定角色组在调用记号之后只补本段可见的服饰、表情和动作。发色、瞳色、发型、身材等固定特征由记号负责。即使正文、User 人设、Char 角色卡或世界书也写了这些外观，也不要在同一角色组里另写一次。');
        rule.push('未出镜角色省略。其他出镜角色由你根据正文和人物资料直接写英文外貌和动作 tag。提交前逐张检查，确保每个绑定角色的固定特征只以调用记号出现。');
        if(roleSlot)rule.push('自定义预设里的角色固定 tag 同样作为参考，输出时使用对照表左侧的调用记号。');
    } else rule.push('每个出镜角色都由你根据正文直接写英文外貌和动作 tag。');
    if (options.selfCheck) rule.push('返回前检查位置编号、张数、角色描述和标签边界。');
    if (options.nsfwRules) rule.push(options.nsfwRules);
    if (options.specialization&&!specializationInPreset) rule.push(options.specialization);
    if (inline) {
        rule.push(`最终回复只包含一个 <drawings> XML。每张图用一个 <draw>。正文图用 after 指定真实的段尾编号，再用 quote 原样摘录同段短语。每个条目的 <tags> 仅包含一组 ${escapeXMLText(capture.start)}tag${escapeXMLText(capture.end)}；出镜绑定角色的调用记号属于这组 tag 的人物特征字段。省略 Markdown 围栏和说明文字。`);
        rule.push('先从开头到结尾挑选不同剧情节点，再给每个节点写画面；有足够段落时覆盖至少一个前半段情节。每张图只能描绘其编号段落里的场景，按段号顺序输出；普通图不可共用段号或集中选最后几段。');
        rule.push('普通图只能放在正文段落，避开 meowfm 彩蛋区。不要复述正文，也不要返回 meowfm 标记。');
        if (options.title) rule.push(`每张正文图和彩蛋图的 <draw> 内都必须有一个非空的 <title>，写在 <tags> 前。由你根据这张图创作标题、装饰符号和颜文字。标题风格：${options.titleStyle}。在 <title> 中只写标题内容，省略世界书的 ┈┈ 边框。返回前逐张检查标题。`);
        if (options.egg) rule.push('正文已有彩蛋位置。仅一张彩蛋图使用 egg="true"，插件会将它放到原有彩蛋标记之后。');
        else rule.push('本楼不输出彩蛋条目。');
        if (options.egg && options.eggDescription) rule.push('彩蛋的 <draw> 用 <egg_description> 返回解析，其他插图不加。');
        rule.push('XML 文本中的 & 和尖括号按 XML 规则转义。');
    }
    return rule.join('\n');
}

export function buildSecondaryMessages({maxTags, preset, output, roleText = '', capture = {start:'image###',end:'###'}}, body, expand) {
    if (!preset) throw Error('副 API 预设无效');
    const renderText = text => expand ? expand(text) : resolveCapture(text,capture).replace(replySlot, () => body);
    const render = source => {
        const text = captureTemplate(sharedTemplate(source,output));
        const example = output && text.startsWith(drawingFormatHeading) && /\n<drawings>[\s\S]*?<\/drawings>/.exec(text);
        if (!example) return renderText(text);
        // Insert saved role names after expanding Tavern macros, keeping the names literal.
        const roleName = roleText.split(' = ',1)[0];
        return renderText(text.slice(0,example.index))+ '\n'+drawingExample({...output,roleName,capture})+
            renderText(text.slice(example.index+example[0].length));
    };
    if (preset.entries) {
        const messages = preset.entries.filter(entry => entry.enabled && entry.content.trim() &&
            (entry.content.includes(replySlot) ||
                (entry.name !== '彩蛋' || output?.egg !== false) && (entry.name !== '绘画自检' || output?.selfCheck !== false)))
            .map(({role, content}) => ({role, content: render(content)}))
            .filter(message => message.content.trim());
        if (output) {
            const hasSpecializationSlot=preset.entries.some(entry=>entry.enabled&&entry.content.includes('{{miao_image_specialization}}'));
            const roleSlot=preset.entries.some(entry=>entry.enabled&&/\{\{\s*角色启用列表\s*\}\}/.test(removeLegacyRoleDirections(entry.content)));
            const rule = secondaryOutputRule(output,inlineSecondaryPreset(preset),capture,{specializationInPreset:hasSpecializationSlot,roleText,roleSlot});
            const lastSystem = messages.findLast(message => message.role === 'system');
            if (lastSystem) lastSystem.content += '\n\n' + rule;
            else messages.unshift({role:'system',content:rule});
        }
        return messages;
    }
    return [
        {role: 'system', content: render(preset.instructions)},
        {role: 'system', content: `接下来的一条用户消息是待分析的小说正文。最多输出 ${maxTags} 个绘图标签，每张一行，严格使用 ${capture.start}绘图提示词${capture.end}；只输出绘图标签，完全闭合每一组。不要复述正文或输出思考过程。${output?'\n'+secondaryOutputRule(output,false,capture,{roleText,roleSlot:/\{\{\s*角色启用列表\s*\}\}/.test(preset.instructions+'\n'+preset.bodyTemplate)}):''}`},
        {role: 'user', content: render(preset.bodyTemplate)},
    ];
}

export async function requestSecondaryTags(connection, key, body, {signal, fetchImpl = fetch, macros, roleTags, onPrepared} = {}) {
    const {url, model, maxTags} = connection;
    if (body.length > 60000) throw Error('正文超过副 API 的单楼长度上限');
    const capture = connection.capture ?? {start: 'image###', end: '###'};
    const roleText=roleTags?[...roleTags].map(([name,tags])=>`${name} = ${tags}`).join('\n'):'';
    const expand = createSecondaryMacroExpander({...macros, values: {...macros?.values,
        ...(roleTags?{角色启用列表:()=>roleText}:{}), ...captureMacroValues(capture), 正文: () => body,
        miao_image_specialization:()=>connection.output?.specialization??''}});
    const messages = buildSecondaryMessages({...connection,roleText}, body, expand);
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
        const {drawings, errors} = drawingResponse(maskReasoning(text), capture, connection.output);
        if (!drawings.length) throw Error(errors[0] ?? '副 API 未返回可用的 <draw> 绘图条目');
        const egg = drawings.findLast(drawing=>drawing.egg);
        return drawings.filter(drawing=>!drawing.egg||drawing===egg).map(drawing=>{
            const prompt=flattenSecondaryPrompt(drawing.prompt);
            return {...drawing,prompt,tag:capture.start+prompt+capture.end};
        });
    }
    const tags = typeof text === 'string' && text.length <= 100000 ? extractSecondaryTags(text, maxTags, delimiterPattern(capture.start,capture.end)) : [];
    if (!tags.length) throw Error('副 API 未输出完整的绘图标签，请检查捕捉标签配置');
    return tags;
}
