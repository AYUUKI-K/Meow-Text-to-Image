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

export function drawingResponse(text, capture) {
  const xml = text.trim().replace(/^```(?:xml)?\s*([\s\S]*?)\s*```$/i, '$1');
  if (!xml) return {drawings: [], errors: []};
  if (/<!DOCTYPE/i.test(xml)) throw Error('请直接返回 <drawings> XML。');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const root = doc.documentElement;
  if (root?.tagName !== 'drawings' || doc.querySelector('parsererror')) throw Error('返回须为有效的 <drawings> XML。');
  const drawings = [], errors = [];
  for (const draw of root.children) {
    const anchor = draw.getAttribute('after')?.trim().toUpperCase();
    const raw = draw.textContent.trim();
    if (draw.tagName !== 'draw' || draw.childElementCount || !raw.startsWith(capture.start) ||
        !raw.endsWith(capture.end) || raw.length <= capture.start.length + capture.end.length) {
      errors.push('有一张图的返回格式或标签边界与当前配置不一致。');
      continue;
    }
    const prompt = raw.slice(capture.start.length, -capture.end.length).trim();
    if (!prompt || prompt.includes(capture.end) || prompt.includes(capture.start) || /<\/?[a-z][^>]*>/i.test(prompt)) {
      errors.push('有一张图的 tag 不完整或包含额外标记。');
    } else {
      drawings.push({anchor, prompt, tag: capture.start + prompt + capture.end});
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

export function insertDrawingTags(body, paragraphs, drawings, endOfBody = paragraphs.at(-1)?.end) {
  const positions = new Map(paragraphs.map(({id, end}) => [id, end]));
  if (endOfBody === undefined) return {text: body, starts: new Set(), placed: 0, atEnd: 0};
  const newline = body.includes('\r\n') ? '\r\n' : '\n';
  const gap = newline.repeat(2);
  const byOffset = new Map();
  let atEnd = 0;
  for (const {anchor, tag} of drawings) {
    const position = positions.get(anchor);
    if (position === undefined) atEnd++;
    const offset = position ?? endOfBody;
    const tags = byOffset.get(offset) ?? [];
    tags.push(tag);
    byOffset.set(offset, tags);
  }
  let text = '', cursor = 0;
  const starts = new Set();
  for (const [offset, tags] of [...byOffset].sort(([a], [b]) => a - b)) {
    text += body.slice(cursor, offset);
    for (const tag of tags) {
      text += gap;
      starts.add(text.length);
      text += tag;
    }
    cursor = offset;
  }
  text += body.slice(cursor);
  return {text, starts, placed: drawings.length - atEnd, atEnd};
}

// Outbound regex runs on the entire reply. Retain offsets into the unfiltered
// message so chat saves preserve markup and text that the preset did not see.
export function numberedReply(prose, rawVisible) {
  const outgoing = paragraphsOf(prose);
  const original = paragraphsOf(rawVisible);
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
  return {
    text: outgoing.map(({id, text}) => `${text}\n[${id}]`).join('\n\n'),
    anchors: {paragraphs, end: original.at(-1)?.end},
  };
}
