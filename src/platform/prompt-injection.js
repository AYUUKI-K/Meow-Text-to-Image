import {composePrompt} from '../prompts/prompt-composer.js';
import {secondaryEnabled} from '../prompts/secondary-tags.js';
import {captureTemplate,resolveCapture} from '../chat/secondary-placement.js';
import {drawingOptions,drawingOutputRule,sharedDrawingText} from '../prompts/drawing-options.js';
export const PROMPT_ID='miao_nai_image_instruction';
export function createPromptInjection({context,settings,onError}){
    return {update(){try{
        const text=settings.enabled&&!secondaryEnabled(settings)&&settings.promptConfig?.mode==='builtin'
            ?resolveCapture(captureTemplate(sharedDrawingText(composePrompt(settings.promptConfig))),{start:settings.startTag??'image###',end:settings.endTag??'###'})
                .replace('</imageTag>',()=>drawingOutputRule(drawingOptions(settings.promptConfig))+'\n</imageTag>')
            :'';
        const host=context();if(typeof host.setExtensionPrompt!=='function')throw Error('宿主不支持 setExtensionPrompt');
        host.setExtensionPrompt(PROMPT_ID,text,1,0,false,0);return text;
    }catch(error){onError(error);throw error;}}};
}
