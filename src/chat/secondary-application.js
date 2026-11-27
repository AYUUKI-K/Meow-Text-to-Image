import {parseBodyBlocks} from '../core/core.js';
import {insertDrawingTags} from './secondary-placement.js';
import {readSecondaryTags,writeSecondaryTags} from './secondary-tags.js';
import {blockSlot,moveSwipeImage,promptIdentity} from './swipe-history.js';

function newSidecarTags(candidates,known,limit,egg) {
    const added=[];
    for(const {prompt,title} of candidates){
        if(added.length>=limit)break;
        const identity=promptIdentity(prompt);
        if(known.has(identity))continue;
        known.add(identity);
        added.push({prompt,...(egg===undefined?{}:{egg}),...(title?{title}:{})});
    }
    return added;
}

export function planSecondaryUpdate({text,drawings,anchors,count,pattern,format,originalBlocks,previousTags}) {
    if(!anchors){
        const known=new Set(previousTags.map(({prompt})=>promptIdentity(prompt)));
        const sidecar=newSidecarTags(drawings,known,count.max);
        return {text,previousTags,sidecar,inserted:[],moves:[]};
    }
    const result=insertDrawingTags(text,anchors.paragraphs,drawings,anchors.egg,count.max);
    const nextBlocks=parseBodyBlocks(result.text,pattern,format);
    const inserted=[],retained=[];
    for(const block of nextBlocks){
        if(result.starts.has(block.start))inserted.push({block,egg:result.eggStarts.has(block.start)});
        else retained.push(block);
    }
    const ordinary=inserted.filter(({egg})=>!egg).length;
    const known=new Set([...nextBlocks,...previousTags].map(({prompt})=>promptIdentity(prompt)));
    const sidecar=newSidecarTags(result.unplacedDrawings,known,count.max-ordinary,false);
    const moves=originalBlocks.filter(block=>!block.secondary).flatMap((old,index)=>{
        const next=retained[index];
        if(!next||next.raw!==old.raw||blockSlot(next)===blockSlot(old))return [];
        return [{from:blockSlot(old),to:blockSlot(next)}];
    });
    return {
        text:result.text,previousTags,sidecar,inserted,moves,
        ordinary:ordinary+sidecar.length,
        skipped:Math.max(0,drawings.length-inserted.length-sidecar.length),
        missingTitles:result.missingTitles+sidecar.filter(tag=>!tag.title).length,
    };
}

export async function saveSecondaryUpdate(message,swipe,plan,{readImage,saveChat}) {
    const original=message.mes,swipes=message.swipes,oldSwipe=swipes?.[swipe];
    const changed=plan.text!==original;
    const nextTags=plan.sidecar.length?[...plan.previousTags,...plan.sidecar]:null;
    const moves=plan.moves.flatMap(({from,to})=>{
        const record=readImage(from);
        return record?[{from,to,record}]:[];
    });
    if(changed){
        message.mes=plan.text;
        if(typeof oldSwipe==='string')swipes[swipe]=plan.text;
    }
    if(nextTags)writeSecondaryTags(message,swipe,nextTags);
    for(const {from,to,record} of moves.slice().reverse())moveSwipeImage(message,swipe,from,to,record);
    try{
        if(await saveChat()===false)throw Error('保存失败');
    }catch{
        // The user can edit or change swipes while the host is saving.
        const ownsBody=changed&&(message.swipe_id??0)===swipe&&message.mes===plan.text;
        const ownsSwipe=changed&&message.swipes===swipes&&swipes?.[swipe]===plan.text;
        if(ownsBody)message.mes=original;
        if(ownsSwipe)swipes[swipe]=oldSwipe;
        if(nextTags&&readSecondaryTags(message,swipe)===nextTags)writeSecondaryTags(message,swipe,plan.previousTags);
        if(ownsBody||ownsSwipe)for(const {from,to,record} of moves)moveSwipeImage(message,swipe,to,from,record);
        throw Error('副 API 已返回 tag，但保存聊天失败');
    }
}
