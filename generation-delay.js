// Applied to every actual image attempt, after any cloud queue lease is acquired.
export async function waitForGeneration({canContinue=()=>true,onStatus=()=>{},random=Math.random,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
    const check=()=>{if(!canContinue())throw Error('原消息已变化，已退出待生成队列');};
    check();onStatus('准备生图');
    await sleep(2000+Math.floor(random()*2001));
    check();
}
