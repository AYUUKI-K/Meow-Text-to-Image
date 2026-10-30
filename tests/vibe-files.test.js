import test from 'node:test';
import assert from 'node:assert/strict';
import {File} from 'node:buffer';
import {createVibePackage,readVibeFiles,VIBE_FILE_LIMIT,VIBE_PACKAGE_LIMIT} from '../src/vibe/vibe-files.js';
import {createDirectClient} from '../src/novelai/direct-client.js';

const source={id:'00000000-0000-4000-8000-000000000001',name:'猫咪 / 氛围',image:'aW1hZ2U=',thumbnail:'data:image/png;base64,aW1hZ2U=',encodings:{'v4-5full':{full:{encoding:'YWJj',params:{information_extracted:0.7}}},v4full:{other:{encoding:'ZGVm',params:{information_extracted:0.4}}}},key:'private-key',url:'/user/private.json'};
function zipEntry(name,bytes){
    return {name,internalStream(){const callbacks={};let stopped=false;return {on(event,fn){callbacks[event]=fn;return this;},pause(){stopped=true;},resume(){queueMicrotask(()=>{callbacks.data(bytes);if(!stopped)callbacks.end();});return this;}};}};
}
const archiveLoader=entries=>async()=>({loadAsync:async()=>({files:Object.fromEntries(entries.map(entry=>[entry.name,entry]))})});
test('Vibe ZIP contains portable data, unique safe filenames and no keys, IDs or local URLs',async()=>{
    const records=[];const original=JSON.stringify(source);
    class Zip {file(name,text){records.push({name,data:JSON.parse(text)});}async generateAsync(options){assert.equal(options.compression,'DEFLATE');return new Blob(['fixture'],{type:options.mimeType});}}
    const {blob,name}=await createVibePackage([source,source],{loadZip:async()=>Zip});
    assert.equal(blob.type,'application/zip');assert.equal(name,'喵喵Vibe-2个.zip');
    assert.equal(new Set(records.map(record=>record.name)).size,2);assert(records.every(record=>!record.name.includes('/')));
    for(const {data} of records){assert.deepEqual(data.encodings,source.encodings);assert.equal(data.image,source.image);assert.equal(data.thumbnail,source.thumbnail);assert.equal(data.name,source.name);assert.deepEqual(Object.keys(data).sort(),['encodings','image','name','thumbnail']);}
    assert.equal(JSON.stringify(source),original);
});
test('ZIP imports nested single and bundle files plus multiple input files, ignoring unrelated entries',async()=>{
    const entries=[zipEntry('nested/a.naiv4vibe',new TextEncoder().encode(JSON.stringify(source))),zipEntry('two.naiv4vibeBundle',new TextEncoder().encode(JSON.stringify({vibes:[source,source]}))),zipEntry('readme.txt',new TextEncoder().encode('ignore'))];
    const files=[new File(['zip'],'包.zip'),new File([JSON.stringify(source)],'单个.json'),new File(['raw'],'图.png',{type:'image/png'})];
    const items=await readVibeFiles(files,{loadZip:archiveLoader(entries)});
    assert.equal(items.length,5);assert(items.slice(0,4).every(item=>item.name===source.name&&item.encodings.v4full.other.encoding==='ZGVm'));
    assert.equal(items[4].image,'cmF3');assert.equal(items[4].name,'图');assert(items.every(item=>!item.id&&!item.key&&!item.url));
});
test('all input is validated before writes; corrupt JSON, UTF-8, empty ZIP and total counts reject',async()=>{
    await assert.rejects(readVibeFiles([new File([JSON.stringify(source)],'ok.json'),new File(['broken'],'bad.json')]),SyntaxError);
    await assert.rejects(readVibeFiles([new File(['zip'],'bad.zip')],{loadZip:archiveLoader([zipEntry('bad.json',new Uint8Array([255]))])}),/encoded|encoding|valid/i);
    await assert.rejects(readVibeFiles([new File(['zip'],'empty.zip')],{loadZip:archiveLoader([])}),/ZIP/);
    await assert.rejects(readVibeFiles([new File([JSON.stringify({vibes:Array.from({length:128},()=>source)})],'128.json'),new File([JSON.stringify(source)],'one.json')]),/128/);
    assert.equal((await readVibeFiles([new File([JSON.stringify({vibes:Array.from({length:128},()=>source)})],'128.json')])).length,128);
    await assert.rejects(readVibeFiles([]),/请选择/);
});
test('input and decompression budgets stop oversized files and compressed bombs',async()=>{
    await assert.rejects(readVibeFiles([{name:'large.zip',size:VIBE_PACKAGE_LIMIT+1}]),/64 MB/);
    await assert.rejects(readVibeFiles([{name:'large.json',size:VIBE_FILE_LIMIT+1}]),/18 MB/);
    await assert.rejects(readVibeFiles([new File(['zip'],'bomb.zip')],{loadZip:archiveLoader([zipEntry('huge.json',new Uint8Array(VIBE_FILE_LIMIT+1))])}),/解压/);
    await assert.rejects(createVibePackage([]),/请选择/);
});
test('export reads full saved Vibes; re-import preserves encodings and image without changing source or NAI calls',async()=>{
    const files=new Map(),requests=[],settings={};
    const client=createDirectClient({settings,save(){},getHeaders:()=>({}),getKey:()=>{throw Error('must not access key');},fetchImpl:async(url,options={})=>{
        requests.push(url);
        if(url==='/api/files/upload'){const body=JSON.parse(options.body);files.set('/user/files/'+body.name,JSON.parse(Buffer.from(body.data,'base64').toString('utf8')));return Response.json({path:'/user/files/'+body.name});}
        if(files.has(url))return Response.json(files.get(url));
        throw Error('unexpected '+url);
    }});
    const [first]=await client.import({data:source}),before=JSON.stringify(files.get('/user/files/miao-vibe-'+first.id+'.json'));
    const portable=await client.export([first.id]);assert.equal(portable[0].image,source.image);assert.deepEqual(portable[0].encodings,source.encodings);
    const [second]=await client.import({data:{vibes:portable}});assert.notEqual(second.id,first.id);assert.equal(second.name,first.name);
    assert.equal(JSON.stringify(files.get('/user/files/miao-vibe-'+first.id+'.json')),before);assert.equal(settings.vibeLibrary.length,2);
    assert(requests.every(url=>!url.includes('novelai')));assert.equal(JSON.stringify(portable).includes(first.id),false);
    await assert.rejects(client.export([first.id,first.id]),/勾选/);await assert.rejects(client.export(['missing']),/删除/);
});
test('capacity is checked before upload and partial storage failures report saved count',async()=>{
    let uploads=0;const settings={vibeLibrary:[]};
    const client=createDirectClient({settings,save(){},getHeaders:()=>({}),fetchImpl:async(url,options)=>{
        uploads++;if(uploads===2)return new Response('storage full',{status:500});
        return Response.json({path:'/user/files/'+JSON.parse(options.body).name});
    }});
    await assert.rejects(client.import({data:{vibes:[source,source]}}),/已导入 1 \/ 2/);assert.equal(settings.vibeLibrary.length,1);
    settings.vibeLibrary=Array.from({length:128},()=>({}));uploads=0;
    await assert.rejects(client.import({data:source}),/128/);assert.equal(uploads,0);
});
test('reopening settings cannot start a second import while the previous one is writing',async()=>{
    let release,notify;let started=new Promise(resolve=>notify=resolve);const settings={},client=createDirectClient({settings,save(){},getHeaders:()=>({}),fetchImpl:async(url,options)=>{
        const gate=new Promise(resolve=>release=resolve);notify();await gate;return Response.json({path:'/user/files/'+JSON.parse(options.body).name});
    }});
    const pending=client.import({data:source});await started;await assert.rejects(client.import({data:source}),/正在导入/);
    release();await pending;assert.equal(settings.vibeLibrary.length,1);
    started=new Promise(resolve=>notify=resolve);const next=client.import({data:source});await started;release();await next;assert.equal(settings.vibeLibrary.length,2);
});
