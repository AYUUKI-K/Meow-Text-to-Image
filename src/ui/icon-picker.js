import {showPanelPage} from './panel-page.js';
import {loadHostIcons,filterIcons,fontAwesomeElement} from './fontawesome-icons.js';
import {bindButtonPress} from './button-press.js';

export async function showFloatingIconPicker({parent,selected}){
    const doc=parent.ownerDocument,make=(tag,text,cls)=>{const el=doc.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
    const root=make('section',undefined,'miao-icon-picker'),header=make('header'),title=make('h3','选择悬浮图标'),reset=make('button','恢复默认图标','miao-button');reset.type='button';header.append(title,reset);
    const tools=make('div',undefined,'miao-icon-tools'),search=make('input'),family=make('select');search.type='search';search.placeholder='名称或编码，如 cat / f1b0 / 0xf005';search.setAttribute('aria-label','搜索 Font Awesome 图标');search.dataset.initialFocus='true';family.setAttribute('aria-label','图标分类');
    for(const [value,label] of [['all','全部'],['solid','实心'],['brands','品牌']]){const option=make('option',label);option.value=value;family.append(option);}tools.append(search,family);
    const status=make('p','正在读取酒馆图标库…','miao-muted'),scroll=make('div',undefined,'miao-icon-scroll'),grid=make('div',undefined,'miao-icon-grid');scroll.tabIndex=0;scroll.setAttribute('aria-label','可选图标');scroll.append(grid);
    const pager=make('nav',undefined,'miao-icon-pagination'),previous=make('button','上一页','miao-button'),next=make('button','下一页','miao-button'),count=make('span');pager.setAttribute('aria-label','图标分页');previous.type=next.type='button';count.setAttribute('aria-live','polite');pager.append(previous,count,next);root.append(header,tools,status,scroll,pager);
    let finish=()=>{},result,icons=[],page=0;const size=96;
    const popup=showPanelPage(root,{parent,kind:'icons',closeLabel:'取消',onOpen:popup=>{finish=popup.completeAffirmative;}});
    bindButtonPress(reset,()=>{result=null;finish();});
    const paint=()=>{
        const matches=filterIcons(icons,search.value,family.value),pages=Math.max(1,Math.ceil(matches.length/size));page=Math.min(page,pages-1);grid.replaceChildren();
        for(const icon of matches.slice(page*size,(page+1)*size)){
            const button=make('button',undefined,'miao-icon-option'),name=icon.name.slice(3);button.type='button';button.title=icon.names.map(name=>name.slice(3)).join(' / ');button.setAttribute('aria-label',`${name} · U+${icon.unicode.toUpperCase()}`);button.setAttribute('aria-pressed',String(selected?.family===icon.family&&selected?.unicode===icon.unicode));
            button.append(fontAwesomeElement(icon,doc),make('span',name),make('small','U+'+icon.unicode.toUpperCase()));bindButtonPress(button,()=>{result={name:icon.name,unicode:icon.unicode,family:icon.family};finish();});grid.append(button);
        }
        status.textContent=matches.length?`${matches.length} 个图标`:'没有匹配的图标';count.textContent=`${page+1} / ${pages}`;previous.disabled=page===0;next.disabled=page===pages-1;scroll.scrollTop=0;
    };
    previous.disabled=next.disabled=true;
    search.addEventListener('input',()=>{page=0;paint();});family.addEventListener('change',()=>{page=0;paint();});bindButtonPress(previous,()=>{if(page>0){page--;paint();}});bindButtonPress(next,()=>{page++;paint();});
    loadHostIcons().then(loaded=>{icons=loaded;if(root.isConnected)paint();}).catch(error=>{if(root.isConnected)status.textContent=error.message;});
    await popup;return result;
}
