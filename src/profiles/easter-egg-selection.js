import {maskReasoning,parseBodyBlocks} from '../core/core.js';

// Only an entire visible line is a separator. User text is never a regexp.
export function parseGenerationBody(text,pattern,format={},marker=''){
    const visible=maskReasoning(text,format),blocks=parseBodyBlocks(text,pattern,format),positions=[];
    marker=String(marker||'').trim();
    if(marker&&!/[\r\n]/.test(marker)){
        let offset=0;
        for(const line of visible.split('\n')){
            const start=offset+line.indexOf(marker);
            if(line.trim()===marker&&!blocks.some(b=>start>=b.start&&start<b.start+b.raw.length))positions.push(start);
            offset+=line.length+1;
        }
    }
    const last=blocks.at(-1),position=positions[0];
    const marked=last&&positions.length===1&&position<last.start&&!visible.slice(position+marker.length,last.start).trim()?last:null;
    return {blocks,marked};
}
export function generationCandidates(parsed,{streaming=false,eggEnabled=false}={}){
    const last=parsed.blocks.at(-1);
    return parsed.blocks.flatMap(block=>{
        // A later token can add another separator/tag. Keep just the tail until
        // completion even with an explicit marker, so ambiguous output is safe.
        if(eggEnabled&&streaming&&block===last)return [];
        return [{block,egg:eggEnabled&&block===last&&(!streaming||block===parsed.marked)}];
    });
}

// Cache only resource metadata, never message content. Each auto session keeps
// its own resolved value even when a later resource update invalidates the cache.
export function createEggMarkerCache({read,key}){
    let cached,revision=0;
    return {
        invalidate(){revision++;cached=undefined;},
        read(){
            const current=key();
            if(!cached||cached.key!==current||cached.revision!==revision){
                cached={key:current,revision,promise:Promise.resolve().then(read).then(snapshot=>snapshot.macros.findLast(m=>m.scope==='setvar'&&m.name==='彩蛋标签')?.value.trim()||'').catch(()=>'')};
            }
            return cached.promise;
        },
    };
}
