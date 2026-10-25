// Run locally on the machine hosting SillyTavern, never in a browser.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {randomUUID} from 'node:crypto';

const sourceDirectory=path.dirname(fileURLToPath(import.meta.url));
const marker='// Managed by Miao-NAI-Image backend installer.\n';
const exists=async file=>{try{await fs.access(file);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}};
async function requireRegular(file){const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('不能使用链接或非普通文件：'+file);}
export async function findTavernRoot(start){
    let current=path.resolve(start);
    for(;;){if(await exists(path.join(current,'server.js'))&&await exists(path.join(current,'src','plugin-loader.js')))return current;const parent=path.dirname(current);if(parent===current)return null;current=parent;}
}
export function enablePluginsConfig(text){
    const lines=text.split(/\r?\n/),matches=lines.map((line,index)=>/^enableServerPlugins\s*:/.test(line)?index:-1).filter(index=>index>=0);
    if(matches.length>1)throw Error('config.yaml 中 enableServerPlugins 重复，请先修正配置');
    if(matches.length){const index=matches[0],match=lines[index].match(/^(enableServerPlugins\s*:\s*)(true|false)(\s*(?:#.*)?)$/);if(!match)throw Error('enableServerPlugins 必须是 true 或 false');if(match[2]==='true')return text;lines[index]=match[1]+'true'+match[3];return lines.join(text.includes('\r\n')?'\r\n':'\n');}
    const newline=text.includes('\r\n')?'\r\n':'\n';return text+(text.endsWith('\n')?'':newline)+'enableServerPlugins: true'+newline;
}
async function atomicWrite(file,text){const temporary=file+'.miao-'+randomUUID()+'.tmp';let mode=0o644;try{mode=(await fs.stat(file)).mode&0o777;}catch(error){if(error.code!=='ENOENT')throw error;}try{await fs.writeFile(temporary,text,{flag:'wx',mode});await fs.rename(temporary,file);}finally{await fs.rm(temporary,{force:true});}}
export async function installBackend({sourceRoot=sourceDirectory,tavernRoot,configPath}={}){
    sourceRoot=await fs.realpath(sourceRoot);
    tavernRoot=tavernRoot?path.resolve(tavernRoot):await findTavernRoot(sourceRoot)||await findTavernRoot(process.cwd());
    if(!tavernRoot||await findTavernRoot(tavernRoot)!==tavernRoot)throw Error('找不到酒馆根目录，请使用 --root 指定 SillyTavern 目录');
    tavernRoot=await fs.realpath(tavernRoot);
    const entry=path.join(sourceRoot,'server-plugin','index.mjs');await requireRegular(entry);
    configPath=configPath?path.resolve(configPath):path.join(tavernRoot,'config.yaml');await requireRegular(configPath);
    const config=await fs.readFile(configPath,'utf8'),nextConfig=enablePluginsConfig(config);
    const plugins=path.join(tavernRoot,'plugins');await fs.mkdir(plugins,{recursive:true});const stat=await fs.lstat(plugins);if(stat.isSymbolicLink()||!stat.isDirectory())throw Error('plugins 必须是普通目录');
    for(const name of ['miao-nai-image','Mewo-Text-to-Image'])if(await exists(path.join(plugins,name)))throw Error('检测到独立安装的旧喵喵后端，请先移出 plugins 后再运行安装器，避免重复加载');
    const loader=path.join(plugins,'miao-nai-image-loader.mjs');let old='';if(await exists(loader)){await requireRegular(loader);old=await fs.readFile(loader,'utf8');if(!old.startsWith(marker))throw Error('后端入口已有其他内容，已停止以免覆盖：'+loader);}
    const code=marker+'export {info,init} from '+JSON.stringify(pathToFileURL(entry).href)+';\n';
    if(old!==code)await atomicWrite(loader,code);
    let backup=null;if(nextConfig!==config){backup=configPath+'.miao-backup-'+Date.now()+'-'+randomUUID();await fs.copyFile(configPath,backup,fs.constants.COPYFILE_EXCL);await atomicWrite(configPath,nextConfig);}
    return {tavernRoot,loader,backup,changed:old!==code||nextConfig!==config};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
    try{const {values}=parseArgs({options:{root:{type:'string'},config:{type:'string'},help:{type:'boolean'}}});
        if(values.help)console.log('node install-backend.mjs [--root 酒馆目录] [--config 配置文件]');
        else{const result=await installBackend({tavernRoot:values.root,configPath:values.config});console.log((result.changed?'后端已安装':'后端已就绪')+'，请重启酒馆。\n'+result.loader);if(result.backup)console.log('配置备份：'+result.backup);}
    }catch(error){console.error('安装失败：'+error.message);process.exitCode=1;}
}
