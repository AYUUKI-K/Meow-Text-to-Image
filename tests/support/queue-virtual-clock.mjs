// Test-only event scheduler. Runs the real async clients and timeout callbacks.
export class VirtualClock {
    now=0;next=1;events=new Map();steps=0;
    timer=(fn,delay=0,interval=0,...args)=>{const id=this.next++;this.events.set(id,{id,at:this.now+Math.max(0,Number(delay)||0),fn:()=>fn(...args),interval});return id;};
    clear=id=>this.events.delete(id);
    sleep=ms=>new Promise(resolve=>this.timer(resolve,ms));
    install(){
        const names=['setTimeout','clearTimeout','setInterval','clearInterval'];const saved=Object.fromEntries(names.map(name=>[name,globalThis[name]]));
        globalThis.setTimeout=(fn,ms,...args)=>this.timer(fn,ms,0,...args);globalThis.clearTimeout=this.clear;
        globalThis.setInterval=(fn,ms,...args)=>this.timer(fn,ms,ms,...args);globalThis.clearInterval=this.clear;
        return ()=>Object.assign(globalThis,saved);
    }
    async flush(){for(let i=0;i<48;i++)await Promise.resolve();}
    async run(done,{onAdvance=()=>{},limit=2000000}={}){
        await this.flush();
        while(!done()){
            if(++this.steps>limit)throw Error('virtual event limit');
            const event=[...this.events.values()].sort((a,b)=>a.at-b.at||a.id-b.id)[0];
            if(!event)throw Error('virtual deadlock');
            onAdvance(this.now,event.at);this.now=event.at;this.events.delete(event.id);
            if(event.interval)this.events.set(event.id,{...event,at:this.now+event.interval});
            event.fn();await this.flush();
        }
    }
}
export const seededRandom=seed=>()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
export function distribution(values){
    const a=values.filter(Number.isFinite).sort((x,y)=>x-y),p=q=>a.length?a[Math.max(0,Math.ceil(q*a.length)-1)]:null;
    return {n:a.length,mean:a.length?a.reduce((x,y)=>x+y,0)/a.length:null,p50:p(.5),p95:p(.95),p99:p(.99),max:a.at(-1)??null};
}
