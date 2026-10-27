import test from 'node:test';
import assert from 'node:assert/strict';
import {createImagePresentation,JPEG_FOLDER} from '../image-presentation.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const png=new Blob(['original PNG + prompt metadata'],{type:'image/png'}),jpg=new Blob([new Uint8Array([255,216,255,217])],{type:'image/jpeg'});
const image=()=>({dataset:{},alt:'original',removeAttribute(name){delete this[name];}});
function fixture(options={}){
 const files=new Map([['/original.png',png],['/second.png',png]]),reads=[],writes=[];let format='jpg';
 const presentation=createImagePresentation({getFormat:()=>format,base:()=> 'https://tavern.test/',Observer:null,fetchImage:async url=>{reads.push(url);return files.has(url)?new Response(files.get(url)):new Response('',{status:404});},saveJPEG:async(blob,folder,name)=>{const url=`/user/images/${folder}/${name}.jpg`;files.set(url,blob);writes.push({url,blob});return url;},convert:async()=>({blob:jpg}),...options});
 return {presentation,files,reads,writes,setFormat:value=>format=value};
}
test('JPG image sources and exports use a persisted JPEG while PNG export retains the original bytes',async()=>{
 const f=fixture(),element=image();f.presentation.bind(element,'/original.png');assert.equal(element.src,undefined);assert.equal(element.dataset.miaoExportState,'loading');
 const url=await f.presentation.jpeg('/original.png');await tick();assert.equal(element.src,url);assert.match(url,new RegExp(`/user/images/${JPEG_FOLDER}/.*\\.jpg$`));assert.equal(f.writes.length,1);
 const exported=await f.presentation.file({url:'/original.png',name:'original.png'},'jpg');assert.equal(exported.name,'original.jpg');assert.deepEqual(new Uint8Array(await exported.blob.arrayBuffer()),new Uint8Array(await jpg.arrayBuffer()));
 f.setFormat('png');f.presentation.bind(element,'/original.png');assert.equal(element.src,'/original.png');const original=await f.presentation.file({url:'/original.png',name:'original.png'},'png');assert.equal(await original.blob.text(),await png.text());assert.equal(f.writes.length,1);
});
test('switching to PNG or another image while conversion runs cannot apply an old JPEG result',async()=>{
 let release;const f=fixture({convert:async()=>{await new Promise(resolve=>release=resolve);return {blob:jpg};}}),element=image();f.presentation.bind(element,'/original.png');while(!release)await tick();
 f.setFormat('png');f.presentation.bind(element,'/second.png');release();await f.presentation.jpeg('/original.png');await tick();assert.equal(element.src,'/second.png');assert.equal(element.dataset.miaoOriginalUrl,'/second.png');
});
test('conversion failure never falls back to exposing the original PNG in JPG mode',async()=>{
 const errors=[],f=fixture({convert:async()=>{throw Error('encoding failed');},onError:error=>errors.push(error)}),element=image();element.src='/original.png';f.presentation.bind(element,'/original.png');
 while(!errors.length)await tick();assert.equal(element.src,undefined);assert.equal(element.dataset.miaoExportState,'error');assert.match(element.alt,/转换失败/);assert.equal(f.writes.length,0);
});
test('cached JPEGs survive a new presentation instance and concurrent conversions share work and stay bounded',async()=>{
 let converting=0,peak=0;const f=fixture({convert:async()=>{converting++;peak=Math.max(peak,converting);await tick();converting--;return {blob:jpg};}});
 for(let i=0;i<6;i++)f.files.set(`/image-${i}.png`,png);
 await Promise.all([...Array.from({length:6},(_,i)=>f.presentation.jpeg(`/image-${i}.png`)),f.presentation.jpeg('/image-0.png')]);assert.equal(peak,2);assert.equal(f.writes.length,6);assert.equal(f.reads.filter(url=>url==='/image-0.png').length,1);
 const cached=fixture({fetchImage:async url=>f.files.has(url)?new Response(f.files.get(url)):new Response('',{status:404}),convert:async()=>{throw Error('should reuse JPEG');}});assert.equal(await cached.presentation.jpeg('/image-0.png'),f.writes[0].url);
 await assert.rejects(cached.presentation.jpeg('https://other.test/image.png'),/当前酒馆/);
});
test('lazy images wait until visible and a format refresh updates only bound plugin images',async()=>{
 let observe,watched;class Observer{constructor(callback){observe=callback;}observe(element){watched=element;}unobserve(){}}
 const f=fixture({Observer}),element=image();f.presentation.bind(element,'/original.png',{lazy:true});await tick();assert.equal(watched,element);assert.equal(f.reads.length,0);
 observe([{target:element,isIntersecting:true}]);await f.presentation.jpeg('/original.png');await tick();assert.ok(element.src.endsWith('.jpg'));
 f.setFormat('png');f.presentation.refresh({querySelectorAll:()=>[element,image()]});assert.equal(element.src,'/original.png');
});
test('export MIME types omit HTTP charset parameters and forgetting a deleted original invalidates its JPEG',async()=>{
 const f=fixture({fetchImage:async url=>{const blob=f.files.get(url);return blob?new Response(blob,{headers:{'Content-Type':blob.type+'; charset=utf-8'}}):new Response('',{status:404});}});
 const original=await f.presentation.file({url:'/original.png',name:'original.png'},'png');assert.equal(original.blob.type,'image/png');assert.equal(await original.blob.text(),await png.text());
 const converted=await f.presentation.file({url:'/original.png',name:'original.png'},'jpg');assert.equal(converted.blob.type,'image/jpeg');assert.equal(f.writes.length,1);
 const path=await f.presentation.forget('/original.png');assert.equal('/'+path,converted.url);f.files.delete('/'+path);assert.equal(await f.presentation.jpeg('/original.png'),converted.url);assert.equal(f.writes.length,2);f.files.delete(converted.url);assert.equal((await f.presentation.file({url:'/original.png',name:'original.png'},'jpg')).blob.type,'image/jpeg');assert.equal(f.writes.length,3);
});
