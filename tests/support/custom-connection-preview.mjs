// Browser interaction regression for the custom NovelAI connection settings.
export async function runCustomConnectionPreview({p,wait}){
    const results=[],report=document.getElementById('report');
    const check=(condition,label)=>{results.push((condition?'PASS ':'FAIL ')+label);report.textContent=results.join('\n');if(!condition)throw Error(label);};
    const settle=async fn=>{for(let i=0;i<80;i++){if(fn())return;await wait();}throw Error('custom connection fixture timed out');};
    const control=label=>[...document.querySelectorAll('.miao-field')].find(field=>field.querySelector('span')?.textContent===label)?.querySelector('input,select,textarea');
    const select=(label,value)=>{const element=control(label);if(!element)throw Error(`missing field: ${label}`);element.value=value;element.dispatchEvent(new Event('change',{bubbles:true}));return element;};
    const open=async()=>{document.getElementById('miao-nai-menu').click();await settle(()=>document.querySelector('.miao-settings'));const root=document.querySelector('.miao-settings');if(getComputedStyle(root.querySelector('.miao-tabs')).display==='none'){root.querySelector('.miao-overview-row[aria-label="生成"]').click();}await wait();};
    const close=async()=>{document.querySelector('.miao-drawer-close').click();await wait();};
    try{
        await open();
        const connection=control('连接方式');connection.value='custom';connection.dispatchEvent(new Event('change',{bubbles:true}));await wait();
        const url=control('自定义 API 地址'),generation=control('生图 URL 处理'),mode=control('Vibe 在线编码地址'),vibeURL=control('Vibe 自定义 URL 或追加路径');
        check(!!url&&generation?.value==='auto'&&mode?.value==='derived','新自定义连接默认 auto + derived，页面初始化无 ReferenceError');
        check(!control('实际生图请求 URL')&&!control('实际 Vibe 请求 URL')&&!document.querySelector('.miao-panel-body').textContent.includes('在线编码已禁用；'),'移除预览节点和长期技术提示');
        check(vibeURL.closest('.miao-field').hidden,'推荐模式下隐藏手动 Vibe 地址');
        const calls=p.calls.length,queueCalls=p.queueCalls?.length||0,backendCalls=p.backendCalls?.length||0;
        mode.value='manual';mode.dispatchEvent(new Event('change',{bubbles:true}));
        check(!vibeURL.closest('.miao-field').hidden,'切换到 manual 后立即显示自定义地址');
        vibeURL.value='vendor/encode';vibeURL.dispatchEvent(new Event('input',{bubbles:true}));
        url.value='https://relay.invalid/v1';url.dispatchEvent(new Event('input',{bubbles:true}));
        select('生图 URL 处理','exact');
        check(p.calls.length===calls&&(p.queueCalls?.length||0)===queueCalls&&(p.backendCalls?.length||0)===backendCalls,'切换模式及输入时不保存配置或发送网络请求');
        const key=control('API Key');key.value='fixture-placeholder-key';key.dispatchEvent(new Event('input',{bubbles:true}));
        [...document.querySelectorAll('.miao-button')].find(button=>button.textContent==='保存自定义连接').click();
        await settle(()=>p.settings.customEncodeURLMode==='manual');
        check(p.settings.customGenerationURL==='https://relay.invalid/v1'&&p.settings.customGenerationURLMode==='exact'&&p.settings.customEncodeURL==='vendor/encode','有效完整 URL 与相对 Vibe 路径保存成功');
        select('Vibe 在线编码地址','derived');check(vibeURL.closest('.miao-field').hidden,'manual 切换到 derived 后立即隐藏地址');
        select('Vibe 在线编码地址','disabled');check(vibeURL.closest('.miao-field').hidden,'切换到 disabled 后地址保持隐藏');
        [...document.querySelectorAll('.miao-button')].find(button=>button.textContent==='保存自定义连接').click();
        await settle(()=>p.settings.customEncodeURLMode==='disabled');
        await close();await open();
        check(control('生图 URL 处理').value==='exact'&&control('Vibe 在线编码地址').value==='disabled','重新打开设置后已保存的模式保持不变');
        await close();
        p.settings.customGenerationURL='https://legacy.invalid/custom';p.settings.customGenerationURLMode='exact';p.settings.customEncodeURLMode='manual';
        await open();
        check(control('生图 URL 处理').value==='exact'&&control('Vibe 在线编码地址').value==='manual','已有 exact 与 manual 配置在 UI 中保持原值');
        await close();
    }catch(error){results.push('FAIL '+error.stack);report.textContent=results.join('\n');}
}
