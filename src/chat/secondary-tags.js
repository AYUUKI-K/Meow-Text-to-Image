const STORE = 'miao_nai_image_secondary_tags';

export function readSecondaryTags(message, swipe) {
    return message[STORE]?.[swipe] ?? [];
}

export function writeSecondaryTags(message, swipe, tags) {
    if (!tags.length) {
        if (message[STORE]) delete message[STORE][swipe];
        return;
    }
    (message[STORE] ??= {})[swipe] = tags;
}

export function removeSecondarySwipe(message, removed) {
    if (!message[STORE]) return;
    message[STORE] = Object.fromEntries(Object.entries(message[STORE])
        .filter(([swipe]) => Number(swipe) !== removed)
        .map(([swipe, tags]) => [Number(swipe) > removed ? Number(swipe) - 1 : Number(swipe), tags]));
}

export function secondaryBlocks(message, swipe, text, mainCount) {
    return readSecondaryTags(message, swipe).map(({prompt}, index) => ({
        prompt, raw: `image###${prompt}###`, start: text.length + index + 1,
        bodyIndex: mainCount + index, secondaryIndex: index, secondary: true,
    }));
}

export async function prepareSecondaryChat(chat, message, {includeContext, includeUser, applyRegex, clean}) {
    const earlier = chat.slice(0, chat.indexOf(message)).filter(item => !item.is_system && item.role !== 'tool');
    const depthOf = new Map(earlier.map((item, index) => [item, earlier.length - index]));
    const history = includeContext ? earlier.slice(-12) : [];
    const lastUser = includeUser ? earlier.findLast(item => item.is_user) : undefined;
    const selected = [...new Set([...history, ...(lastUser ? [lastUser] : []), message])];
    const regexed = await applyRegex(selected.map(item => ({item, depth: depthOf.get(item) ?? 0})));
    if (!Array.isArray(regexed) || regexed.length !== selected.length || regexed.some(text => typeof text !== 'string')) {
        throw Error('酒馆正则未返回有效的文本');
    }
    const text = new Map(selected.map((item, index) => [item, clean(regexed[index])]));
    return {
        body: text.get(message),
        values: {
            上下文: () => history.map(item => {
                const content = text.get(item);
                return content ? (item.is_user ? '用户：' : '角色：') + content : '';
            }).filter(Boolean).join('\n\n').slice(-12000),
            用户需求: () => (text.get(lastUser) ?? '').slice(-12000),
        },
    };
}
