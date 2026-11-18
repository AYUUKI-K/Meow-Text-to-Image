import {composePrompt} from '../prompts/prompt-composer.js';
import {secondaryEnabled} from '../prompts/secondary-tags.js';
export const PROMPT_ID='miao_nai_image_instruction';
export function createPromptInjection({context,settings,onError}){
    return {update(){try{
        const text=settings.enabled&&!secondaryEnabled(settings)&&settings.promptConfig?.mode==='builtin'?composePrompt(settings.promptConfig):'';
        const host=context();if(typeof host.setExtensionPrompt!=='function')throw Error('宿主不支持 setExtensionPrompt');
        host.setExtensionPrompt(PROMPT_ID,text,1,0,false,0);return text;
    }catch(error){onError(error);throw error;}}};
}
