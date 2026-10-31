import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync,mkdtempSync,cpSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,relative,dirname,join,posix} from 'node:path';
import {tmpdir} from 'node:os';

const root=fileURLToPath(new URL('../',import.meta.url));
const files=directory=>readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(join(directory,entry.name)):[join(directory,entry.name)]);
const imports=text=>[...text.matchAll(/\b(?:from\s*|import\s*\(\s*)(['"])([^'"\n]+)\1/g)].map(match=>match[2]);

test('extension entry resolves every local module and keeps host imports at the host scripts directory',()=>{
    const allowedHost=new Set(['extensions.js','utils.js','secrets.js','user.js','popup.js','world-info.js','extensions/regex/engine.js','../script.js']);
    const visited=new Set();
    const walk=file=>{
        if(visited.has(file))return;visited.add(file);
        for(const specifier of imports(readFileSync(file,'utf8'))){
            if(specifier.startsWith('/lib/'))continue;
            assert.ok(specifier.startsWith('.'),`unexpected browser dependency: ${specifier}`);
            const target=resolve(dirname(file),specifier),local=relative(root,target);
            if(local.startsWith('..')){
                // The extension is installed under /scripts/extensions/third-party/<name>/.
                const browserURL=new URL(specifier,new URL(relative(root,file),'https://host.invalid/scripts/extensions/third-party/mewo/'));
                assert.ok(allowedHost.has(posix.relative('/scripts',browserURL.pathname)),browserURL.pathname);
            }else{
                assert.ok(existsSync(target),`missing ${local}`);walk(target);
            }
        }
    };
    walk(resolve(root,'index.js'));
    const sourceFiles=[...files(resolve(root,'src')),...files(resolve(root,'shared'))].filter(file=>file.endsWith('.js'));
    for(const file of sourceFiles)assert.ok(visited.has(file),`orphaned module: ${relative(root,file)}`);
    assert.deepEqual(readdirSync(root).filter(name=>name.endsWith('.js')),['index.js']);
});

test('settings version and bundled resources resolve from their original extension root',()=>{
    const uiURL=pathToFileURL(resolve(root,'src/ui/ui.js'));
    const ui=readFileSync(uiURL,'utf8'),manifestPath=ui.match(/new URL\('([^']*manifest\.json)',import\.meta\.url\)/)?.[1];
    assert.ok(manifestPath);assert.equal(fileURLToPath(new URL(manifestPath,uiURL)),resolve(root,'manifest.json'));
    const manifest=JSON.parse(readFileSync(resolve(root,'manifest.json'),'utf8'));
    assert.equal(manifest.js,'index.js');assert.ok(existsSync(resolve(root,manifest.css.split('?')[0])));
    const entry=readFileSync(resolve(root,'index.js'),'utf8');assert.match(entry,/const base=new URL\('\.',import\.meta\.url\)/);
    assert.ok(existsSync(resolve(root,'assets/resource-manifest.json')));
});

test('queue service and shared protocol stay independent of frontend modules',()=>{
    for(const folder of ['cloudflare','queue-service','shared'])for(const file of files(resolve(root,folder))){
        if(!/\.(mjs|js)$/.test(file))continue;
        for(const specifier of imports(readFileSync(file,'utf8'))){
            if(specifier.startsWith('.')){
                const target=resolve(dirname(file),specifier);
                assert.ok(existsSync(target),specifier);
                assert.ok(!relative(root,target).startsWith('src/'),`${folder} imports frontend`);
            }else assert.ok(folder!=='shared','shared protocol must have no platform dependencies');
        }
    }
});

test('Docker queue copy set is sufficient to load the Node service without frontend files',async()=>{
    const docker=readFileSync(resolve(root,'Dockerfile.queue'),'utf8');
    const copies=[...docker.matchAll(/^COPY\s+(\S+)\s+(\S+)$/gm)];
    const temp=mkdtempSync(join(tmpdir(),'mewo-layout-'));
    try{
        for(const [,source,target] of copies)cpSync(resolve(root,source),resolve(temp,target),{recursive:true});
        const {createQueueServer}=await import(pathToFileURL(resolve(temp,'queue-service/service.mjs')).href);
        const server=createQueueServer();server.emit('close');
        assert.equal(typeof server.listen,'function');
        assert.equal(existsSync(resolve(temp,'src')),false);
    }finally{rmSync(temp,{recursive:true,force:true});}
});
