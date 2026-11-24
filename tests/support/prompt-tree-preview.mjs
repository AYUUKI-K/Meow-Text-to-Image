import {defaultLegacyPromptSettings,defaultPromptSettings} from '../../src/prompts/prompt-settings.js';

// Synthetic historical configurations only; no saved host/user settings are read.
export function configurePromptTreeFixture({settings,preview}) {
    const query=new URL(location.href).searchParams;
    const variant=query.get('prompt-v1'),v2=query.get('prompt-v2');
    if(!variant&&!v2)return;
    const saved=sessionStorage.getItem('miao-preview-prompt-state');
    const config=v2?defaultPromptSettings():defaultLegacyPromptSettings(variant==='external'?'external':'builtin');
    if(v2){
        config.params={persona:'V2_FIXTURE',count:3,eggMarker:'/fixture_marker'};
        config.textOverridesById.composition={body:'V2_KEPT_COMPOSITION'};
        config.enabledById.egg=false;
    }else{
        config.fixed.人格='V1_FIXTURE';config.fixed.彩蛋标签='/fixture_marker';config.orientation='bl';
        if(variant==='custom')config.overrides={main:'V1_CUSTOM_WHOLE_BODY {{user}}'};
    }
    settings.promptConfig=saved?JSON.parse(saved):config;
    preview.originalPromptConfig=structuredClone(config);
    preview.promptMigrationFixture=true;
    if(variant==='save-fail'||v2==='save-fail')preview.failSettingsSave=true;
}
