import {PREPARE_LEASE_MS,SEND_WINDOW_MS,UNKNOWN_RESULT_GRACE_MS,MAX_UNKNOWN_RESULT_GRACE_MS,UNCLAIMED_PICKUP_MS,RATE_LIMIT_BACKOFF_MS,MAX_RATE_LIMIT_COOLDOWN_MS,RATE_LIMIT_HISTORY_MS,RETRY_WAIT_MS,RETRY_PICKUP_MS,MAX_RETRY_ATTEMPTS,MAX_RETRY_AFTER_MS} from './lease-policy.mjs';
import {randomUUID,timingSafeEqual,createHash} from 'node:crypto';
import {Buffer} from 'node:buffer';
const equal=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length>0&&x.length===y.length&&timingSafeEqual(x,y);};
export class LeaseQueue {
    constructor({now=Date.now,leaseMs=240000,waitingMs=90000,maxHoldMs=600000,maxJobs=1000,renewalMs=0,pickupMs=UNCLAIMED_PICKUP_MS,prepareMs=PREPARE_LEASE_MS,sendWindowMs=SEND_WINDOW_MS,uncertainMs=UNKNOWN_RESULT_GRACE_MS}={}){Object.assign(this,{now,leaseMs,waitingMs,maxHoldMs,maxJobs,renewalMs,pickupMs,prepareMs,sendWindowMs,uncertainMs});this.lanes=new Map();}
    validate(input){
        if(!input||'key' in input||!/^([a-f0-9]{64})$/i.test(input.key_hash||'')||!/^[-a-zA-Z0-9_]{8,100}$/.test(input.user_id||'')||!/^[-a-zA-Z0-9_]{8,100}$/.test(input.task_id||''))throw new Error('无效排队信息');
        const fields=['key_hash','user_id','task_id','greeting','lock_token','release_proof','cancel_hash','cancel_proof','generation_timeout_ms','protocol','outcome','retry_after_ms','retry_protocol','attempt_no','attempt_id','rejection_status'];
        if(Object.keys(input).some(field=>!fields.includes(field)))throw new Error('无效排队字段');
        if(input.generation_timeout_ms!==undefined&&(!Number.isInteger(input.generation_timeout_ms)||input.generation_timeout_ms<5000||input.generation_timeout_ms>180000))throw new Error('无效生图超时');
        if(input.protocol!==undefined&&input.protocol!==2)throw new Error('无效队列协议');
        if(input.retry_protocol!==undefined&&(input.retry_protocol!==1||input.protocol!==2))throw new Error('无效重试协议');
        if(input.attempt_no!==undefined&&(!Number.isInteger(input.attempt_no)||input.attempt_no<0||input.attempt_no>MAX_RETRY_ATTEMPTS))throw new Error('无效尝试次数');
        if(input.attempt_id!==undefined&&!/^[-a-zA-Z0-9_]{8,100}$/.test(input.attempt_id))throw new Error('无效尝试凭据');
        if(input.rejection_status!==undefined&&![409,423,429].includes(input.rejection_status))throw new Error('无效拒绝状态');
        if(input.retry_after_ms!==undefined&&(!Number.isInteger(input.retry_after_ms)||input.retry_after_ms<0))throw new Error('无效冷却时间');
        for(const field of ['cancel_hash','cancel_proof'])if(input[field]!==undefined&&!/^[a-f0-9]{64}$/.test(input[field]))throw new Error('无效撤销凭据');
    }
    cleanup(){
        const now=this.now();
        for(const [hash,lane] of this.lanes){
            lane.waiting=lane.waiting.filter(job=>now-job.seen<this.waitingMs);
            if(lane.active&&now>=lane.active.expires)lane.active=null;
            if(!lane.active&&lane.waiting.length&&!(now<lane.cooldownUntil)){const job=lane.waiting.shift();lane.active={...job,token:randomUUID(),pending:true,started:now,expires:now+Math.min(this.pickupMs,this.leaseMs)};}
            if(!lane.active&&!lane.waiting.length&&!(now<lane.cooldownUntil)&&!(now<lane.rateLimitHistoryUntil))this.lanes.delete(hash);
        }
    }
    find(lane,input){return lane.active?.user===input.user_id&&lane.active?.task===input.task_id?lane.active:lane.waiting.find(j=>j.user===input.user_id&&j.task===input.task_id);}
    remaining(job){return Math.max(0,Math.min(job.expires,job.generationDeadline??Infinity,job.started+this.maxHoldMs)-this.now());}
    view(lane,job){
        const active=lane.active===job,now=this.now();
        return {your_turn:active,status:active?(job.protocol===2?job.phase:'granted'):(now<lane.cooldownUntil?'cooldown':'waiting'),position:active?0:lane.waiting.indexOf(job)+1,...(now<lane.cooldownUntil?{cooldown_remaining_ms:lane.cooldownUntil-now}:{}),
            ...(active?{lock_token:job.token,...(job.generationDeadline?{generation_remaining_ms:this.remaining(job)}:{}),
                ...(job.protocol===2?{protocol:2,phase:job.phase,prepare_remaining_ms:Math.max(0,(job.prepareDeadline??job.expires)-now),
                    ...(job.retryProtocol===1?{retry_protocol:1,attempt_no:job.attemptNo??0,attempt_id:job.attemptId,task_remaining_ms:Math.max(0,job.started+this.maxHoldMs-now),hard_remaining_ms:Math.max(0,job.expires-now),...(job.phase==='retry-wait'?{retry_remaining_ms:Math.max(0,job.retryNotBefore-now)}:{})}:{}),
                    ...(job.sendNotAfter?{send_window_ms:Math.max(0,Math.min(job.sendNotAfter,job.expires)-now),hard_remaining_ms:Math.max(0,job.expires-now)}:{})}:{})}:{})};
    }
    touch(job){if(this.now()-job.seen>=this.renewalMs)job.seen=this.now();}
    prepare(job){job.phase='preparing';job.prepareDeadline=Math.min(this.now()+this.prepareMs,job.started+this.maxHoldMs);job.expires=job.prepareDeadline;}
    pickup(job){if(job.pending){delete job.pending;job.started=this.now();job.expires=this.now()+this.leaseMs;if(job.protocol===2)this.prepare(job);}}
    proof(job,input){const proof=createHash('sha256').update(job.token+'\0release').digest('hex');return equal(job.token,input.lock_token)||equal(proof,input.release_proof);}
    holder(input){
        this.validate(input);this.cleanup();const lane=this.lanes.get(input.key_hash.toLowerCase()),job=lane&&this.find(lane,input);
        if(!job||lane.active!==job)throw new Error('排队任务已过期，请重新生成');
        if(!this.proof(job,input))throw new Error('无效队列凭据');
        if(job.protocol!==2||job.pending)throw new Error('请先领取新协议准备许可');
        return {lane,job};
    }
    begin(input){
        const {lane,job}=this.holder(input),now=this.now();
        if(now<lane.cooldownUntil)throw new Error('上游限流冷却中');
        if(job.phase==='uncertain')throw new Error('任务结果不确定，不得重新发送');
        if(job.retryProtocol===1){
            const expected=job.phase==='retry-wait'?job.attemptNo+1:job.attemptNo??0;
            if(input.attempt_no!==expected)throw new Error('尝试已失效，不得重新发送');
            if(job.phase==='retry-wait'&&now<job.retryNotBefore)throw new Error('尚未到重试时间');
        }
        if(job.phase==='preparing'||job.retryProtocol===1&&job.phase==='retry-wait'){
            if(input.generation_timeout_ms===undefined)throw new Error('无效生图超时');
            if(job.retryProtocol===1){job.attemptNo=input.attempt_no;job.attemptId=randomUUID();}
            job.phase='possibly-sent';job.sendNotAfter=Math.min(now+this.sendWindowMs,job.started+this.maxHoldMs);
            job.generationDeadline=Math.min(now+input.generation_timeout_ms,job.started+this.maxHoldMs);
            job.hardReleaseAt=Math.min(job.generationDeadline+Math.min(MAX_UNKNOWN_RESULT_GRACE_MS,Math.max(0,this.uncertainMs)),job.started+this.maxHoldMs);
            job.expires=job.hardReleaseAt;
        }
        return this.view(lane,job);
    }
    retry(input){
        const {lane,job}=this.holder(input),now=this.now();
        if(job.retryProtocol!==1||input.attempt_no!==job.attemptNo||!equal(job.attemptId,input.attempt_id)||![409,423,429].includes(input.rejection_status))throw new Error('尝试已失效或没有明确拒绝，不得重试');
        if(job.phase==='retry-wait')return this.view(lane,job);
        if(job.phase!=='possibly-sent'||job.attemptNo>=MAX_RETRY_ATTEMPTS||![409,423,429].includes(input.rejection_status))throw new Error('没有明确拒绝或重试次数已耗尽');
        const delay=Math.max(RETRY_WAIT_MS,input.retry_after_ms??0);
        if(delay>MAX_RETRY_AFTER_MS||now+delay>=job.started+this.maxHoldMs)throw new Error('重试等待超过安全上限');
        job.phase='retry-wait';job.retryNotBefore=now+delay;
        job.expires=Math.min(job.retryNotBefore+RETRY_PICKUP_MS,job.started+this.maxHoldMs);
        delete job.sendNotAfter;delete job.generationDeadline;
        return this.view(lane,job);
    }
    finish(input){
        this.validate(input);this.cleanup();
        const lane=this.lanes.get(input.key_hash.toLowerCase()),job=lane&&this.find(lane,input);
        if(!job||lane.active!==job)return {finished:false};
        const allowed=['success','rejected','uncertain','not-sent','rate-limited'];
        if(!allowed.includes(input.outcome))throw new Error('无效结束状态');
        if(job.protocol!==2||!this.proof(job,input))throw new Error('无效队列凭据');
        if(job.retryProtocol===1){
            if(input.attempt_no!==(job.attemptNo??0)||(job.attemptId&&!equal(job.attemptId,input.attempt_id)))throw new Error('尝试已失效');
            if(job.phase==='retry-wait'&&!['rejected','not-sent'].includes(input.outcome))throw new Error('该尝试已明确拒绝');
            if(job.phase==='uncertain'&&!['success','uncertain'].includes(input.outcome))throw new Error('任务结果不确定');
        }
        if(job.phase==='preparing'&&input.outcome!=='not-sent')throw new Error('尚未准许发送');
        if(input.outcome==='uncertain'){job.phase='uncertain';return {finished:true,phase:job.phase,hard_remaining_ms:Math.max(0,job.expires-this.now())};}
        if(input.outcome==='rate-limited'&&job.retryProtocol!==1){
            const now=this.now();
            lane.rateLimitCount=now<(lane.rateLimitHistoryUntil??0)?Math.min(3,(lane.rateLimitCount??0)+1):1;
            lane.rateLimitHistoryUntil=now+RATE_LIMIT_HISTORY_MS;
            lane.cooldownUntil=now+Math.min(MAX_RATE_LIMIT_COOLDOWN_MS,Math.max(RATE_LIMIT_BACKOFF_MS[lane.rateLimitCount-1],input.retry_after_ms??0));
        }
        lane.active=null;this.cleanup();return {finished:true,...(input.outcome==='rate-limited'&&job.retryProtocol!==1?{cooldown_remaining_ms:Math.max(0,lane.cooldownUntil-this.now())}:{})};
    }
    join(input){
        this.validate(input);this.cleanup();const hash=input.key_hash.toLowerCase();let lane=this.lanes.get(hash);
        if(!lane){lane={active:null,waiting:[]};this.lanes.set(hash,lane);}
        const previous=this.find(lane,input);if(previous){if(previous===lane.active)this.pickup(previous);this.touch(previous);return this.view(lane,previous);}
        const total=[...this.lanes.values()].reduce((sum,l)=>sum+l.waiting.length+(l.active?1:0),0);
        if(total>=this.maxJobs||lane.waiting.length>=64)throw Object.assign(new Error('队列暂时满了'),{status:429});
        const job={user:input.user_id,task:input.task_id,seen:this.now(),...(input.protocol===2?{protocol:2,phase:'preparing'}:{}),...(input.retry_protocol===1?{retryProtocol:1,attemptNo:0}:{}),...(input.cancel_hash?{cancelHash:input.cancel_hash}:{})};
        if(!lane.active&&!(this.now()<lane.cooldownUntil)){lane.active={...job,token:randomUUID(),started:this.now(),expires:this.now()+this.leaseMs};if(job.protocol===2)this.prepare(lane.active);return this.view(lane,lane.active);}
        lane.waiting.push(job);return this.view(lane,job);
    }
    turn(input){
        this.validate(input);this.cleanup();const lane=this.lanes.get(input.key_hash.toLowerCase()),job=lane&&this.find(lane,input);
        if(!job)throw new Error('排队任务已过期，请重新生成');
        if(lane.active===job)this.pickup(job);
        // Legacy v2.4.3 registration keeps its original semantics. Never let
        // this endpoint shorten or renew a two-phase task, including uncertain.
        if(input.generation_timeout_ms!==undefined&&job.protocol!==2){
            const proof=createHash('sha256').update(job.token+'\0release').digest('hex');
            if(lane.active!==job||!equal(job.token,input.lock_token)&&!equal(proof,input.release_proof))throw new Error('无效队列凭据');
            job.generationDeadline??=this.now()+input.generation_timeout_ms;
            job.expires=Math.min(job.expires,job.generationDeadline);
        }
        this.touch(job);
        if(lane.active===job&&job.protocol!==2){const expires=Math.min(this.now()+this.leaseMs,job.started+this.maxHoldMs,job.generationDeadline??Infinity);if(expires-job.expires>=this.renewalMs)job.expires=expires;}
        return this.view(lane,job);
    }
    release(input){
        this.validate(input);this.cleanup();const hash=input.key_hash.toLowerCase(),lane=this.lanes.get(hash);
        if(!lane)return {released:false};const job=this.find(lane,input);if(!job)return {released:false};
        if(lane.active===job){if(job.protocol===2&&job.phase!=='preparing')throw new Error('请使用 finish 结束已授权任务');const proof=createHash('sha256').update(job.token+'\0release').digest('hex');const cancelled=job.cancelHash&&input.cancel_proof&&equal(job.cancelHash,createHash('sha256').update(input.cancel_proof).digest('hex'));if(!equal(job.token,input.lock_token)&&!equal(proof,input.release_proof)&&!cancelled)throw new Error('无效队列凭据');lane.active=null;}
        else lane.waiting=lane.waiting.filter(j=>j!==job);
        this.cleanup();return {released:true};
    }
    stats(){this.cleanup();return {active:[...this.lanes.values()].filter(l=>l.active).length,waiting:[...this.lanes.values()].reduce((sum,l)=>sum+l.waiting.length,0)};}
}
