export const defaultFontAwesomeIcon={name:'fa-paw',unicode:'f1b0',family:'solid'};

export function validFontAwesomeIcon(icon){
    if(!icon||!/^fa-[a-z0-9-]+$/.test(icon.name)||!['solid','brands'].includes(icon.family)||!/^[a-f0-9]{2,6}$/i.test(icon.unicode))return false;
    const code=parseInt(icon.unicode,16);return code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff);
}
export function fontAwesomeElement(icon,doc=document){
    const element=doc.createElement('span');element.className=`miao-fa-icon fa-${icon.family}`;
    element.textContent=String.fromCodePoint(parseInt(icon.unicode,16));element.setAttribute('aria-hidden','true');return element;
}
// Parse only glyph declarations, never insert fetched CSS or user input as HTML.
export function parseIconCSS(css,family){
    const icons=new Map();
    for(const [,selectors,body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
        const content=body.match(/(?:^|;)\s*(?:content|--fa)\s*:\s*(['"])(.*?)\1/);if(!content)continue;
        const glyph=content[2],hex=glyph.match(/^\\([a-f0-9]{1,6})\s?$/i),code=hex?parseInt(hex[1],16):[...glyph].length===1?glyph.codePointAt(0):0;
        if(!code||code>0x10ffff||code>=0xd800&&code<=0xdfff)continue;
        const names=selectors.split(',').flatMap(selector=>{const match=selector.trim().match(/^\.(fa-[a-z0-9-]+)(?::{1,2}before)?$/);return match?[match[1]]:[];});if(!names.length)continue;
        const unicode=code.toString(16).padStart(4,'0'),previous=icons.get(unicode);
        if(previous)previous.names=[...new Set([...previous.names,...names])];else icons.set(unicode,{name:names[0],names,unicode,family});
    }
    return [...icons.values()];
}
export function filterIcons(icons,query,family='all'){
    const text=String(query).trim().toLowerCase(),tokens=text.replace(/^fa-(?:solid|brands)\s+/,'').split(/\s+/).filter(Boolean);
    const encoded=text.match(/^(?:u\+|0x|\\u|&#x)?([a-f0-9]{2,6});?$/i),hex=encoded?parseInt(encoded[1],16):NaN,decimal=/^\d+$/.test(text)?Number(text):NaN;
    return icons.filter(icon=>(family==='all'||icon.family===family)&&(!text||parseInt(icon.unicode,16)===hex||parseInt(icon.unicode,16)===decimal||tokens.every(token=>icon.names.some(name=>name.includes(token)))));
}
let catalog;
export async function loadHostIcons(fetchImpl=fetch){
    if(catalog)return catalog;
    const loading=(async()=>{
        const results=await Promise.allSettled(['solid','brands'].map(async family=>{
            const file=family==='solid'?'fontawesome':'brands';
            const response=await fetchImpl(`/css/${file}.min.css`,{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('图标库读取失败');
            return parseIconCSS(await response.text(),family);
        }));
        const icons=results.flatMap(result=>result.status==='fulfilled'?result.value:[]);
        if(!icons.length)throw Error('无法读取酒馆的 Font Awesome 图标库，请刷新后重试');
        return icons.sort((a,b)=>a.name.localeCompare(b.name));
    })();catalog=loading;
    try{return await loading;}catch(error){if(catalog===loading)catalog=undefined;throw error;}
}
