import {parseBodyBlocks} from '../core/core.js';

// Change only the first capture of this exact occurrence. Reject delimiters
// that would split one tag into several tags or consume a neighbouring tag.
export function editedTag(text,block,prompt,pattern,format={}){
    prompt=String(prompt).trim();if(!prompt)throw Error('提示词不能为空');
    const before=parseBodyBlocks(text,pattern,format),current=before.find(item=>item.start===block.start&&item.raw===block.raw);
    if(!current)throw Error('原 tag 已变化，请重新打开提示词');
    let match;try{match=new RegExp(pattern,'id').exec(current.raw);}catch{match=new RegExp(pattern,'i').exec(current.raw);}
    if(!match?.[1])throw Error('无法定位 tag 提示词');
    const at=match.indices?.[1]?.[0]??current.raw.indexOf(match[1]);
    const start=current.start+at,end=start+match[1].length;
    const next=text.slice(0,start)+prompt+text.slice(end),after=parseBodyBlocks(next,pattern,format),replacement=after[current.bodyIndex];
    if(after.length!==before.length||!replacement||replacement.prompt!==prompt||before.some((item,i)=>i!==current.bodyIndex&&item.raw!==after[i].raw))throw Error('提示词不能包含捕捉标签的起始或结束标记');
    return {text:next,block:replacement};
}
