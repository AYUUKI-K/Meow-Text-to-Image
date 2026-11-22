import {maskReasoning,parseBodyBlocks} from '../core/core.js';
import {eggBoundary} from '../chat/secondary-placement.js';

// A custom separator must occupy a visible line unless it is MeowFM XML.
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
    // The image prompt may mention XML literally. Mask its span before looking
    // for a real separator, retaining the original reply's offsets.
    let xmlSource=visible;
    for(const {raw,start} of blocks){
        if(raw.includes('<'))xmlSource=xmlSource.slice(0,start)+raw.replace(/[^\r\n]/g,' ')+xmlSource.slice(start+raw.length);
    }
    const position=positions[0],xml=eggBoundary(xmlSource);
    const end=xml?.end??(positions.length===1?position+marker.length:undefined);
    const next=end===undefined?null:blocks.find(block=>block.start>=end);
    const marked=next&&!visible.slice(end,next.start).replace(/^\s*┈┈[^\r\n]+┈┈\s*$/,'').trim()?next:null;
    return {blocks,marked};
}
export function generationCandidates(parsed,{streaming=false,eggEnabled=false,implicitEgg=true}={}){
    const last=parsed.blocks.at(-1);
    const bonus=implicitEgg?last:parsed.marked;
    const pending=bonus??last;
    return parsed.blocks.flatMap(block=>{
        if(eggEnabled&&streaming&&block===pending)return [];
        return [{block,egg:eggEnabled&&block===bonus}];
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
                cached={key:current,revision,promise:Promise.resolve().then(read).then(snapshot=>snapshot.macros.findLast(m=>['setvar','parameter'].includes(m.scope)&&m.name==='彩蛋标签')?.value.trim()||'').catch(()=>'')};
            }
            return cached.promise;
        },
    };
}
