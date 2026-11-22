export const secondaryDataSlots = new Set(['正文', '上下文', '用户需求', '用户人设', '角色设定', '世界书触发', '角色启用列表', 'miao_image_start', 'miao_image_end', 'miao_image_specialization']);

const macro = /\{\{([^{}\r\n]*)\}\}/g;
const macroOpen = /\{\{|\{@/;
const variableName = /^[\p{L}\p{N}_-]{1,80}$/u;

function unresolvedMacro(text) {
    const name = /\{\{\s*([^{}:\s]{1,80})/.exec(text)?.[1];
    return new Error(name ? `副 API 无法展开宏「${name}」，请检查酒馆宏或同名变量` : '副 API 预设含未展开或未闭合的宏');
}

function expandLegacySetters(text, substitute) {
    let start, depth = 0, cursor = 0;
    const parts = [];
    for (const token of text.matchAll(/\{\{|\}\}/g)) {
        if (token[0] === '{{') {
            if (depth++ === 0) start = token.index;
        } else if (depth && --depth === 0) {
            const end = token.index + 2;
            const found = /^(set(?:global)?var::[^:{}]+::)([\s\S]*)$/i.exec(text.slice(start + 2, token.index));
            if (!found) continue;
            // Older Tavern extracts setter arguments with a flat regex. Expand the value first.
            const value = substitute(found[2]);
            if (typeof value !== 'string' || macroOpen.test(value)) throw unresolvedMacro(String(value ?? ''));
            parts.push(text.slice(cursor, start), substitute('{{' + found[1] + value + '}}'));
            cursor = end;
        }
    }
    return parts.join('') + text.slice(cursor);
}

export function createSecondaryMacroExpander({values = {}, substitute, readVariable = () => undefined, legacy = false}) {
    return source => {
        const template = source.replace(/\{@([^@\r\n]+)@\}/g, '{{$1}}');
        const literal = [];
        let prefix = 'MIAO_SLOT_';
        while (template.includes(prefix)) prefix += '_';
        const hold = value => {
            literal.push(String(value ?? ''));
            return `${prefix}${literal.length - 1}_END`;
        };
        let depth = 0, offset = 0;
        let text = template.replace(macro, (raw, name, index) => {
            // Direct data slots are shielding text, not arguments for a macro to execute.
            for (const token of template.slice(offset, index).matchAll(/\{\{|\}\}/g)) {
                depth = Math.max(0, depth + (token[0] === '{{' ? 1 : -1));
            }
            offset = index + raw.length;
            name = name.trim();
            if (!secondaryDataSlots.has(name) || (name === '角色启用列表' && !Object.hasOwn(values, name))) return raw;
            if (depth) throw Error(`副 API 的 {{${name}}} 请放在模板正文中，不能作为另一个宏的参数`);
            return hold(values[name]?.());
        });

        // Let the host evaluate actual Tavern syntax, including local/global writes.
        if (macroOpen.test(text) && typeof substitute !== 'function') throw Error('当前酒馆无法展开副 API 预设中的酒馆宏');
        if (legacy && macroOpen.test(text)) text = expandLegacySetters(text, substitute);
        for (let pass = 0; pass < 4 && macroOpen.test(text); pass++) {
            let next = substitute(text);
            if (typeof next !== 'string') throw Error('酒馆宏返回了无效内容');
            next = next.replace(macro, (raw, name) => {
                const key = name.trim();
                if (!variableName.test(key)) return raw;
                const value = readVariable(key);
                return value === undefined ? raw : String(value ?? '');
            });
            if (next === text) break;
            text = next;
        }
        if (macroOpen.test(text)) throw unresolvedMacro(text);
        return text.replace(new RegExp(`${prefix}(\\d+)_END`, 'g'), (token, index) => literal[index] ?? token);
    };
}
