const gridCenters = [0.1, 0.3, 0.5, 0.7, 0.9];

export function parseStructuredScene(text) {
    // Field names delimit sections; commas and semicolons inside captions stay intact.
    const fields = [...text.matchAll(/(?:^|[;,；\r\n])\s*(?:(Scene\s+Composition)|Character\s+(\d+)\s+(Prompt|UC))\s*[:：]/gi)];
    if (!fields.some(field => field[2] || field.index === 0)) return {scene: text, characters: []};

    let scene = text.slice(0, fields[0].index).trim();
    const characters = new Map();
    for (const [index, field] of fields.entries()) {
        const end = fields[index + 1]?.index ?? text.length;
        const value = text.slice(field.index + field[0].length, end).replace(/[;；\s]+$/, '').trimStart();
        if (field[1]) {
            if (index !== 0 || scene) throw Error('场景构图只能写在提示词开头');
            scene = value;
            continue;
        }

        const number = Number(field[2]);
        if (!Number.isSafeInteger(number) || number < 1) throw Error('角色编号必须为正整数');
        const key = field[3].toLowerCase() === 'uc' ? 'uc' : 'prompt';
        const character = characters.get(number) ?? {};
        if (Object.hasOwn(character, key)) throw Error(`角色 ${number} 的${key === 'uc' ? '负面' : '正面'}提示词重复`);
        character[key] = value;
        characters.set(number, character);
    }
    if (!scene) throw Error('请填写场景构图');

    const orderedCharacters = [...characters].sort(([left], [right]) => left - right).map(([number, character]) => {
        const match = character.prompt?.match(/\|\s*centers?\s*[:：]\s*(.*)$/is);
        const prompt = (match ? character.prompt.slice(0, match.index) : character.prompt)?.trim();
        if (!prompt) throw Error(`角色 ${number} 缺少正面提示词`);
        const result = {prompt, uc: character.uc ?? ''};
        if (match) {
            const coordinate = /^([A-E])([1-5])$/i.exec(match[1].trim());
            if (!coordinate) throw Error(`角色 ${number} 的坐标须为 A1 到 E5`);
            result.center = {x: gridCenters[coordinate[1].toUpperCase().charCodeAt(0) - 65], y: gridCenters[Number(coordinate[2]) - 1]};
        }
        return result;
    });
    return {scene, characters: orderedCharacters};
}

export function characterParameters(request) {
    const characters = request.characters ?? [];
    const useCoords = characters.some(character => character.center);
    const characterPrompts = characters.map(({prompt, uc, center}) => ({prompt, uc, center: center ?? {x: 0.5, y: 0.5}}));
    const captions = (base, key) => ({
        base_caption: base,
        char_captions: characterPrompts.map(character => ({char_caption: character[key], centers: [character.center]})),
    });
    return {
        use_coords: useCoords,
        characterPrompts,
        v4_prompt: {caption: captions(request.prompt, 'prompt'), use_coords: useCoords, use_order: true},
        v4_negative_prompt: {caption: captions(request.negative_prompt, 'uc')},
    };
}
