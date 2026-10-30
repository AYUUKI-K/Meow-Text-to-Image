import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,buildRequest,normalizeProfile} from '../src/core/core.js';
import {novelAIPresets,applyNovelAIPresets} from '../src/novelai/novelai-presets.js';
import {naiPayload} from '../src/novelai/direct-client.js';
import {promptFileData,importPromptData} from '../src/prompts/prompt-files.js';
import {sampleSignature} from '../src/profiles/profile-previews.js';

const profile={...defaults,qualityPreset:'none',ucPreset:'none',positive:'front',positiveSuffix:'back',negative:'custom negative',seed:42};
test('website quality suffixes follow the selected model and come after all user positive parts',()=>{
 const suffixes={
  'nai-diffusion-5-full':'very aesthetic, masterpiece, no text',
  'nai-diffusion-5-curated':'very aesthetic, masterpiece, no text',
  'nai-diffusion-4-5-full':'very aesthetic, masterpiece, no text',
  'nai-diffusion-4-5-curated':'very aesthetic, masterpiece, no text, -0.8::feet::, rating:general',
  'nai-diffusion-4-full':'no text, best quality, very aesthetic, absurdres',
  'nai-diffusion-4-curated-preview':'rating:general, best quality, very aesthetic, absurdres',
  'nai-diffusion-3':'best quality, amazing quality, very aesthetic, absurdres',
  'nai-diffusion-furry-3':'{best quality}, {amazing quality}',
 };
 for(const [model,suffix] of Object.entries(suffixes)){
  const p={...profile,model,qualityPreset:'standard'},before=structuredClone(p),request=buildRequest(p,'scene');
  assert.equal(request.prompt,`front,\nscene,\nback, ${suffix}, `);assert.equal(request.negative_prompt,p.negative);assert.deepEqual(p,before);
  const direct=naiPayload(request);assert.equal(direct.input,request.prompt);assert.equal(direct.parameters.v4_prompt.caption.base_caption,request.prompt);assert.equal(direct.parameters.qualityToggle,false);
 }
 for(const model of ['nai-diffusion-5-full','nai-diffusion-5-curated'])assert.equal(buildRequest({...profile,model,qualityPreset:'light'},'scene').prompt,'front,\nscene,\nback, very aesthetic, amazing quality, no text, ');
});
test('UC presets prepend model-specific tags and follow the website nsfw condition on non-curated models',()=>{
 const heavy='lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page';
 const request=buildRequest({...profile,ucPreset:'heavy'},'scene');
 assert.equal(request.negative_prompt,`nsfw, ${heavy}, custom negative`);
 assert.equal(buildRequest({...profile,ucPreset:'heavy'},'NSFW scene').negative_prompt,`${heavy}, custom negative`);
 const curated=buildRequest({...profile,model:'nai-diffusion-4-5-curated',ucPreset:'light'},'scene');
 assert.equal(curated.negative_prompt,'blurry, lowres, upscaled, artistic error, scan artifacts, jpeg artifacts, logo, too many watermarks, negative space, blank page, custom negative');
 const v5=buildRequest({...profile,model:'nai-diffusion-5-curated',ucPreset:'light',negative:''},'scene');
 assert.equal(v5.negative_prompt,'lowres, bad hands, bad anatomy, artistic error, sepia, white haze, worst quality, very displeasing, jpeg artifacts, 0::ai-generated::, ');
 const human=buildRequest({...profile,ucPreset:'humanFocus'},'scene');assert.ok(human.negative_prompt.includes('blank page, @_@, mismatched pupils, glowing eyes, bad anatomy, custom negative'));
 const furry=buildRequest({...profile,ucPreset:'furryFocus'},'scene');assert.ok(furry.negative_prompt.includes('{{grandfathered content}}'));
 const direct=naiPayload(request);assert.equal(direct.parameters.negative_prompt,request.negative_prompt);assert.equal(direct.parameters.v4_negative_prompt.caption.base_caption,request.negative_prompt);
});
test('legacy configurations get Standard/Heavy, while explicit None and unsupported presets add no tags',()=>{
 const old=normalizeProfile({positive:'old',negative:'avoid'});assert.equal(old.qualityPreset,'standard');assert.equal(old.ucPreset,'heavy');
 for(const patch of [{},{qualityPreset:'none',ucPreset:'none'},{qualityPreset:'unknown',ucPreset:'unknown'},{model:'unknown-model',qualityPreset:'standard',ucPreset:'heavy'}]){
  const request=buildRequest({...profile,...patch},'scene');assert.equal(request.prompt,'front,\nscene,\nback,');assert.equal(request.negative_prompt,profile.negative);
 }
 assert.equal(buildRequest({...profile,qualityPreset:'light'},'scene').prompt,'front,\nscene,\nback,');
 assert.deepEqual(novelAIPresets('nai-diffusion-4-5-curated','uc').map(x=>x.id),['heavy','light','humanFocus','none']);
});
test('website preset composition preserves repeated and weighted tags without deduplicating',()=>{
 const p={...profile,positive:'masterpiece, 1.2::masterpiece, no text::',positiveSuffix:'masterpiece',negative:'lowres, {{lowres}}, 0::ai-generated::',qualityPreset:'standard',ucPreset:'heavy'};
 const r=buildRequest(p,'masterpiece');assert.equal(r.prompt,'masterpiece, 1.2::masterpiece, no text::,\nmasterpiece,\nmasterpiece, very aesthetic, masterpiece, no text, ');assert.ok(r.negative_prompt.endsWith(', lowres, {{lowres}}, 0::ai-generated::'));
});
test('preset composition preserves V4 character captions, text and quoted chunks; V3 mixing keeps weights',()=>{
 const p={...profile,qualityPreset:'standard',ucPreset:'heavy'};
 const r=applyNovelAIPresets(p,'base ||quoted|chunk||, text:Hello|character','bad|character bad');
 assert.equal(r.prompt,'base ||quoted|chunk||, very aesthetic, masterpiece, no text, text:Hello|character');assert.ok(r.negative.endsWith(', bad|character bad'));
 const v3=applyNovelAIPresets({...p,model:'nai-diffusion-3'},'cat:0.5|dog:0.5','bad');
 assert.equal(v3.prompt,'cat, best quality, amazing quality, very aesthetic, absurdres:0.5|dog, best quality, amazing quality, very aesthetic, absurdres:0.5');
});
test('presets survive portable config export/import and invalidate preview signatures independently',()=>{
 const p={...profile,qualityPreset:'standard',ucPreset:'heavy'},data=promptFileData(p),restored=importPromptData(data);
 assert.equal(restored.qualityPreset,'standard');assert.equal(restored.ucPreset,'heavy');
 assert.equal(buildRequest(restored,'scene').prompt,buildRequest(p,'scene').prompt);
 const old=structuredClone(data);delete old.parameters.qualityPreset;delete old.parameters.ucPreset;
 assert.equal(importPromptData(old).qualityPreset,'standard');assert.equal(importPromptData(old).ucPreset,'heavy');
 for(const key of ['qualityPreset','ucPreset']){assert.throws(()=>importPromptData({...data,parameters:{...data.parameters,[key]:{}}}),/预设/);assert.notEqual(sampleSignature(p),sampleSignature({...p,[key]:'none'}));}
});

test('every official tag list terminates with comma-space and new configurations enable Standard/Heavy',()=>{
 assert.equal(defaults.qualityPreset,'standard');assert.equal(defaults.ucPreset,'heavy');
 for(const model of ['nai-diffusion-5-full','nai-diffusion-5-curated','nai-diffusion-4-5-full','nai-diffusion-4-5-curated','nai-diffusion-4-full','nai-diffusion-4-curated-preview','nai-diffusion-3','nai-diffusion-furry-3']){
  for(const kind of ['quality','uc'])for(const p of novelAIPresets(model,kind))for(const key of ['prefix','suffix'])if(p[key])assert.ok(p[key].endsWith(', '));
  const r=buildRequest({...defaults,model,positive:'',positiveSuffix:'',negative:''},'scene');assert.ok(r.prompt.endsWith(', '));assert.ok(r.negative_prompt.endsWith(', '));
 }
 const none=normalizeProfile({qualityPreset:'none',ucPreset:'none'});assert.equal(none.qualityPreset,'none');assert.equal(none.ucPreset,'none');
});
