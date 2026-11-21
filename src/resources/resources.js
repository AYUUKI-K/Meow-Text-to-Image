import {preserveWorldMacros} from './world-macros.js';
import {randomId} from '../platform/browser-crypto.js';
import {promptTemplates} from '../prompts/prompt-templates.js';
export const BUNDLED_RESOURCES={"schema":1,"version":"2.2.2-1026","revision":2026102601,"worldName":"[喵喵]文生图 2.2.2","worldSHA256":"63ed43d74b00c05f2cf42db300cb83b15026c2cf7e58ae15f0ca9dd24af43e5a","regexSHA256":"d2991bb7e775b162980cb92dcb2e41b82cb11ea179397e542d5b32078a70dbd4"};
export const RESOURCE_VERSION=BUNDLED_RESOURCES.version;
export const WORLD_NAME=BUNDLED_RESOURCES.worldName;
const drawingEntryTitles=new Set([...Object.values(promptTemplates).map(entry=>entry.comment),'使用说明']);
const drawingWorldName=/^(?:\[喵喵\]\s*文生图|喵喵文生图)(?:[\s_.（(-]|$)/;
const worldEntryTitle=entry=>String(entry?.comment??'').trim();

function drawingEntryMarker(entry) {
    const text=entry?.content;
    if(typeof text!=='string')return false;
    if(text.includes('{{miao_drawing_policy}}'))return true;
    return worldEntryTitle(entry)==='tag头'&&text.includes('<imageTag>')&&
        text.includes('{{setvar::张数::')&&text.includes('{{setvar::彩蛋标签::');
}

export function filterDrawingWorldEntries(lists, configuredWorld) {
    const drawingWorlds=new Set();
    for(const entries of lists){
        if(!Array.isArray(entries))continue;
        for(const entry of entries){
            if(typeof entry?.world==='string'&&(entry.world===configuredWorld||drawingWorldName.test(entry.world.trim())||drawingEntryMarker(entry))){
                drawingWorlds.add(entry.world);
            }
        }
    }
    return lists.map(entries=>Array.isArray(entries)?entries.filter(entry=>!drawingEntryMarker(entry)&&
        !(drawingWorlds.has(entry?.world)&&drawingEntryTitles.has(worldEntryTitle(entry)))):entries);
}

const validEntries=book=>book&&book.entries&&typeof book.entries==='object'&&!Array.isArray(book.entries)&&Object.values(book.entries).every(entry=>entry&&typeof entry==='object'&&!Array.isArray(entry));
export function mergeWorldEntries(existing,incoming,{preserveMacros=false}={}){
    if(!validEntries(incoming)||!validEntries(existing))throw Error('世界书需要有效的 entries 字段');
    const entries=structuredClone(existing.entries);
    for(const source of Object.values(incoming.entries)){
        const title=String(source.comment||'').trim();
        const matches=title?Object.entries(entries).filter(([,entry])=>String(entry.comment||'').trim()===title):[];
        let key=matches[0]?.[0];
        if(key===undefined){
            key=String(source.uid??0);
            if(!/^\d+$/.test(key)||Object.hasOwn(entries,key)){let uid=0;while(Object.hasOwn(entries,String(uid)))uid++;key=String(uid);}
        }
        for(const [duplicate] of matches.slice(1))delete entries[duplicate];
        entries[key]={...structuredClone(source),uid:Number(key)};
    }
    const merged={...structuredClone(existing),...structuredClone(incoming),entries};
    return preserveMacros?preserveWorldMacros(existing,merged):merged;
}
const regexFamily=name=>/^喵喵文生图[1-4]-/.test(name||'')?name.replace(/-\d{4}$/,''):null;
export function mergeRegexRules(existing,incoming,makeId=randomId){
    const list=Array.isArray(incoming)?incoming:[incoming];
    for(const rule of list)if(!rule||typeof rule.findRegex!=='string'||!rule.findRegex||typeof rule.replaceString!=='string')throw Error('不是有效的酒馆正则文件');
    let merged=structuredClone(existing);
    for(const rule of list){
        const family=regexFamily(rule.scriptName);
        const matches=merged.map((item,index)=>({item,index})).filter(({item})=>rule.id&&item.id===rule.id||rule.scriptName&&item.scriptName===rule.scriptName||family&&regexFamily(item.scriptName)===family);
        const replacement={...structuredClone(rule),id:matches[0]?.item.id||rule.id||makeId()};
        if(!matches.length){merged.push(replacement);continue;}
        const first=matches[0].index,duplicates=new Set(matches.slice(1).map(({index})=>index));
        merged=merged.map((item,index)=>index===first?replacement:item).filter((_,index)=>!duplicates.has(index));
    }
    return merged;
}
export function bundledWorldTargets(names,preferred,newName=WORLD_NAME){
    const version=name=>{const match=name.match(/^\[喵喵\]文生图\s*2\.(\d+)(?:\.(\d+))?$/);return match?[Number(match[1]),Number(match[2]||0)]:null;};
    const latest=version(newName);
    const existing=names.filter(name=>{const current=version(name);return current&&latest&&(current[0]<latest[0]||current[0]===latest[0]&&current[1]<=latest[1]);});
    const primary=existing.includes(preferred)?preferred:existing.find(name=>/2\.0$/.test(name))||existing[0]||newName;
    return [primary,...existing.filter(name=>name!==primary)];
}
export function migrateWorldBindings({selected=[],worldInfo={},powerUser={},chatMetadata={}},oldNames,newName=WORLD_NAME){
    const old=new Set(oldNames),replace=name=>old.has(name)?newName:name;
    const remap=list=>[...new Set(list.map(replace))];
    selected.splice(0,selected.length,...remap(selected));
    worldInfo.globalSelect=[...selected];
    for(const lore of worldInfo.charLore||[])if(Array.isArray(lore.extraBooks))lore.extraBooks=remap(lore.extraBooks);
    if(old.has(powerUser.persona_description_lorebook))powerUser.persona_description_lorebook=newName;
    for(const persona of Object.values(powerUser.persona_descriptions||{}))if(old.has(persona.lorebook))persona.lorebook=newName;
    const chatChanged=old.has(chatMetadata.world_info);
    if(chatChanged)chatMetadata.world_info=newName;
    return chatChanged;
}
