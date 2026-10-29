import test from 'node:test';import assert from 'node:assert/strict';
import {createKeyVault,saveCurrentKey} from '../direct-key.js';
import {saveCustomConnection} from '../nai-connection.js';
function memoryIndexedDB(){
    const keys=new Map();let exists=false;
    const db={createObjectStore(){},close(){},transaction(){const tx={objectStore:()=>Object.fromEntries(['get','put','delete'].map(method=>[method,(value,id)=>{const request={};queueMicrotask(()=>{if(method==='get')request.result=keys.get(value);if(method==='put')keys.set(id,value);if(method==='delete')keys.delete(value);request.onsuccess?.();queueMicrotask(()=>tx.oncomplete?.());});return request;}] ))};return tx;}};
    return {open(){const request={result:db};queueMicrotask(()=>{if(!exists){exists=true;request.onupgradeneeded?.();}request.onsuccess?.();});return request;}};
}
test('save then enable remember persists the existing key across vault reloads and isolates users',async()=>{
    const indexedDBImpl=memoryIndexedDB(),vault=createKeyVault('a',{indexedDBImpl});
    await vault.set('fixture-key',false);assert.equal((await vault.status()).persistent,false);
    await vault.remember(true);
    const reloaded=createKeyVault('a',{indexedDBImpl});assert.equal(await reloaded.get(),'fixture-key');assert.equal((await reloaded.status()).persistent,true);
    assert.equal(await createKeyVault('b',{indexedDBImpl}).get(),'');
    await reloaded.remember(false);assert.equal(await reloaded.get(),'fixture-key');assert.equal((await reloaded.status()).persistent,false);
    assert.equal(await createKeyVault('a',{indexedDBImpl}).get(),'');
});
test('saving an existing masked key really persists it, rather than reporting a no-op success',async()=>{
    const indexedDBImpl=memoryIndexedDB(),vault=createKeyVault('a',{indexedDBImpl}),settings={rememberDirectKey:true,keyHash:'hash'},written=[];
    await vault.set('fixture-key',false);
    await saveCurrentKey({input:'',vault,settings,writeServerKey:async key=>{written.push(key);settings.keyHash='';return 'secret-id';},fingerprint:async()=> 'hash',save(){}});
    assert.deepEqual(written,['fixture-key']);assert.equal(settings.keyHash,'hash');
    assert.equal(await createKeyVault('a',{indexedDBImpl}).get(),'fixture-key');
});
test('a hash or remember checkbox is not a key: missing raw key fails before server writes',async()=>{
    const vault=createKeyVault('a',{indexedDBImpl:memoryIndexedDB()});let writes=0;
    await assert.rejects(saveCurrentKey({input:'',vault,settings:{rememberDirectKey:true,keyHash:'hash'},writeServerKey:async()=>writes++,fingerprint:async()=>'',save(){}}),/补填一次/);
    assert.equal(writes,0);assert.deepEqual(await vault.status(),{available:false,persistent:false});
});
test('failed server writes and mismatched old keys never report a successful save',async()=>{
    const vault=createKeyVault('a',{indexedDBImpl:memoryIndexedDB()}),settings={rememberDirectKey:true,keyHash:'old'};let writes=0;
    await assert.rejects(saveCurrentKey({input:'new-key',vault,settings,writeServerKey:async()=>null,fingerprint:async()=> 'new',save(){}}),/未能保存/);
    assert.equal(settings.keyHash,'old');assert.equal(await vault.get(),'');
    await vault.set('old-local-key',false);
    await assert.rejects(saveCurrentKey({input:'',vault,settings,writeServerKey:async()=>writes++,fingerprint:async()=> 'different',save(){}}),/不匹配/);assert.equal(writes,0);
});

test('custom credential has an independent persistent slot and never calls the official secret writer',async()=>{
    const indexedDBImpl=memoryIndexedDB(),user='fixture-user',customScope=JSON.stringify([user,'custom-novelai']);
    const official=createKeyVault(user,{indexedDBImpl}),custom=createKeyVault(customScope,{indexedDBImpl}),settings={keyHash:'official-hash',rememberDirectKey:true,rememberCustomKey:true};
    await official.set('official-token',true);
    await saveCustomConnection({settings,vault:custom,input:'custom-token',generationURL:'https://relay.invalid/custom',fingerprint:async()=> 'custom-hash',save(){}});
    assert.equal(await createKeyVault(user,{indexedDBImpl}).get(),'official-token');
    assert.equal(await createKeyVault(customScope,{indexedDBImpl}).get(),'custom-token');
    assert.equal(settings.keyHash,'official-hash');assert.equal(settings.customKeyHash,'custom-hash');
    assert.equal(JSON.stringify(settings).includes('token'),false);
    await custom.clear();assert.equal(await official.get(),'official-token');
    assert.equal(await createKeyVault(customScope,{indexedDBImpl}).get(),'');
});
