// Global generation policy; profile IDs remain independent of the editor index.
export function reconcileProfileSelection(settings){
    const ids=new Set(settings.profiles.map(p=>p.id)),warnings=[];
    settings.randomProfileIds=[...new Set(Array.isArray(settings.randomProfileIds)?settings.randomProfileIds:[])].filter(id=>ids.has(id));
    settings.profileSelectionMode=settings.profileSelectionMode==='random'?'random':'single';
    if(settings.profileSelectionMode==='random'&&settings.randomProfileIds.length<2)warnings.push('随机池不足 2 项，请至少选择 2 个配置；普通图片暂不能生成');
    settings.eggProfileEnabled=settings.eggProfileEnabled===true;
    settings.eggProfileId=ids.has(settings.eggProfileId)?settings.eggProfileId:null;
    if(settings.eggProfileEnabled&&!settings.eggProfileId){settings.eggProfileEnabled=false;warnings.push('彩蛋配置已不存在，已关闭尾图覆盖，请重新选择');}
    return warnings;
}
export function selectGenerationProfile(settings,{egg=false,random=Math.random}={}){
    let profile,source='single';
    if(egg&&settings.eggProfileEnabled){
        profile=settings.profiles.find(p=>p.id===settings.eggProfileId);source='egg';
        if(!profile)throw Error('彩蛋配置已不存在，请重新选择');
    }else if(settings.profileSelectionMode==='random'){
        const pool=[...new Set(settings.randomProfileIds)].map(id=>settings.profiles.find(p=>p.id===id)).filter(Boolean);
        if(pool.length<2)throw Error('随机配置至少需要选择 2 项，请调整配置使用方式');
        profile=pool[Math.floor(random()*pool.length)];source='random';
    }else profile=settings.profiles[settings.active];
    if(!profile)throw Error('请先选择有效配置');
    return {profile:structuredClone(profile),profileId:profile.id,profileName:profile.name,source};
}
