import {defaults} from '../../src/core/core.js';
import {promptFileData} from '../../src/prompts/prompt-files.js';
import {selectGenerationProfile} from '../../src/profiles/profile-selection.js';

// Run preview-server.mjs, then /?profile-gallery (&tt&ios&host-css=tt).
// All credentials, profiles, requests and images belong to the isolated fixture.
export async function runProfileGalleryPreview({p,wait}){
    const report=document.getElementById('report'),results=[];
    const check=(ok,label)=>{results.push(`${ok?'PASS':'FAIL'} ${label}`);report.textContent=results.join('\n');if(!ok)throw Error(label);};
    const settle=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await wait();}throw Error('gallery fixture timed out');};
    const field=label=>[...document.querySelectorAll('.miao-field')].find(f=>f.querySelector('span')?.textContent===label)?.querySelector('select,input,textarea');
    const set=(label,value)=>{const input=field(label);input.value=value;input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));};
    const button=label=>[...document.querySelectorAll('.miao-button')].find(b=>b.textContent===label);
    const tile=id=>[...document.querySelectorAll('.miao-sample-tile')].find(el=>el.dataset.profileFocus==='select:'+id);
    const edit=id=>[...document.querySelectorAll('.miao-sample-edit')].find(el=>el.dataset.profileFocus==='edit:'+id);
    const go=async label=>{const root=document.querySelector('.miao-settings');if(getComputedStyle(root.querySelector('.miao-tabs')).display==='none'){if(root.dataset.section!=='overview')root.querySelector('.miao-drawer-back').click();document.querySelector(`.miao-overview-row[aria-label="${label}"]`).click();}else [...root.querySelectorAll('.miao-tabs>button')].find(b=>b.textContent===label).click();await wait();};
    const open=async()=>{document.getElementById('miao-nai-menu').click();await settle(()=>document.querySelector('.miao-settings'));await go('配置');};
    const close=async()=>{document.querySelector('.miao-drawer-close').click();await wait();};
    try{
        const all=Array.from({length:24},(_,i)=>({...structuredClone(defaults),id:'gallery-'+i,name:i===23?'超长配置名称用于验证换行与完整显示'.repeat(4):'配置 '+i,vibeEnabled:false,vibes:[],...(i<4?{preview:{url:i===3?'/fixture-missing-gallery.png':'/fixture-image/square.svg',signature:'fixture'}}:{})}));
        Object.assign(p.settings,{profiles:all,active:0,cloudQueue:false,profileSelectionMode:'single',randomProfileIds:[],eggProfileEnabled:false,eggProfileId:null});
        await open();
        check(!field('当前配置')&&!field('配置使用方式')&&!!field('选择方式'),'只有例图普通选择入口，标题与字段采用新文案');
        check(document.querySelector('.miao-profile-selection').contains(document.querySelector('.miao-sample-gallery'))&&document.querySelector('.miao-profile-section').textContent.startsWith('编辑配置'),'例图属于配置选择，管理操作属于编辑配置');
        for(const count of [4,10,20,24]){
            p.settings.profiles=all.slice(0,count);set('选择方式','single');await wait();
            const gallery=document.querySelector('.miao-sample-gallery'),cards=[...gallery.querySelectorAll('.miao-sample-tile')];
            check(cards.length===count&&cards.every(card=>{const rect=card.querySelector('.miao-sample-visual').getBoundingClientRect(),name=card.querySelector('.miao-sample-name').getBoundingClientRect();return rect.width>0&&Math.abs(rect.width-rect.height)<2&&name.height>=44&&card.getBoundingClientRect().height>=rect.height+name.height;}),`${count} 个配置保持方形与可见名称，卡片不压缩`);
            if(count>=10){gallery.scrollTop=gallery.scrollHeight;check(gallery.scrollTop>0&&gallery.scrollHeight>gallery.clientHeight,`${count} 个配置由网格内部滚动`);}
        }
        check(tile('gallery-4').querySelector('.miao-sample-visual').getBoundingClientRect().height>0&&tile('gallery-23').querySelector('.miao-sample-name').getBoundingClientRect().height>44,'空例图和超长名称保留占位与换行');
        tile('gallery-23').click();await wait();
        check(p.settings.active===23&&field('配置名称').value===all[23].name&&tile('gallery-23').getAttribute('aria-pressed')==='true'&&tile('gallery-23').textContent.includes('♡'),'单选同时切换生图与编辑对象，仅选中项带心形');
        check(document.querySelectorAll('.miao-sample-name').length===24&&[...document.querySelectorAll('.miao-sample-name')].filter(el=>el.textContent.startsWith('♡')).length===1,'单选只有一个状态标记');
        check(document.activeElement===tile('gallery-23')&&document.querySelector('.miao-sample-gallery').scrollTop>0,'切换后恢复卡片焦点和网格滚动');
        set('选择方式','random');await wait();
        let draws=0;try{selectGenerationProfile(p.settings,{random:()=>{draws++;return 0;}});}catch{}
        check(p.settings.profileSelectionMode==='random'&&!!document.querySelector('.miao-profile-warning')&&draws===0&&p.calls.length===0,'空随机池保留多选界面，阻止抽取与生成');
        const broken=tile('gallery-3').querySelector('img');broken.dispatchEvent(new Event('error'));document.querySelector('.miao-settings').dispatchEvent(new Event('miao-profile-previews'));
        check(broken.hidden&&!tile('gallery-3').querySelector('.miao-muted').hidden,'失败例图在状态刷新后继续显示占位，不暴露压缩或损坏图片');
        tile('gallery-0').click();tile('gallery-1').click();await wait();
        check(p.settings.randomProfileIds.join(',')==='gallery-0,gallery-1'&&p.settings.active===23&&!document.querySelector('.miao-profile-warning'),'卡片多选与当前编辑对象分离');
        tile('gallery-0').click();await wait();check(p.settings.profileSelectionMode==='random'&&!!document.querySelector('.miao-profile-warning')&&!tile('gallery-0').textContent.includes('♡'),'取消后保留多选界面并立即移除心形');tile('gallery-0').click();await wait();
        set('通用提示词','fixture unsaved sample prompt');const pool=JSON.stringify(p.settings.randomProfileIds);edit('gallery-7').click();await wait();
        check(p.settings.active===7&&JSON.stringify(p.settings.randomProfileIds)===pool&&field('通用提示词').value==='fixture unsaved sample prompt'&&edit('gallery-7').getAttribute('aria-current')==='true','可以编辑池外配置，保留随机池、草稿与独立编辑状态');
        set('配置名称','重命名的配置');check(tile('gallery-7').textContent.includes('重命名的配置')&&document.querySelector('.miao-profile-editing').textContent.includes('重命名的配置'),'改名即时同步例图和编辑标题');
        check(all.every(profile=>!profile.name.includes('♡'))&&all.every(profile=>!promptFileData(profile).name.includes('♡')),'心形不写入名称或导出配置');
        check(!document.querySelector('.miao-sample-tile button')&&edit('gallery-7').parentElement===tile('gallery-7').parentElement,'选择和编辑是独立按钮，不嵌套交互节点');
        const gallery=document.querySelector('.miao-sample-gallery');gallery.scrollTop=0;await wait();
        const target=tile('gallery-2'),rect=target.getBoundingClientRect(),point={bubbles:true,cancelable:true,pointerType:'touch',pointerId:70,isPrimary:true,clientX:rect.left+10,clientY:rect.top+10};
        target.dispatchEvent(new PointerEvent('pointerdown',point));target.dispatchEvent(new PointerEvent('pointerup',point));tile('gallery-2').dispatchEvent(new MouseEvent('click',{...point,detail:1}));
        check(p.settings.randomProfileIds.includes('gallery-2'),'一次触摸及延迟 click 只切换一次');
        tile('gallery-2').click();check(!p.settings.randomProfileIds.includes('gallery-2'),'键盘形式的 click 可以继续切换选择');
        const toggle=[...document.querySelectorAll('.miao-switch-row')].find(row=>row.textContent.startsWith('为最后一张图')).querySelector('input');toggle.click();set('彩蛋使用配置','gallery-2');
        const savedPool=JSON.stringify(p.settings.randomProfileIds);button('排序').click();await wait();const order=[...document.querySelectorAll('.miao-order-row')].find(row=>row.dataset.profileId==='gallery-7');order.querySelector('[data-direction="-1"]').click();await wait();
        check(p.settings.profiles[p.settings.active].id==='gallery-7'&&JSON.stringify(p.settings.randomProfileIds)===savedPool&&p.settings.eggProfileId==='gallery-2','排序按稳定 ID 保留编辑对象、随机池和彩蛋引用');
        button('复制配置').click();await wait();check(JSON.stringify(p.settings.randomProfileIds)===savedPool&&!p.settings.profiles[p.settings.active].preview,'复制配置不自动入池，不重建原例图');
        button('新增配置').click();await wait();check(JSON.stringify(p.settings.randomProfileIds)===savedPool,'新增配置不自动入池');
        const transfer=new DataTransfer();transfer.items.add(new File([JSON.stringify(promptFileData({...defaults,name:'fixture imported'}))],'fixture.json',{type:'application/json'}));const upload=document.querySelector('[data-miao-prompt-import]'),before=p.settings.profiles.length;upload.files=transfer.files;upload.dispatchEvent(new Event('change',{bubbles:true}));await settle(()=>p.settings.profiles.length===before+1);await wait();
        check(JSON.stringify(p.settings.randomProfileIds)===savedPool&&field('配置名称').value==='fixture imported','导入配置切换编辑对象，不自动入池');
        await go('生成');set('API Key','fixture-gallery-key');button('保存密钥').click();await settle(()=>document.querySelector('[role=status]')?.textContent==='Key 已就绪');await go('配置');
        const current=p.settings.profiles[p.settings.active],others=p.settings.profiles.filter(profile=>profile!==current).map(profile=>JSON.stringify(profile.preview)),posts=p.calls.length;
        button('刷新例图').click();await settle(()=>!!current.preview?.url);check(p.calls.length===posts+1&&p.settings.profiles.filter(profile=>profile!==current).every((profile,i)=>JSON.stringify(profile.preview)===others[i])&&JSON.stringify(p.settings.randomProfileIds)===savedPool,'刷新例图只生成当前编辑配置，不遍历随机池');
        document.querySelector('.miao-sample-gallery').scrollTop=180;await wait();const top=document.querySelector('.miao-sample-gallery').scrollTop;await close();await open();await wait();
        check(p.settings.profiles[p.settings.active]===current&&JSON.stringify(p.settings.randomProfileIds)===savedPool&&Math.abs(document.querySelector('.miao-sample-gallery').scrollTop-top)<2,'关闭重开保留选择、编辑对象和网格滚动');
        check(p.settings.samplePrompt==='fixture unsaved sample prompt','例图提示词保持单份全局设置，切换编辑没有丢失草稿');
        // Keep the resulting panel available for visual and real-input inspection.
        check(true,'配置页回归完成（模拟请求，非 iOS 真机验收）');
    }catch(error){results.push('FAIL '+error.message);}
    report.textContent=results.join('\n');
}
