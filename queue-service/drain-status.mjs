// Pure offline inspection for a private, complete namespace snapshot. No route,
// credential or key hashes are exposed; expiry alone is not counted as cleanup.
export function assessQueueDrain({maintenance,completeSnapshot,lanes,now}){
    if(!Array.isArray(lanes)||!Number.isFinite(now))throw Error('无效排空快照');
    let active=0,waiting=0,newProtocol=0,cooling=0,cooldownRemainingMs=0;
    for(const entry of lanes){
        const lane=Array.isArray(entry)?entry[1]:entry;
        if(!lane||!Array.isArray(lane.waiting)||!(lane.active===null||typeof lane.active==='object'&&lane.active))throw Error('无效排空记录');
        active+=lane.active?1:0;waiting+=lane.waiting.length;
        newProtocol+=(lane.active?.protocol===2?1:0)+lane.waiting.filter(job=>job.protocol===2).length;
        if(lane.cooldownUntil!==undefined&&!Number.isFinite(lane.cooldownUntil))throw Error('无效冷却期限');
        if(lane.cooldownUntil>now){cooling++;cooldownRemainingMs=Math.max(cooldownRemainingMs,lane.cooldownUntil-now);}
    }
    return {maintenance:maintenance===true,completeSnapshot:completeSnapshot===true,active,waiting,newProtocol,cooling,cooldownRemainingMs,
        rollbackEligible:maintenance===true&&completeSnapshot===true&&active===0&&waiting===0&&cooling===0};
}
