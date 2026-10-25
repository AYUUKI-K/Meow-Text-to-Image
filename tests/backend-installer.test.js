import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {findTavernRoot,enablePluginsConfig,installBackend} from '../install-backend.mjs';

test('installer changes only the top-level server plugin flag and preserves comments and line endings',()=>{
 const before='port: 8000\r\n# keep me\r\nenableServerPlugins: false # local\r\nother: true\r\n';
 assert.equal(enablePluginsConfig(before),before.replace('false #','true #'));assert.equal(enablePluginsConfig('enableServerPlugins: true\n'),'enableServerPlugins: true\n');
 assert.equal(enablePluginsConfig('port: 8000'),'port: 8000\nenableServerPlugins: true\n');assert.throws(()=>enablePluginsConfig('enableServerPlugins: false\nenableServerPlugins: true'),/重复/);assert.throws(()=>enablePluginsConfig('enableServerPlugins: "false"'),/true 或 false/);
});
test('installer discovers nested frontend installs, backs up configuration, and loads updated frontend code on restart',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'miao-installer-'));
 try{
  await fs.mkdir(path.join(root,'src'));await fs.writeFile(path.join(root,'server.js'),'');await fs.writeFile(path.join(root,'src','plugin-loader.js'),'');
  const source=path.join(root,'data','default-user','extensions','Mewo-Text-to-Image');await fs.mkdir(path.join(source,'server-plugin'),{recursive:true});
  const entry=path.join(source,'server-plugin','index.mjs');await fs.writeFile(entry,'export const info={id:"miao-nai-image"}; export const init=()=>1;');
  const before='port: 8000\nenableServerPlugins: false # keep\n';await fs.writeFile(path.join(root,'config.yaml'),before);
  assert.equal(await findTavernRoot(source),await fs.realpath(root));const result=await installBackend({sourceRoot:source});assert.equal(result.changed,true);assert.equal(await fs.readFile(result.backup,'utf8'),before);
  assert.equal(await fs.readFile(path.join(root,'config.yaml'),'utf8'),before.replace('false','true'));
  const loaded=await import(pathToFileURL(result.loader));assert.equal(loaded.info.id,'miao-nai-image');assert.equal(loaded.init(),1);
  await fs.writeFile(entry,'export const info={id:"miao-nai-image"}; export const init=()=>2;');
  const restarted=await promisify(execFile)(process.execPath,['--input-type=module','-e','const p=await import('+JSON.stringify(pathToFileURL(result.loader).href)+');console.log(p.init());']);assert.equal(restarted.stdout.trim(),'2');
  const again=await installBackend({sourceRoot:source});assert.equal(again.changed,false);assert.equal(again.backup,null);
  await fs.writeFile(result.loader,'// user code');await assert.rejects(installBackend({sourceRoot:source}),/已有其他内容/);
  await fs.mkdir(path.join(root,'plugins','miao-nai-image'));await assert.rejects(installBackend({sourceRoot:source}),/旧喵喵后端/);
 }finally{const resolved=path.resolve(root);assert.ok(resolved.startsWith(path.resolve(os.tmpdir())+path.sep+'miao-installer-'));await fs.rm(resolved,{recursive:true,force:true});}
});
