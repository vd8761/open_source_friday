const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createSenderClient}=require('../sender');
const env={SENDER_API_TOKEN:'test-secret',SENDER_FROM_EMAIL:'from@example.com',SENDER_FROM_NAME:'Test',SENDER_POSTAL_ADDRESS:'Test address',PUBLIC_APP_URL:'https://example.com'};
function fixture(responses){let clock=Date.parse('2026-10-30T13:00:00Z');const calls=[],waits=[];const client=createSenderClient({env,now:()=>clock,sleep:async ms=>{assert.ok(ms>=0);waits.push(ms);clock+=ms;},fetchImpl:async(url,init)=>{calls.push({at:clock,url,method:init.method});const r=responses.shift();assert.ok(r,'unexpected network request');if(r instanceof Error)throw r;return {status:r.status||200,ok:(r.status||200)<400,headers:{get:key=>r.headers?.[key]??null},json:async()=>r.body??{data:{id:'g1'}}};}});return {client,calls,waits};}
test('concurrent preparation and report calls share a paced queue',async()=>{
 const {client,calls}=fixture(Array.from({length:5},()=>({body:{data:{status:{email:'active'}}}})));
 await Promise.all(Array.from({length:5},(_,i)=>client.subscriber(`person${i}@example.com`)));
 assert.equal(calls.length,5);for(let i=1;i<calls.length;i++)assert.ok(calls[i].at-calls[i-1].at>=2000);
});
test('a lower provider per-minute limit slows later requests',async()=>{
 const {client,calls}=fixture([{headers:{'x-ratelimit-limit':'2','x-ratelimit-remaining':'1'}},{}]);
 await client.createGroup('one');await client.createGroup('two');assert.ok(calls[1].at-calls[0].at>=30250);
});
test('zero remaining allowance waits until the provider reset, accepting ISO and Unix timestamps',async()=>{
 for(const reset of ['2026-10-30T13:01:00Z','1793365260','1793365260000']) {
  const {client,calls}=fixture([{headers:{'x-ratelimit-remaining':'0','x-ratelimit-reset':reset}},{}]);
  await client.createGroup('one');await client.createGroup('two');assert.ok(calls[1].at-calls[0].at>=60000,reset);
 }
});
test('missing or malformed reset time with zero remaining uses a conservative minute',async()=>{
 for(const reset of [undefined,'bad','30','2020-01-01T00:00:00Z']){
  const {client,calls}=fixture([{headers:{'x-ratelimit-remaining':'0','x-ratelimit-reset':reset}},{}]);
  await client.createGroup('one');await client.createGroup('two');assert.ok(calls[1].at-calls[0].at>=60000);
 }
});
test('429 keeps the send single-attempt, protects later calls with Retry-After and does not poison the queue',async()=>{
 const {client,calls}=fixture([{status:429,headers:{'retry-after':'90'},body:{}},{}]);
 await assert.rejects(client.send('campaign1'),e=>e.status===429&&e.retryAfterSeconds===90);
 assert.equal(calls.length,1);await client.createGroup('next');assert.ok(calls[1].at-calls[0].at>=90000);assert.equal(calls.filter(c=>c.url.endsWith('/send')).length,1);
});
test('HTTP-date Retry-After is honoured',async()=>{
 const {client,calls}=fixture([{status:429,headers:{'retry-after':'Fri, 30 Oct 2026 13:01:30 GMT'},body:{}},{}]);
 await assert.rejects(client.subscriber('one@example.com'),e=>e.retryAfterSeconds===90);await client.createGroup('next');assert.ok(calls[1].at-calls[0].at>=90000);
});
test('uncertain sends are not retried and later safe requests can still execute',async()=>{
 const {client,calls}=fixture([new Error('network interrupted'),{}]);
 await assert.rejects(client.send('campaign1'),/outcome is unknown/);await client.createGroup('next');assert.equal(calls.filter(c=>c.url.endsWith('/send')).length,1);
});
test('a group-read deadline includes time spent waiting in the shared queue',async()=>{
 const {client,calls}=fixture([{status:429,headers:{'retry-after':'300'},body:{}}]);
 await assert.rejects(client.createGroup('one'),e=>e.status===429);
 await assert.rejects(client.waitForGroup('g1',1),/two minutes.*cooldown/);assert.equal(calls.length,1);
});


test('long shared cooldowns pause instead of keeping backend requests waiting indefinitely',async()=>{
 const {client,calls,waits}=fixture([{status:429,headers:{'retry-after':'300'},body:{}}]);
 await assert.rejects(client.createGroup('one'),e=>e.status===429);
 await assert.rejects(client.subscriber('one@example.com'),e=>e.status===429&&e.retryAfterSeconds>=300);
 assert.equal(calls.length,1);assert.equal(waits.length,0);
});
