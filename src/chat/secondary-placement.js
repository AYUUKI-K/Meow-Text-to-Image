const captureMacros = /\{\{miao_image_(start|end)\}\}/g;

export function captureMacroValues(capture) {
  return {miao_image_start: () => capture.start, miao_image_end: () => capture.end};
}

export function resolveCapture(text, capture) {
  return text.replace(captureMacros, (_, part) => capture[part]);
}

export function captureTemplate(text) {
  const wrapped = prompt => '{{miao_image_start}}' + prompt + '{{miao_image_end}}';
  return text.replace(/image###((?:(?!image###)[^\r\n])*?)###/g, (_, prompt) => wrapped(prompt))
    .replace(/(^|\r?\n)([ \t]*)image###([ \t]*\r?\n(?:(?!image###)[\s\S])*?)###(?=[ \t]*(?:\r?\n|$))/g,
      (_, newline, indent, prompt) => newline + indent + wrapped(prompt))
    .replace(/image###/g, '{{miao_image_start}}');
}

export function paragraphsOf(body) {
  const blocks = /\r?\n[ \t]*\r?\n/.test(body) ? /\r?\n(?:[ \t]*\r?\n)+/g : /\r?\n/g;
  const paragraphs = [];
  let from = 0;
  function add(until) {
    const chunk = body.slice(from, until).trimEnd();
    const text = chunk.trimStart();
    if (text) paragraphs.push({id: 'P' + String(paragraphs.length + 1).padStart(2, '0'), text, end: from + chunk.length});
  }
  for (const separator of body.matchAll(blocks)) {
    add(separator.index);
    from = separator.index + separator[0].length;
  }
  add(body.length);
  return paragraphs;
}

export function eggBoundary(body, marker = '') {
  const xml = /<(meow_?fm)\b(?:\s[^<>]*?)?\s*(?:\/>|>[\s\S]*?<\/\1\s*>)/i.exec(body)
    ?? /<\/meow_?fm\s*>/i.exec(body);
  if (xml) return {start: xml.index, end: xml.index + xml[0].length};
  let offset = 0;
  for (const line of body.split('\n')) {
    if (marker && line.trim() === marker) return {start: offset, end: offset + line.trimEnd().length};
    offset += line.length + 1;
  }
}

export function roleList(text) {
  const roles = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = line.match(/^\s*([^=$￥\r\n]+?)\s*=\s*(\S.*?)\s*$/);
    if (!match) throw Error('角色绑定请每行填写「角色名 = tag」。');
    const [, name, raw] = match;
    const tags = raw.replace(/[,，\s]+$/, '');
    if (!tags || roles.has(name)) throw Error(`请检查「${name}」的 tag 或重复绑定。`);
    roles.set(name, tags);
  }
  return roles;
}

const escapeDecoration = text => text.replace(/[&<>]/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;'}[char]));

export function drawingResponse(text, capture, options) {
  const xml = text.trim().replace(/^```(?:xml)?\s*([\s\S]*?)\s*```$/i, '$1');
  if (!xml) return {drawings: [], errors: []};
  if (/<!DOCTYPE/i.test(xml)) throw Error('请直接返回 <drawings> XML。');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const root = doc.documentElement;
  if (root?.tagName !== 'drawings' || doc.querySelector('parsererror')) throw Error('返回须为有效的 <drawings> XML。');
  const drawings = [], errors = [];
  for (const draw of root.children) {
    const rawAnchor = draw.getAttribute('after')?.trim().toUpperCase();
    const number = /^\[?P(\d{1,6})\]?$/.exec(rawAnchor ?? '');
    const anchor = number ? 'P' + String(Number(number[1])).padStart(2, '0') : rawAnchor;
    const fields = new Map([...draw.children].map(child => [child.tagName,child]));
    const plain = fields.size === 0;
    const raw = (plain ? draw.textContent : fields.get('tags')?.textContent ?? '').trim();
    const invalidFields = fields.size !== draw.childElementCount ||
      [...fields].some(([name, child]) => !['tags','title','egg_description'].includes(name) || child.childElementCount);
    if (draw.tagName !== 'draw' || invalidFields || !raw.startsWith(capture.start) ||
        !raw.endsWith(capture.end) || raw.length <= capture.start.length + capture.end.length) {
      errors.push('有一张图的返回格式或标签边界与当前配置不一致。');
      continue;
    }
    const prompt = raw.slice(capture.start.length, -capture.end.length).trim();
    if (!prompt || prompt.includes(capture.end) || prompt.includes(capture.start) || /<\/?[a-z][^>]*>/i.test(prompt)) {
      errors.push('有一张图的 tag 不完整或包含额外标记。');
    } else {
      const drawing = {anchor, prompt, tag: capture.start + prompt + capture.end};
      const title = fields.get('title')?.textContent.trim().replace(/[\r\n]+/g,' ').replace(/^┈{2,}|┈{2,}$/g,'').trim();
      if (options?.title && title) drawing.title = escapeDecoration(title);
      if (draw.getAttribute('egg') === 'true') {
        if (!options?.egg) continue;
        drawing.egg = true;
        const description = fields.get('egg_description')?.textContent.trim();
        if (options.eggDescription && description) drawing.eggDescription = escapeDecoration(description);
      }
      drawings.push(drawing);
    }
  }
  return {drawings, errors};
}

export function expandRoleTags(prompt, roles) {
  return prompt.replace(/\$([^$￥\r\n]+)[$￥]/g, (_, name) => {
    if (!roles.has(name)) throw Error(`当前存档未绑定「${name}」。`);
    return roles.get(name);
  });
}

export function insertDrawingTags(body, paragraphs, drawings, endOfBody = paragraphs.at(-1)?.end, egg, available = paragraphs.map(({end}) => end)) {
  const positions = new Map(paragraphs.map(({id, end}) => [id, end]));
  const newline = body.includes('\r\n') ? '\r\n' : '\n';
  const gap = newline.repeat(2);
  const byOffset = new Map();
  let atEnd = 0;
  const ordinary = drawings.filter(drawing => !drawing.egg);
  const reserved = new Set(), assigned = new Map();
  for (const drawing of ordinary) {
    const offset = positions.get(drawing.anchor);
    if (offset === undefined || reserved.has(offset)) continue;
    assigned.set(drawing, offset);
    reserved.add(offset);
  }
  for (const drawing of ordinary) {
    if (assigned.has(drawing)) continue;
    const free = available.filter(offset => !reserved.has(offset));
    const candidates = free.length ? free : available;
    const target = positions.get(drawing.anchor) ?? (ordinary.length === 1 ? endOfBody :
      available[Math.round(ordinary.indexOf(drawing) * (available.length - 1) / (ordinary.length - 1))]);
    const offset = candidates.reduce((nearest, candidate) =>
      nearest === undefined || Math.abs(target - candidate) < Math.abs(target - nearest) ? candidate : nearest, undefined);
    if (offset === undefined && endOfBody === undefined) continue;
    assigned.set(drawing, offset ?? endOfBody);
    reserved.add(offset ?? endOfBody);
    if ((offset ?? endOfBody) === endOfBody) atEnd++;
  }
  const bonus = drawings.findLast(drawing => drawing.egg);
  if (bonus && egg) assigned.set(bonus, egg.end);
  for (const [drawing, offset] of assigned) {
    const tags = byOffset.get(offset) ?? [];
    tags.push(drawing);
    byOffset.set(offset, tags);
  }
  let text = '', cursor = 0;
  const starts = new Set();
  const eggStarts = new Set();
  for (const [offset, tags] of [...byOffset].sort(([a], [b]) => a - b)) {
    text += body.slice(cursor, offset);
    for (const {tag, title, egg, eggDescription} of tags) {
      text += gap;
      if (title) text += '┈┈' + title + '┈┈' + gap;
      starts.add(text.length);
      if (egg) eggStarts.add(text.length);
      text += tag;
      if (eggDescription) {
        text += gap + '<easter_egg>' + newline + eggDescription.replace(/\r?\n/g,'<br>') + newline + '</easter_egg>';
      }
    }
    if (!/^[ \t]*(?:\r?\n|$)/.test(body.slice(offset))) text += gap;
    cursor = offset;
  }
  text += body.slice(cursor);
  return {text, starts, eggStarts, placed: starts.size - atEnd, atEnd};
}

// Outbound regex runs on the entire reply. Retain offsets into the unfiltered
// message so chat saves preserve markup and text that the preset did not see.
export function numberedReply(prose, rawVisible, marker) {
  const egg = eggBoundary(rawVisible, marker);
  const filteredEgg = eggBoundary(prose, marker);
  const outgoing = paragraphsOf(prose.slice(0, filteredEgg?.start));
  const original = paragraphsOf(rawVisible.slice(0, egg?.start));
  const normalize = value => value.replace(/\s+/g, ' ').trim();
  const byText = new Map();
  const frequencies = new Map();
  for (const {text, end} of original) {
    const key = normalize(text);
    byText.set(key, byText.has(key) ? null : end);
  }
  for (const {text} of outgoing) {
    const key = normalize(text);
    frequencies.set(key, (frequencies.get(key) ?? 0) + 1);
  }
  const inOrder = outgoing.length === original.length && outgoing.every(({text}, index) => {
    const exact = byText.get(normalize(text));
    return exact == null || exact === original[index].end;
  });
  const paragraphs = outgoing.flatMap(({id, text}, index) => {
    const key = normalize(text);
    const end = inOrder ? original[index].end : frequencies.get(key) === 1 ? byText.get(key) : null;
    return end == null ? [] : [{id, end}];
  });
  const numbered = outgoing.map(({id, text}) => `${text}\n[${id}]`).join('\n\n');
  const eggText = filteredEgg ? prose.slice(filteredEgg.start) : '';
  return {
    text: [numbered, eggText].filter(Boolean).join('\n\n'),
    anchors: {paragraphs, end: original.at(-1)?.end, egg, available: original.map(({end}) => end)},
  };
}
