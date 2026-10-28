const title=entry=>String(entry.comment||'').trim();
const header=book=>Object.values(book?.entries||{}).find(entry=>title(entry)==='tag头');
// Balance nested macros: values may themselves contain {{user}} / {{getvar::...}}.
export function parseHeaderMacros(content=''){
    const result=[],counts=new Map();
    for(let start=0;start<content.length;start++){
        if(content.slice(start,start+2)!=='{{')continue;
        let depth=1,end=start+2;
        while(end<content.length&&depth){const pair=content.slice(end,end+2);if(pair==='{{'){depth++;end+=2;}else if(pair==='}}'){depth--;end+=2;}else end++;}
        if(depth)throw Error('tag头中存在未闭合的酒馆宏，请先在世界书中修正');
        const body=content.slice(start+2,end-2),match=/^(setvar|setglobalvar)::([^\r\n{}]+?)::([\s\S]*)$/.exec(body);
        if(match){const [,scope,name,value]=match,key=JSON.stringify([scope,name]),occurrence=counts.get(key)||0;counts.set(key,occurrence+1);result.push({id:JSON.stringify([scope,name,occurrence]),scope,name,value,start,end,valueStart:start+2+scope.length+2+name.length+2});}
        start=end-1;
    }
    return result;
}
export function worldMacros(book){const entry=header(book);return entry?parseHeaderMacros(entry.content):[];}
function validateValue(value){
    if(typeof value!=='string'||value.length>16000)throw Error('宏值需要是文本，且不能超过 16000 字符');
    let depth=0;for(let i=0;i<value.length-1;i++){const pair=value.slice(i,i+2);if(pair==='{{'){depth++;i++;}else if(pair==='}}'){if(!depth)throw Error('宏值包含多余的结束括号 }}');depth--;i++;}}
    if(depth)throw Error('宏值中的酒馆宏尚未闭合');
}
export function patchWorldMacros(book,baseline,values){
    const copy=structuredClone(book),entry=header(copy);if(!entry)throw Error('当前世界书没有 tag头 条目');
    const current=new Map(worldMacros(copy).map(item=>[item.id,item])),patches=[];
    for(const original of baseline){
        const value=values[original.id];if(value===undefined||value===original.value)continue;
        validateValue(value);const target=current.get(original.id);
        if(!target||target.value!==original.value)throw Error(`「${original.name}」已在世界书中修改，请重新读取后再保存`);
        patches.push({...target,value});
    }
    for(const patch of patches.sort((a,b)=>b.start-a.start))entry.content=entry.content.slice(0,patch.valueStart)+patch.value+entry.content.slice(patch.end-2);
    return copy;
}
export function preserveWorldMacros(previous,incoming){
    const existing=new Map(worldMacros(previous).map(item=>[item.id,item.value])),fresh=worldMacros(incoming);
    if(!fresh.length||!existing.size)return incoming;
    return patchWorldMacros(incoming,fresh,Object.fromEntries(fresh.filter(item=>existing.has(item.id)).map(item=>[item.id,existing.get(item.id)])));
}
