import test from 'node:test';
import assert from 'node:assert/strict';
import {archiveContext,rememberImage,archiveItems,browseArchive,archiveImageURL,imageArchiveLocation,validateArchivePath} from '../image-archives.js';
const origin='https://tavern/';
const image=(number,extra={})=>({folder:'miao-nai',name:'miao-179273784770'+number+'.png',...extra});

test('frontend classification distinguishes same-name cards, groups and chats without changing physical paths',()=>{
 const a=archiveContext({characterId:0,characters:[{name:'猫猫',avatar:'one.png'}],getCurrentChatId:()=> 'Chat 1'});
 const b=archiveContext({characterId:0,characters:[{name:'猫猫',avatar:'two.png'}],getCurrentChatId:()=> 'Chat 1'});
 const group=archiveContext({groupId:12,groups:[{id:12,name:'群聊'}],getCurrentChatId:()=> 'Chat 1'});
 assert.notEqual(a.cardId,b.cardId);assert.notEqual(a.cardId,group.cardId);
 const catalog={},files=[image(1),image(2),image(3),image(4)];for(const [i,owner] of [a,b,{...a,chatId:'Chat 2'},group].entries())rememberImage(catalog,archiveImageURL(files[i].folder,files[i].name),owner,origin);
 const items=archiveItems(files,catalog);assert.ok(items.every(item=>item.folder==='miao-nai'));
 assert.equal(browseArchive(items,'chat').children.length,3);const card=browseArchive(items,'chat',[a.cardId]);assert.equal(card.items.length,2);assert.deepEqual(card.children.map(child=>child.label),['Chat 1','Chat 2']);assert.equal(browseArchive(items,'chat',[a.cardId,'Chat 1']).items.length,1);
 assert.equal(browseArchive(items,'card',[a.cardId]).children.length,0);assert.equal(browseArchive(items,'flat').items.length,4);
});
test('saved ownership survives reload, rerolls and copied chats, while unknown images remain unclassified',()=>{
 let catalog={};const file=image(1),url=archiveImageURL(file.folder,file.name),owner={cardId:'card:a',cardName:'A',chatId:'original'};
 assert.equal(rememberImage(catalog,url,owner,origin),true);catalog=JSON.parse(JSON.stringify(catalog));
 assert.equal(rememberImage(catalog,url,{...owner,chatId:'fork'},origin),false);assert.equal(catalog[url].chatId,'original');
 assert.equal(rememberImage(catalog,url,{cardId:'card:b',cardName:'B',chatId:'other'},origin),false);
 assert.equal(rememberImage(catalog,url,{...owner,cardName:'renamed'},origin),true);assert.equal(catalog[url].cardName,'renamed');
 assert.equal(rememberImage(catalog,'https://outside'+url,owner,origin),false);
 assert.equal(rememberImage(catalog,archiveImageURL(file.folder,image(2).name),{},origin),false);
 const items=archiveItems([file,image(2),image(3,{name:'sample-1792737847703.png'})],catalog),root=browseArchive(items,'chat');
 assert.deepEqual(root.children.map(child=>child.path[0]).sort(),['@samples','@unclassified','card:a'].sort());assert.equal(browseArchive(items,'chat',['@unclassified']).items[0].name,image(2).name);assert.equal(browseArchive(items,'chat',['@samples']).children.length,0);
});
test('owned image URL validation keeps legacy nested links usable and rejects traversal and outside origins',()=>{
 for(const folder of ['root','root/card/chat']){const url=archiveImageURL(folder,image(1).name);assert.deepEqual(imageArchiveLocation(url,origin),{folder,name:image(1).name});}
 for(const folder of ['../bad','/absolute','root//chat','root/a/b/c','root\\escape'])assert.throws(()=>validateArchivePath(folder));
 assert.throws(()=>imageArchiveLocation('https://outside/user/images/root/'+image(1).name,origin));assert.throws(()=>archiveImageURL('root','user.png'));
});
