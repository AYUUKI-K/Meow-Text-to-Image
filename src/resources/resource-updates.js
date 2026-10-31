import {BUNDLED_RESOURCES} from './resources.js';
import {sha256} from '../platform/browser-crypto.js';
import {hostFetch} from '../platform/host-fetch.js';

export const RESOURCE_REMOTE_BASE='https://raw.githubusercontent.com/AYUUKI-K/Meow-Text-to-Image/main/';
export function validateResourceManifest(data){
    const match=typeof data?.worldName==='string'&&data.worldName.match(/^\[喵喵\]文生图 (2\.\d+(?:\.\d+)?)$/);
    if(data?.schema!==1||!Number.isSafeInteger(data.revision)||data.revision<1||!match||typeof data.version!=='string'||data.version.length>40||!data.version.startsWith(match[1]+'-')||!['worldSHA256','regexSHA256'].every(key=>/^[a-f0-9]{64}$/.test(data[key]||'')))throw Error('资源版本信息无效');
    return Object.fromEntries(['schema','version','revision','worldName','worldSHA256','regexSHA256'].map(key=>[key,data[key]]));
}
export function createResourceUpdater({settings,localBase,fetchImpl=fetch,now=Date.now,onChange=()=>{},onAvailable=()=>{},save=()=>{}}){
    let latest=validateResourceManifest(BUNDLED_RESOURCES),pending=null,checkedAt=null,error='',checking=false;
    const snapshot=()=>({latest:{...latest},available:settings.installed!==true||((settings.resourceRevision||0)<=latest.revision&&(settings.resourceVersion!==latest.version||settings.resourceRevision!==latest.revision)),checking,error});
    const publish=()=>onChange(snapshot());
    const notify=()=>{if(settings.installed&&snapshot().available&&settings.resourceNoticeRevision!==latest.revision){onAvailable(snapshot());settings.resourceNoticeRevision=latest.revision;save();}};
    const read=async(path,remote=true)=>{
        const response=await hostFetch(new URL(path,remote?RESOURCE_REMOTE_BASE:localBase),{cache:'no-store',credentials:remote?'omit':'same-origin'},{fetchImpl,timeoutMs:12000});
        if(!response.ok)throw Error(`资源读取失败：HTTP ${response.status}`);
        const text=await response.text();if(text.length>2*1024*1024)throw Error('资源文件过大');return text;
    };
    return {
        snapshot,
        changed(){publish();},
        check(force=false){
            notify();
            if(pending)return pending;
            if(!force&&checkedAt!==null&&now()-checkedAt<600000)return Promise.resolve(snapshot());
            checking=true;error='';publish();
            pending=(async()=>{
                try{
                    const manifest=validateResourceManifest(JSON.parse(await read('assets/resource-manifest.json')));
                    if(manifest.revision>latest.revision)latest=manifest;
                    checkedAt=now();notify();
                }catch(cause){error=String(cause.message||cause);checkedAt=now();throw cause;}
                finally{checking=false;pending=null;publish();}
                return snapshot();
            })();return pending;
        },
        async load(){
            if((settings.resourceRevision||0)>latest.revision)throw Error('当前资源版本较新，请检查更新后重试');
            const manifest={...latest},remote=manifest.revision>BUNDLED_RESOURCES.revision;
            const [world,rules]=await Promise.all([read('assets/worldbook.json?v='+manifest.worldSHA256,remote),read('assets/regex.json?v='+manifest.regexSHA256,remote)]);
            const hashes=await Promise.all([sha256(world.replace(/\r\n/g,'\n')),sha256(rules.replace(/\r\n/g,'\n'))]);
            if(hashes[0]!==manifest.worldSHA256||hashes[1]!==manifest.regexSHA256)throw Error('资源校验失败，请检查更新后重试');
            return {manifest,world,rules:JSON.parse(rules)};
        },
    };
}
