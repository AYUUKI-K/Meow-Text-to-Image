import {buildRequest} from './core.js';
import {randomId} from './browser-crypto.js';
import {selectVibes} from './vibe.js';

export const SAMPLE_PROMPT=`a  girl, (16-year-old:1.1),(flat breasts:0.7)

(white hair:1.3),  (waist-length hair:1.1),
(slightly messy hair:0.5), (long uneven bangs:1.3),(split bangs:1.1),hair down,

(face-framing strands clearly separated from main hair:1.3),

(Grey-blue eyes:1.2), ​:3,

(gray-blue striped sweater:1.3), Loose-fitting sweater,black shorts,(horizontal stripes:1.2),​(dark blue ribbon choker:0.4),`;
export function ensureProfileIds(profiles){
    // IDs route pending jobs; assigning one must never discard a saved image.
    // Explicit UI copies clear their own preview before they reach this helper.
    const used=new Set();for(const profile of profiles){if(!profile.id||used.has(profile.id))profile.id=randomId();used.add(profile.id);}
}
export function moveProfile(settings,id,offset){
    const list=settings.profiles,from=list.findIndex(profile=>profile.id===id),to=from+offset;
    if(from<0||![-1,1].includes(offset)||to<0||to>=list.length)return false;
    const active=list[settings.active],[profile]=list.splice(from,1);list.splice(to,0,profile);settings.active=Math.max(0,list.indexOf(active));return true;
}
export function sampleRequest(profile,library=[],prompt=SAMPLE_PROMPT){
    if(typeof prompt!=='string'||!prompt.trim())throw Error('请填写例图提示词');
    const request=buildRequest({...profile,width:512,height:512,seed:246813579},prompt);
    request.vibes=selectVibes(profile,library,()=>0);return request;
}
export function sampleSignature(profile,library=[],prompt=SAMPLE_PROMPT){const request=sampleRequest(profile,library,prompt);request.vibes=request.vibes.map(({id,key,strength})=>({id,key,strength}));return JSON.stringify(request);}
export function createProfilePreviews({profiles,library,prompt=()=>SAMPLE_PROMPT,onQueued=()=>{},enqueue,generate,saveImage,persist,onChange=()=>{},onError=()=>{}}){
    const jobs=new Map();
    const current=(id,signature)=>{const p=profiles().find(item=>item.id===id);try{return p&&sampleSignature(p,library(),prompt())===signature?p:null;}catch{return null;}};
    return {
        state(profile){const job=jobs.get(profile.id);let fresh=false;try{fresh=profile.preview?.signature===sampleSignature(profile,library(),prompt());}catch{}
            return {url:profile.preview?.url,busy:!!job?.busy,status:job?.busy?job.status:job?.error?'生成失败':profile.preview?.url?(fresh?'':'待更新'):''};},
        refresh(profile,{ifChanged=false,scope}={}){
            let signature,request;try{signature=sampleSignature(profile,library(),prompt());request=sampleRequest(profile,library(),prompt());}catch(error){onError(error);return Promise.resolve();}
            if(ifChanged&&profile.preview?.url&&profile.preview.signature===signature){if(jobs.get(profile.id)?.error){jobs.delete(profile.id);onChange();}return Promise.resolve();}
            const previous=jobs.get(profile.id);if(previous?.busy&&previous.signature===signature)return previous.promise;
            if(!ifChanged)request.seed=Math.floor(Math.random()*4294967296);
            const job={busy:true,status:'排队中',signature};jobs.set(profile.id,job);onChange();onQueued();
            const valid=()=>{if(!current(profile.id,signature)||jobs.get(profile.id)!==job)throw Error('配置已变化，例图已取消');return true;};
            job.promise=enqueue(async()=>{
                if(!current(profile.id,signature)||jobs.get(profile.id)!==job)return;
                const data=await generate(request,{...scope,onStatus:status=>{job.status=status;onChange();}},valid);
                const url=await saveImage(data,scope);
                const target=current(profile.id,signature);if(!target||jobs.get(profile.id)!==job)return;
                target.preview={url,signature,created:Date.now()};onChange();
                try{await persist();}catch(error){throw Error('例图已生成，但配置保存失败，请再次保存配置：'+error.message);}
            }).catch(error=>{job.error=String(error.message||error);onError(error);}).finally(()=>{job.busy=false;onChange();});
            return job.promise;
        },
    };
}
