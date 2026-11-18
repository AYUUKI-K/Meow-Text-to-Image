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
