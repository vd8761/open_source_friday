// Review-only template. Not connected to the mailer: enabling speaker receipts needs approval of this draft.
const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const socials = [
  ['LinkedIn','https://www.linkedin.com/company/descience-open-source-club/'],
  ['YouTube','https://www.youtube.com/channel/UCvF5jATxekeLcFvjLrMGjpA'],
  ['Instagram','https://www.instagram.com/descienceopensourceclub/'],
  ['X','https://x.com/descienceosclub'],
  ['Facebook','https://www.facebook.com/descienceosclub'],
  ['Threads','https://www.threads.net/@descienceosclub'],
  ['GitHub','https://github.com/descienceosclub'],
];
function speakerThankYou(pitch) {
  const subject = 'Thank you for your speaker pitch | Open Source Fridays';
  const text = `Thank you, ${pitch.name}.\n\nYour idea has reached the Open Source Fridays team.\n\nSession: ${pitch.title}\n${pitch.domain_label ? `Domain: ${pitch.domain_label}\n` : ''}${pitch.preferred_call_time ? `Best time to call: ${pitch.preferred_call_time} IST\n` : ''}\nWe’ll review your proposal and get in touch to discuss the fit and next steps. A session date is confirmed only after we speak with you.\n\nHave something to add? Reply to info@descienceosclub.com. There’s no need to submit the form again.\n\nStay close to the community:\n${socials.map(([name,url])=>`${name}: ${url}`).join('\n')}\n\nDescience Open Source Club\nAn initiative of Touchmark Descience Pvt Ltd.\nhttps://osf.descienceosclub.com/privacy-policy`;
  const row = (label,value) => `<tr><td style="padding:9px 0;color:#66766d;font-size:12px;vertical-align:top;width:130px">${label}</td><td style="padding:9px 0;color:#17392c;font-size:14px;font-weight:600">${escape(value)}</td></tr>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${subject}</title></head><body style="margin:0;padding:0;background:#edf2ef;color:#17392c;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;font-size:1px;color:#edf2ef;max-height:0;overflow:hidden;opacity:0;mso-hide:all">Your idea is with our team. Here’s what happens next.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#edf2ef"><tr><td align="center" style="padding:36px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#fff;border:1px solid #dce6df;border-radius:20px;overflow:hidden">
<tr><td style="padding:26px 32px;background:#103a2c;color:#d9f5b5;font-size:12px;font-weight:bold;letter-spacing:2px">DESCIENCE OPEN SOURCE CLUB<span style="color:#9bb9ab;font-weight:normal"> &nbsp;/&nbsp; OSF</span></td></tr>
<tr><td style="padding:36px 32px 12px"><p style="margin:0 0 16px;color:#64836d;font-size:11px;font-weight:bold;letter-spacing:2px">SPEAKER ENQUIRY RECEIVED</p><h1 style="margin:0;color:#103a2c;font-family:Georgia,serif;font-size:38px;line-height:1.15;font-weight:normal">Your experience.<br>A community’s next step.</h1></td></tr>
<tr><td style="padding:14px 32px 24px"><p style="margin:0 0 14px;font-size:17px;line-height:1.6">Thank you, ${escape(pitch.name)}.</p><p style="margin:0;color:#53655a;font-size:15px;line-height:1.75">Your idea has reached the Open Source Fridays team. Thank you for offering your time and experience to help our community learn, build and grow.</p></td></tr>
<tr><td style="padding:0 32px 26px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f7f1;border:1px solid #e0e9dc;border-radius:12px"><tr><td style="padding:16px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${row('YOUR SESSION',pitch.title)}${pitch.domain_label?row('DOMAIN',pitch.domain_label):''}${pitch.preferred_call_time?row('CALLBACK WINDOW',`${pitch.preferred_call_time} IST`):''}</table></td></tr></table></td></tr>
<tr><td style="padding:0 32px 30px"><h2 style="margin:0 0 10px;font-size:18px;color:#103a2c">What happens next</h2><p style="margin:0;color:#53655a;font-size:15px;line-height:1.75">We’ll review your proposal and get in touch to discuss the fit and next steps. A session date is confirmed only after we speak with you.</p><p style="margin:14px 0 0;color:#53655a;font-size:14px;line-height:1.7">Have something to add? <a href="mailto:info@descienceosclub.com" style="color:#176744;text-decoration:underline">Reply to our team</a> — there’s no need to submit the form again.</p></td></tr>
<tr><td style="padding:28px 32px;background:#e9f2e2;border-top:1px solid #dce7d5"><h2 style="margin:0 0 10px;font-family:Georgia,serif;font-size:26px;font-weight:normal;color:#103a2c">Good conversations keep going.</h2><p style="margin:0 0 20px;color:#53655a;font-size:14px;line-height:1.7">Meet the community before your session. Follow us for upcoming Fridays, practical ideas and conversations worth sharing.</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#103a2c" style="border-radius:8px;mso-padding-alt:13px 20px"><a href="${socials[0][1]}" style="display:inline-block;padding:13px 20px;color:#fff;font-size:13px;font-weight:bold;text-decoration:none">Follow DOS Club on LinkedIn &rarr;</a></td></tr></table>
<p style="margin:20px 0 0;font-size:12px;line-height:2.2">${socials.slice(1).map(([name,url])=>`<a href="${url}" style="color:#24523a;text-decoration:underline;white-space:nowrap">${name}</a>`).join(' &nbsp;·&nbsp; ')}</p></td></tr>
<tr><td style="padding:24px 32px;color:#7b887f;font-size:11px;line-height:1.8">Descience Open Source Club<br>An initiative of Touchmark Descience Pvt Ltd.<br><a href="mailto:info@descienceosclub.com" style="color:#53655a">info@descienceosclub.com</a> &nbsp;·&nbsp; <a href="https://osf.descienceosclub.com/privacy-policy" style="color:#53655a">Privacy policy</a><br>This is an acknowledgement of your speaker enquiry, not a session confirmation. Following our social pages is optional.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject,text,html };
}
module.exports={speakerThankYou};
