import {summarizeError} from '../platform/error-summary.js';
import {bindButtonPress} from './button-press.js';
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};

export function createErrorView(error,{title='操作失败',copyText=text=>navigator.clipboard.writeText(text)}={}){
    const info=summarizeError(error),root=node('section',undefined,'miao-prompt-view miao-error-view');
    const heading=node('h3',title),brief=node('p',info.brief,'miao-error-summary'),code=node('code',info.code,'miao-error-code');
    const details=node('details',undefined,'miao-error-details');details.append(node('summary','查看错误详情'),node('pre',info.diagnostic));
    const actions=node('div',undefined,'miao-error-actions'),copy=node('button','复制错误码','miao-button miao-error-copy'),status=node('span','','miao-error-copy-status');copy.type='button';status.setAttribute('role','status');
    bindButtonPress(copy,async()=>{copy.disabled=true;try{await copyText(info.diagnostic);status.textContent='已复制';}catch{details.open=true;status.textContent='复制失败，可展开详情手动复制';}finally{copy.disabled=false;}});
    actions.append(copy,status);root.append(heading,brief,code,actions,details);return root;
}
