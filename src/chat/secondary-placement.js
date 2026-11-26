import {splitImageText} from '../novelai/novelai-presets.js';
import {cleanDrawingTitle} from '../core/core.js';

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
  const paragraphs = [];
  let from = 0;
  function add(until) {
    const chunk = body.slice(from, until).trimEnd();
    const text = chunk.trimStart();
    if (text) paragraphs.push({id: 'P' + String(paragraphs.length + 1).padStart(2, '0'), text, end: from + chunk.length});
  }
  // Handle both hard-broken chat prose and paragraphs already wrapped in HTML.
  for (const separator of body.matchAll(/(<p(?:\s[^<>]*?)?>[\s\S]*?<\/p\s*>)|\r?\n/gi)) {
    const start = separator.index;
    add(start);
    from = start;
    const end = start + separator[0].length;
    if (separator[1]) add(end);
    from = end;
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
const normalizeParagraph = text => text.replace(/<\/?(?:p|em|strong|b|i|span)\b[^>]*>/gi, '').replace(/\s+/g, ' ').trim();

export function drawingResponse(text, capture, options) {
  if (!text.trim()) return {drawings: [], errors: []};
  if (/<!DOCTYPE/i.test(text)) throw Error('请直接返回 <drawings> XML。');
  const sections = [...text.matchAll(/<drawings(?:\s[^<>]*)?>[\s\S]*?<\/drawings\s*>/g)];
  if(sections.length!==1)throw Error('副 API 须返回一组完整的 <drawings>。');
  const xml=sections[0][0].replace(/<!\[CDATA\[[\s\S]*?\]\]>|&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g,
    value=>value==='&'?'&amp;':value);
  const parser = new DOMParser();
  let doc = parser.parseFromString(xml, 'application/xml');
  if(doc.querySelector('parsererror')){
    const repaired=xml.replace(/<title\b[^<>]*>([\s\S]*?)(<\/title\s*>|(?=<(?:tags|egg_description)\b|<\/draw\s*>))|<\/title\s*>/gi,
      (match,content,end)=>end&&!/[<>]/.test(content)?match:'');
    doc=parser.parseFromString(repaired,'application/xml');
  }
  const root = doc.documentElement;
  if (root?.tagName !== 'drawings' || doc.querySelector('parsererror')) throw Error('返回须为有效的 <drawings> XML。');
  const drawings = [], errors = [];
  for (const draw of root.children) {
    const rawAnchor = draw.getAttribute('after')?.trim().toUpperCase();
    const number = /^\[?P(\d{1,6})\]?$/.exec(rawAnchor ?? '');
    const anchor = number ? 'P' + String(Number(number[1])).padStart(2, '0') : rawAnchor;
    const fields = new Map([...draw.children].map(child => [child.tagName,child]));
    const plain = fields.size === 0;
    let raw = (plain ? draw.textContent : fields.get('tags')?.textContent ?? '').trim();
    const prefix = raw.startsWith(capture.start) ? null : /^┈{2,}([^\r\n]+?)┈{2,}\s*/.exec(raw);
    if (prefix) raw = raw.slice(prefix[0].length);
    const wrapped = raw.startsWith(capture.start) && raw.endsWith(capture.end);
    const prompt = wrapped ? raw.slice(capture.start.length,-capture.end.length).trim() : fields.has('tags') ? raw : '';
    const substantive = [...draw.children].filter(child=>child.tagName!=='title');
    const invalidFields = new Set(substantive.map(child=>child.tagName)).size !== substantive.length ||
      substantive.some(child => !['tags','egg_description'].includes(child.tagName) || child.childElementCount);
    if (draw.tagName !== 'draw' || invalidFields || !prompt) {
      errors.push('有一张图的返回格式或标签边界与当前配置不一致。');
      continue;
    }
    if (prompt.includes(capture.end) || prompt.includes(capture.start) || /<\/?[a-z][^>]*>/i.test(prompt)) {
      errors.push('有一张图的 tag 不完整或包含额外标记。');
    } else {
      const quote = draw.getAttribute('quote');
      const egg = draw.getAttribute('egg') === 'true';
      if (egg && !options?.egg) continue;
      const drawing = {anchor, prompt, tag: capture.start + prompt + capture.end};
      if (quote) drawing.quote = quote;
      const title = cleanDrawingTitle(fields.get('title')?.textContent.trim() || prefix?.[1] || '');
      if (options?.title && title) drawing.title = title;
      if (egg) {
        const {tags, text} = splitImageText(prompt);
        const dialogue = text.replace(/(?:\r?\n[ \t]*)+text:(?!:)[ \t]*/gi, '\n\n');
        if (dialogue !== text) {
          drawing.prompt = `${tags}\nText: ${dialogue}`;
          drawing.tag = capture.start + drawing.prompt + capture.end;
        }
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
  const {tags, text} = splitImageText(prompt);
  const expanded = tags.replace(/\$([^$￥\r\n]+)[$￥]/g, (_, name) => {
    if (!roles.has(name)) throw Error(`当前存档未绑定「${name}」。`);
    return roles.get(name);
  });
  return text?`${expanded}\nText: ${text}`:expanded;
}

export function insertDrawingTags(body, paragraphs, drawings, egg, maxOrdinary = Infinity) {
  const positions = new Map(paragraphs.map(paragraph => [paragraph.id, paragraph]));
  const newline = body.includes('\r\n') ? '\r\n' : '\n';
  const gap = newline.repeat(2);
  const byOffset = new Map();
  const ordinary = drawings.filter(drawing => !drawing.egg);
  const reserved = new Set(), assigned = new Map();
  const unplacedDrawings = [];
  let unplaced = 0;
  for (const drawing of ordinary) {
    if (assigned.size >= maxOrdinary) break;
    const quote = normalizeParagraph(drawing.quote ?? '');
    const byNumber = positions.get(drawing.anchor);
    const matches = quote.length >= 4 && (!byNumber || !normalizeParagraph(byNumber.text ?? '').includes(quote))
      ? paragraphs.filter(paragraph => normalizeParagraph(paragraph.text ?? '').includes(quote)) : [];
    const offset = (matches.length === 1 ? matches[0] : byNumber)?.end;
    if (offset === undefined || reserved.has(offset)) {
      unplaced++;
      if(offset===undefined)unplacedDrawings.push(drawing);
      continue;
    }
    assigned.set(drawing, offset);
    reserved.add(offset);
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
    for (const {tag, egg, eggDescription} of tags) {
      text += gap;
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
  return {text, starts, eggStarts, unplaced, unplacedDrawings,
    missingTitles: [...assigned.keys()].filter(drawing => !drawing.title).length};
}

// Outbound regex runs on the entire reply. Retain offsets into the unfiltered
// message so chat saves preserve markup and text that the preset did not see.
export function numberedReply(prose, rawVisible, marker) {
  const egg = eggBoundary(rawVisible, marker);
  const filteredEgg = eggBoundary(prose, marker);
  const outgoing = paragraphsOf(prose.slice(0, filteredEgg?.start));
  const original = paragraphsOf(rawVisible.slice(0, egg?.start));
  const byText = new Map();
  const frequencies = new Map();
  for (const {text, end} of original) {
    const key = normalizeParagraph(text);
    byText.set(key, byText.has(key) ? null : end);
  }
  for (const {text} of outgoing) {
    const key = normalizeParagraph(text);
    frequencies.set(key, (frequencies.get(key) ?? 0) + 1);
  }
  const inOrder = outgoing.length === original.length && outgoing.every(({text}, index) => {
    const exact = byText.get(normalizeParagraph(text));
    return exact == null || exact === original[index].end;
  });
  const paragraphs = outgoing.flatMap(({id, text}, index) => {
    const key = normalizeParagraph(text);
    const end = inOrder ? original[index].end : frequencies.get(key) === 1 ? byText.get(key) : null;
    return end == null ? [] : [{id, text, end}];
  });
  const known = new Set(paragraphs.map(({id}) => id));
  const numbered = outgoing.map(({id, text}) => known.has(id) ? `${text}\n[${id}]` : text).join('\n\n');
  const eggText = filteredEgg ? prose.slice(filteredEgg.start) : '';
  return {
    text: [numbered, eggText].filter(Boolean).join('\n\n'),
    anchors: {paragraphs, egg},
  };
}
