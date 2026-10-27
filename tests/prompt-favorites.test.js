import test from 'node:test';
import assert from 'node:assert/strict';
import {createFavorites,validateFavorite,favoritesEnabled} from '../prompt-favorites.js';
import {thumbnailURL,localImagePath} from '../image-thumbnails.js';

const base='http://localhost:8000/';
const draft={name:'雨天场景',positive:'girl in a rainy garden',images:['user/images/miao-nai/scene.png']};

test('收藏默认关闭，开关只控制入口而不清空收藏及图片保护',async()=>{
    const settings={},store=createFavorites({settings,persist:async()=>{},base:()=>base});
    assert.equal(favoritesEnabled(settings),false);
    settings.promptFavoritesEnabled=true;const saved=await store.save(draft);assert.equal(favoritesEnabled(settings),true);
    settings.promptFavoritesEnabled=false;assert.equal(favoritesEnabled(settings),false);assert.equal(store.list()[0].id,saved.id);assert.equal(store.protects(draft.images[0]),true);
    settings.promptFavoritesEnabled=true;assert.equal(store.list()[0].positive,draft.positive);
});
test('收藏只保存场景词，通过设置持久化后保留多张例图',async()=>{
    const settings={profiles:[{width:832}],active:0};let disk;
    const store=createFavorites({settings,persist:async()=>{disk=JSON.parse(JSON.stringify(settings));},base:()=>base});
    const item=await store.save({...draft,positiveSuffix:'不得收藏的后置串',negative:'不得收藏的负面串',images:[...draft.images,'/user/images/miao-nai/second.png']});
    assert.equal('positiveSuffix' in item,false);assert.equal('negative' in item,false);
    assert.equal(settings.active,0);assert.equal(settings.profiles[0].width,832);
    const restored=createFavorites({settings:disk,persist:async()=>{},base:()=>base});assert.deepEqual(restored.list()[0],item);
    assert.equal(restored.protects('http://localhost:8000/user/images/miao-nai/scene.png'),true);
    await restored.remove(item.id);assert.equal(restored.protects('/user/images/miao-nai/scene.png'),false);
});
test('保存失败回滚收藏；串行保存不会把另一条记录覆盖掉',async()=>{
    const settings={};let fail=true;
    const store=createFavorites({settings,persist:async()=>{if(fail)throw Error('offline');},base:()=>base});
    await assert.rejects(store.save(draft),/offline/);assert.deepEqual(store.list(),[]);fail=false;
    await Promise.all([store.save(draft),store.save({...draft,name:'第二条'})]);assert.equal(store.list().length,2);
    const before=structuredClone(store.list());fail=true;await assert.rejects(store.remove(before[0].id),/offline/);assert.deepEqual(store.list(),before);
});
test('收藏图片的不同 URL 写法得到相同保护与缩略图路径',async()=>{
    const relative='user/images/miao-nai/例图.png',absolute='http://localhost:8000/user/images/miao-nai/%E4%BE%8B%E5%9B%BE.png';
    assert.equal(localImagePath(relative,base),localImagePath(absolute,base));assert.equal(await thumbnailURL(relative,base),await thumbnailURL(absolute,base));
    assert.match(await thumbnailURL(relative,base),/^\/user\/images\/miao-nai-thumbnails\/thumb-[a-f0-9]{64}\.jpg$/);
});
test('空提示词、超量例图及外部或越界图片不能进入收藏',()=>{
    assert.throws(()=>validateFavorite({...draft,positive:'',negative:'不能当成场景词'},base),/提示词/);
    assert.throws(()=>validateFavorite({...draft,images:Array.from({length:9},(_,i)=>`/user/images/miao-nai/${i}.png`)},base),/最多/);
    for(const url of ['https://other.test/user/images/a.png','/user/files/file.json','/user/images/%2e%2e/secret.png'])assert.throws(()=>validateFavorite({...draft,images:[url]},base));
});
test('多次生成的例图追加到同一条收藏，不覆盖场景词',async()=>{
    const settings={},store=createFavorites({settings,persist:async()=>{},base:()=>base});const item=await store.save(draft);
    await Promise.all([store.addImage(item.id,'/user/images/miao-nai/a.png'),store.addImage(item.id,'/user/images/miao-nai/b.png')]);
    assert.equal(store.list().length,1);assert.equal(store.list()[0].positive,draft.positive);assert.equal(store.list()[0].images.length,3);
});
