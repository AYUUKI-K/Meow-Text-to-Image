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
    const xml=eggBoundary(xmlSource);
    const adjacent=end=>{
        if(end===undefined)return null;
        const next=blocks.find(block=>block.start>=end);
        return next&&!visible.slice(end,next.start).replace(/^\s*┈┈[^\r\n]+┈┈\s*$/,'').trim()?next:null;
    };
    const marked=adjacent(positions.length===1?positions[0]+marker.length:undefined)??adjacent(xml?.end);
    return {blocks,marked,hasMarker:!!xml||positions.length>0};
}
export function generationCandidates(parsed,{streaming=false,eggEnabled=false,implicitEgg=true}={}){
    const last=parsed.blocks.at(-1);
    const {block:bonus,implicit}=selectEggBlock(parsed,{implicitEgg});
    const pending=bonus??last;
    return parsed.blocks.flatMap(block=>{
        if(eggEnabled&&streaming&&block===pending)return [];
        const egg=eggEnabled&&block===bonus;
        return [{block,egg,requiresFinalEggTag:egg&&implicit}];
    });
}

export function selectEggBlock(parsed,{implicitEgg=false}={}){
    if(parsed.marked)return {block:parsed.marked,implicit:false};
    const block=implicitEgg&&!parsed.hasMarker?parsed.blocks.at(-1):undefined;
    return {block,implicit:!!block};
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
                cached={key:current,revision,promise:Promise.resolve().then(read).then(marker=>String(marker??'').trim()).catch(()=>'')};
            }
            return cached.promise;
        },
    };
}
