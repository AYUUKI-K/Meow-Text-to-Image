import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,buildRequest} from '../src/core/core.js';
import {selectVibes} from '../src/vibe/vibe.js';
import {selectGenerationProfile,reconcileProfileSelection} from '../src/profiles/profile-selection.js';
import {ensureProfileIds,moveProfile,planProfileRemoval} from '../src/profiles/profile-previews.js';
import {runGenerationTask} from '../src/generation/generation-options.js';
import {httpRequestError} from '../src/platform/request-errors.js';
const fixture=()=>({profiles:['a','b','c'].map((id,i)=>({...defaults,id,name:id,positive:id,negative:id,width:512+64*i,seed:i,vibeEnabled:false,vibes:[{id:'keep'}]})),active:1});

test('legacy settings gain disabled global policies without changing profiles, previews or IDs',()=>{
    const settings=fixture();settings.profiles[0].preview={url:'sample.png'};const before=structuredClone(settings.profiles);
    assert.deepEqual(reconcileProfileSelection(settings),[]);assert.deepEqual(settings.profiles,before);
    assert.equal(settings.profileSelectionMode,'single');assert.equal(settings.eggProfileEnabled,false);assert.equal(settings.eggProfileId,null);
    assert.equal(selectGenerationProfile(settings).profileId,'b');
    delete settings.profiles[0].id;ensureProfileIds(settings.profiles);const id=settings.profiles[0].id;ensureProfileIds(settings.profiles);assert.equal(settings.profiles[0].id,id);assert.equal(settings.profiles[0].preview.url,'sample.png');
});
test('each pool entry has an equal interval, independent of editor, order, copies and imports',()=>{
    const settings={...fixture(),profileSelectionMode:'random',randomProfileIds:['c','a','b']};
    assert.deepEqual([0,1/3,2/3,0.99999].map(random=>selectGenerationProfile(settings,{random:()=>random}).profileId),['c','a','b','b']);
    moveProfile(settings,'a',1);settings.profiles.push({...defaults,id:'new',name:'new'});reconcileProfileSelection(settings);
    assert.deepEqual(settings.randomProfileIds,['c','a','b']);assert.equal(selectGenerationProfile(settings,{random:()=>0}).profileId,'c');
});
test('selected parameters and Vibe come from one detached snapshot; egg overrides either ordinary mode without a draw',()=>{
    for(const mode of ['single','random']){
        const settings={...fixture(),profileSelectionMode:mode,randomProfileIds:['a','b'],eggProfileEnabled:true,eggProfileId:'c'};
        const selected=selectGenerationProfile(settings,{egg:true,random:()=>{throw Error('unexpected draw');}});
        settings.profiles[2].positive='changed';settings.profiles[2].vibes=[];
        const request=buildRequest(selected.profile,'scene');request.vibes=selectVibes(selected.profile,[]);
        assert.equal(selected.profileId,'c');assert.equal(selected.profileName,'c');assert.equal(request.prompt.startsWith('c,'),true);assert.equal(request.width,640);assert.equal(request.seed,2);assert.deepEqual(request.vibes,[]);assert.equal(selected.profile.vibes.length,1);
    }
});
test('deleting invalid IDs cleans pools and disables missing egg with explicit fallback warnings',()=>{
    const settings={...fixture(),profileSelectionMode:'random',randomProfileIds:['a','b','a','missing'],eggProfileEnabled:true,eggProfileId:'a'};
    const removal=planProfileRemoval(settings,['a']);Object.assign(settings,{profiles:removal.profiles,active:removal.active});
    assert.equal(reconcileProfileSelection(settings).length,2);assert.deepEqual(settings.randomProfileIds,['b']);assert.equal(settings.profileSelectionMode,'single');assert.equal(settings.eggProfileEnabled,false);assert.equal(settings.eggProfileId,null);
    settings.profileSelectionMode='random';assert.throws(()=>selectGenerationProfile(settings),/至少/);
    settings.eggProfileEnabled=true;assert.throws(()=>selectGenerationProfile(settings,{egg:true}),/不存在/);
});
test('429 task retries reuse one profile and seed snapshot, while a new task draws again',async()=>{
    const settings={...fixture(),profileSelectionMode:'random',randomProfileIds:['a','b']};let draws=0,posts=0;
    const selected=selectGenerationProfile(settings,{random:()=>{draws++;return 0;}}),request=buildRequest({...selected.profile,seed:-1},'scene'),before=structuredClone(request);
    await runGenerationTask({scope:{autoRetryEnabled:true},retryOptions:{sleep:async()=>{}},generate:async()=>{posts++;assert.deepEqual(request,before);if(posts<3)throw httpRequestError({source:'nai-generation',status:429});return 'image';}});
    assert.equal(posts,3);assert.equal(draws,1);selectGenerationProfile(settings,{random:()=>{draws++;return 0.9;}});assert.equal(draws,2);
});
