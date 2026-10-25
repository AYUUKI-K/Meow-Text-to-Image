import fs from 'node:fs/promises';
import path from 'node:path';
import {validateArchivePath} from '../image-archives.js';
import {imageDay,validateFolder} from '../core.js';

export function registerArchiveRoutes(router,safe){
    const folderPath=async(req,folder,create=false)=>{
        validateArchivePath(folder);
        const root=req.user.directories.userImages||path.join(req.user.directories.root,'user','images');
        await fs.mkdir(root,{recursive:true});let target=await fs.realpath(root);
        for(const segment of folder.split('/')){
            target=path.join(target,segment);
            let stat;try{stat=await fs.lstat(target);}catch(error){if(error.code!=='ENOENT')throw error;if(!create)return null;try{await fs.mkdir(target);}catch(error){if(error.code!=='EEXIST')throw error;}stat=await fs.lstat(target);}
            if(stat.isSymbolicLink()||!stat.isDirectory())throw Error('归档目录不能使用链接或普通文件');
        }
        return target;
    };
    const filename=name=>{if(typeof name!=='string'||!imageDay(name))throw Error('不是可管理的生成图片');return name;};
    router.post('/images/save',safe(async(req,res)=>{
        const {folder,name,image}=req.body;filename(name);
        if(typeof image!=='string'||image.length>32*1024*1024||!image.length||!/^[A-Za-z0-9+/]+={0,2}$/.test(image))throw Error('图片数据无效');
        const bytes=Buffer.from(image,'base64');if(!bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))throw Error('需要 PNG 图片');
        const target=await folderPath(req,folder,true);await fs.writeFile(path.join(target,name),bytes,{flag:'wx'});
        res.json({url:'/user/images/'+folder.split('/').map(encodeURIComponent).join('/')+'/'+encodeURIComponent(name)});
    }));
    router.post('/images/list',safe(async(req,res)=>{
        const target=await folderPath(req,req.body.folder);if(!target)return res.json([]);
        res.json((await fs.readdir(target,{withFileTypes:true})).filter(item=>item.isFile()&&imageDay(item.name)).map(item=>item.name));
    }));
    router.post('/images/folders',safe(async(req,res)=>{
        const root=validateFolder(req.body.root),target=await folderPath(req,root),folders=[root];
        if(target){const pending=[{target,folder:root,depth:1}];while(pending.length){const current=pending.shift();if(current.depth>=3)continue;
            for(const entry of await fs.readdir(current.target,{withFileTypes:true})){if(!entry.isDirectory()||entry.isSymbolicLink())continue;const folder=current.folder+'/'+entry.name;try{validateArchivePath(folder);}catch{continue;}folders.push(folder);if(folders.length>5000)throw Error('归档目录过多');pending.push({target:path.join(current.target,entry.name),folder,depth:current.depth+1});}
        }}res.json(folders);
    }));
    router.post('/images/delete',safe(async(req,res)=>{
        const {folder,name}=req.body;filename(name);const target=await folderPath(req,folder);if(!target)return res.status(404).json({error:'图片不存在'});
        const file=path.join(target,name),stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('只能删除生成图片文件');
        await fs.unlink(file);res.json({ok:true});
    }));
}
