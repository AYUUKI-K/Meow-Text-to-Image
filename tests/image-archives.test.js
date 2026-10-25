import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {archiveFolder,archiveContext,validateArchivePath,archiveImageURL,imageArchiveLocation,createArchiveClient} from '../image-archives.js';
import {registerRoutes} from '../server-plugin/index.mjs';
test('archive folders distinguish same-name cards, chats and groups with safe deterministic segments',async()=>{
 const a=archiveContext({characterId:0,characters:[{name:'Alice / 猫猫',avatar:'one.png'}],getCurrentChatId:()=> 'Chat 1.jsonl'}),b={...a,cardId:'card:two.png'};
 const first=await archiveFolder('miao-nai','chat',a);assert.equal(first.split('/').length,3);assert.equal(first,await archiveFolder('miao-nai','chat',a));assert.notEqual(first,await archiveFolder('miao-nai','chat',b));assert.notEqual(first,await archiveFolder('miao-nai','chat',{...a,chatId:'Chat 2'}));
 assert.equal((await archiveFolder('root','card',a)).split('/').length,2);assert.equal(await archiveFolder('root','flat',{}),'root');await assert.rejects(archiveFolder('root','chat',{...a,chatId:undefined}),/聊天存档/);
 for(const value of ['../bad','root/../bad','/absolute','root\\escape','root//chat','CON/chat','root/a/b/c'])assert.throws(()=>validateArchivePath(value));
 const url=archiveImageURL(first,'miao-1792737847709.png');assert.deepEqual(imageArchiveLocation(url,'https://tavern/'),{folder:first,name:'miao-1792737847709.png'});assert.throws(()=>imageArchiveLocation('https://elsewhere'+url,'https://tavern/'));
});
test('archive backend writes real nested directories, discovers them and isolates users',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'miao-archives-'));const routes=new Map();
 registerRoutes({get:(p,fn)=>routes.set('GET '+p,fn),post:(p,fn)=>routes.set('POST '+p,fn)},{readKey:()=>'',extractPNG:async()=>null});
 const call=async(endpoint,body,user='a')=>{let data,status=200;const res={status(n){status=n;return this;},json(value){data=value;return this;}};await routes.get('POST /images/'+endpoint)({body,user:{directories:{root:path.join(root,user)}}},res);return {data,status};};
 try{
  const folder='miao-nai/Alice--0123456789ab/Chat--abcdef012345',name='miao-1792737847709-12345678.png',image=Buffer.from('89504e470d0a1a0a00000000','hex').toString('base64');
  assert.equal((await call('save',{folder,name,image})).status,200);assert.ok((await fs.stat(path.join(root,'a/user/images',folder,name))).isFile());assert.deepEqual((await call('list',{folder})).data,[name]);assert.deepEqual((await call('list',{folder},'b')).data,[]);
  assert.deepEqual((await call('folders',{root:'miao-nai'})).data,['miao-nai','miao-nai/Alice--0123456789ab',folder]);
  assert.notEqual((await call('save',{folder,name,image})).status,200);for(const bad of ['../outside','miao-nai/../outside','C:/outside'])assert.notEqual((await call('save',{folder:bad,name,image})).status,200);
  assert.notEqual((await call('delete',{folder,name:'user.png'})).status,200);assert.equal((await call('delete',{folder,name})).status,200);assert.deepEqual((await call('list',{folder})).data,[]);
 }finally{assert.ok(root.startsWith(path.join(os.tmpdir(),'miao-archives-')));await fs.rm(root,{recursive:true,force:true});}
});
test('TT uses native archive commands and old clients fail before an image is generated',async()=>{
 const calls=[],client=createArchiveClient({getHeaders:()=>({}),isTT:()=>true,invoke:()=>async(command,args)=>{calls.push({command,args});if(command==='get_user_archive_capabilities')return {version:1};if(command==='upload_user_archive_image')return {path:'user/images/root/a/b/miao-1792737847709.png'};return [];}});
 await client.save('png','root/a/b','miao-1792737847709.png');await client.folders('root');await client.list('root/a/b');await client.remove('root/a/b','miao-1792737847709.png');assert.deepEqual(calls.map(c=>c.command),['get_user_archive_capabilities','upload_user_archive_image','list_user_archive_folders','list_user_archive_images','delete_user_image']);
 const old=createArchiveClient({getHeaders:()=>({}),isTT:()=>true,invoke:()=>async()=>{throw Error('unknown command');}});await assert.rejects(old.requireBackend(),/TT.*实体归档/);
});
