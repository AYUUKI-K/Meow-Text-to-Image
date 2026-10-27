import {showPagePopup} from './page-popup.js';
import {bindButtonPress} from './button-press.js';

// Selection changes the gallery view only; image ownership and paths stay intact.
export function showArchivePicker({parent,title,items,selected,onSelect}){
    const doc=parent.ownerDocument;
    const make=(tag,text,cls)=>{const element=doc.createElement(tag);if(text!==undefined)element.textContent=text;if(cls)element.className=cls;return element;};
    const content=make('section',undefined,'miao-archive-picker'),heading=make('h3',title),search=make('input'),list=make('nav',undefined,'miao-archive-options');
    search.type='search';search.placeholder='搜索名称';search.setAttribute('aria-label',title+'：搜索名称');search.autocomplete='off';
    list.setAttribute('aria-label',title);list.setAttribute('aria-live','polite');content.append(heading,search,list);
    let close=()=>{};
    const current=items.reduce((best,item)=>item.path.length<=selected.length&&item.path.every((part,index)=>part===selected[index])&&(!best||item.path.length>best.path.length)?item:best,null);
    const paint=()=>{
        list.replaceChildren();const query=search.value.trim().toLocaleLowerCase();
        const matches=items.filter((item,index)=>index===0||!query||item.label.toLocaleLowerCase().includes(query));
        for(const item of matches){
            const button=make('button',undefined,'miao-button miao-archive-option');button.type='button';button.setAttribute('aria-pressed',String(item===current));
            button.append(make('span',item.label),make('small',item.count+' 张'));
            bindButtonPress(button,()=>{close();onSelect([...item.path]);});list.append(button);
        }
        if(query&&matches.length===1)list.append(make('p','没有匹配的分类','miao-muted'));
    };
    paint();search.addEventListener('input',paint);
    return showPagePopup(content,{parent,closeLabel:'取消',onOpen:popup=>{
        close=popup.completeAffirmative;popup.dlg.classList.add('miao-archive-picker-dialog');
    }});
}
