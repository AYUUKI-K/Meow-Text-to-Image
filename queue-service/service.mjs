import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {queueCapabilities,queueMaintenance} from '../shared/queue-protocol.js';
import {LeaseQueue} from './queue.mjs';
export function createQueueServer({queue=new LeaseQueue(),maintenance=false}={}){
    maintenance=queueMaintenance(maintenance);
    const server=http.createServer(async(req,res)=>{
        res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Cache-Control','no-store');
        if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
        res.setHeader('Content-Type','application/json; charset=utf-8');
        try{
            if(req.method==='GET'&&req.url==='/'){res.end(JSON.stringify({name:'喵喵文生图队列',ready:true,privacy:'只接收 Key 指纹，不接收 Key、提示词或图片'}));return;}
            if(req.method==='GET'&&req.url==='/ping'){res.end(JSON.stringify({ready:true,version:'0.7.0',capabilities:maintenance?[]:queueCapabilities,...(maintenance?{maintenance:true}:{})}));return;}
            if(req.method!=='POST'){res.writeHead(405);res.end(JSON.stringify({error:'Use POST'}));return;}
            const chunks=[];let size=0;for await(const part of req){size+=part.length;if(size>8192)throw new Error('请求过大');chunks.push(part);}
            const input=JSON.parse(Buffer.concat(chunks).toString()||'{}');let result;
            if(req.url==='/join-queue'&&maintenance){res.writeHead(503);res.end(JSON.stringify({error:'队列维护中，暂不接受入队',code:'queue-maintenance'}));return;}
            if(req.url==='/join-queue')result=queue.join(input);
            else if(req.url==='/my-turn')result=queue.turn(input);
            else if(req.url==='/begin-generation')result=queue.begin(input);
            else if(req.url==='/retry-generation')result=queue.retry(input);
            else if(req.url==='/finish')result=queue.finish(input);
            else if(req.url==='/complete'||req.url==='/leave-queue')result=queue.release(input);
            else{res.writeHead(404);res.end(JSON.stringify({error:'Not found'}));return;}
            res.end(JSON.stringify(result));
        }catch(error){const status=error.status===429?429:400;res.writeHead(status);res.end(JSON.stringify({error:status===429?'队列暂时满了':error.message==='排队任务已过期，请重新生成'?error.message:'队列请求无效'}));}
    });
    server.requestTimeout=15000;const sweep=setInterval(()=>queue.cleanup(),10000);sweep.unref();server.on('close',()=>clearInterval(sweep));return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const server=createQueueServer({maintenance:process.env.QUEUE_MAINTENANCE});server.listen(Number(process.env.PORT||7860),process.env.HOST||'0.0.0.0',()=>console.log('Miao fingerprint queue ready'));}
