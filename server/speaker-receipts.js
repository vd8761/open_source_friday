const { speakerThankYou } = require('./speaker-thank-you');

function createSpeakerReceiptWorker({ pool, env = process.env, flags, fetchImpl = fetch }) {
  const allow = String(env.TEST_EMAIL_ALLOWLIST || env.ZOOM_TEST_ALLOWLIST || '').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  // This transactional feature has its own live switch, like lounge codes; campaign/Zoom flags stay unchanged.
  const live = flags.production || env.SPEAKER_THANK_YOU_MODE === 'live';
  const enabled = env.ENABLE_SPEAKER_THANK_YOU == null || env.ENABLE_SPEAKER_THANK_YOU === '' ? live : env.ENABLE_SPEAKER_THANK_YOU === 'true';
  return async function processReceipts({ limit = 10 } = {}) {
    if (!enabled || !env.SENDER_API_TOKEN) return { sent: 0, skipped: true };
    // A crash after a send may mean Sender accepted it. Never blindly send that receipt again.
    await pool.query(`UPDATE speaker_applications SET thank_you_status='unknown',thank_you_error='Delivery outcome is uncertain after an interrupted send. Please check Sender before sending again.'
      WHERE thank_you_status='sending' AND thank_you_attempted_at < NOW()-INTERVAL '15 minutes'`);
    let sent = 0;
    for (let i=0;i<limit;i++) {
      const { rows } = await pool.query(`UPDATE speaker_applications SET thank_you_status='sending',thank_you_attempted_at=NOW(),thank_you_error=NULL
        WHERE id=(SELECT id FROM speaker_applications WHERE thank_you_status='pending' AND deleted_at IS NULL ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1)
        AND thank_you_status='pending' RETURNING *`);
      const pitch=rows[0];if(!pitch) break;
      if (!live && !allow.includes(pitch.email.trim().toLowerCase())) {
        await pool.query("UPDATE speaker_applications SET thank_you_status='skipped',thank_you_error='Test recipient is not allowlisted.' WHERE id=$1 AND thank_you_status='sending'",[pitch.id]);continue;
      }
      let outcome='unknown',messageId=null,error='Sender did not confirm acceptance. Check Sender before retrying.';
      try {
        const domain=(await pool.query('SELECT label FROM domains WHERE key=$1',[pitch.domain])).rows[0]?.label;
        const content=speakerThankYou({...pitch,domain_label:domain});
        const response=await fetchImpl('https://api.sender.net/v2/message/send',{
          method:'POST',signal:AbortSignal.timeout(15000),
          headers:{Authorization:`Bearer ${env.SENDER_API_TOKEN}`,'Content-Type':'application/json',Accept:'application/json'},
          body:JSON.stringify({from:{email:env.SENDER_FROM_EMAIL||'info@descienceosclub.com',name:env.SENDER_FROM_NAME||'Descience Open Source Club'},to:{email:pitch.email,name:pitch.name},...content}),
        });
        const body=await response.json().catch(()=>null);
        if(response.ok && body?.success===true) {outcome='sent';messageId=String(body.emailId||body.data?.id||'').slice(0,200)||null;error=null;sent++;}
        else if((response.status>=400&&response.status<500)||body?.success===false) {outcome='failed';error=`Sender rejected the thank-you email (HTTP ${response.status}). Please check the sending account before retrying.`;}
        // Transport failures, invalid success bodies and server errors remain uncertain to prevent duplicates.
      } catch { /* Keep the uncertain outcome; no credentials or contact data in logs. */ }
      await pool.query(`UPDATE speaker_applications SET thank_you_status=$2,thank_you_sent_at=CASE WHEN $2='sent' THEN NOW() ELSE NULL END,
        thank_you_message_id=$3,thank_you_error=$4 WHERE id=$1 AND thank_you_status='sending'`,[pitch.id,outcome,messageId,error]);
    }
    return {sent};
  };
}
module.exports={createSpeakerReceiptWorker};
