const optional=title=>/\[选开\]/.test(title);
const choice=title=>/\[选一\]/.test(title);
export function worldOptions(book){
    const entries=Object.entries(book?.entries||{}).map(([key,entry])=>({key,title:String(entry.comment||'').trim(),enabled:entry.disable!==true}));
    return {toggles:entries.filter(entry=>optional(entry.title)),choices:entries.filter(entry=>choice(entry.title))};
}
export function patchWorldOptions(book,baseline,values){
    const copy=structuredClone(book),current=worldOptions(copy),before=[...baseline.toggles,...baseline.choices],patches=[];
    for(const item of before){
        if(!Object.hasOwn(values,item.key)||values[item.key]===item.enabled)continue;
        if(typeof values[item.key]!=='boolean')throw Error('世界书开关无效');
        const fresh=[...current.toggles,...current.choices].find(entry=>entry.key===item.key);
        if(!fresh||fresh.title!==item.title||fresh.enabled!==item.enabled)throw Error('世界书开关已在别处修改，请重新读取');
        patches.push([item.key,values[item.key]]);
    }
    for(const [key,enabled] of patches)copy.entries[key].disable=!enabled;
    if(worldOptions(copy).choices.filter(item=>item.enabled).length>1)throw Error('性向条目只能选择一项');
    return copy;
}
