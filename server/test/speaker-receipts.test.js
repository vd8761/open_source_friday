const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');const {createSpeakerReceiptWorker}=require('../speaker-receipts');
const env={SENDER_API_TOKEN:'test-token',SENDER_FROM_EMAIL:'info@descienceosclub.com',SENDER_FROM_NAME:'Descience Open Source Club'};
const flags={production:true,sender:true};
async function setup() {
  const db=new PGlite();await db.exec(`CREATE TABLE domains(key TEXT PRIMARY KEY,label TEXT);INSERT INTO domains VALUES('open_source','Open Source');
    CREATE TABLE speaker_applications(id SERIAL PRIMARY KEY,name TEXT,email TEXT,title TEXT,domain TEXT,preferred_call_time TEXT,deleted_at TIMESTAMPTZ);`);
  await db.exec(fs.readFileSync(path.join(__dirname,'../db/migrations/011_speaker_receipts.up.sql'),'utf8'));
  const add=async(status='pending',email='mohan@example.com')=>(await db.query("INSERT INTO speaker_applications(name,email,title,domain,preferred_call_time,thank_you_status) VALUES('Mohan',$1,'Practical open source','open_source','1 PM–4 PM',$2) RETURNING id",[email,status])).rows[0].id;
  return {db,pool:{query:(...args)=>db.query(...args)},add,state:async id=>(await db.query('SELECT * FROM speaker_applications WHERE id=$1',[id])).rows[0]};
}
const accepted=(calls)=>async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});return{ok:true,status:200,json:async()=>({success:true,emailId:'receipt-123'})};};
test('a durable receipt claim sends once with logo/socials and keeps Sender acceptance evidence',async()=>{
  const {db,pool,add,state}=await setup();try{const id=await add(),calls=[];const run=createSpeakerReceiptWorker({pool,env,flags,fetchImpl:accepted(calls)});
    await Promise.all([run(),run()]);await run();assert.equal(calls.length,1);assert.equal(calls[0].body.to.email,'mohan@example.com');
    assert.ok(calls[0].body.html.includes('https://osf.descienceosclub.com/dos_logo.png'));assert.ok(calls[0].body.html.includes('https://www.linkedin.com/company/descience-open-source-club/'));
    assert.ok(calls[0].body.text.includes('Open Source'));const row=await state(id);assert.equal(row.thank_you_status,'sent');assert.equal(row.thank_you_message_id,'receipt-123');assert.ok(row.thank_you_sent_at);
  }finally{await db.close();}
});
test('legacy and trashed enquiries are never automatically emailed',async()=>{
  const {db,pool,add,state}=await setup();try{const old=await add('not_requested'),trashed=await add();await db.query('UPDATE speaker_applications SET deleted_at=NOW() WHERE id=$1',[trashed]);
    const calls=[];await createSpeakerReceiptWorker({pool,env,flags,fetchImpl:accepted(calls)})();assert.equal(calls.length,0);assert.equal((await state(old)).thank_you_status,'not_requested');
  }finally{await db.close();}
});
test('non-production receipts are off by default and enabled tests only reach allowlisted recipients',async()=>{
  const {db,pool,add,state}=await setup();try{const id=await add(),calls=[];
    await createSpeakerReceiptWorker({pool,env,flags:{production:false,sender:true},fetchImpl:accepted(calls)})();assert.equal((await state(id)).thank_you_status,'pending');
    await createSpeakerReceiptWorker({pool,env:{...env,ENABLE_SPEAKER_THANK_YOU:'true',TEST_EMAIL_ALLOWLIST:'owner@example.com'},flags:{production:false,sender:true},fetchImpl:accepted(calls)})();
    assert.equal(calls.length,0);assert.equal((await state(id)).thank_you_status,'skipped');
    const allowed=await add('pending','owner@example.com');await createSpeakerReceiptWorker({pool,env:{...env,ENABLE_SPEAKER_THANK_YOU:'true',TEST_EMAIL_ALLOWLIST:'owner@example.com'},flags:{production:false,sender:true},fetchImpl:accepted(calls)})();assert.equal(calls.length,1);assert.equal((await state(allowed)).thank_you_status,'sent');
  }finally{await db.close();}
});
test('explicit rejections are failed; timeouts and uncertain responses never auto-retry',async()=>{
  for(const [reply,expected] of [[async()=>({ok:false,status:403,json:async()=>({success:false})}),'failed'],[async()=>({ok:true,status:200,json:async()=>({success:false})}),'failed'],[async()=>{throw new Error('timeout');},'unknown'],[async()=>({ok:false,status:500,json:async()=>({})}),'unknown'],[async()=>({ok:true,status:200,json:async()=>{throw new Error('invalid');}}),'unknown']]){
    const {db,pool,add,state}=await setup();try{const id=await add();let calls=0;const run=createSpeakerReceiptWorker({pool,env,flags,fetchImpl:async(...a)=>{calls++;return reply(...a);}});await run();await run();assert.equal(calls,1);assert.equal((await state(id)).thank_you_status,expected);assert.equal((await state(id)).thank_you_sent_at,null);}finally{await db.close();}
  }
});
test('missing credentials and the receipt kill-switch leave pending work unsent',async()=>{
  const {db,pool,add,state}=await setup();try{const id=await add(),calls=[];
    for(const options of [{env:{...env,SENDER_API_TOKEN:''},flags},{env:{...env,ENABLE_SPEAKER_THANK_YOU:'false'},flags}])await createSpeakerReceiptWorker({pool,...options,fetchImpl:accepted(calls)})();
    assert.equal(calls.length,0);assert.equal((await state(id)).thank_you_status,'pending');
  }finally{await db.close();}
});
test('a stale in-flight send is held for review, not resent after a process restart',async()=>{
  const {db,pool,add,state}=await setup();try{const id=await add('sending');await db.query("UPDATE speaker_applications SET thank_you_attempted_at=NOW()-INTERVAL '20 minutes' WHERE id=$1",[id]);const calls=[];
    await createSpeakerReceiptWorker({pool,env,flags,fetchImpl:accepted(calls)})();assert.equal(calls.length,0);assert.equal((await state(id)).thank_you_status,'unknown');
  }finally{await db.close();}
});


test('explicit live receipts work on a preview-hosted public site without enabling campaigns or other integrations',async()=>{
  const {db,pool,add,state}=await setup();try{const id=await add(),calls=[];const isolatedFlags={production:false,sender:false,zoom:false,push:false};
    await createSpeakerReceiptWorker({pool,env:{...env,SPEAKER_THANK_YOU_MODE:'live'},flags:isolatedFlags,fetchImpl:accepted(calls)})();
    assert.equal(calls.length,1);assert.equal((await state(id)).thank_you_status,'sent');assert.deepEqual(isolatedFlags,{production:false,sender:false,zoom:false,push:false});
  }finally{await db.close();}
});
