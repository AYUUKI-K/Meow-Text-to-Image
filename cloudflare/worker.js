import {LeaseQueue} from '../queue-service/queue.mjs';
const headers={'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Cache-Control':'no-store'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
export default {
    async fetch(request,env){
        const path=new URL(request.url).pathname;
        if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
        if(request.method==='GET'&&path==='/ping')return reply({ready:true,version:'0.6.2',runtime:'cloudflare',relay:1});
        // ST's existing visit endpoint supports GET resources. The envelope
        // preserves queue status codes through hosts which flatten HTTP errors.
        if(request.method==='GET'&&path==='/relay'){
            const wrap=(body,status)=>reply({relay_status:status,body});
            let input,operation;
            try{
                const query=new URL(request.url).searchParams;operation=query.get('op');const data=query.get('data')||'';
                if(data.length>8192)return wrap({error:'请求过大'},413);
                if(!['join-queue','my-turn','complete','leave-queue'].includes(operation))throw Error();
                input=JSON.parse(data);new LeaseQueue().validate(input);
                if(Object.keys(input).some(key=>!['key_hash','user_id','task_id','release_proof','cancel_hash','cancel_proof'].includes(key))||input.release_proof!==undefined&&!/^[a-f0-9]{64}$/.test(input.release_proof))throw Error();
            }catch{return wrap({error:'排队请求无效'},400);}
            try{
                const id=env.MIAO_KEY_QUEUE.idFromName(input.key_hash.toLowerCase());
                const response=await env.MIAO_KEY_QUEUE.get(id).fetch(new Request('https://queue.internal/'+operation,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}));
                return wrap(await response.json(),response.status);
            }catch{return wrap({error:'排队服务暂不可用，请稍后重试'},503);}
        }
        if(request.method==='GET'&&path==='/')return reply({name:'喵喵文生图队列',ready:true,privacy:'只接收 Key 指纹，不接收 Key、提示词或图片'});
        if(request.method!=='POST')return reply({error:'Use POST'},405);
        if(!['/join-queue','/my-turn','/complete','/leave-queue'].includes(path))return reply({error:'Not found'},404);
        let input;
        try{
            const text=await request.text();if(text.length>8192)return reply({error:'请求过大'},413);
            input=JSON.parse(text);new LeaseQueue().validate(input);
        }catch{return reply({error:'排队请求无效'},400);}
        try{
            const id=env.MIAO_KEY_QUEUE.idFromName(input.key_hash.toLowerCase());
            return await env.MIAO_KEY_QUEUE.get(id).fetch(new Request('https://queue.internal'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}));
        }catch{return reply({error:'排队服务暂不可用，请稍后重试'},503);}
    }
};
// Each key gets an independent, strongly consistent SQLite-backed Durable Object.
export class MiaoKeyQueue {
    constructor(ctx){
        // A coalesced touch is immediately durable. The extra 30s waiting grace
        // preserves at least 90s of inactivity tolerance even after eviction.
        this.ctx=ctx;this.queue=new LeaseQueue({renewalMs:30000,waitingMs:120000});
        ctx.blockConcurrencyWhile(()=>this.load());
    }
    async load(){
        const [lanes,alarm]=await Promise.all([this.ctx.storage.get('lanes'),this.ctx.storage.getAlarm()]);
        this.queue.lanes=new Map(lanes||[]);this.saved=JSON.stringify([...this.queue.lanes]);this.alarmAt=alarm;this.needsReload=false;
    }
    async persist(){
        const lanes=[...this.queue.lanes],saved=JSON.stringify(lanes),changed=saved!==this.saved,now=this.queue.now();
        const deadlines=[];
        for(const lane of this.queue.lanes.values()){if(lane.active)deadlines.push(lane.active.expires);for(const waiting of lane.waiting)deadlines.push(waiting.seen+this.queue.waitingMs);}
        const next=deadlines.length?Math.max(now+1000,Math.min(...deadlines)):null;
        // An earlier alarm can safely wake and recheck deadlines. Do not rewrite
        // it on each heartbeat just because the deadline moved further away.
        const alarmAt=next===null?null:(this.alarmAt!==null&&this.alarmAt>now&&this.alarmAt<=next?this.alarmAt:next);
        if(!changed&&alarmAt===this.alarmAt)return;
        await this.ctx.storage.transaction(async()=>{
            if(changed){if(lanes.length)await this.ctx.storage.put('lanes',lanes);else await this.ctx.storage.delete('lanes');}
            if(alarmAt!==this.alarmAt){if(alarmAt===null)await this.ctx.storage.deleteAlarm();else await this.ctx.storage.setAlarm(alarmAt);}
        });
        this.saved=saved;this.alarmAt=alarmAt;
    }
    async fetch(request){
        return this.ctx.blockConcurrencyWhile(async()=>{
            try{
                if(this.needsReload)await this.load();
                let input;try{input=await request.json();this.queue.validate(input);}catch{return reply({error:'排队请求无效'},400);}
                let result,error;
                try{
                    switch(new URL(request.url).pathname){
                        case '/join-queue':result=this.queue.join(input);break;
                        case '/my-turn':result=this.queue.turn(input);break;
                        case '/complete':case '/leave-queue':result=this.queue.release(input);break;
                        default:return reply({error:'Not found'},404);
                    }
                }catch(cause){error=cause;}
                // Cleanup may advance the lane even when this caller expired.
                // Commit that handoff before replying, including error replies.
                await this.persist();
                return error?reply({error:error.message},error.status||400):reply(result);
            }catch{
                // Never grant from uncommitted in-memory state after a storage
                // failure. Reload durable state before the next request.
                this.needsReload=true;
                return reply({error:'排队状态保存失败，请稍后重试'},503);
            }
        });
    }
    async alarm(){
        return this.ctx.blockConcurrencyWhile(async()=>{
            try{if(this.needsReload)await this.load();this.alarmAt=null;this.queue.cleanup();await this.persist();}
            catch(error){this.needsReload=true;throw error;}
        });
    }
}
