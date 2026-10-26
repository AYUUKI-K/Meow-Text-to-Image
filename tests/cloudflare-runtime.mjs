// Optional real workerd/SQLite smoke test. Point MIAO_MINIFLARE at an installed
// miniflare entry, or install miniflare locally; no cloud account or NAI is used.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,resolve} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const runtime=await import(process.env.MIAO_MINIFLARE?pathToFileURL(process.env.MIAO_MINIFLARE).href:'miniflare');
const entry=process.env.MIAO_QUEUE_RUNTIME_ENTRY;
const options={name:'queue-runtime-check',modulesRoot:entry?dirname(resolve(entry)):root,modules:entry?[{type:'ESModule',path:resolve(entry)}]:[
    {type:'ESModule',path:fileURLToPath(new URL('../cloudflare/worker.js',import.meta.url))},
    {type:'ESModule',path:fileURLToPath(new URL('../queue-service/queue.mjs',import.meta.url))}
],compatibilityDate:'2026-10-23',compatibilityFlags:['nodejs_compat'],durableObjects:{MIAO_KEY_QUEUE:{className:'MiaoKeyQueue',useSQLite:true}}};
const mf=new runtime.Miniflare(runtime.convertV4MiniflareOptions?runtime.convertV4MiniflareOptions(options):options);
const who=(key,user)=>({key_hash:createHash('sha256').update(key).digest('hex'),user_id:'runtime-user-'+user,task_id:'runtime-task-'+user});
const call=async(path,body)=>{
    const response=await mf.dispatchFetch('https://queue.test'+path,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(body)});
    const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;
};
try{
    const a=who('one','A'),b=who('one','B'),c=who('two','C');
    const first=await call('/join-queue',a);assert.equal(first.your_turn,true);
    assert.equal((await call('/join-queue',b)).your_turn,false);
    const other=await call('/join-queue',c);assert.equal(other.your_turn,true);
    for(let i=0;i<5;i++)assert.equal((await call('/my-turn',b)).position,1);
    assert.equal((await call('/complete',{...a,lock_token:first.lock_token})).released,true);
    const next=await call('/my-turn',b);assert.equal(next.your_turn,true);
    await call('/complete',{...b,lock_token:next.lock_token});await call('/complete',{...c,lock_token:other.lock_token});
    assert.equal((await call('/leave-queue',b)).released,false);
    const again=await call('/join-queue',a);assert.equal(again.your_turn,true);assert.notEqual(again.lock_token,first.lock_token);
    await call('/complete',{...a,lock_token:again.lock_token});
    const relay=async(op,body)=>{const target=new URL('https://queue.test/relay');target.searchParams.set('op',op);target.searchParams.set('data',JSON.stringify(body));const response=await mf.dispatchFetch(target);assert.equal(response.status,200);const data=await response.json();assert.equal(data.relay_status,200,JSON.stringify(data));return data.body;};
    const held=await relay('join-queue',a);assert.equal((await call('/join-queue',b)).your_turn,false);
    assert.equal((await relay('join-queue',a)).lock_token,held.lock_token);
    const proof=createHash('sha256').update(held.lock_token+'\0release').digest('hex');
    await relay('complete',{...a,release_proof:proof});const granted=await call('/my-turn',b);assert.equal(granted.your_turn,true);await call('/complete',{...b,lock_token:granted.lock_token});
    console.log('workerd + SQLite: isolation, polling, transactional handoff, idle cleanup and rejoin passed. No NAI requests.');
}finally{await mf.dispose();}
