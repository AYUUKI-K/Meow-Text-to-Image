import {redactErrorText} from './request-errors.js';

export function summarizeError(error){
    const message=redactErrorText(error?.message??error??'操作失败').slice(0,2200);
    const safe=value=>redactErrorText(String(value||'')).replace(/[\r\n\t]/g,' ').slice(0,150);
    const code=safe(error?.diagnosticCode)||['MIAO',safe(error?.source)||'operation',safe(error?.code)||safe(error?.name)||'error',Number.isInteger(error?.status)?error.status:''].filter(Boolean).join('_').toUpperCase();
    let brief=message.split('\n').find(line=>line.trim())||'操作失败';
    if(brief.length>105)brief=brief.slice(0,104)+'…';
    const generation=['nai-generation','tavern-generation','nai-encode'].includes(error?.source);
    const uncertain=error?.localGenerationTimeout||generation&&([408,500,502,503,504].includes(error?.status)||['TypeError','AbortError','TimeoutError'].includes(error?.name));
    if(uncertain&&!/结果.*(?:不确定|未确定)|先检查|不会自动重试/.test(brief))brief+='；结果未确定，请先检查图片。';
    const diagnostic=[`错误码：${code}`,error?.source?`来源：${safe(error.source)}`:'',Number.isInteger(error?.status)?`HTTP：${error.status}`:'',message].filter(Boolean).join('\n');
    return {brief,code,diagnostic};
}
