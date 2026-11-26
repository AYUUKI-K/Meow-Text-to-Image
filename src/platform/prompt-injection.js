import {composePrompt} from '../prompts/prompt-composer.js';
import {secondaryEnabled} from '../prompts/secondary-tags.js';
import {captureTemplate,resolveCapture} from '../chat/secondary-placement.js';
import {drawingOptions,drawingOutputRule,mainDrawingTitleRule,sharedDrawingText} from '../prompts/drawing-options.js';
import {eggDialogueLanguage} from '../profiles/profile-selection.js';
export const PROMPT_ID='miao_nai_image_instruction';
export function createPromptInjection({context,settings,onError}){
    return {update(){try{
        const output=drawingOptions(settings.promptConfig);
        const rules=[drawingOutputRule({...output,eggDialogue:eggDialogueLanguage(settings)},{existingEggMarker:true}), output.egg && '正文已有的 meowfm、meow_FM XML 或用户配置的彩蛋标记仅作插入位置。普通插图放在正文段落内，彩蛋图只跟在原有彩蛋标记之后。保持原标记原样，严禁新建、补写或重复任何彩蛋标记。原文没有彩蛋标记时，本楼仅输出普通插图。'].filter(Boolean).join('\n');
        const text=settings.enabled&&!secondaryEnabled(settings)&&settings.promptConfig?.mode==='builtin'
            ?resolveCapture(captureTemplate(sharedDrawingText(composePrompt(settings.promptConfig))),{start:settings.startTag??'image###',end:settings.endTag??'###'})
                .replace('</imageTag>',()=>[rules,output.title&&mainDrawingTitleRule,'</imageTag>'].filter(Boolean).join('\n'))
            :'';
        const host=context();if(typeof host.setExtensionPrompt!=='function')throw Error('宿主不支持 setExtensionPrompt');
        host.setExtensionPrompt(PROMPT_ID,text,1,0,false,0);return text;
    }catch(error){onError(error);throw error;}}};
}
