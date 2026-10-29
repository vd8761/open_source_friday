const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const {initWhatsAppConsent,NOTICE_VERSION,NOTICE_TEXT}=require('../whatsapp-consent');

test('nullable consent migration preserves legacy registrations and stores choices atomically using PostgreSQL',async()=>{
  const db=new PGlite();
  try {
    await db.exec('CREATE TABLE episode_registrations(id SERIAL PRIMARY KEY,student_id INTEGER,episode_id INTEGER); INSERT INTO episode_registrations(student_id,episode_id) VALUES(7,1)');
    await initWhatsAppConsent(db);await initWhatsAppConsent(db);
    assert.equal((await db.query('SELECT whatsapp_opt_in FROM episode_registrations WHERE id=1')).rows[0].whatsapp_opt_in,null);
    for(const choice of [null,false,true]) {
      await db.query('BEGIN');
      await db.query(`INSERT INTO episode_registrations(student_id,episode_id,whatsapp_opt_in,whatsapp_consent_at,whatsapp_notice_version,whatsapp_notice_text)
        VALUES($1,$2,$3,CASE WHEN $3::boolean IS NULL THEN NULL ELSE NOW() END,$4,$5)`,[7,2,choice,choice===null?null:NOTICE_VERSION,choice===null?null:NOTICE_TEXT]);
      const saved=(await db.query('SELECT * FROM episode_registrations ORDER BY id DESC LIMIT 1')).rows[0];
      assert.equal(saved.whatsapp_opt_in,choice);assert.equal(saved.whatsapp_consent_at===null,choice===null);
      await db.query('ROLLBACK');
    }
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM episode_registrations')).rows[0].n,1);
  }finally{await db.close();}
});

test('WhatsApp contact export excludes withdrawn, declined, legacy and missing-number records and escapes spreadsheet formulas',async()=>{
  const {whatsappCsv}=await import('../../client/src/utils/whatsappCsv.js');
  const optIn={whatsapp_status:'opted_in',full_name:'=HYPERLINK("bad")',whatsapp_consent_number:'+91 9000000000',whatsapp_consent_at:'2026-10-29T12:00:00Z',whatsapp_notice_version:NOTICE_VERSION};
  const csv=whatsappCsv([optIn,{...optIn,full_name:'withdrawn',whatsapp_withdrawn_at:'2026-10-29T12:05:00Z'},...['declined','not_recorded','withdrawn'].map(whatsapp_status=>({...optIn,full_name:whatsapp_status,whatsapp_status})),{...optIn,full_name:'missing',whatsapp_consent_number:null}],16);
  assert.equal(csv.split('\r\n').length,2);assert.ok(csv.includes('"16"'));assert.ok(csv.includes('"\'=HYPERLINK'));assert.ok(csv.includes('"\'+91 9000000000"'));assert.ok(!csv.includes('withdrawn'));assert.ok(!csv.includes('missing'));
});
