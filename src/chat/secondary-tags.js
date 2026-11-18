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

export function secondaryHistory(chat, message, clean) {
    const earlier = chat.slice(0, chat.indexOf(message)).filter(item => !item.is_system);
    return {
        上下文: () => earlier.slice(-12).map(item => {
            const content = clean(item.mes);
            return content ? (item.is_user ? '用户：' : '角色：') + content : '';
        }).filter(Boolean).join('\n\n').slice(-12000),
        用户需求: () => clean(earlier.findLast(item => item.is_user)?.mes).slice(-12000),
    };
}
