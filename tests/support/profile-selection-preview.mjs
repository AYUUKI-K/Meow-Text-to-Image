import {defaults} from '../../src/core/core.js';
import {swipeImageRecords} from '../../src/chat/swipe-history.js';

// Browser integration fixture for the real entry, using preview-server mocks.
// Run /?profile-selection (optionally &tt or &frame=390x844).
export async function runProfileSelectionPreview({p,wait,draw}){
    const results=[],report=document.getElementById('report');
    const check=(condition,label)=>{results.push(`${condition?'PASS':'FAIL'} ${label}`);report.textContent=results.join('\n');if(!condition)throw Error(label);};
    const settle=async predicate=>{for(let i=0;i<120;i++){if(predicate())return;await wait();}throw Error('fixture timed out');};
    const action=label=>[...document.querySelectorAll('.miao-button')].find(b=>b.textContent===label);
    const field=label=>[...document.querySelectorAll('.miao-field')].find(f=>f.querySelector('span')?.textContent===label)?.querySelector('select,input,textarea');
    const set=(label,value)=>{const control=field(label);control.value=value;control.dispatchEvent(new Event(control.tagName==='SELECT'?'change':'input',{bubbles:true}));};
    const toggle=label=>[...document.querySelectorAll('.miao-switch-row')].find(row=>row.textContent===label)?.querySelector('input');
    const go=async label=>{const root=document.querySelector('.miao-settings');if(getComputedStyle(root.querySelector('.miao-tabs')).display==='none'){if(root.dataset.section!=='overview')root.querySelector('.miao-drawer-back').click();document.querySelector(`.miao-overview-row[aria-label="${label}"]`).click();}else [...root.querySelectorAll('.miao-tabs>button')].find(b=>b.textContent===label).click();await wait();};
    const open=async label=>{document.getElementById('miao-nai-menu').click();await settle(()=>document.querySelector('.miao-settings'));await go(label);};
    const close=async()=>{document.querySelector('.miao-drawer-close').click();await wait();};
    const records=message=>swipeImageRecords(message).map(item=>item.record);
    try{
        p.settings.profiles=['a','b','egg'].map((id,i)=>({...structuredClone(defaults),id,name:id,positive:id,qualityPreset:'none',ucPreset:'none',negative:id,seed:i,vibeEnabled:false,vibes:[]}));
        Object.assign(p.settings,{active:0,cloudQueue:false,profileSelectionMode:'single',randomProfileIds:[],eggProfileEnabled:false,eggProfileId:null});
        p.context.powerUserSettings={reasoning:{prefix:'<star_cot>',suffix:'</star_cot>'}};
        await open('配置');set('选择方式','random');
        check(p.settings.profileSelectionMode==='random'&&document.querySelector('.miao-profile-warning').textContent.includes('至少选择 2'),'不足两项保留多选界面并阻止普通图片生成');
        await close();document.querySelector('[mesid="3"] .miao-image-card button').click();await wait();check(p.calls.length===0,'不足两项时真实生成入口没有 POST');await open('配置');
        document.querySelector('[aria-label="选择生图配置 a"]').click();document.querySelector('[aria-label="选择生图配置 b"]').click();check(p.settings.profileSelectionMode==='random'&&p.settings.randomProfileIds.join(',')==='a,b','两项候选启用独立随机池');
        toggle('为最后一张图（彩蛋）单独指定配置').click();set('彩蛋使用配置','egg');
        const bindings=JSON.stringify(p.settings.profiles[0].vibes);toggle('启用 Vibe').click();await wait();check(document.querySelector('.miao-vibe-choices')!==null,'启用后显示完整 Vibe 区域');
        toggle('启用 Vibe').click();check(!document.querySelector('.miao-vibe-choices')&&JSON.stringify(p.settings.profiles[0].vibes)===bindings,'关闭后隐藏区域并保留候选');
        await go('生成');check(!document.querySelector('.miao-settings').textContent.includes('已记住'),'Key 状态移除已记住文案');
        set('API Key','fixture-placeholder-key');action('保存密钥').click();await settle(()=>document.querySelector('[role=status]')?.textContent==='Key 已就绪');
        check(document.querySelector('[role=status]').previousElementSibling.querySelector('h3').textContent==='连接 NovelAI','唯一 Key 状态位于整个连接区块下方');
        const initialKey=document.querySelector('[role=status]').textContent;action('测试连接').click();await wait();check(document.querySelector('[role=status]').textContent===initialKey,'队列测试不覆盖 Key 状态');
        await close();
        document.querySelector('[mesid="3"] .miao-image-card button:last-child').click();await wait();
        check(document.querySelector('.miao-prompt-metadata').textContent.includes('生成时从随机池选取')&&document.querySelector('.miao-prompt-metadata').textContent.includes('最后一张：egg'),'待生成提示词展示随机与尾图策略，不冒用当前编辑配置');
        (document.querySelector('.miao-page-controls button')||document.querySelector('dialog[open] .popup-controls button')).click();await wait();
        p.settings.mode='stream';p.settings.enabled=true;
        const before=p.calls.length;
        await p.emit('GENERATION_STARTED','normal',{},false);
        const message={name:'Policy fixture',mes:'<star_cot>\n/content\nimage###fake###',extra:{}};p.chat.push(message);draw();await p.emit('STREAM_TOKEN_RECEIVED');await wait();
        check(p.calls.length===before,'未闭合自定义思维链内没有 POST');
        message.mes+='</star_cot>\nimage###first###';draw();await p.emit('STREAM_TOKEN_RECEIVED');await wait();check(p.calls.length===before,'第一张完整正文图片作为尾部候选');
        message.mes+='\nimage###second###';draw();await p.emit('STREAM_TOKEN_RECEIVED');await settle(()=>records(message).length===1);
        check(records(message)[0].profileId!=='egg','第二张出现后第一张立即使用普通随机池');
        const ordinary=records(message)[0],prefix=ordinary.profileId;check(ordinary.request.prompt.startsWith(prefix+',')&&ordinary.request.negative_prompt===prefix,'正负提示词与实际记录配置同源');
        message.mes+='\n/content\nimage###tail###';draw();await p.emit('STREAM_TOKEN_RECEIVED');await settle(()=>records(message).length===2);
        check(p.calls.length===before+2&&records(message).every(record=>record.profileId!=='egg'),'仅最后一个候选等待结束，其他普通图继续生成');
        await p.emit('GENERATION_ENDED');await p.emit('CHARACTER_MESSAGE_RENDERED',p.chat.length-1);await settle(()=>records(message).length===3);
        check(records(message).at(-1).profileId==='egg'&&records(message).at(-1).request.prompt.startsWith('egg,'),'回复结束时尾图强制固定配置并记录稳定 ID');
        await p.emit('STREAM_TOKEN_RECEIVED');await p.emit('GENERATION_ENDED');await wait();check(p.calls.length===before+3,'重复结束与恢复事件不重复提交');
        p.settings.eggProfileEnabled=false;await p.emit('GENERATION_STARTED','normal',{},false);const ordinaryMessage={name:'Disabled fixture',mes:'image###immediate###',extra:{}};p.chat.push(ordinaryMessage);draw();await p.emit('STREAM_TOKEN_RECEIVED');await settle(()=>records(ordinaryMessage).length===1);check(records(ordinaryMessage)[0].profileId!=='egg','关闭尾图覆盖后首张立即生成');await p.emit('GENERATION_ENDED');
        p.settings.mode='manual';
        const pendingMessage=async label=>{
            const message={name:'Pending fixture',mes:`image###${label} first### image###${label} second###`,extra:{}};p.chat.push(message);draw();await p.emit('MESSAGE_UPDATED',p.chat.length-1);await wait();
            const cards=()=>document.querySelector('#chat .mes:last-child').querySelectorAll('.miao-image-card');
            p.holdImage=true;const posts=p.calls.length;cards()[0].querySelector('button').click();await settle(()=>p.calls.length===posts+1);cards()[1].querySelector('button').click();await wait();
            return {message,posts};
        };
        const pending=await pendingMessage('snapshot');
        for(const profile of p.settings.profiles)profile.positive='changed after enqueue';
        p.holdImage=false;p.releaseImage();await settle(()=>records(pending.message).length===2);
        check(records(pending.message).every(record=>record.request.prompt.startsWith(record.profileId+',')),'入队后编辑配置不污染在途请求快照');
        for(const profile of p.settings.profiles)profile.positive=profile.id;
        const stale=await pendingMessage('removed');stale.message.mes='image###removed first###';draw();await p.emit('MESSAGE_EDITED',p.chat.length-1);p.holdImage=false;p.releaseImage();await settle(()=>records(stale.message).length===1);await wait();
        check(p.calls.length===stale.posts+1,'排队中的 tag 删除后不会继续 POST');
        const swiped=await pendingMessage('swiped');swiped.message.swipes=[swiped.message.mes,'new swipe'];swiped.message.swipe_id=1;swiped.message.mes='new swipe';draw();await p.emit('MESSAGE_SWIPED',p.chat.length-1);p.holdImage=false;p.releaseImage();await settle(()=>records(swiped.message).length===1);await wait();
        check(p.calls.length===swiped.posts+1&&swipeImageRecords(swiped.message)[0].swipe===0,'swipe 切换取消待发送任务，已发送图片仍归原 swipe');
        await open('配置');
        if(!window.__TAURITAVERN__){
            p.confirmResult=0;action('删除配置').click();await wait();check(p.settings.profiles.length===3,'宿主取消返回值保留配置');
            p.confirmResult=1;action('删除配置').click();await settle(()=>p.settings.profiles.length===2);check(p.settings.profileSelectionMode==='random'&&p.settings.randomProfileIds.join(',')==='b'&&!!document.querySelector('.miao-profile-warning'),'删除后清理随机池，保留多选界面并提示不足两项');
            document.querySelector('.miao-error-view')?.closest('dialog')?.close();await wait();
        }
        check(true,'入口集成验证完成（仅模拟接口）');
    }catch(error){results.push('FAIL '+error.message);}
    report.textContent=results.join('\n');
}
