// One queue covers campaign preparation, sends and report reads in this process.
function createSenderPacer({now,sleep}) {
  let tail=Promise.resolve(),nextStart=0,blockedUntil=0,spacing=2000;
  const integer=value=>typeof value==='string'&&/^\d+$/.test(value)?Number(value):NaN;
  const resetTime=value=>{
    if(!value)return NaN;
    if(/^\d+$/.test(value)){const n=Number(value);return n>=1e12?n:n>=1e9?n*1000:NaN;}
    return Date.parse(value);
  };
  function retrySeconds(headers){
    const retry=headers?.get('retry-after');
    const parsed=/^\d+$/.test(retry||'')?Number(retry):(Date.parse(retry)-now())/1000;
    return Number.isFinite(parsed)?Math.max(60,Math.ceil(parsed)):60;
  }
  function observe(response){
    const headers=response.headers;
    const limit=integer(headers?.get('x-ratelimit-limit'));
    if(Number.isSafeInteger(limit)&&limit>0)spacing=Math.max(2000,Math.ceil(60000/limit)+250);
    const reset=resetTime(headers?.get('x-ratelimit-reset'));
    if(integer(headers?.get('x-ratelimit-remaining'))===0){
      blockedUntil=Math.max(blockedUntil,Number.isFinite(reset)&&reset>now()?reset+250:now()+60000);
    }
    if(response.status===429)blockedUntil=Math.max(blockedUntil,now()+retrySeconds(headers)*1000);
  }
  function run(work,{deadline,onDeadline,onCooldown}={}){
    const queued=tail.then(async()=>{
      const target=Math.max(nextStart,blockedUntil);
      if(deadline!==undefined&&Math.max(now(),target)>=deadline)throw onDeadline();
      if(target-now()>120000)throw onCooldown(Math.ceil((target-now())/1000));
      if(target>now())await sleep(target-now());
      if(deadline!==undefined&&now()>=deadline)throw onDeadline();
      const started=now();
      nextStart=started+spacing;
      try{return await work(observe,deadline===undefined?undefined:Math.max(1,deadline-now()));}
      finally{nextStart=Math.max(nextStart,started+spacing);}
    });
    // A failed request must not poison subsequent requests in the queue.
    tail=queued.catch(()=>{});
    return queued;
  }
  return {run,retrySeconds};
}
module.exports={createSenderPacer};
