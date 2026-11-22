import {defaultLegacyPromptSettings} from '../../src/prompts/prompt-settings.js';

// Synthetic v1 configurations only; no saved host/user settings are read.
export function configurePromptTreeFixture({settings,preview}) {
    const variant=new URL(location.href).searchParams.get('prompt-v1');
    if(!variant)return;
    const saved=sessionStorage.getItem('miao-preview-prompt-state');
    const config=defaultLegacyPromptSettings(variant==='external'?'external':'builtin');
    config.fixed.人格='V1_FIXTURE';config.fixed.彩蛋标签='/fixture_marker';config.orientation='bl';
    if(variant==='custom')config.overrides={main:'V1_CUSTOM_WHOLE_BODY {{user}}'};
    settings.promptConfig=saved?JSON.parse(saved):config;
    preview.originalPromptConfig=structuredClone(config);
    preview.promptMigrationFixture=true;
    if(variant==='save-fail')preview.failSettingsSave=true;
}
