import {stageError,redactErrorText} from '../platform/request-errors.js';

export function queueConnectionError(operation,direct,relay){
    const describe=(route,error)=>`${route}：${error?.status?`HTTP ${error.status}`:'未取得 HTTP 响应'}；${error?.name||'Error'}${error?.retryAfterMs?`；Retry-After ${error.retryAfterMs}ms`:''}\n${redactErrorText(error?.message||'请求失败').slice(0,700)}`;
    const error=stageError('queue',Error('当前浏览器直连队列失败，SillyTavern 服务端转接也未成功。请检查当前设备与酒馆服务端的网络、代理设置，以及酒馆是否支持网页访问接口。'));
    error.operation=operation;
    error.message+=`\n阶段：${operation}\n${describe('浏览器直连（队列）',direct)}\n${describe('SillyTavern 服务端转接',relay)}`;
    return error;
}
